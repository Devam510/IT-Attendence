// NEXUS — GET /api/attendance/today
// Returns today's attendance status for the current user

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

    if (!record) {
        return success({
            status: "NOT_CHECKED_IN",
            record: null,
        });
    }

    return success({
        status: record.checkOutAt ? "CHECKED_OUT" : (record.checkInAt ? "CHECKED_IN" : "NOT_CHECKED_IN"),
        record: {
            id: record.id,
            checkInAt: record.checkInAt?.toISOString() || null,
            checkOutAt: record.checkOutAt?.toISOString() || null,
            checkInMethod: record.checkInMethod,
            verificationScore: record.verificationScore,
            locationName: record.location?.name,
            status: record.status,
            totalHours: record.totalHours,
            overtimeHours: record.overtimeHours,
            anomalyFlags: record.anomalyFlags,
        },
    });
}

export const GET = withAuth(handleToday);
