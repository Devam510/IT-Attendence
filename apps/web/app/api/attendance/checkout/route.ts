// NEXUS — POST /api/attendance/checkout
// Records checkout with total hours and overtime calculation

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nexus/db";
import { CheckOutSchema } from "@nexus/shared";
import { withAuth } from "@/lib/auth";
import { calculateOvertime } from "@/lib/overtime";
import { logAuditEvent } from "@/lib/audit";
import { success, error, logger } from "@/lib/errors";
import type { JwtPayload } from "@nexus/shared";

async function handleCheckOut(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
        return error("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const parsed = CheckOutSchema.safeParse(body);
    if (!parsed.success) {
        return error("VALIDATION_ERROR", "Invalid check-out data", 422, parsed.error.errors);
    }

    const input = parsed.data;

    // Find today's check-in record (with check-in but no check-out)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const record = await prisma.attendanceRecord.findFirst({
        where: {
            userId: auth.sub,
            date: { gte: todayStart, lt: tomorrowStart },
            checkInAt: { not: null },
            checkOutAt: null,
        },
    });

    if (!record) {
        return error("NO_CHECKIN", "No active check-in found for today", 404);
    }

    // Verify device matches check-in device
    if (record.deviceId !== input.deviceId) {
        return error("DEVICE_MISMATCH", "Must check out from the same device used for check-in", 403);
    }

    // Get user's entity for jurisdiction-aware overtime
    const user = await prisma.user.findUnique({
        where: { id: auth.sub },
        select: { entity: { select: { country: true } } },
    });

    // Calculate overtime (checkInAt is guaranteed non-null by our query)
    const checkOutTime = new Date();
    const overtime = calculateOvertime(
        record.checkInAt!,
        checkOutTime,
        undefined,
        user?.entity?.country || "IN"
    );

    // Update record
    await prisma.attendanceRecord.update({
        where: { id: record.id },
        data: {
            checkOutAt: checkOutTime,
            checkOutLat: input.lat,
            checkOutLng: input.lng,
            totalHours: overtime.totalHours,
            overtimeHours: overtime.overtimeHours,
        },
    });

    // Audit log
    await logAuditEvent({
        actorId: auth.sub,
        actorRole: auth.role,
        action: "attendance.checkout",
        resourceType: "attendance",
        resourceId: record.id,
        geoLocation: { lat: input.lat, lng: input.lng },
        metadata: {
            totalHours: overtime.totalHours,
            overtimeHours: overtime.overtimeHours,
            regularHours: overtime.regularHours,
        },
    });

    logger.info({
        userId: auth.sub,
        recordId: record.id,
        totalHours: overtime.totalHours,
        overtime: overtime.overtimeHours,
    }, "Check-out recorded");

    return success({
        recordId: record.id,
        checkInAt: record.checkInAt!.toISOString(),
        checkOutAt: checkOutTime.toISOString(),
        hours: {
            total: overtime.totalHours,
            regular: overtime.regularHours,
            overtime: overtime.overtimeHours,
            breakDeducted: overtime.breakDeducted,
            isHalfDay: overtime.isHalfDay,
            overtimeMultiplier: overtime.overtimeMultiplier,
        },
    });
}

export const POST = withAuth(handleCheckOut);
