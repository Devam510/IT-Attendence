// Vibe Tech Labs — POST /api/leaves/cancel
// Allows employees to cancel their own pending or approved leaves.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import { success, error, logger } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

async function handleCancel(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
        return error("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const { leaveId } = body as { leaveId?: string };

    if (!leaveId) {
        return error("VALIDATION_ERROR", "leaveId is required", 422);
    }

    // Find the leave request to ensure it belongs to the user
    const leave = await prisma.leaveRequest.findUnique({
        where: { id: leaveId },
        include: { 
            user: { select: { fullName: true, email: true, managerId: true, entityId: true } },
            leaveType: { select: { name: true } }
        },
    });

    if (!leave) {
        return error("NOT_FOUND", "Leave request not found", 404);
    }

    if (leave.userId !== auth.sub) {
        return error("FORBIDDEN", "You can only cancel your own leaves", 403);
    }

    if (["CANCELLED", "REJECTED"].includes(leave.status)) {
        return error("ALREADY_PROCESSED", `This leave is already ${leave.status.toLowerCase()}`, 409);
    }

    const previousStatus = leave.status;

    // 1. Update leave request status to CANCELLED
    await prisma.leaveRequest.update({
        where: { id: leaveId },
        data: { status: "CANCELLED" },
    });

    // 2. Refund balance
    const leaveDays = Math.ceil(
        (leave.endDate.getTime() - leave.startDate.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

    const year = leave.startDate.getFullYear();
    const balance = await prisma.leaveBalance.findFirst({
        where: { userId: leave.userId, leaveTypeId: leave.leaveTypeId, year },
    });

    if (balance) {
        if (previousStatus === "APPROVED") {
            // Move used days back — leave was already approved so reduce used count
            await prisma.leaveBalance.update({
                where: { id: balance.id },
                data: { used: Math.max(0, balance.used - leaveDays) },
            });
        } else if (previousStatus === "PENDING") {
            // Release the reserved pending days
            await prisma.leaveBalance.update({
                where: { id: balance.id },
                data: { pending: Math.max(0, balance.pending - leaveDays) },
            });
        }
    }

    // 3. Auto-resolve the workflow if it was still pending
    if (previousStatus === "PENDING") {
        await prisma.approvalWorkflow.updateMany({
            where: { entityType: "leave", entityId: leaveId, status: "PENDING" },
            data: { status: "CANCELLED" },
        });
    }

    // 4. Notify manager via in-app notification (silently — do not fail the cancel on error)
    if (leave.user.managerId) {
        try {
            await prisma.notification.create({
                data: {
                    userId: leave.user.managerId,
                    type: "LEAVE_APPROVED", // Reuse existing notify type for generic leave update
                    title: "Leave Cancelled",
                    body: `${leave.user.fullName} has cancelled their ${leave.leaveType.name} (${leave.startDate.toLocaleDateString()} – ${leave.endDate.toLocaleDateString()}).`,
                }
            });
        } catch (e) {
            logger.warn({ err: e }, "Failed to send leave cancellation notification to manager");
        }
    }

    return success({ canceled: true });
}

export const POST = withAuth(handleCancel);
