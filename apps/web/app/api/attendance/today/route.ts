// NEXUS — GET /api/attendance/today
// Returns today's attendance status matching frontend TodayData interface

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nexus/db";
import { withAuth } from "@/lib/auth";
import { success } from "@/lib/errors";
import type { JwtPayload } from "@nexus/shared";

async function handleToday(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    // Calculate "today" in IST (UTC+5:30), not in server's UTC timezone
    const nowUtc = new Date();
    const istOffsetMs = 5.5 * 60 * 60 * 1000; // IST = UTC + 5:30
    const nowIst = new Date(nowUtc.getTime() + istOffsetMs);
    // IST midnight today
    const todayStart = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()) - istOffsetMs);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const record = await prisma.attendanceRecord.findFirst({
        where: {
            userId: auth.sub,
            // Use checkInAt timestamp range in IST — avoids UTC-midnight date storage mismatch
            checkInAt: { gte: todayStart, lt: tomorrowStart },
        },
        include: {
            location: { select: { name: true } },
        },
    });

    if (!record || !record.checkInAt) {
        // Frontend expects: { checkedIn: boolean, ... }
        return success({
            checkedIn: false,
            checkInTime: null,
            checkOutTime: null,
            location: null,
            verificationScore: null,
            totalMinutes: null,
        });
    }

    const now = new Date();
    const checkedOut = !!record.checkOutAt;
    const totalMs = checkedOut
        ? record.checkOutAt!.getTime() - record.checkInAt.getTime()
        : now.getTime() - record.checkInAt.getTime();
    const totalMinutes = Math.floor(totalMs / 60000);

    // Format times in IST (server runs in UTC on Vercel, so we must specify timezone)
    const timeOpts: Intl.DateTimeFormatOptions = {
        hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
    };

    return success({
        checkedIn: !checkedOut, // still checked in (no checkout yet)
        checkInTime: record.checkInAt.toLocaleTimeString("en-US", timeOpts),
        checkOutTime: record.checkOutAt?.toLocaleTimeString("en-US", timeOpts) || null,
        location: record.location?.name || null,
        verificationScore: record.verificationScore,
        totalMinutes,
    });
}

export const GET = withAuth(handleToday);
