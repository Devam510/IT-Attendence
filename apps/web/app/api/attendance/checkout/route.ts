// NEXUS — POST /api/attendance/checkout
// Simple checkout — calculates total hours

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

    const checkOutTime = new Date();
    const diffMs = checkOutTime.getTime() - record.checkInAt!.getTime();
    const totalHours = +(diffMs / 3600000).toFixed(2);
    const overtimeHours = Math.max(0, +(totalHours - 8).toFixed(2));

    await prisma.attendanceRecord.update({
        where: { id: record.id },
        data: {
            checkOutAt: checkOutTime,
            totalHours,
            overtimeHours,
        },
    });

    logger.info({ userId: auth.sub, recordId: record.id, totalHours }, "Check-out recorded");

    return success({
        recordId: record.id,
        checkInAt: record.checkInAt!.toISOString(),
        checkOutAt: checkOutTime.toISOString(),
        totalHours,
        overtimeHours,
    });
}

export const POST = withAuth(handleCheckOut);
