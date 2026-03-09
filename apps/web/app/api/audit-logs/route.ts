// Vibe Tech Labs — GET /api/audit-logs
// Filterable, exportable audit log query API

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withRole } from "@/lib/auth";
import { success } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

// ─── Security View Handler ────────────────────────────────────────────────────
// Called when ?view=security — returns metrics, security events, and anomalies
// shaped for the Security Dashboard page.

async function handleSecurityView(req: NextRequest): Promise<NextResponse> {
    const url = new URL(req.url);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch recent audit events with actor info
    const rawEvents = await prisma.auditEvent.findMany({
        orderBy: { timestamp: "desc" },
        take: limit,
        include: {
            actor: {
                select: {
                    fullName: true,
                    email: true,
                },
            },
        },
    });

    // Count failed logins today
    const failedLoginsToday = await prisma.auditEvent.count({
        where: {
            action: { contains: "auth.login" },
            riskScore: { gte: 50 },
            timestamp: { gte: today },
        },
    });

    // Count trusted devices
    const trustedDevices = await prisma.device.count({
        where: { trustScore: { gte: 70 } },
    });

    // Compute risk score: average of top-risk events (last 50)
    const topEvents = await prisma.auditEvent.findMany({
        orderBy: { timestamp: "desc" },
        take: 50,
        select: { riskScore: true },
    });
    const riskScores = topEvents.map((e) => e.riskScore ?? 0);
    const avgRisk =
        riskScores.length > 0
            ? Math.round(riskScores.reduce((a, b) => a + b, 0) / riskScores.length)
            : 0;

    // Active threats = high-risk events in last 24h
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeThreats = await prisma.auditEvent.count({
        where: {
            riskScore: { gte: 75 },
            timestamp: { gte: since24h },
        },
    });

    // Map severity from riskScore
    function getSeverity(score: number | null): "critical" | "high" | "medium" | "low" {
        if (!score) return "low";
        if (score >= 80) return "critical";
        if (score >= 60) return "high";
        if (score >= 35) return "medium";
        return "low";
    }

    // Transform raw events into SecurityEvent shape
    const events = rawEvents.map((e) => {
        const geo = e.geoLocation as Record<string, string> | null;
        const meta = e.metadata as Record<string, string> | null;
        return {
            id: e.id,
            time: e.timestamp.toISOString(),
            eventType: e.action,
            userName: e.actor?.fullName ?? (e.actorId ? `User ${e.actorId.slice(0, 6)}` : "Unknown"),
            userEmail: e.actor?.email ?? "",
            location: geo?.city && geo?.country ? `${geo.city}, ${geo.country}` : (geo?.country ?? "Unknown"),
            device: meta?.device || meta?.platform || e.deviceId?.slice(0, 8) || "Unknown",
            severity: getSeverity(e.riskScore),
            ipAddress: e.ipAddress ?? "",
        };
    });

    // Derive anomalies from high-risk events (riskScore >= 60)
    const anomalies = rawEvents
        .filter((e) => (e.riskScore ?? 0) >= 60)
        .slice(0, 10)
        .map((e) => {
            const meta = e.metadata as Record<string, string> | null;
            return {
                id: e.id,
                title: meta?.anomalyTitle || `Suspicious: ${e.action}`,
                meta: meta?.anomalyDetail || `Actor: ${e.actor?.fullName ?? e.actorId ?? "unknown"} — IP: ${e.ipAddress ?? "n/a"}`,
                severity: getSeverity(e.riskScore),
                time: e.timestamp.toISOString(),
            };
        });

    return success({
        metrics: {
            riskScore: avgRisk,
            activeThreats,
            trustedDevices,
            failedLoginsToday,
        },
        events,
        anomalies,
    });
}

// ─── Standard Audit Log Handler ───────────────────────────────────────────────

async function handleAuditLogs(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const url = new URL(req.url);

    // Delegate to security view if requested
    if (url.searchParams.get("view") === "security") {
        return handleSecurityView(req);
    }

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
