// Vibe Tech Labs — POST /api/approvals/bulk
// Bulk approve or reject multiple workflows

import { NextRequest, NextResponse } from "next/server";
import { ApprovalBulkSchema } from "@vibetech/shared";
import { withAuth } from "@/lib/auth";
import { processApprovalDecision } from "@/lib/approval-chain";
import { logAuditEvent } from "@/lib/audit";
import { success, error, logger } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

interface BulkResultItem {
    workflowId: string;
    success: boolean;
    newStatus: string;
    message: string;
}

async function handleBulk(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
        return error("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const parsed = ApprovalBulkSchema.safeParse(body);
    if (!parsed.success) {
        return error("VALIDATION_ERROR", "Invalid bulk data", 422, parsed.error.errors);
    }

    const { ids, action, comment } = parsed.data;
    const results: BulkResultItem[] = [];

    // Process sequentially to avoid race conditions on shared resources
    for (const workflowId of ids) {
        const result = await processApprovalDecision({
            workflowId,
            action,
            actorId: auth.sub,
            comment,
        });

        results.push({
            workflowId,
            success: result.success,
            newStatus: result.newStatus,
            message: result.message,
        });
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    // Bulk audit
    await logAuditEvent({
        actorId: auth.sub,
        actorRole: auth.role,
        action: `approval.bulk_${action}`,
        resourceType: "approval",
        resourceId: `bulk:${ids.length}`,
        metadata: {
            total: ids.length,
            succeeded,
            failed,
            comment,
        },
    });

    logger.info({
        actorId: auth.sub,
        action,
        total: ids.length,
        succeeded,
        failed,
    }, "Bulk approval processed");

    return success({
        action,
        total: ids.length,
        succeeded,
        failed,
        results,
    });
}

export const POST = withAuth(handleBulk);
