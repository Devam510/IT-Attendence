import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { success, error, logger } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

async function handleRespond(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    try {
        const input = await req.json();
        
        if (!input.workflowId || !input.action || !["approved", "rejected"].includes(input.action)) {
            return error("BAD_REQUEST", "Invalid input. Required: workflowId, action ('approved' or 'rejected').", 400);
        }

        const workflow = await prisma.approvalWorkflow.findUnique({
            where: { id: input.workflowId }
        });

        if (!workflow || workflow.entityType !== "regularization") {
            return error("NOT_FOUND", "Regularization workflow not found", 404);
        }

        if (workflow.status !== "PENDING") {
            return error("BAD_REQUEST", "Workflow is already resolved", 400);
        }

        const currentStepIndex = workflow.currentStep;
        let steps = workflow.steps as any[];
        const currentStep = steps[currentStepIndex];

        // Authorization check: Is the authenticated user the assigned approver?
        if (currentStep.approverId !== auth.sub && auth.role !== "SADM" && auth.role !== "HRA") {
            return error("UNAUTHORIZED", "Unauthorized to respond to this request", 403);
        }

        const newStatus = input.action === "approved" ? "APPROVED" : "REJECTED";
        
        // Update the step
        currentStep.status = newStatus;
        currentStep.actedAt = new Date().toISOString();
        if (input.comment) currentStep.comment = input.comment;
        steps[currentStepIndex] = currentStep;

        const regReqId = workflow.entityId;

        // Atomically resolve the workflow and update the attendance record if approved
        await prisma.$transaction(async (tx) => {
            // Update workflow
            await tx.approvalWorkflow.update({
                where: { id: workflow.id },
                data: {
                    status: newStatus,
                    steps: JSON.parse(JSON.stringify(steps)),
                    completedAt: new Date()
                }
            });

            // Update Regularization Request
            const regReq = await tx.regularizationRequest.update({
                where: { id: regReqId },
                data: { status: newStatus }
            });

            if (newStatus === "APPROVED") {
                // If the manager approved, calculate the new times
                const attendance = await tx.attendanceRecord.findUnique({
                    where: { id: regReq.attendanceId }
                });

                if (attendance) {
                    const finalCheckIn = regReq.requestedCheckIn || attendance.checkInAt;
                    const finalCheckOut = regReq.requestedCheckOut || attendance.checkOutAt;

                    let totalHours = 0;
                    let overtimeHours = 0;

                    if (finalCheckIn && finalCheckOut) {
                        const diffMs = finalCheckOut.getTime() - finalCheckIn.getTime();
                        totalHours = diffMs / (1000 * 60 * 60);
                        if (totalHours > 8) {
                            overtimeHours = totalHours - 8;
                        }
                    }

                    // Force the record to "REGULARIZED" and update timestamps and calculated hours
                    await tx.attendanceRecord.update({
                        where: { id: attendance.id },
                        data: {
                            status: "REGULARIZED",
                            checkInAt: finalCheckIn,
                            checkOutAt: finalCheckOut,
                            totalHours,
                            overtimeHours,
                            anomalyFlags: attendance.anomalyFlags 
                                ? { ...(attendance.anomalyFlags as any), regularized: true }
                                : { regularized: true }
                        }
                    });
                }
            }

            // Create in-app notification for the requester (employee)
            await tx.notification.create({
                data: {
                    userId: workflow.requesterId,
                    type: "REGULARIZATION_STATUS",
                    title: `Regularization ${newStatus === "APPROVED" ? "Approved" : "Rejected"}`,
                    body: `Your manager has ${newStatus.toLowerCase()} your attendance time correction.`,
                    data: { workflowId: workflow.id, status: newStatus }
                }
            });
        });

        // Audit Log
        await logAuditEvent({
            actorId: auth.sub,
            actorRole: auth.role,
            action: `regularization.${input.action}`,
            resourceType: "regularization",
            resourceId: regReqId,
            metadata: { workflowId: workflow.id, comment: input.comment }
        }).catch(() => {});

        logger.info({ userId: auth.sub, workflowId: workflow.id, action: input.action }, "Regularization responded");

        return success({
            message: `Regularization request successfully ${input.action}.`,
            status: newStatus
        });

    } catch (e) {
        logger.error({ err: e }, "Failed to process regularization response");
        return error("INTERNAL_SERVER_ERROR", "Internal server error", 500);
    }
}

export const POST = withAuth(handleRespond);
