// Vibe Tech Labs — POST /api/leaves/apply
// Submit a leave request with balance validation, sandwich rule, and team overlap detection

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { LeaveApplySchema } from "@vibetech/shared";
import { withAuth } from "@/lib/auth";
import { calculateLeaveDays, getAvailableBalance, reserveLeaveBalance } from "@/lib/leave-accrual";
import { checkSandwichRule } from "@/lib/sandwich-rule";
import { calculateSlaDeadline } from "@/lib/approval-chain";
import { logAuditEvent } from "@/lib/audit";
import { success, error, logger } from "@/lib/errors";
import { EmailService } from "@/lib/email-service";
import type { JwtPayload } from "@vibetech/shared";

async function handleApply(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
        return error("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const parsed = LeaveApplySchema.safeParse(body);
    if (!parsed.success) {
        return error("VALIDATION_ERROR", "Invalid leave data", 422, parsed.error.errors);
    }

    const input = parsed.data;
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);

    // 1. Validate date range
    if (endDate < startDate) {
        return error("INVALID_DATES", "End date must be on or after start date", 400);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (startDate < today) {
        return error("PAST_DATE", "Cannot apply for past dates", 400);
    }

    // 2. Verify leave type exists
    const leaveType = await prisma.leaveType.findUnique({
        where: { id: input.leaveTypeId },
        select: { id: true, name: true, code: true },
    });

    if (!leaveType) {
        return error("LEAVE_TYPE_NOT_FOUND", "Leave type not found", 404);
    }

    // 3. Calculate leave days
    const leaveDays = calculateLeaveDays(startDate, endDate, input.halfDay || "NONE");
    if (leaveDays <= 0) {
        return error("ZERO_DAYS", "No working days in selected range", 400);
    }

    // 4. Check balance
    const year = startDate.getFullYear();
    const { available, balance } = await getAvailableBalance(auth.sub, input.leaveTypeId, year);

    if (available < leaveDays) {
        return error("INSUFFICIENT_BALANCE", `Insufficient leave balance: ${available} available, ${leaveDays} requested`, 400, {
            available,
            requested: leaveDays,
            balance,
        });
    }

    // 5. Check for overlapping requests
    const overlapping = await prisma.leaveRequest.findFirst({
        where: {
            userId: auth.sub,
            status: { in: ["PENDING", "APPROVED"] },
            OR: [
                { startDate: { lte: endDate }, endDate: { gte: startDate } },
            ],
        },
    });

    if (overlapping) {
        return error("OVERLAP", "You already have a leave request overlapping with these dates", 409);
    }

    // 6. Team overlap detection (warn only, don't block)
    const user = await prisma.user.findUnique({
        where: { id: auth.sub },
        select: { managerId: true, departmentId: true, fullName: true, entityId: true },
    });

    let teamOverlapCount = 0;
    if (user?.departmentId) {
        teamOverlapCount = await prisma.leaveRequest.count({
            where: {
                status: { in: ["PENDING", "APPROVED"] },
                userId: { not: auth.sub },
                user: { departmentId: user.departmentId },
                OR: [
                    { startDate: { lte: endDate }, endDate: { gte: startDate } },
                ],
            },
        });
    }

    // 7. Sandwich rule check
    const sandwich = checkSandwichRule(startDate, endDate);

    // 8. Reserve balance
    await reserveLeaveBalance(auth.sub, input.leaveTypeId, year, leaveDays);

    // 9. Create leave request
    const leaveRequest = await prisma.leaveRequest.create({
        data: {
            userId: auth.sub,
            leaveTypeId: input.leaveTypeId,
            startDate,
            endDate,
            halfDay: input.halfDay || "NONE",
            reason: input.reason || null,
            status: "PENDING",
        },
    });

    // 10. Determine Approver & Create Workflow 
    let finalApproverId: string | null = user?.managerId || null;
    let isSickLeave = leaveType.name.toLowerCase().includes("sick");

    if (isSickLeave) {
        // Find an HR or SADM to route Sick Leave to directly
        const hrUser = await prisma.user.findFirst({
            where: { role: { in: ["HRA", "SADM"] }, entityId: user?.entityId },
            select: { id: true }
        });
        if (hrUser) {
            finalApproverId = hrUser.id;
        }
    }

    if (finalApproverId) {
        await prisma.approvalWorkflow.create({
            data: {
                entityType: "leave",
                entityId: leaveRequest.id,
                requesterId: auth.sub,
                currentStep: 0,
                status: "PENDING",
                slaDeadline: calculateSlaDeadline("leave"),
                steps: JSON.parse(JSON.stringify([{
                    approverId: finalApproverId,
                    status: "PENDING",
                    actedAt: null,
                    comment: null,
                }])),
            },
        });

        // Create in-app notification for the approver
        await prisma.notification.create({
            data: {
                userId: finalApproverId,
                type: "LEAVE_APPROVAL",
                title: "New Leave Request",
                body: `${user?.fullName || "An employee"} has requested ${leaveType.name}.`,
                data: {
                    leaveId: leaveRequest.id,
                    employeeName: user?.fullName,
                }
            }
        });

        // Fire-and-forget email dispatch
        prisma.user.findUnique({
            where: { id: finalApproverId },
            select: { email: true }
        }).then(approver => {
            if (approver?.email) {
                EmailService.sendLeaveRequestEmail({
                    managerEmail: approver.email,
                    employeeName: user?.fullName || "Employee",
                    leaveType: leaveType.name,
                    startDate: leaveRequest.startDate.toISOString(),
                    endDate: leaveRequest.endDate.toISOString(),
                    reason: leaveRequest.reason || "No reason provided",
                }).catch(err => logger.error({ err, leaveId: leaveRequest.id }, "Failed to send leave request email"));
            }
        }).catch(() => {});
    }

    // 11. Audit log
    await logAuditEvent({
        actorId: auth.sub,
        actorRole: auth.role,
        action: "leave.apply",
        resourceType: "leave",
        resourceId: leaveRequest.id,
        metadata: {
            leaveType: leaveType.code,
            startDate: input.startDate,
            endDate: input.endDate,
            days: leaveDays,
            halfDay: input.halfDay,
            sandwichDetected: sandwich.isSandwich,
            teamOverlap: teamOverlapCount,
        },
    });

    logger.info({
        userId: auth.sub,
        leaveId: leaveRequest.id,
        type: leaveType.code,
        days: leaveDays,
    }, "Leave request submitted");

    return success({
        leaveId: leaveRequest.id,
        status: "PENDING",
        leaveType: leaveType.name,
        startDate: input.startDate,
        endDate: input.endDate,
        days: leaveDays,
        balanceAfter: +(available - leaveDays).toFixed(2),
        warnings: {
            sandwichRule: sandwich.isSandwich ? sandwich.message : null,
            teamOverlap: teamOverlapCount > 0 ? `${teamOverlapCount} team member(s) also on leave during this period` : null,
        },
    }, 201);
}

export const POST = withAuth(handleApply);
