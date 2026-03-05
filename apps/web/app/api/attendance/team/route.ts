// Vibe Tech Labs — GET /api/attendance/team
// Manager-scoped team attendance view for today

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withRole } from "@/lib/auth";
import { success, error } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

async function handleTeamView(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;
    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date");

    // Default to today
    const targetDate = dateParam ? new Date(dateParam) : new Date();
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Get direct reports
    const reports = await prisma.user.findMany({
        where: { managerId: auth.sub, status: "ACTIVE" },
        select: { id: true, fullName: true, employeeId: true, designation: true },
    });

    if (reports.length === 0) {
        return error("NO_REPORTS", "No direct reports found", 404);
    }

    const userIds = reports.map((r) => r.id);

    // Get attendance records for all reports
    const records = await prisma.attendanceRecord.findMany({
        where: {
            userId: { in: userIds },
            date: { gte: targetDate, lt: nextDay },
        },
        select: {
            userId: true,
            checkInAt: true,
            checkOutAt: true,
            status: true,
            checkInMethod: true,
            verificationScore: true,
            totalHours: true,
            anomalyFlags: true,
        },
    });

    // Build team view
    type AttendanceRec = (typeof records)[number];
    const recordMap = new Map<string, AttendanceRec>(records.map((r) => [r.userId, r]));

    const teamStatus = reports.map((member) => {
        const record = recordMap.get(member.id);
        return {
            userId: member.id,
            employeeId: member.employeeId,
            fullName: member.fullName,
            designation: member.designation,
            attendance: record
                ? {
                    status: record.checkOutAt ? "CHECKED_OUT" : "CHECKED_IN",
                    verificationStatus: record.status,
                    checkInAt: record.checkInAt?.toISOString() || null,
                    checkOutAt: record.checkOutAt?.toISOString() || null,
                    checkInMethod: record.checkInMethod,
                    verificationScore: record.verificationScore,
                    totalHours: record.totalHours,
                    hasAnomaly: record.anomalyFlags != null,
                }
                : {
                    status: "ABSENT" as const,
                    verificationStatus: null,
                    checkInAt: null,
                    checkOutAt: null,
                },
        };
    });

    // Summary
    const present = teamStatus.filter((m) => m.attendance.status !== "ABSENT").length;
    const absent = teamStatus.length - present;
    const flagged = records.filter((r) => r.status === "FLAGGED").length;

    return success({
        date: targetDate.toISOString().split("T")[0],
        team: teamStatus,
        summary: {
            total: teamStatus.length,
            present,
            absent,
            flagged,
            attendanceRate: +((present / teamStatus.length) * 100).toFixed(1),
        },
    });
}

// Only managers and above can see team view
export const GET = withRole("MGR", "HRBP", "HRA", "SADM")(handleTeamView);
