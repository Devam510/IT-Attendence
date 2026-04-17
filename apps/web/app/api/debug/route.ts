// TEMPORARY DEBUG ENDPOINT - DELETE AFTER FIXING
import { NextResponse } from "next/server";

export async function GET() {
    const results: Record<string, unknown> = {};

    // 1. Check env vars
    results.DATABASE_URL_SET = !!process.env.DATABASE_URL;
    results.DATABASE_URL_PREFIX = process.env.DATABASE_URL?.substring(0, 40) + "...";
    results.JWT_SECRET_SET = !!process.env.JWT_SECRET;
    results.REDIS_URL_SET = !!process.env.REDIS_URL;
    results.NODE_ENV = process.env.NODE_ENV;

    // 2. Test DB connection
    try {
        const { prisma } = await import("@vibetech/db");
        const count = await prisma.$queryRaw`SELECT 1 as test`;
        results.DB_CONNECTION = "SUCCESS";
        results.DB_QUERY = count;
    } catch (err: unknown) {
        results.DB_CONNECTION = "FAILED";
        results.DB_ERROR = err instanceof Error ? err.message : String(err);
        results.DB_ERROR_CODE = (err as any)?.code;
        results.DB_ERROR_STACK = err instanceof Error ? err.stack?.split("\n").slice(0, 5).join(" | ") : "";
    }

    // 3. Test Redis
    try {
        const { getRedis } = await import("@/lib/redis");
        const redis = await getRedis();
        results.REDIS_CONNECTION = redis ? "SUCCESS" : "NOT_AVAILABLE_GRACEFUL";
    } catch (err: unknown) {
        results.REDIS_CONNECTION = "FAILED";
        results.REDIS_ERROR = err instanceof Error ? err.message : String(err);
    }

    return NextResponse.json(results);
}
