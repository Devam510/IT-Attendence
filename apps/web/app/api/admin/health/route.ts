// NEXUS — GET /api/admin/health
// System health check and readiness probe

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nexus/db";
import { success } from "@/lib/errors";

// No auth required — health endpoint must be accessible for load balancers

async function handleHealth(req: NextRequest): Promise<NextResponse> {
    const start = Date.now();
    const checks: Record<string, { status: "UP" | "DOWN"; latencyMs: number; details?: string }> = {};

    // 1. Database connectivity
    try {
        const dbStart = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        checks["database"] = { status: "UP", latencyMs: Date.now() - dbStart };
    } catch (err) {
        checks["database"] = { status: "DOWN", latencyMs: Date.now() - start, details: String(err) };
    }

    // 2. Database table counts (basic integrity)
    try {
        const countStart = Date.now();
        const [userCount, entityCount] = await Promise.all([
            prisma.user.count(),
            prisma.entity.count(),
        ]);
        checks["data_integrity"] = {
            status: userCount >= 0 && entityCount >= 0 ? "UP" : "DOWN",
            latencyMs: Date.now() - countStart,
            details: `users: ${userCount}, entities: ${entityCount}`,
        };
    } catch (err) {
        checks["data_integrity"] = { status: "DOWN", latencyMs: 0, details: String(err) };
    }

    // 3. Memory usage
    const memUsage = process.memoryUsage();
    const heapUsedMb = Math.round(memUsage.heapUsed / 1024 / 1024);
    const heapTotalMb = Math.round(memUsage.heapTotal / 1024 / 1024);
    checks["memory"] = {
        status: heapUsedMb < heapTotalMb * 0.9 ? "UP" : "DOWN",
        latencyMs: 0,
        details: `${heapUsedMb}MB / ${heapTotalMb}MB heap`,
    };

    // 4. Uptime
    const uptimeSeconds = Math.floor(process.uptime());
    checks["uptime"] = {
        status: "UP",
        latencyMs: 0,
        details: `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`,
    };

    // Overall status
    const allUp = Object.values(checks).every(c => c.status === "UP");
    const totalLatency = Date.now() - start;

    const response = success({
        status: allUp ? "HEALTHY" : "DEGRADED",
        timestamp: new Date().toISOString(),
        version: process.env["APP_VERSION"] || "1.0.0",
        environment: process.env["NODE_ENV"] || "development",
        totalLatencyMs: totalLatency,
        checks,
    });

    // Set appropriate status code
    if (!allUp) {
        return new NextResponse(await response.text(), {
            status: 503,
            headers: { "Content-Type": "application/json" },
        });
    }

    return response;
}

export async function GET(req: NextRequest) {
    return handleHealth(req);
}
