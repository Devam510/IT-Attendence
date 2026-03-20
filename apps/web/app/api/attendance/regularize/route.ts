// Vibe Tech Labs — POST /api/attendance/regularize
// Allows employees to request regularization for missed/incorrect check-ins
// Creates an ApprovalWorkflow entry

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { RegularizeSchema } from "@vibetech/shared";
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

    const { attendanceId, reason, requestedCheckIn, requestedCheckOut } = body;

    if (!attendanceId || !reason) {
        return error("VALIDATION", "Attendance ID and reason are required", 400);
    }

    // 1. Get the Attendance Record and User Manager
    const record = await prisma.attendanceRecord.findUnique({
        where: { id: attendanceId, userId: auth.sub },
        include: { user: { select: { managerId: true, entityId: true, fullName: true } } }
    });

    if (!record) return error("NOT_FOUND", "Attendance record not found", 404);
    if (record.status !== "FLAGGED") {
        return error("INVALID_STATE", "Only FLAGGED days can be regularized", 400);
    }

    let approverId = record.user.managerId;
    if (!approverId) {
        const hr = await prisma.user.findFirst({
            where: { role: { in: ["HRA", "SADM"] }, entityId: record.user.entityId }
        });
        approverId = hr?.id || null;
    }
    if (!approverId) return error("NO_APPROVER", "No manager or HR found to approve this request", 400);

    // 2. Check for existing pending request
    const existingReq = await prisma.regularizationRequest.findFirst({
        where: { attendanceId: record.id, status: "PENDING" }
    });
    if (existingReq) {
        return error("DUPLICATE", "A regularization request is already pending for this day", 409);
    }

    const checkInDate = requestedCheckIn ? new Date(requestedCheckIn) : null;
    const checkOutDate = requestedCheckOut ? new Date(requestedCheckOut) : null;

    // 3. Atomically create Request + Approval Workflow + Notification
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
                    approverId: approverId,
                    status: "PENDING",
                    comment: null,
                    actedAt: null,
                }])),
            }
        });

        // 3.5 Find HR and Admin users for notifications
        const hrAdmins = await tx.user.findMany({
            where: {
                role: { in: ["HRA", "SADM", "HRBP"] },
                entityId: record.user.entityId,
                status: "ACTIVE",
                id: { not: auth.sub } // Don't notify the requester if they happen to be an admin
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
    }).catch(()=>{});

    logger.info({ userId: auth.sub, regReqId: result.regReq.id }, "Regularization requested");

    return success({
        workflowId: result.workflow.id,
        requestId: result.regReq.id,
        status: "PENDING"
    }, 201);
}

export const POST = withAuth(handleRegularize);
