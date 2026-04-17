// TEMP DEBUG - no imports at all
export const runtime = "nodejs";

export async function GET() {
    const { NextResponse } = await import("next/server");

    const info: Record<string, unknown> = {
        node_version: process.version,
        DATABASE_URL: process.env.DATABASE_URL
            ? process.env.DATABASE_URL.replace(/:([^:@]+)@/, ":***@").substring(0, 60) + "..."
            : "NOT SET",
        JWT_SECRET: process.env.JWT_SECRET ? "SET" : "NOT SET",
        NODE_ENV: process.env.NODE_ENV,
    };

    // Test DB with raw pg (no prisma)
    try {
        const { default: pg } = await import("pg").catch(() => ({ default: null }));
        if (pg) {
            const client = new (pg as any).Client({ connectionString: process.env.DATABASE_URL });
            await client.connect();
            const res = await client.query("SELECT 1 as ok");
            await client.end();
            info.RAW_PG = "SUCCESS: " + JSON.stringify(res.rows);
        } else {
            info.RAW_PG = "pg module not available";
        }
    } catch (e: unknown) {
        info.RAW_PG_ERROR = e instanceof Error ? e.message : String(e);
    }

    // Test prisma import
    try {
        const mod = await import("@vibetech/db");
        info.PRISMA_IMPORT = "SUCCESS";
        try {
            const result = await Promise.race([
                (mod.prisma as any).$queryRaw`SELECT 1 as ok`,
                new Promise((_, reject) => setTimeout(() => reject(new Error("5s timeout")), 5000))
            ]);
            info.PRISMA_QUERY = "SUCCESS: " + JSON.stringify(result);
        } catch (qe: unknown) {
            info.PRISMA_QUERY_ERROR = qe instanceof Error ? qe.message : String(qe);
        }
    } catch (e: unknown) {
        info.PRISMA_IMPORT_ERROR = e instanceof Error ? e.message : String(e);
        info.PRISMA_IMPORT_STACK = e instanceof Error ? e.stack?.split("\n").slice(0, 8).join(" | ") : "";
    }

    return NextResponse.json(info, { status: 200 });
}
