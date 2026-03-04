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

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const record = await prisma.attendanceRecord.findFirst({
        where: {
            userId: auth.sub,
            date: { gte: todayStart, lt: tomorrowStart },
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

    return success({
        checkedIn: !checkedOut, // still checked in (no checkout yet)
        checkInTime: record.checkInAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }),
        checkOutTime: record.checkOutAt?.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }) || null,
        location: record.location?.name || null,
        verificationScore: record.verificationScore,
        totalMinutes,
    });
}

export const GET = withAuth(handleToday);
