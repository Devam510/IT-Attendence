// NEXUS — GET /api/dashboard/manager
// Manager dashboard with team overview, pending approvals, and team stats

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nexus/db";
import { withRole } from "@/lib/auth";
import { getPendingApprovalsForUser } from "@/lib/approval-chain";
import { getUnreadCount } from "@/lib/notifications";
import { success } from "@/lib/errors";
import type { JwtPayload } from "@nexus/shared";

async function handleManagerDashboard(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    // Get direct reports
    const directReports = await prisma.user.findMany({
        where: { managerId: auth.sub, status: "ACTIVE" },
        select: { id: true, fullName: true, employeeId: true, designation: true },
    });

    const reportIds = directReports.map((r: any) => r.id);

    // Early return if no direct reports — avoid 6 unnecessary queries
    if (reportIds.length === 0) {
        return success({
            teamSummary: { totalMembers: 0, present: 0, onLeave: 0, absent: 0, attendanceRate: 0 },
            teamStatus: [],
            approvals: { pending: 0, overdue: 0, pendingLeaveRequests: 0 },
            notifications: { unreadCount: 0, recent: [] },
        });
    }

    // Parallel fetch all manager data
    const [
        teamAttendance,
        teamLeaveToday,
        pendingApprovals,
        pendingLeaveRequests,
        unreadCount,
        recentNotifications,
    ] = await Promise.all([
        // Today's team attendance
        prisma.attendanceRecord.findMany({
            where: { userId: { in: reportIds }, date: { gte: todayStart, lt: tomorrowStart } },
            select: { userId: true, status: true, checkInAt: true, checkOutAt: true },
        }),
        // Team members on leave today
        prisma.leaveRequest.findMany({
            where: {
                userId: { in: reportIds },
                status: "APPROVED",
                startDate: { lte: now },
                endDate: { gte: todayStart },
            },
            select: { userId: true, user: { select: { fullName: true } }, leaveType: { select: { name: true } } },
        }),
        // Pending approvals for this manager
        getPendingApprovalsForUser(auth.sub),
        // Pending leave requests from team
        prisma.leaveRequest.count({
            where: { userId: { in: reportIds }, status: "PENDING" },
        }),
        // Unread notifications
        getUnreadCount(auth.sub),
        // Recent notifications
        prisma.notification.findMany({
            where: { userId: auth.sub },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { id: true, type: true, title: true, body: true, isRead: true, createdAt: true },
        }),
    ]);

    // Build team status
    const checkedInIds = new Set(teamAttendance.map((a: any) => a.userId));
    const onLeaveIds = new Set(teamLeaveToday.map((l: any) => l.userId));

    const teamStatus = directReports.map((member: any) => {
        const attendance = teamAttendance.find((a: any) => a.userId === member.id);
        const leave = teamLeaveToday.find((l: any) => l.userId === member.id);

        let status: "PRESENT" | "ON_LEAVE" | "ABSENT" = "ABSENT";
        if (checkedInIds.has(member.id)) status = "PRESENT";
        else if (onLeaveIds.has(member.id)) status = "ON_LEAVE";

        return {
            id: member.id,
            fullName: member.fullName,
            employeeId: member.employeeId,
            designation: member.designation,
            status,
            checkInAt: attendance?.checkInAt?.toISOString() || null,
            leaveType: leave ? (leave as any).leaveType?.name : null,
        };
    });

    // Summary counts
    const presentCount = teamStatus.filter((t: any) => t.status === "PRESENT").length;
    const onLeaveCount = teamStatus.filter((t: any) => t.status === "ON_LEAVE").length;
    const absentCount = teamStatus.filter((t: any) => t.status === "ABSENT").length;

    // SLA-overdue approvals
    const overdueApprovals = pendingApprovals.filter((a) => {
        return a.slaDeadline && a.slaDeadline.getTime() < Date.now();
    });

    return success({
        teamSummary: {
            totalMembers: directReports.length,
            present: presentCount,
            onLeave: onLeaveCount,
            absent: absentCount,
            attendanceRate: directReports.length > 0
                ? +((presentCount / directReports.length) * 100).toFixed(1)
                : 0,
        },
        teamStatus,
        approvals: {
            pending: pendingApprovals.length,
            overdue: overdueApprovals.length,
            pendingLeaveRequests,
        },
        notifications: {
            unreadCount,
            recent: recentNotifications.map((n: any) => ({
                id: n.id,
                type: n.type,
                title: n.title,
                body: n.body,
                isRead: n.isRead,
                createdAt: n.createdAt.toISOString(),
            })),
        },
    });
}

export const GET = withRole("MGR", "HRBP", "HRA", "SADM")(handleManagerDashboard);
