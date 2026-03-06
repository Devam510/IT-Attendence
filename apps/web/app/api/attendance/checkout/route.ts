// Vibe Tech Labs — POST /api/attendance/checkout
// Verifies session token matches check-in device — prevents buddy check-out

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import { success, error, logger } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

async function handleCheckOut(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body is ok */ }

    const sessionToken = body.sessionToken as string | undefined;
    const earlyReason = body.earlyReason as string | undefined;

    const now = new Date();
    // Calculate "today" in IST (UTC+5:30), not in server's UTC timezone
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const nowIst = new Date(now.getTime() + istOffsetMs);
    const todayStart = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()) - istOffsetMs);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    // Find today's check-in record — use checkInAt timestamp range (IST) not date field
    const record = await prisma.attendanceRecord.findFirst({
        where: {
            userId: auth.sub,
            checkInAt: { gte: todayStart, lt: tomorrowStart },
            checkOutAt: null,
        },
    });

    if (!record) {
        return error("NO_CHECKIN", "No active check-in found for today", 404);
    }

    // ── Device session verification ──────────────────────────────
    // sessionToken is OPTIONAL for web sessions — JWT already proves identity.
    // We only actively block when BOTH tokens exist AND they don't match
    // (true buddy-checkout: different person's token was sent).
    const flags = record.anomalyFlags as Record<string, string> | null;
    const storedToken = flags?.sessionToken;

    if (storedToken && sessionToken && sessionToken !== storedToken) {
        const checkInDevice = flags?.checkInDevice || "another device";
        logger.warn({
            userId: auth.sub,
            recordId: record.id,
            expected: storedToken.slice(0, 8) + "...",
            received: sessionToken.slice(0, 8) + "...",
        }, "Checkout device mismatch — possible buddy checkout blocked");

        return error(
            "DEVICE_MISMATCH",
            `You must check out from the same device used for check-in (${checkInDevice}). This incident has been logged.`,
            403,
            { checkInDevice }
        );
    }

    // ── Capture checkout device info ─────────────────────────────
    const checkOutUserAgent = req.headers.get("user-agent") || "Unknown device";
    const checkOutIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || req.headers.get("x-real-ip")
        || "Unknown IP";
    const checkOutDevice = /mobile|android|iphone|ipad/i.test(checkOutUserAgent) ? "Mobile" : "Desktop/Browser";

    const checkOutTime = new Date();
    const diffMs = checkOutTime.getTime() - record.checkInAt!.getTime();
    const totalHours = +(diffMs / 3600000).toFixed(2);
    const overtimeHours = Math.max(0, +(totalHours - 8).toFixed(2));
    const isHalfDay = totalHours < 4;

    // Update device info and check-out time
    const updatedFlags = {
        ...(flags || {}),
        checkOutDevice,
        checkOutUserAgent,
        checkOutIp,
        ...(isHalfDay ? { isHalfDay: true } : {}),
        ...(isHalfDay && earlyReason ? { earlyReason } : {}),
    };

    await prisma.attendanceRecord.update({
        where: { id: record.id },
        data: {
            checkOutAt: checkOutTime,
            totalHours,
            overtimeHours,
            anomalyFlags: JSON.parse(JSON.stringify(updatedFlags)),
        },
    });

    logger.info({
        userId: auth.sub,
        recordId: record.id,
        totalHours,
        checkInDevice: flags?.checkInDevice,
        checkOutDevice,
        sameDevice: flags?.checkInDevice === checkOutDevice,
    }, "Check-out recorded");

    return success({
        recordId: record.id,
        checkInAt: record.checkInAt!.toISOString(),
        checkOutAt: checkOutTime.toISOString(),
        totalHours,
        overtimeHours,
        isHalfDay,
        deviceMatch: !storedToken || !sessionToken || sessionToken === storedToken,
    });
}

export const POST = withAuth(handleCheckOut);
