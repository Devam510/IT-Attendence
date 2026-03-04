// NEXUS — POST /api/approvals/delegate
// Delegate current approval step to another user

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nexus/db";
import { ApprovalDelegateSchema } from "@nexus/shared";
import { withAuth } from "@/lib/auth";
import { delegateApproval } from "@/lib/approval-chain";
import { logAuditEvent } from "@/lib/audit";
import { success, error, logger } from "@/lib/errors";
import type { JwtPayload } from "@nexus/shared";

async function handleDelegate(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
        return error("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const parsed = ApprovalDelegateSchema.safeParse(body);
    if (!parsed.success) {
        return error("VALIDATION_ERROR", "Invalid delegation data", 422, parsed.error.errors);
    }

    const { delegateToUserId, reason } = parsed.data;
    const workflowId = body["workflowId"] as string;

    if (!workflowId || typeof workflowId !== "string") {
        return error("MISSING_WORKFLOW_ID", "workflowId is required", 400);
    }

    // Verify delegate user exists
    const delegateUser = await prisma.user.findUnique({
        where: { id: delegateToUserId },
        select: { id: true, status: true, fullName: true },
    });

    if (!delegateUser || delegateUser.status !== "ACTIVE") {
        return error("INVALID_DELEGATE", "Delegate user not found or inactive", 400);
    }

    // Cannot delegate to yourself
    if (delegateToUserId === auth.sub) {
        return error("SELF_DELEGATE", "Cannot delegate to yourself", 400);
    }

    const result = await delegateApproval(workflowId, auth.sub, delegateToUserId, reason);

    if (!result.success) {
        return error("DELEGATE_FAILED", result.message, 400);
    }

    // Audit
    await logAuditEvent({
        actorId: auth.sub,
        actorRole: auth.role,
        action: "approval.delegate",
        resourceType: "approval",
        resourceId: workflowId,
        metadata: {
            delegatedTo: delegateToUserId,
            delegateName: delegateUser.fullName,
            reason,
        },
    });

    logger.info({ actorId: auth.sub, workflowId, delegateTo: delegateToUserId }, "Approval delegated");

    return success({
        workflowId,
        delegatedTo: {
            id: delegateUser.id,
            name: delegateUser.fullName,
        },
        message: result.message,
    });
}

export const POST = withAuth(handleDelegate);
