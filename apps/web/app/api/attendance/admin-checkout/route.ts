// Vibe Tech Labs — POST /api/attendance/admin-checkout
// Admin-only override: force check-out any currently checked-in employee.
// Bypasses face verification, geofence, and session token completely.
// Full audit trail is written so every admin-forced checkout is traceable.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import { success, error, logger } from "@/lib/errors";
import { logAuditEvent } from "@/lib/audit";
import type { JwtPayload } from "@vibetech/shared";

const ADMIN_ROLES = ["SADM", "HRA"];

async function handleAdminCheckout(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    // Only SADM and HRA roles are allowed
    if (!ADMIN_ROLES.includes(auth.role)) {
        return error("FORBIDDEN", "Only admins can perform force checkout", 403);
    }

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body guard */ }

    const targetUserId = body.userId as string | undefined;
    const reason = (body.reason as string | undefined)?.trim() || "Admin override";

    if (!targetUserId) {
        return error("INVALID_INPUT", "userId is required", 400);
    }

    // Verify target user exists
    const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, fullName: true, employeeId: true },
    });

    if (!targetUser) {
        return error("NOT_FOUND", "Employee not found", 404);
    }

    // Calculate today's IST date window
    const now = new Date();
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const nowIst = new Date(now.getTime() + istOffsetMs);
    const todayStart = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()) - istOffsetMs);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    // Find active check-in record for today
    const record = await prisma.attendanceRecord.findFirst({
        where: {
            userId: targetUserId,
            checkInAt: { gte: todayStart, lt: tomorrowStart },
            checkOutAt: null, // still checked in
        },
    });

    if (!record) {
        return error("NO_CHECKIN", `${targetUser.fullName} is not currently checked in today`, 404);
    }

    const checkOutTime = new Date();
    const diffMs = checkOutTime.getTime() - record.checkInAt!.getTime();
    const rawMinutes = diffMs / (1000 * 60);

    // Deduct any break time already taken
    const flags = record.anomalyFlags as Record<string, unknown> | null;
    const breaks = (flags?.breaks as Array<{ start: string; end: string | null }> | undefined) ?? [];
    const breakMinutes = breaks.reduce((sum, b) => {
        if (!b.start) return sum;
        const breakEnd = b.end ? new Date(b.end) : checkOutTime;
        return sum + Math.max(0, (breakEnd.getTime() - new Date(b.start).getTime()) / (1000 * 60));
    }, 0);

    const netMinutes = Math.max(0, rawMinutes - breakMinutes);
    const totalHours = +(netMinutes / 60).toFixed(2);
    const overtimeHours = Math.max(0, +(totalHours - 8).toFixed(2));
    const isHalfDay = totalHours < 4;

    const updatedFlags = {
        ...(flags || {}),
        adminCheckout: true,
        adminCheckoutBy: auth.sub,
        adminCheckoutReason: reason,
        checkOutDevice: "Admin Override",
        faceVerifiedAtCheckout: false,
        totalBreakMinutes: Math.round(breakMinutes),
        ...(isHalfDay ? { isHalfDay: true } : {}),
    };

    await prisma.attendanceRecord.update({
        where: { id: record.id },
        data: {
            checkOutAt: checkOutTime,
            totalHours,
            overtimeHours,
            anomalyFlags: JSON.parse(JSON.stringify(updatedFlags)),
        },
    });

    // Full audit trail — non-blocking
    logAuditEvent({
        actorId: auth.sub,
        actorRole: auth.role,
        action: "attendance.admin_checkout",
        resourceType: "attendance_record",
        resourceId: record.id,
        metadata: {
            targetUserId,
            targetUserName: targetUser.fullName,
            reason,
            totalHours,
            adminOverride: true,
        },
    }).catch(() => { });

    logger.info({
        adminId: auth.sub,
        targetUserId,
        recordId: record.id,
        totalHours,
        reason,
    }, "Admin force checkout performed");

    return success({
        recordId: record.id,
        employeeName: targetUser.fullName,
        checkInAt: record.checkInAt!.toISOString(),
        checkOutAt: checkOutTime.toISOString(),
        totalHours,
        overtimeHours,
        isHalfDay,
        adminOverride: true,
    });
}

export const POST = withAuth(handleAdminCheckout);
