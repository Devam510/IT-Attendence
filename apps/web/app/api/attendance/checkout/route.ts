// NEXUS — POST /api/attendance/checkout
// Verifies session token matches check-in device — prevents buddy check-out

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nexus/db";
import { withAuth } from "@/lib/auth";
import { success, error, logger } from "@/lib/errors";
import type { JwtPayload } from "@nexus/shared";

async function handleCheckOut(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body is ok */ }

    const sessionToken = body.sessionToken as string | undefined;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    // Find today's check-in record
    const record = await prisma.attendanceRecord.findFirst({
        where: {
            userId: auth.sub,
            date: { gte: todayStart, lt: tomorrowStart },
            checkInAt: { not: null },
            checkOutAt: null,
        },
    });

    if (!record) {
        return error("NO_CHECKIN", "No active check-in found for today", 404);
    }

    // ── Device session verification ──────────────────────────────
    // Retrieve stored session token and device info from anomalyFlags
    const flags = record.anomalyFlags as Record<string, string> | null;
    const storedToken = flags?.sessionToken;

    if (storedToken && sessionToken) {
        // Both tokens present — enforce match
        if (sessionToken !== storedToken) {
            const checkInDevice = flags?.checkInDevice || "another device";
            logger.warn({
                userId: auth.sub,
                recordId: record.id,
                expected: storedToken.slice(0, 8) + "...",
                received: sessionToken.slice(0, 8) + "...",
            }, "Checkout device mismatch — possible buddy checkout attempt");

            return error(
                "DEVICE_MISMATCH",
                `You must check out from the same device used for check-in (${checkInDevice}). This incident has been logged.`,
                403,
                { checkInDevice }
            );
        }
    }
    // If sessionToken is missing (older records or first deploy), allow but log warning
    if (storedToken && !sessionToken) {
        logger.warn({ userId: auth.sub, recordId: record.id }, "Checkout without session token — consider enforcing on client");
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

    // Update device info and check-out time
    const updatedFlags = {
        ...(flags || {}),
        checkOutDevice,
        checkOutUserAgent,
        checkOutIp,
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
        deviceMatch: !storedToken || !sessionToken || sessionToken === storedToken,
    });
}

export const POST = withAuth(handleCheckOut);
