// Vibe Tech Labs — POST /api/leaves/respond
// Direct leave approval/rejection by manager, HR, or admin

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import { success, error, logger } from "@/lib/errors";
import { EmailService } from "@/lib/email-service";
import type { JwtPayload } from "@vibetech/shared";

async function handleRespond(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    // Only managers, HR, and admins can approve
    if (!["MGR", "HRA", "SADM"].includes(auth.role)) {
        return error("FORBIDDEN", "You do not have permission to approve leaves", 403);
    }

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
        return error("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const { leaveId, action, comment } = body as {
        leaveId?: string;
        action?: string;
        comment?: string;
    };

    if (!leaveId || !action) {
        return error("VALIDATION_ERROR", "leaveId and action are required", 422);
    }

    if (!["approved", "rejected"].includes(action)) {
        return error("VALIDATION_ERROR", "action must be 'approved' or 'rejected'", 422);
    }

    // Find the leave request (including user details and leave type for the email)
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

    if (leave.status !== "PENDING") {
        return error("ALREADY_PROCESSED", `This leave is already ${leave.status.toLowerCase()}`, 409);
    }

    // Verify manager scope
    if (auth.role === "MGR" && leave.user.managerId !== auth.sub) {
        return error("FORBIDDEN", "You can only approve leaves for your direct reports", 403);
    }

    const newStatus = action === "approved" ? "APPROVED" : "REJECTED";

    // Update leave request status
    await prisma.leaveRequest.update({
        where: { id: leaveId },
        data: {
            status: newStatus,
            approvedBy: auth.sub,
        },
    });

    // If approved: move pending days to used; if rejected: release reserved days
    const leaveDays = Math.ceil(
        (leave.endDate.getTime() - leave.startDate.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

    const year = leave.startDate.getFullYear();
    const balance = await prisma.leaveBalance.findFirst({
        where: { userId: leave.userId, leaveTypeId: leave.leaveTypeId, year },
    });

    if (balance) {
        if (newStatus === "APPROVED") {
            await prisma.leaveBalance.update({
                where: { id: balance.id },
                data: {
                    // Move from pending to used
                    pending: Math.max(0, balance.pending - leaveDays),
                    used: balance.used + leaveDays,
                },
            });
        } else {
            // Rejected: release the reserved pending days
            await prisma.leaveBalance.update({
                where: { id: balance.id },
                data: {
                    pending: Math.max(0, balance.pending - leaveDays),
                },
            });
        }
    }

    // Also update the approval workflow if one exists
    const workflow = await prisma.approvalWorkflow.findFirst({
        where: { entityId: leaveId, entityType: "leave" },
    });
    if (workflow) {
        await prisma.approvalWorkflow.update({
            where: { id: workflow.id },
            data: { status: newStatus },
        }).catch(() => { }); // non-critical
    }

    // Fire-and-forget email dispatch
    if (leave.user.email) {
        EmailService.sendLeaveStatusUpdateEmail({
            employeeEmail: leave.user.email,
            employeeName: leave.user.fullName,
            leaveType: leave.leaveType.name,
            status: newStatus as "APPROVED" | "REJECTED",
            startDate: leave.startDate.toISOString(),
            endDate: leave.endDate.toISOString(),
            remarks: comment, 
        }).catch(err => logger.error({ err, leaveId }, "Failed to send leave status email"));
    }

    logger.info({ actorId: auth.sub, leaveId, action: newStatus }, "Leave request responded");

    return success({
        leaveId,
        status: newStatus,
        message: `Leave request ${action === "approved" ? "approved" : "rejected"} successfully`,
    });
}

export const POST = withAuth(handleRespond);
