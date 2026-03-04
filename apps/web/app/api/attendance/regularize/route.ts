// NEXUS — POST /api/attendance/regularize
// Allows employees to request regularization for missed/incorrect check-ins
// Creates an ApprovalWorkflow entry

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nexus/db";
import { RegularizeSchema } from "@nexus/shared";
import { withAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { success, error, logger } from "@/lib/errors";
import type { JwtPayload } from "@nexus/shared";

async function handleRegularize(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
        return error("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const parsed = RegularizeSchema.safeParse(body);
    if (!parsed.success) {
        return error("VALIDATION_ERROR", "Invalid regularization data", 422, parsed.error.errors);
    }

    const input = parsed.data;
    const targetDate = new Date(input.date);
    targetDate.setHours(0, 0, 0, 0);

    // Prevent future date regularization
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    if (targetDate >= todayMidnight) {
        return error("INVALID_DATE", "Cannot regularize a future date", 400);
    }

    // Get user's manager for approval
    const user = await prisma.user.findUnique({
        where: { id: auth.sub },
        select: { managerId: true, fullName: true },
    });

    if (!user?.managerId) {
        return error("NO_MANAGER", "No manager assigned for approval routing", 400);
    }

    // Check for existing pending regularization for same date using entityId
    const entityId = `reg:${auth.sub}:${input.date}`;
    const existingRequest = await prisma.approvalWorkflow.findFirst({
        where: {
            entityId,
            entityType: "regularization",
            status: "PENDING",
        },
    });

    if (existingRequest) {
        return error("DUPLICATE_REQUEST", "A regularization request for this date is already pending", 409);
    }

    // Create approval workflow
    const workflow = await prisma.approvalWorkflow.create({
        data: {
            entityType: "regularization",
            entityId,
            requesterId: auth.sub,
            currentStep: 0,
            status: "PENDING",
            steps: JSON.parse(JSON.stringify([{
                approverId: user.managerId,
                status: "PENDING",
                comment: null,
                actedAt: null,
                // Embed regularization details in the first step
                metadata: {
                    date: input.date,
                    reason: input.reason,
                    checkInAt: input.checkInAt || null,
                    checkOutAt: input.checkOutAt || null,
                    requestedBy: user.fullName,
                },
            }])),
        },
    });

    // Audit
    await logAuditEvent({
        actorId: auth.sub,
        actorRole: auth.role,
        action: "attendance.regularize_requested",
        resourceType: "approval",
        resourceId: workflow.id,
        metadata: { date: input.date, reason: input.reason },
    });

    logger.info({ userId: auth.sub, workflowId: workflow.id, date: input.date }, "Regularization requested");

    return success({
        workflowId: workflow.id,
        status: "PENDING",
        approver: user.managerId,
        date: input.date,
    }, 201);
}

export const POST = withAuth(handleRegularize);
