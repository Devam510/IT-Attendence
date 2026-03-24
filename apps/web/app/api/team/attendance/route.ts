// Vibe Tech Labs — GET /api/team/attendance?date=YYYY-MM-DD
// Returns all employees + their attendance status for the given date
// Accessible by MGR (direct reports only), HRA/SADM (entity-wide)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withRole } from "@/lib/auth";
import { success, error } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

export const dynamic = "force-dynamic";

async function handleTeamAttendance(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;
    const { searchParams } = new URL(req.url);

    // Parse requested date (default = today IST)
    const dateParam = searchParams.get("date"); // YYYY-MM-DD
    const istOffsetMs = 5.5 * 60 * 60 * 1000;

    let dayStart: Date;
    let dayEnd: Date;
    let targetDateStr: string;

    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        targetDateStr = dateParam;
        const parts = dateParam.split("-").map(Number);
        const y = parts[0] ?? 2026, m = parts[1] ?? 1, d = parts[2] ?? 1;
        // Build IST midnight → next midnight in UTC
        dayStart = new Date(Date.UTC(y, m - 1, d) - istOffsetMs);
        dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    } else {
        // Default: today in IST
        const nowIst = new Date(Date.now() + istOffsetMs);
        targetDateStr = nowIst.toISOString().slice(0, 10);
        dayStart = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()) - istOffsetMs);
        dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    }

    // For PostgreSQL DATE columns, we must compare against absolute 00:00:00Z 
    // to prevent timezone offsets from drifting dates in the query
    const targetDateUtc = new Date(`${targetDateStr}T00:00:00Z`);

    const isHraOrAdmin = auth.role === "HRA" || auth.role === "SADM" || auth.role === "HRBP";

    const employeeWhere = isHraOrAdmin
        ? { entityId: auth.entityId, status: "ACTIVE" as const, role: { notIn: ["SADM"] as any[] } }
        : { managerId: auth.sub, status: "ACTIVE" as const };

    const [employees, attendance, leavesToday] = await Promise.all([
        prisma.user.findMany({
            where: employeeWhere,
            select: {
                id: true,
                fullName: true,
                employeeId: true,
                role: true,
                designation: true,
                department: { select: { name: true } },
            },
            orderBy: { fullName: "asc" },
        }),
        prisma.attendanceRecord.findMany({
            where: {
                checkInAt: { gte: dayStart, lt: dayEnd },
                user: isHraOrAdmin
                    ? { entityId: auth.entityId }
                    : { managerId: auth.sub },
            },
            select: {
                userId: true,
                status: true,
                checkInAt: true,
                checkOutAt: true,
                totalHours: true,
                anomalyFlags: true,
            },
        }),
        prisma.leaveRequest.findMany({
            where: {
                status: "APPROVED",
                startDate: { lte: targetDateUtc },
                endDate: { gte: targetDateUtc },
                user: isHraOrAdmin
                    ? { entityId: auth.entityId }
                    : { managerId: auth.sub },
            },
            select: {
                userId: true,
                startDate: true,
                endDate: true,
                leaveType: { select: { name: true } },
            },
        }),
    ]);

    const attendanceMap = new Map(attendance.map(a => [a.userId, a]));
    const leaveMap = new Map(leavesToday.map(l => [l.userId, l]));

    const staff = employees.map(emp => {
        const att = attendanceMap.get(emp.id);
        const leave = leaveMap.get(emp.id);

        let status: "PRESENT" | "ABSENT" | "ON_LEAVE" = "ABSENT";
        if (leave) status = "ON_LEAVE";
        else if (att) status = "PRESENT";

        // If on approved leave → don't show working time (leave takes precedence)
        const onLeave = status === "ON_LEAVE";
        // Extract remark from anomalyFlags JSON (stored by check-in route)
        const flags = att?.anomalyFlags as Record<string, unknown> | null;
        const remark = typeof flags?.remark === "string" && flags.remark.trim() ? flags.remark.trim() : null;
        const breaks = Array.isArray(flags?.breaks) ? flags!.breaks : [];
        const earlyReason = typeof flags?.earlyReason === "string" && flags.earlyReason.trim() ? flags.earlyReason.trim() : null;
        const isHalfDay = flags?.isHalfDay === true;
        const location = typeof flags?.location === "string" ? flags.location : null;
        // ── Compute net hours (deducting actual break time) ───────────────
        // For checked-out employees, totalHours is already net (deducted at checkout).
        // For currently checked-in employees, we must compute live net hours.
        let netTotalHours = att?.totalHours || 0;
        let netOvertimeHours = 0;

        if (att && !att.checkOutAt && att.checkInAt) {
            // Employee is still checked in — compute live net hours
            const now = new Date();
            const rawMs = now.getTime() - att.checkInAt.getTime();
            const rawMinutes = rawMs / (1000 * 60);
            const liveBreaks = (Array.isArray(flags?.breaks) ? flags!.breaks : []) as Array<{ start: string; end: string | null }>;
            const breakMinutes = liveBreaks.reduce((sum: number, b: { start: string; end: string | null }) => {
                if (!b.start) return sum;
                const breakEnd = b.end ? new Date(b.end) : now;
                return sum + Math.max(0, (breakEnd.getTime() - new Date(b.start).getTime()) / (1000 * 60));
            }, 0);
            netTotalHours = +((Math.max(0, rawMinutes - breakMinutes)) / 60).toFixed(2);
        }

        netOvertimeHours = onLeave ? 0 : Math.max(0, +(netTotalHours - 8).toFixed(2));

        return {
            id: emp.id,
            fullName: emp.fullName,
            employeeId: emp.employeeId,
            role: emp.role,
            designation: emp.designation,
            department: emp.department?.name || null,
            status,
            checkInAt: onLeave ? null : att?.checkInAt?.toISOString() || null,
            checkOutAt: onLeave ? null : att?.checkOutAt?.toISOString() || null,
            totalHours: onLeave ? null : netTotalHours,
            overtimeHours: netOvertimeHours,
            leaveType: leave ? (leave as any).leaveType?.name : null,
            leaveStart: leave ? (leave as any).startDate?.toISOString() || null : null,
            leaveEnd: leave ? (leave as any).endDate?.toISOString() || null : null,
            remark: onLeave ? null : remark,
            breaks: onLeave ? [] : breaks,
            earlyReason: onLeave ? null : earlyReason,
            isHalfDay: onLeave ? false : isHalfDay,
            location: onLeave ? null : location,
        };

    });

    const presentCount = staff.filter(s => s.status === "PRESENT").length;
    const absentCount = staff.filter(s => s.status === "ABSENT").length;
    const onLeaveCount = staff.filter(s => s.status === "ON_LEAVE").length;

    return success({
        date: dateParam || new Date(dayStart.getTime() + istOffsetMs).toISOString().slice(0, 10),
        summary: { total: staff.length, present: presentCount, absent: absentCount, onLeave: onLeaveCount },
        staff,
    });
}

export const GET = withRole("MGR", "HRBP", "HRA", "SADM")(handleTeamAttendance);
