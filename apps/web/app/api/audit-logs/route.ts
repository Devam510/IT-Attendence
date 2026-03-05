// Vibe Tech Labs — GET /api/audit-logs
// Filterable, exportable audit log query API

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withRole } from "@/lib/auth";
import { success } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

async function handleAuditLogs(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const url = new URL(req.url);

    // Pagination
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));

    // Filters
    const actorId = url.searchParams.get("actorId");
    const action = url.searchParams.get("action");
    const resourceType = url.searchParams.get("resourceType");
    const resourceId = url.searchParams.get("resourceId");
    const fromDate = url.searchParams.get("from");
    const toDate = url.searchParams.get("to");
    const riskMin = url.searchParams.get("riskMin");
    const format = url.searchParams.get("format"); // "json" (default) or "csv"

    // Build where clause
    const where: Record<string, unknown> = {};
    if (actorId) where["actorId"] = actorId;
    if (action) where["action"] = { contains: action };
    if (resourceType) where["resourceType"] = resourceType;
    if (resourceId) where["resourceId"] = resourceId;
    if (riskMin) where["riskScore"] = { gte: parseInt(riskMin, 10) };

    if (fromDate || toDate) {
        const timestampFilter: Record<string, Date> = {};
        if (fromDate) timestampFilter["gte"] = new Date(fromDate);
        if (toDate) timestampFilter["lte"] = new Date(toDate);
        where["timestamp"] = timestampFilter;
    }

    const [events, total] = await Promise.all([
        prisma.auditEvent.findMany({
            where,
            orderBy: { timestamp: "desc" },
            skip: (page - 1) * limit,
            take: limit,
            select: {
                id: true,
                timestamp: true,
                actorId: true,
                actorRole: true,
                action: true,
                resourceType: true,
                resourceId: true,
                ipAddress: true,
                riskScore: true,
                metadata: true,
                hashChain: true,
            },
        }),
        prisma.auditEvent.count({ where }),
    ]);

    // CSV export mode
    if (format === "csv") {
        const header = "timestamp,actorId,actorRole,action,resourceType,resourceId,ipAddress,riskScore\n";
        const rows = events.map((e: any) =>
            `${e.timestamp.toISOString()},${e.actorId || ""},${e.actorRole || ""},${e.action},${e.resourceType},${e.resourceId || ""},${e.ipAddress || ""},${e.riskScore ?? ""}`
        ).join("\n");

        return new NextResponse(header + rows, {
            headers: {
                "Content-Type": "text/csv",
                "Content-Disposition": `attachment; filename="audit_log_${new Date().toISOString().split("T")[0]}.csv"`,
            },
        });
    }

    return success({
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        events: events.map((e: any) => ({
            id: e.id,
            timestamp: e.timestamp.toISOString(),
            actorId: e.actorId,
            actorRole: e.actorRole,
            action: e.action,
            resourceType: e.resourceType,
            resourceId: e.resourceId,
            ipAddress: e.ipAddress,
            riskScore: e.riskScore,
            metadata: e.metadata,
            hashValid: !!e.hashChain,
        })),
    });
}

export const GET = withRole("HRA", "SADM")(handleAuditLogs);
