// Vibe Tech Labs — GET /api/leaves/history
// Returns leave request history with status filters

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nexus/db";
import { withAuth } from "@/lib/auth";
import { success, error } from "@/lib/errors";
import type { JwtPayload } from "@nexus/shared";

async function handleHistory(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;
    const url = new URL(req.url);

    const status = url.searchParams.get("status"); // PENDING, APPROVED, REJECTED, CANCELLED
    const yearParam = url.searchParams.get("year");
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));

    const where: Record<string, unknown> = {
        userId: auth.sub,
        startDate: {
            gte: new Date(year, 0, 1),
            lt: new Date(year + 1, 0, 1),
        },
    };

    if (status) {
        const validStatuses = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "REVOKED"];
        if (!validStatuses.includes(status)) {
            return error("INVALID_STATUS", `Invalid status filter. Valid: ${validStatuses.join(", ")}`, 400);
        }
        where["status"] = status;
    }

    const [records, total] = await Promise.all([
        prisma.leaveRequest.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
            include: {
                leaveType: { select: { name: true, code: true } },
            },
        }),
        prisma.leaveRequest.count({ where }),
    ]);

    return success({
        year,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        records: records.map((r: any) => ({
            id: r.id,
            leaveType: r.leaveType.name,
            leaveTypeCode: r.leaveType.code,
            startDate: r.startDate.toISOString().split("T")[0],
            endDate: r.endDate.toISOString().split("T")[0],
            halfDay: r.halfDay,
            reason: r.reason,
            status: r.status,
            approvedBy: r.approvedBy,
            createdAt: r.createdAt.toISOString(),
        })),
    });
}

export const GET = withAuth(handleHistory);
