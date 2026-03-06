// Vibe Tech Labs — GET /api/dashboard/employee
// Comprehensive employee dashboard with attendance, leaves, and notifications

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import { getUnreadCount } from "@/lib/notifications";
import { success } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

async function handleEmployeeDashboard(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;
    const now = new Date();
    // ── IST-based today range (same as checkin/checkout/today routes) ──
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const nowIst = new Date(now.getTime() + istOffsetMs);
    const todayStart = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()) - istOffsetMs);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const year = nowIst.getUTCFullYear();
    const monthStart = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), 1) - istOffsetMs);

    // Parallel fetch all dashboard data
    const [
        user,
        todayAttendance,
        monthAttendance,
        pendingLeaves,
        leaveBalances,
        recentNotifications,
        unreadCount,
        pendingApprovals,
    ] = await Promise.all([
        // User profile
        prisma.user.findUnique({
            where: { id: auth.sub },
            select: { fullName: true, employeeId: true, designation: true, department: { select: { name: true } }, entity: { select: { name: true } } },
        }),
        // Today's attendance — use checkInAt IST range (not date field)
        prisma.attendanceRecord.findFirst({
            where: { userId: auth.sub, checkInAt: { gte: todayStart, lt: tomorrowStart } },
            select: { checkInAt: true, checkOutAt: true, status: true, totalHours: true, verificationScore: true },
        }),
        // Month attendance summary
        prisma.attendanceRecord.findMany({
            where: { userId: auth.sub, checkInAt: { gte: monthStart, lt: tomorrowStart } },
            select: { date: true, status: true, totalHours: true },
        }),
        // Pending leave requests
        prisma.leaveRequest.count({
            where: { userId: auth.sub, status: "PENDING" },
        }),
        // Leave balances
        prisma.leaveBalance.findMany({
            where: { userId: auth.sub, year },
            include: { leaveType: { select: { name: true, code: true } } },
        }),
        // Recent notifications
        prisma.notification.findMany({
            where: { userId: auth.sub },
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { id: true, type: true, title: true, body: true, isRead: true, createdAt: true },
        }),
        // Unread count
        getUnreadCount(auth.sub),
        // Pending approvals (for managers)
        prisma.approvalWorkflow.count({
            where: { requesterId: auth.sub, status: "PENDING" },
        }),
    ]);

    // Compute month stats
    const monthDays = monthAttendance.length;
    // Count any day the employee actually showed up (regardless of verification state)
    const monthPresent = monthAttendance.filter((a: any) =>
        a.status === "VERIFIED" || a.status === "REGULARIZED" ||
        a.status === "CHECKED_IN" || a.status === "CHECKED_OUT"
    ).length;
    const monthFlagged = monthAttendance.filter((a: any) => a.status === "FLAGGED").length;
    const monthHours = monthAttendance.reduce((sum: number, a: any) => sum + (a.totalHours || 0), 0);

    // Today's status
    let todayStatus: "NOT_CHECKED_IN" | "CHECKED_IN" | "CHECKED_OUT" = "NOT_CHECKED_IN";
    if (todayAttendance?.checkOutAt) todayStatus = "CHECKED_OUT";
    else if (todayAttendance?.checkInAt) todayStatus = "CHECKED_IN";

    return success({
        user: user ? {
            fullName: user.fullName,
            employeeId: user.employeeId,
            designation: user.designation,
            department: user.department?.name,
            entity: user.entity?.name,
        } : null,
        today: {
            status: todayStatus,
            checkInAt: todayAttendance?.checkInAt?.toISOString() || null,
            checkOutAt: todayAttendance?.checkOutAt?.toISOString() || null,
            totalHours: todayAttendance?.totalHours || null,
            verificationScore: todayAttendance?.verificationScore || null,
        },
        monthSummary: {
            daysTracked: monthDays,
            daysPresent: monthPresent,
            daysFlagged: monthFlagged,
            totalHours: +monthHours.toFixed(2),
            attendanceRate: monthDays > 0 ? +((monthPresent / monthDays) * 100).toFixed(1) : 0,
        },
        leaves: {
            pendingRequests: pendingLeaves,
            balances: leaveBalances.map((b: any) => ({
                type: b.leaveType.name,
                code: b.leaveType.code,
                available: Math.max(0, +(b.opening + b.accrued - b.used - b.pending).toFixed(2)),
                used: b.used,
                pending: b.pending,
            })),
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
        pendingApprovals,
    });
}

export const GET = withAuth(handleEmployeeDashboard);
