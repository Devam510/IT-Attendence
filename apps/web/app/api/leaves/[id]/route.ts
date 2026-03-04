// NEXUS — DELETE /api/leaves/[id]
// Cancel a pending leave request and release reserved balance

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nexus/db";
import { LeaveCancelSchema } from "@nexus/shared";
import { withAuth } from "@/lib/auth";
import { calculateLeaveDays } from "@/lib/leave-accrual";
import { releaseLeaveBalance } from "@/lib/leave-accrual";
import { logAuditEvent } from "@/lib/audit";
import { success, error, logger } from "@/lib/errors";
import type { JwtPayload } from "@nexus/shared";

async function handleCancel(
    req: NextRequest,
    context: { auth: JwtPayload; params?: Record<string, string> }
): Promise<NextResponse> {
    const { auth, params } = context;
    const leaveId = params?.id;

    if (!leaveId) {
        return error("MISSING_ID", "Leave request ID is required", 400);
    }

    // Parse optional cancellation reason
    let reason: string | undefined;
    try {
        const body = await req.json();
        const parsed = LeaveCancelSchema.safeParse(body);
        if (parsed.success) {
            reason = parsed.data.reason ?? undefined;
        }
    } catch {
        // No body is fine for DELETE
    }

    // Find the leave request
    const leaveRequest = await prisma.leaveRequest.findUnique({
        where: { id: leaveId },
        include: { leaveType: { select: { name: true, code: true } } },
    });

    if (!leaveRequest) {
        return error("NOT_FOUND", "Leave request not found", 404);
    }

    // Only the requester can cancel
    if (leaveRequest.userId !== auth.sub) {
        return error("FORBIDDEN", "You can only cancel your own leave requests", 403);
    }

    // Can only cancel PENDING requests
    if (leaveRequest.status !== "PENDING") {
        return error("CANNOT_CANCEL", `Cannot cancel a leave request with status: ${leaveRequest.status}`, 400);
    }

    // Calculate days to release
    const days = calculateLeaveDays(
        leaveRequest.startDate,
        leaveRequest.endDate,
        leaveRequest.halfDay
    );

    // Release reserved balance
    const year = leaveRequest.startDate.getFullYear();
    await releaseLeaveBalance(auth.sub, leaveRequest.leaveTypeId, year, days);

    // Update leave request status
    await prisma.leaveRequest.update({
        where: { id: leaveId },
        data: { status: "CANCELLED" },
    });

    // Cancel associated approval workflow
    await prisma.approvalWorkflow.updateMany({
        where: {
            entityType: "leave",
            entityId: leaveId,
            status: { in: ["PENDING", "IN_PROGRESS"] },
        },
        data: {
            status: "REJECTED",
            completedAt: new Date(),
        },
    });

    // Audit
    await logAuditEvent({
        actorId: auth.sub,
        actorRole: auth.role,
        action: "leave.cancel",
        resourceType: "leave",
        resourceId: leaveId,
        metadata: {
            leaveType: leaveRequest.leaveType.code,
            days,
            reason: reason || "Cancelled by employee",
        },
    });

    logger.info({ userId: auth.sub, leaveId, days }, "Leave request cancelled");

    return success({
        leaveId,
        status: "CANCELLED",
        daysReleased: days,
    });
}

export const DELETE = withAuth(handleCancel);
