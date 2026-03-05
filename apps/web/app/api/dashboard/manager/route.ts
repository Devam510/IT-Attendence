// Vibe Tech Labs — GET /api/dashboard/manager
// Manager dashboard: direct-report team view for MGR; entity-wide view for HRA/SADM

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

    // ── IST-based today range ────────────────────────────
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const nowIst = new Date(now.getTime() + istOffsetMs);
    const todayStart = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()) - istOffsetMs);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    // ── Determine which employees to show ───────────────
    // HRA / SADM see ALL active employees in the entity
    // MGR sees their direct reports only
    const isHraOrAdmin = auth.role === "HRA" || auth.role === "SADM" || auth.role === "HRBP";

    const employeeWhere = isHraOrAdmin
        ? { entityId: auth.entityId, status: "ACTIVE" as const, role: { notIn: ["SADM"] as any[] } }
        : { managerId: auth.sub, status: "ACTIVE" as const };

    const employees = await prisma.user.findMany({
        where: employeeWhere,
        select: { id: true, fullName: true, employeeId: true, designation: true },
    });

    const employeeIds = employees.map((r: any) => r.id);

    if (employeeIds.length === 0) {
        return success({
            teamSummary: { totalMembers: 0, present: 0, onLeave: 0, absent: 0, remote: 0, attendanceRate: 0 },
            teamStatus: [],
            approvals: { pending: 0, overdue: 0, pendingLeaveRequests: 0 },
            notifications: { unreadCount: 0, recent: [] },
        });
    }

    // ── Parallel fetch ───────────────────────────────────
    const [
        teamAttendance,
        teamLeaveToday,
        pendingApprovals,
        pendingLeaveRequests,
        unreadCount,
        recentNotifications,
    ] = await Promise.all([
        // Today's team attendance — use checkInAt IST range
        prisma.attendanceRecord.findMany({
            where: { userId: { in: employeeIds }, checkInAt: { gte: todayStart, lt: tomorrowStart } },
            select: { userId: true, status: true, checkInAt: true, checkOutAt: true },
        }),
        // Team members on leave today
        prisma.leaveRequest.findMany({
            where: {
                userId: { in: employeeIds },
                status: "APPROVED",
                startDate: { lte: now },
                endDate: { gte: todayStart },
            },
            select: { userId: true, user: { select: { fullName: true } }, leaveType: { select: { name: true } } },
        }),
        getPendingApprovalsForUser(auth.sub),
        prisma.leaveRequest.count({
            where: { userId: { in: employeeIds }, status: "PENDING" },
        }),
        getUnreadCount(auth.sub),
        prisma.notification.findMany({
            where: { userId: auth.sub },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { id: true, type: true, title: true, body: true, isRead: true, createdAt: true },
        }),
    ]);

    // ── Build team status ────────────────────────────────
    const checkedInIds = new Set(teamAttendance.map((a: any) => a.userId));
    const onLeaveIds = new Set(teamLeaveToday.map((l: any) => l.userId));

    const teamStatus = employees.map((member: any) => {
        const attendance = teamAttendance.find((a: any) => a.userId === member.id);
        const leave = teamLeaveToday.find((l: any) => l.userId === member.id);

        let status: "PRESENT" | "ON_LEAVE" | "ABSENT" = "ABSENT";
        if (onLeaveIds.has(member.id)) status = "ON_LEAVE";
        else if (checkedInIds.has(member.id)) status = "PRESENT";

        return {
            id: member.id,
            fullName: member.fullName,
            employeeId: member.employeeId,
            designation: member.designation,
            status,
            checkInAt: attendance?.checkInAt?.toISOString() || null,
            checkOutAt: attendance?.checkOutAt?.toISOString() || null,
            leaveType: leave ? (leave as any).leaveType?.name : null,
        };
    });

    // ── Summary counts ───────────────────────────────────
    const presentCount = teamStatus.filter((t: any) => t.status === "PRESENT").length;
    const onLeaveCount = teamStatus.filter((t: any) => t.status === "ON_LEAVE").length;
    const absentCount = teamStatus.filter((t: any) => t.status === "ABSENT").length;

    const overdueApprovals = pendingApprovals.filter((a) => {
        return a.slaDeadline && a.slaDeadline.getTime() < Date.now();
    });

    return success({
        teamSummary: {
            totalMembers: employees.length,
            present: presentCount,
            onLeave: onLeaveCount,
            absent: absentCount,
            remote: 0, // Remote detection requires future feature
            attendanceRate: employees.length > 0
                ? +((presentCount / employees.length) * 100).toFixed(1)
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
