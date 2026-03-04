// NEXUS — GET /api/approvals/pending
// Returns all pending approval items for the current user

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nexus/db";
import { withAuth } from "@/lib/auth";
import { getPendingApprovalsForUser } from "@/lib/approval-chain";
import { success } from "@/lib/errors";
import type { JwtPayload } from "@nexus/shared";

interface RequesterInfo {
    id: string;
    fullName: string;
    employeeId: string | null;
    designation: string | null;
}

async function handlePending(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    const pending = await getPendingApprovalsForUser(auth.sub);

    // Enrich with requester details
    const requesterIds = [...new Set(pending.map((p) => p.requesterId))];
    const requesters: RequesterInfo[] = await prisma.user.findMany({
        where: { id: { in: requesterIds } },
        select: { id: true, fullName: true, employeeId: true, designation: true },
    });
    const requesterMap = new Map(requesters.map((r: RequesterInfo) => [r.id, r]));

    const enriched = pending.map((p) => {
        const requester = requesterMap.get(p.requesterId);
        const slaHoursLeft = p.slaDeadline
            ? +((p.slaDeadline.getTime() - Date.now()) / (1000 * 60 * 60)).toFixed(1)
            : null;

        return {
            workflowId: p.id,
            entityType: p.entityType,
            entityId: p.entityId,
            requester: requester
                ? { id: requester.id, name: requester.fullName, employeeId: requester.employeeId, designation: requester.designation }
                : { id: p.requesterId, name: "Unknown" },
            step: p.currentStep + 1,
            slaDeadline: p.slaDeadline?.toISOString() || null,
            slaHoursLeft,
            isOverdue: slaHoursLeft != null && slaHoursLeft < 0,
            createdAt: p.createdAt.toISOString(),
        };
    });

    return success({
        total: enriched.length,
        items: enriched,
        overdue: enriched.filter((e) => e.isOverdue).length,
    });
}

export const GET = withAuth(handlePending);
