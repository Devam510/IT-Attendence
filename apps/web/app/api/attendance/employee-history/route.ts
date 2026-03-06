// Vibe Tech Labs — GET /api/attendance/employee-history
// Admin/HR only: returns monthly attendance calendar for ANY employee
// Query: ?userId=<id>&month=2026-03

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import { success, error } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

async function handleEmployeeHistory(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    // Only Admin, HR Admin, or Manager can view other employees' attendance
    if (auth.role === "EMPLOYEE") {
        return error("FORBIDDEN", "Access denied", 403);
    }

    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    const month = url.searchParams.get("month"); // "2026-03"

    if (!userId) {
        return error("INVALID_INPUT", "Query param 'userId' is required", 400);
    }
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        return error("INVALID_INPUT", "Query param 'month' required in YYYY-MM format", 400);
    }

    // Verify the target user exists
    const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, fullName: true, employeeId: true, department: true, designation: true },
    });
    if (!targetUser) {
        return error("NOT_FOUND", "Employee not found", 404);
    }

    const [yearStr, monStr] = month.split("-");
    const year = parseInt(yearStr ?? "2026", 10);
    const mon = parseInt(monStr ?? "1", 10);
    const startDate = new Date(year, mon - 1, 1);
    const endDate = new Date(year, mon, 1);

    const records = await prisma.attendanceRecord.findMany({
        where: {
            userId,
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

    // Build calendar — same logic as /api/attendance/history
    type AttendanceRecord = (typeof records)[number];
    const daysInMonth = new Date(year, mon, 0).getDate();
    const calendar: Record<string, unknown>[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${month}-${String(day).padStart(2, "0")}`;
        const dayRecords = records.filter((r: AttendanceRecord) =>
            new Date(r.date).getUTCDate() === day
        );

        if (dayRecords.length > 0) {
            const rec = dayRecords[0]!;
            const flags = rec.anomalyFlags as Record<string, unknown> | null;
            const remark = typeof flags?.remark === "string" && flags.remark.trim() ? flags.remark.trim() : null;
            const breaks = Array.isArray(flags?.breaks) ? flags!.breaks : [];
            const earlyReason = typeof flags?.earlyReason === "string" && flags.earlyReason.trim() ? flags.earlyReason.trim() : null;
            const isHalfDay = flags?.isHalfDay === true;

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
                remark,
                breaks,
                earlyReason,
                isHalfDay,
            });
        } else {
            const dayDate = new Date(Date.UTC(year, mon - 1, day));
            const isWeekend = dayDate.getUTCDay() === 0 || dayDate.getUTCDay() === 6;
            const istOffsetMs = 5.5 * 60 * 60 * 1000;
            const nowIstDate = new Date(Date.now() + istOffsetMs);
            const istTodayUtc = new Date(Date.UTC(nowIstDate.getUTCFullYear(), nowIstDate.getUTCMonth(), nowIstDate.getUTCDate()));
            const isPast = dayDate < istTodayUtc;
            calendar.push({
                date: dateStr,
                status: isWeekend ? "WEEKEND" : (isPast ? "ABSENT" : "UPCOMING"),
                checkInAt: null,
                checkOutAt: null,
                totalHours: null,
                remark: null,
            });
        }
    }

    type AttendanceRec = (typeof records)[number];
    const totalPresent = records.filter((r: AttendanceRec) => ["PRESENT", "VERIFIED", "REGULARIZED"].includes(r.status)).length;
    const totalHours = records.reduce((sum: number, r: AttendanceRec) => sum + (r.totalHours || 0), 0);
    const flaggedDays = records.filter((r: AttendanceRec) => r.status === "FLAGGED").length;
    const totalAbsent = calendar.filter(d => d.status === "ABSENT").length;

    return success({
        month,
        employee: targetUser,
        calendar,
        summary: {
            totalPresent,
            totalAbsent,
            totalHours: +totalHours.toFixed(2),
            flaggedDays,
            daysInMonth,
        },
    });
}

export const GET = withAuth(handleEmployeeHistory);
