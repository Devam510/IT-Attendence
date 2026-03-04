// NEXUS — GET /api/attendance/history
// Returns monthly attendance calendar data
// Query: ?month=2026-03

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nexus/db";
import { withAuth } from "@/lib/auth";
import { success, error } from "@/lib/errors";
import type { JwtPayload } from "@nexus/shared";

async function handleHistory(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;
    const url = new URL(req.url);
    const month = url.searchParams.get("month"); // "2026-03"

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        return error("INVALID_INPUT", "Query param 'month' required in YYYY-MM format", 400);
    }

    const [yearStr, monStr] = month.split("-");
    const year = parseInt(yearStr ?? "2026", 10);
    const mon = parseInt(monStr ?? "1", 10);
    const startDate = new Date(year, mon - 1, 1);
    const endDate = new Date(year, mon, 1);

    const records = await prisma.attendanceRecord.findMany({
        where: {
            userId: auth.sub,
            date: { gte: startDate, lt: endDate },
        },
        orderBy: { date: "asc" },
        select: {
            id: true,
            date: true,
            checkInAt: true,
            checkOutAt: true,
            checkInMethod: true,
            status: true,
            verificationScore: true,
            totalHours: true,
            overtimeHours: true,
            anomalyFlags: true,
        },
    });

    // Build calendar summary
    type AttendanceRecord = (typeof records)[number];
    const daysInMonth = new Date(year, mon, 0).getDate();
    const calendar: Record<string, unknown>[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${month}-${String(day).padStart(2, "0")}`;
        const dayRecords = records.filter((r: AttendanceRecord) => {
            const d = new Date(r.date);
            return d.getDate() === day;
        });

        if (dayRecords.length > 0) {
            const rec = dayRecords[0]!;
            calendar.push({
                date: dateStr,
                status: rec.status,
                checkInAt: rec.checkInAt?.toISOString() || null,
                checkOutAt: rec.checkOutAt?.toISOString() || null,
                totalHours: rec.totalHours,
                overtimeHours: rec.overtimeHours,
                checkInMethod: rec.checkInMethod,
                verificationScore: rec.verificationScore,
                hasAnomaly: rec.anomalyFlags != null,
            });
        } else {
            const dayDate = new Date(year, mon - 1, day);
            const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
            const todayMidnight = new Date();
            todayMidnight.setHours(0, 0, 0, 0);
            const isPast = dayDate < todayMidnight;
            calendar.push({
                date: dateStr,
                status: isWeekend ? "WEEKEND" : (isPast ? "ABSENT" : "UPCOMING"),
                checkInAt: null,
                checkOutAt: null,
                totalHours: null,
            });
        }
    }

    // Calculate summary
    type AttendanceRec = (typeof records)[number];
    const totalPresent = records.length;
    const totalHours = records.reduce((sum: number, r: AttendanceRec) => sum + (r.totalHours || 0), 0);
    const totalOvertime = records.reduce((sum: number, r: AttendanceRec) => sum + (r.overtimeHours || 0), 0);
    const flaggedDays = records.filter((r: AttendanceRec) => r.status === "FLAGGED").length;

    return success({
        month,
        calendar,
        summary: {
            totalPresent,
            totalHours: +totalHours.toFixed(2),
            totalOvertime: +totalOvertime.toFixed(2),
            flaggedDays,
            daysInMonth,
        },
    });
}

export const GET = withAuth(handleHistory);
