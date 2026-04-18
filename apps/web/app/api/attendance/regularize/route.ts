// Vibe Tech Labs — POST /api/attendance/regularize
// H5 fix: Now supports two flows:
//   1. FLAGGED record: modify existing record (pass attendanceId)
//   2. ABSENT day: create a regularization request for a day with no record (pass date)
// L3 fix: reason and time fields are length-capped

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { success, error, logger } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

async function handleRegularize(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    let body: any;
    try { body = await req.json(); } catch {
        return error("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const { attendanceId, date, reason, requestedCheckIn, requestedCheckOut } = body;

    if (!reason || typeof reason !== "string" || !reason.trim()) {
        return error("VALIDATION", "Reason is required", 400);
    }

    // L3 fix: cap reason at 1000 chars
    const sanitizedReason = reason.trim().slice(0, 1000);

    if (!attendanceId && !date) {
        return error("VALIDATION", "Either attendanceId (for FLAGGED day) or date (for ABSENT day) is required", 400);
    }

    // M3 fix: validate UUID format if attendanceId provided
    if (attendanceId && !/^[0-9a-f-]{36}$/.test(attendanceId)) {
        return error("VALIDATION_ERROR", "Invalid attendance ID format", 422);
    }

    // Validate date format if provided
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return error("VALIDATION_ERROR", "Date must be in YYYY-MM-DD format", 422);
    }

    const checkInDate = requestedCheckIn ? new Date(requestedCheckIn) : null;
    const checkOutDate = requestedCheckOut ? new Date(requestedCheckOut) : null;

    // ── Flow 1: FLAGGED record regularization ─────────────────────────
    if (attendanceId) {
        const record = await prisma.attendanceRecord.findUnique({
            where: { id: attendanceId, userId: auth.sub },
            include: { user: { select: { managerId: true, entityId: true, fullName: true } } }
        });

        if (!record) return error("NOT_FOUND", "Attendance record not found", 404);

        if (record.status !== "FLAGGED") {
            return error("INVALID_STATE", "Only FLAGGED days can be regularized using this method", 400);
        }

        return await createRegularization({
            auth,
            record: { id: record.id, date: record.date, user: record.user },
            reason: sanitizedReason,
            checkInDate,
            checkOutDate,
        });
    }

    // ── Flow 2: ABSENT day regularization (no attendance record) ──────
    // Build target date in IST
    const targetDateUtc = new Date(`${date}T00:00:00Z`);

    // Prevent future-date regularization
    const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const todayStr = nowIst.toISOString().slice(0, 10);
    if (date >= todayStr) {
        return error("INVALID_STATE", "Cannot request regularization for today or future dates", 400);
    }

    // Fetch user info for approver lookup
    const user = await prisma.user.findUnique({
        where: { id: auth.sub },
        select: { managerId: true, entityId: true, fullName: true }
    });
    if (!user) return error("NOT_FOUND", "User not found", 404);

    // Check if record already exists for this date (use FLAGGED flow instead)
    const existingRecord = await prisma.attendanceRecord.findFirst({
        where: {
            userId: auth.sub,
            date: targetDateUtc,
        }
    });

    if (existingRecord) {
        if (existingRecord.status === "FLAGGED") {
            return error("INVALID_STATE", `An attendance record already exists for ${date}. Use attendanceId to regularize it.`, 409);
        }
        return error("INVALID_STATE", `Cannot regularize a day with status: ${existingRecord.status}`, 400);
    }

    // Create a placeholder ABSENT record so the regularization can be attached to it
    // This ensures the workflow is linked to a consistent record
    const absentRecord = await prisma.attendanceRecord.create({
        data: {
            userId: auth.sub,
            date: targetDateUtc,
            locationId: await prisma.user.findUnique({
                where: { id: auth.sub },
                select: { locationId: true }
            }).then(u => u?.locationId ?? undefined),
            status: "FLAGGED", // will be REGULARIZED if approved
            checkInAt: checkInDate ?? new Date(`${date}T09:00:00+05:30`),
            checkInMethod: "MANUAL",
            verificationScore: 0,
            anomalyFlags: JSON.parse(JSON.stringify({ absentDayRegularization: true })),
        }
    });

    return await createRegularization({
        auth,
        record: { id: absentRecord.id, date: targetDateUtc, user },
        reason: sanitizedReason,
        checkInDate,
        checkOutDate,
    });
}

// ── Shared helper: create regularization workflow ─────────────────────
async function createRegularization({
    auth,
    record,
    reason,
    checkInDate,
    checkOutDate,
}: {
    auth: JwtPayload;
    record: { id: string; date: Date; user: { managerId: string | null; entityId: string; fullName: string } };
    reason: string;
    checkInDate: Date | null;
    checkOutDate: Date | null;
}) {
    // Check for existing pending request
    const existingReq = await prisma.regularizationRequest.findFirst({
        where: { attendanceId: record.id, status: "PENDING" }
    });
    if (existingReq) {
        return error("DUPLICATE", "A regularization request is already pending for this day", 409);
    }

    // Find approver
    let approverId = record.user.managerId;
    if (!approverId) {
        const hr = await prisma.user.findFirst({
            where: { role: { in: ["HRA", "SADM"] }, entityId: record.user.entityId }
        });
        approverId = hr?.id || null;
    }
    if (!approverId) return error("NO_APPROVER", "No manager or HR found to approve this request", 400);

    const result = await prisma.$transaction(async (tx) => {
        const regReq = await tx.regularizationRequest.create({
            data: {
                attendanceId: record.id,
                userId: auth.sub,
                reason,
                requestedCheckIn: checkInDate,
                requestedCheckOut: checkOutDate,
                status: "PENDING"
            }
        });

        const workflow = await tx.approvalWorkflow.create({
            data: {
                entityType: "regularization",
                entityId: regReq.id,
                requesterId: auth.sub,
                currentStep: 0,
                status: "PENDING",
                steps: JSON.parse(JSON.stringify([{
                    approverId,
                    status: "PENDING",
                    comment: null,
                    actedAt: null,
                }])),
            }
        });

        // Notify approver + HR
        const hrAdmins = await tx.user.findMany({
            where: {
                role: { in: ["HRA", "SADM", "HRBP"] },
                entityId: record.user.entityId,
                status: "ACTIVE",
                id: { not: auth.sub }
            },
            select: { id: true }
        });

        const notifyUserIds = Array.from(new Set([
            ...(approverId ? [approverId] : []),
            ...hrAdmins.map(u => u.id)
        ]));

        if (notifyUserIds.length > 0) {
            await tx.notification.createMany({
                data: notifyUserIds.map(userId => ({
                    userId,
                    type: "REGULARIZATION_APPROVAL",
                    title: "Attendance Regularization",
                    body: `${record.user.fullName} requested time correction for ${record.date.toISOString().split("T")[0]}.`,
                    data: { regularizationId: regReq.id, attendanceId: record.id }
                }))
            });
        }

        return { regReq, workflow };
    });

    await logAuditEvent({
        actorId: auth.sub,
        actorRole: auth.role,
        action: "attendance.regularize_requested",
        resourceType: "regularization",
        resourceId: result.regReq.id,
        metadata: { date: record.date, reason }
    }).catch(() => {});

    logger.info({ userId: auth.sub, regReqId: result.regReq.id }, "Regularization requested");

    return success({
        workflowId: result.workflow.id,
        requestId: result.regReq.id,
        status: "PENDING"
    }, 201);
}

export const POST = withAuth(handleRegularize);
