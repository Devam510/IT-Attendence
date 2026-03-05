// Vibe Tech Labs — Health Check Endpoint
// GET /api/health → 200 OK with service status

import { NextResponse } from "next/server";
import { prisma } from "@nexus/db";
import { getRedis } from "@/lib/redis";

export async function GET() {
    const checks: Record<string, string> = {};
    let healthy = true;

    try {
        await prisma.$queryRaw`SELECT 1`;
        checks.database = "ok";
    } catch {
        checks.database = "error";
        healthy = false;
    }

    try {
        const redis = await getRedis();
        if (!redis) throw new Error("Redis unavailable");
        await redis.ping();
        checks.redis = "ok";
    } catch {
        checks.redis = "error";
        healthy = false;
    }

    return NextResponse.json(
        {
            status: healthy ? "healthy" : "degraded",
            version: process.env.npm_package_version || "0.1.0",
            timestamp: new Date().toISOString(),
            checks,
        },
        { status: healthy ? 200 : 503 }
    );
}
