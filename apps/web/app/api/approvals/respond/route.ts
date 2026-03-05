// Vibe Tech Labs — POST /api/approvals/respond
// Approve or reject a single approval workflow

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { ApprovalRespondSchema } from "@vibetech/shared";
import { withAuth } from "@/lib/auth";
import { processApprovalDecision } from "@/lib/approval-chain";
import { debitLeaveBalance, releaseLeaveBalance, calculateLeaveDays } from "@/lib/leave-accrual";
import { logAuditEvent } from "@/lib/audit";
import { success, error, logger } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

async function handleRespond(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
        return error("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const parsed = ApprovalRespondSchema.safeParse(body);
    if (!parsed.success) {
        return error("VALIDATION_ERROR", "Invalid response data", 422, parsed.error.errors);
    }

    const { action, comment } = parsed.data;
    const workflowId = body["workflowId"] as string;

    if (!workflowId || typeof workflowId !== "string") {
        return error("MISSING_WORKFLOW_ID", "workflowId is required", 400);
    }

    // Process the decision
    const result = await processApprovalDecision({
        workflowId,
        action,
        actorId: auth.sub,
        comment,
    });

    if (!result.success) {
        return error("APPROVAL_FAILED", result.message, 400);
    }

    // Side effects on completion
    const workflow = await prisma.approvalWorkflow.findUnique({
        where: { id: workflowId },
    });

    if (workflow && result.isComplete) {
        if (workflow.entityType === "leave") {
            const leaveRequest = await prisma.leaveRequest.findUnique({
                where: { id: workflow.entityId },
            });

            if (leaveRequest) {
                if (result.newStatus === "APPROVED") {
                    // Move from pending to used
                    const days = calculateLeaveDays(leaveRequest.startDate, leaveRequest.endDate, leaveRequest.halfDay);
                    await debitLeaveBalance(leaveRequest.userId, leaveRequest.leaveTypeId, leaveRequest.startDate.getFullYear(), days);

                    await prisma.leaveRequest.update({
                        where: { id: leaveRequest.id },
                        data: { status: "APPROVED", approvedBy: auth.sub },
                    });
                } else if (result.newStatus === "REJECTED") {
                    // Release reserved balance
                    const days = calculateLeaveDays(leaveRequest.startDate, leaveRequest.endDate, leaveRequest.halfDay);
                    await releaseLeaveBalance(leaveRequest.userId, leaveRequest.leaveTypeId, leaveRequest.startDate.getFullYear(), days);

                    await prisma.leaveRequest.update({
                        where: { id: leaveRequest.id },
                        data: { status: "REJECTED", approvedBy: auth.sub },
                    });
                }
            }
        }

        // For regularization approvals — create/update attendance record
        if (workflow.entityType === "regularization" && result.newStatus === "APPROVED") {
            // Extract date from entityId (format: reg:userId:date)
            const parts = workflow.entityId.split(":");
            const dateStr = parts[2];
            if (dateStr) {
                const targetDate = new Date(dateStr);
                targetDate.setHours(0, 0, 0, 0);

                await prisma.attendanceRecord.upsert({
                    where: {
                        userId_date: {
                            userId: workflow.requesterId,
                            date: targetDate,
                        },
                    },
                    create: {
                        userId: workflow.requesterId,
                        date: targetDate,
                        status: "REGULARIZED",
                        checkInMethod: "MANUAL",
                    },
                    update: {
                        status: "REGULARIZED",
                    },
                });
            }
        }
    }

    // Audit
    await logAuditEvent({
        actorId: auth.sub,
        actorRole: auth.role,
        action: `approval.${action}`,
        resourceType: "approval",
        resourceId: workflowId,
        metadata: {
            entityType: workflow?.entityType,
            entityId: workflow?.entityId,
            comment,
            newStatus: result.newStatus,
        },
    });

    logger.info({ actorId: auth.sub, workflowId, action, newStatus: result.newStatus }, "Approval response processed");

    return success({
        workflowId,
        action,
        newStatus: result.newStatus,
        isComplete: result.isComplete,
        message: result.message,
    });
}

export const POST = withAuth(handleRespond);
