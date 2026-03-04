// NEXUS — GET /api/leaves/team-calendar
// Manager view of team leave calendar

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nexus/db";
import { withRole } from "@/lib/auth";
import { success, error } from "@/lib/errors";
import type { JwtPayload } from "@nexus/shared";

interface LeaveRecord {
    id: string;
    userId: string;
    startDate: Date;
    endDate: Date;
    halfDay: string;
    status: string;
    leaveType: { name: string; code: string };
    user: { fullName: string; employeeId: string | null };
}

interface TeamMember {
    id: string;
    fullName: string;
    employeeId: string | null;
}

async function handleTeamCalendar(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;
    const url = new URL(req.url);

    const monthParam = url.searchParams.get("month"); // "2026-03"
    if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
        return error("INVALID_INPUT", "Query param 'month' required in YYYY-MM format", 400);
    }

    const [yearStr, monStr] = monthParam.split("-");
    const year = parseInt(yearStr ?? "2026", 10);
    const mon = parseInt(monStr ?? "1", 10);
    const startDate = new Date(year, mon - 1, 1);
    const endDate = new Date(year, mon, 1);

    // Get direct reports
    const reports: TeamMember[] = await prisma.user.findMany({
        where: { managerId: auth.sub, status: "ACTIVE" },
        select: { id: true, fullName: true, employeeId: true },
    });

    if (reports.length === 0) {
        return error("NO_REPORTS", "No direct reports found", 404);
    }

    const userIds = reports.map((r: TeamMember) => r.id);

    // Get approved and pending leaves for the month
    const leaveRequests: LeaveRecord[] = await prisma.leaveRequest.findMany({
        where: {
            userId: { in: userIds },
            status: { in: ["PENDING", "APPROVED"] },
            OR: [
                { startDate: { lte: endDate }, endDate: { gte: startDate } },
            ],
        },
        include: {
            leaveType: { select: { name: true, code: true } },
            user: { select: { fullName: true, employeeId: true } },
        },
        orderBy: { startDate: "asc" },
    }) as unknown as LeaveRecord[];

    // Build per-member calendar
    const calendar = reports.map((member: TeamMember) => {
        const memberLeaves = leaveRequests.filter((lr: LeaveRecord) => lr.userId === member.id);
        return {
            userId: member.id,
            employeeId: member.employeeId,
            fullName: member.fullName,
            leaves: memberLeaves.map((lr: LeaveRecord) => ({
                id: lr.id,
                leaveType: lr.leaveType.name,
                leaveTypeCode: lr.leaveType.code,
                startDate: lr.startDate.toISOString().split("T")[0],
                endDate: lr.endDate.toISOString().split("T")[0],
                halfDay: lr.halfDay,
                status: lr.status,
            })),
        };
    });

    // Summary
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const onLeaveToday = leaveRequests.filter((lr: LeaveRecord) => {
        return lr.status === "APPROVED" && lr.startDate <= now && lr.endDate >= now;
    });

    return success({
        month: monthParam,
        calendar,
        summary: {
            totalMembers: reports.length,
            pendingRequests: leaveRequests.filter((lr: LeaveRecord) => lr.status === "PENDING").length,
            approvedLeaves: leaveRequests.filter((lr: LeaveRecord) => lr.status === "APPROVED").length,
            onLeaveToday: onLeaveToday.length,
        },
    });
}

export const GET = withRole("MGR", "HRBP", "HRA", "SADM")(handleTeamCalendar);
