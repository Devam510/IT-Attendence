// Vibe Tech Labs — POST /api/attendance/break
// Persists break start/end to anomalyFlags.breaks on the today's attendance record

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import { success, error } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

interface BreakEntry { start: string; end: string | null; }

async function handleBreak(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body ok */ }

    const action = body.action as "start" | "end" | undefined;
    if (action !== "start" && action !== "end") {
        return error("INVALID_ACTION", "action must be 'start' or 'end'", 400);
    }

    const now = new Date();
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const nowIst = new Date(now.getTime() + istOffsetMs);
    const todayStart = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()) - istOffsetMs);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    // Find today's open record
    const record = await prisma.attendanceRecord.findFirst({
        where: {
            userId: auth.sub,
            checkInAt: { gte: todayStart, lt: tomorrowStart },
        },
        select: { id: true, anomalyFlags: true },
    });

    if (!record) {
        return error("NO_CHECKIN", "No check-in record found for today", 404);
    }

    const flags = (record.anomalyFlags as Record<string, unknown>) || {};
    const breaks: BreakEntry[] = (flags.breaks as BreakEntry[]) || [];

    if (action === "start") {
        breaks.push({ start: now.toISOString(), end: null });
    } else {
        // Find latest open break and close it
        const last = breaks[breaks.length - 1];
        if (last && !last.end) {
            last.end = now.toISOString();
        }
    }

    await prisma.attendanceRecord.update({
        where: { id: record.id },
        data: {
            anomalyFlags: JSON.parse(JSON.stringify({ ...flags, breaks })),
        },
    });

    return success({ breaks });
}

export const POST = withAuth(handleBreak);
