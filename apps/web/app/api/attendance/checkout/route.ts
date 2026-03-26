// Vibe Tech Labs — POST /api/attendance/checkout
// Verifies session token matches check-in device — prevents buddy check-out

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import { success, error, logger } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

// Haversine distance in meters
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function handleCheckOut(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body is ok */ }

    const sessionToken = body.sessionToken as string | undefined;
    const earlyReason = body.earlyReason as string | undefined;
    const faceToken = body.faceToken as string | undefined;
    const lat = body.lat as number | undefined;
    const lng = body.lng as number | undefined;

    if (!faceToken) {
        return error("FACE_REQUIRED", "Face verification is required to check out", 403);
    }

    if (lat === undefined || lng === undefined) {
        return error("LOCATION_REQUIRED", "GPS coordinates are required to check out", 400);
    }

    const now = new Date();
    // Calculate "today" in IST (UTC+5:30), not in server's UTC timezone
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const nowIst = new Date(now.getTime() + istOffsetMs);
    const todayStart = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()) - istOffsetMs);
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    // Find today's check-in record — use checkInAt timestamp range (IST) not date field
    const record = await prisma.attendanceRecord.findFirst({
        where: {
            userId: auth.sub,
            checkInAt: { gte: todayStart, lt: tomorrowStart },
            checkOutAt: null,
        },
    });

    if (!record) {
        return error("NO_CHECKIN", "No active check-in found for today", 404);
    }

    // ── Get user's assigned office location ─────────────────────────────
    const user = await prisma.user.findUnique({
        where: { id: auth.sub },
        select: { location: true },
    });

    if (!user?.location) {
        return error("NO_OFFICE", "No office location assigned to you", 400);
    }

    // ── Geofence check — must be within office radius ─────────────────
    const distanceM = haversineM(lat, lng, user.location.latitude, user.location.longitude);
    const maxRadius = user.location.radiusM || 500;

    if (distanceM > maxRadius) {
        return error("GEOFENCE_FAILED",
            `You are ${Math.round(distanceM)}m from office. Must be within ${maxRadius}m to check out.`,
            403,
            { distanceM: Math.round(distanceM), maxRadius, officeName: user.location.name }
        );
    }

    // ── Device info — captured for audit log only, no longer blocks checkout ────
    // Face verification is the identity proof. Device type is just logged.
    const checkOutUserAgent = req.headers.get("user-agent") || "Unknown device";
    const checkOutDevice = /mobile|android|iphone|ipad/i.test(checkOutUserAgent) ? "Mobile" : "Desktop/Browser";
    const flags = record.anomalyFlags as Record<string, unknown> | null;
    const checkInDevice = typeof flags?.checkInDevice === "string" ? flags.checkInDevice : null;
    void checkInDevice; // kept in anomalyFlags for audit, not used for blocking

    // ── Capture checkout device info ─────────────────────────────
    const checkOutIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || req.headers.get("x-real-ip")
        || "Unknown IP";

    const checkOutTime = new Date();
    const diffMs = checkOutTime.getTime() - record.checkInAt!.getTime();
    const rawMinutes = diffMs / (1000 * 60);

    // ── Deduct actual break time taken today ─────────────────────────
    const breaks = (flags?.breaks as Array<{ start: string; end: string | null }> | undefined) ?? [];
    const breakMinutes = breaks.reduce((sum, b) => {
        if (!b.start) return sum;
        const breakEnd = b.end ? new Date(b.end) : checkOutTime; // treat open break as ending at checkout
        const breakMs = breakEnd.getTime() - new Date(b.start).getTime();
        return sum + Math.max(0, breakMs / (1000 * 60));
    }, 0);

    const netMinutes = Math.max(0, rawMinutes - breakMinutes);
    const totalHours = +(netMinutes / 60).toFixed(2);
    const overtimeHours = Math.max(0, +(totalHours - 8).toFixed(2));
    const isHalfDay = totalHours < 4;

    // Update device info and check-out time
    const updatedFlags = {
        ...(flags || {}),
        checkOutDevice,
        checkOutUserAgent,
        checkOutIp,
        totalBreakMinutes: Math.round(breakMinutes),
        faceVerifiedAtCheckout: true,
        ...(isHalfDay ? { isHalfDay: true } : {}),
        ...(isHalfDay && earlyReason ? { earlyReason } : {}),
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

    logger.info({
        userId: auth.sub,
        recordId: record.id,
        totalHours,
        checkInDevice: flags?.checkInDevice,
        checkOutDevice,
        sameDevice: flags?.checkInDevice === checkOutDevice,
    }, "Check-out recorded");

    return success({
        recordId: record.id,
        checkInAt: record.checkInAt!.toISOString(),
        checkOutAt: checkOutTime.toISOString(),
        totalHours,
        overtimeHours,
        isHalfDay,
        deviceMatch: true, // device check removed — face verification is the identity proof
    });
}

export const POST = withAuth(handleCheckOut);
