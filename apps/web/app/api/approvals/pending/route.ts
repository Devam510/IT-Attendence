// Vibe Tech Labs — GET /api/approvals/pending
// Returns leave requests pending approval for manager/HR/admin

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import { success } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

async function handlePending(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "pending"; // pending | approved | rejected
    const type = searchParams.get("type") || "all";

    // Map status to Prisma enum
    const statusMap: Record<string, string | undefined> = {
        pending: "PENDING",
        approved: "APPROVED",
        rejected: "REJECTED",
    };
    const prismaStatus = statusMap[status];

    // Manager/HR sees their team's requests; SADM sees all
    let managerFilter = {};
    if (auth.role === "MGR") {
        // Get manager's direct reports
        const reports = await prisma.user.findMany({
            where: { managerId: auth.sub },
            select: { id: true },
        });
        managerFilter = { userId: { in: reports.map((r: { id: string }) => r.id) } };
    } else if (auth.role === "HRA") {
        // HR sees everyone in the entity
        managerFilter = { user: { entityId: auth.entityId } };
    } else if (auth.role === "SADM") {
        // Admin sees all — no filter
    } else {
        // Employee sees only their own requests
        managerFilter = { userId: auth.sub };
    }

    const leaveRequests = await prisma.leaveRequest.findMany({
        where: {
            ...(prismaStatus ? { status: prismaStatus as any } : {}),
            ...managerFilter,
        },
        include: {
            user: {
                select: {
                    id: true,
                    fullName: true,
                    employeeId: true,
                    role: true,
                    department: { select: { name: true } },
                },
            },
            leaveType: { select: { name: true, code: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
    });

    // Map to frontend ApprovalItem shape
    const codeToKey: Record<string, string> = { EL: "annual", SL: "sick", CL: "casual", CO: "comp" };

    const approvals = leaveRequests.map((lr) => ({
        id: lr.id,
        // Also expose workflowId as the same id for the respond API
        workflowId: lr.id,
        employeeId: lr.user.employeeId || lr.user.id,
        employeeName: lr.user.fullName,
        employeeRole: lr.user.role,
        department: lr.user.department?.name || "—",
        type: "leave" as const,
        leaveType: codeToKey[lr.leaveType?.code || ""] || lr.leaveType?.name?.toLowerCase() || "casual",
        leaveTypeName: lr.leaveType?.name,
        startDate: lr.startDate.toISOString().split("T")[0],
        endDate: lr.endDate.toISOString().split("T")[0],
        days: Math.ceil((lr.endDate.getTime() - lr.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1,
        reason: lr.reason || "",
        status: lr.status.toLowerCase() as "pending" | "approved" | "rejected",
        appliedAt: lr.createdAt.toISOString(),
    }));

    // Apply type filter to leaves
    const filteredLeaves = type === "all" || type === "leave" ? approvals : [];

    // Fetch Regularization Workflows
    let regularizations: any[] = [];
    if (type === "all" || type === "regularization") {
        const regWorkflows = await prisma.approvalWorkflow.findMany({
            where: {
                entityType: "regularization",
                ...(prismaStatus ? { status: prismaStatus as any } : {}),
                steps: {
                    path: ["0", "approverId"],
                    equals: auth.role === "MGR" ? auth.sub : undefined
                } // Simplified filter for demo
            },
            include: {
                requester: {
                    select: {
                        id: true,
                        fullName: true,
                        employeeId: true,
                        role: true,
                        department: { select: { name: true } },
                    }
                }
            },
            orderBy: { createdAt: "desc" },
            take: 50,
        });

        // We fetch the related RegularizationRequest data in a loop since ApprovalWorkflow is poly-morphic
        const regIds = regWorkflows.map(w => w.entityId);
        const regDetails = await prisma.regularizationRequest.findMany({
            where: { id: { in: regIds } }
        });
        const detailsMap = Object.fromEntries(regDetails.map(r => [r.id, r]));

        regularizations = regWorkflows.map(w => {
            const detail = detailsMap[w.entityId];
            return {
                id: w.id, // the frontend uses this for the respond API
                workflowId: w.id,
                employeeId: w.requester.employeeId || w.requester.id,
                employeeName: w.requester.fullName,
                employeeRole: w.requester.role,
                department: w.requester.department?.name || "—",
                type: "regularization" as const,
                leaveType: "regularization",
                startDate: detail?.requestedCheckIn?.toISOString().split("T")[0] || w.createdAt.toISOString().split("T")[0],
                endDate: detail?.requestedCheckOut?.toISOString().split("T")[0] || w.createdAt.toISOString().split("T")[0],
                days: 1,
                reason: detail?.reason || "Check-in time correction",
                status: w.status.toLowerCase() as "pending" | "approved" | "rejected",
                appliedAt: w.createdAt.toISOString(),
            };
        });
    }

    const unifiedApprovals = [...filteredLeaves, ...regularizations].sort(
        (a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime()
    );

    return success({
        approvals: unifiedApprovals,
        total: unifiedApprovals.length,
    });
}

export const GET = withAuth(handlePending);
