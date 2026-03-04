// NEXUS — POST /api/attendance/checkin
// Web-friendly check-in with geofence enforcement (no device required)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nexus/db";
import { withAuth } from "@/lib/auth";
import { success, error, logger } from "@/lib/errors";
import type { JwtPayload } from "@nexus/shared";

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

async function handleCheckIn(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
        return error("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (isNaN(lat) || isNaN(lng)) {
        return error("VALIDATION_ERROR", "lat and lng are required", 422);
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    // 1. Check if already checked in today
    const existingRecord = await prisma.attendanceRecord.findFirst({
        where: { userId: auth.sub, date: { gte: todayStart, lt: tomorrowStart } },
    });

    if (existingRecord) {
        return error("ALREADY_CHECKED_IN", "Already checked in today", 409);
    }

    // 2. Get user's assigned office location
    const user = await prisma.user.findUnique({
        where: { id: auth.sub },
        select: { locationId: true, location: true },
    });

    if (!user?.location) {
        return error("NO_OFFICE", "No office location assigned to you", 400);
    }

    const office = user.location;

    // 3. Geofence check — must be within office radius
    const distanceM = haversineM(lat, lng, office.latitude, office.longitude);
    const maxRadius = office.radiusM || 500; // default 500m if not set

    if (distanceM > maxRadius) {
        return error("GEOFENCE_FAILED",
            `You are ${Math.round(distanceM)}m from office. Must be within ${maxRadius}m to check in.`,
            403,
            { distanceM: Math.round(distanceM), maxRadius, officeName: office.name }
        );
    }

    // 4. Create attendance record
    const record = await prisma.attendanceRecord.create({
        data: {
            userId: auth.sub,
            date: todayStart,
            locationId: user.locationId!,
            checkInAt: now,
            checkInLat: lat,
            checkInLng: lng,
            checkInMethod: "GEO_BIO",
            verificationScore: Math.max(0, 100 - Math.round(distanceM / maxRadius * 50)),
            status: "VERIFIED",
        },
    });

    logger.info({ userId: auth.sub, recordId: record.id, distanceM: Math.round(distanceM) }, "Check-in recorded");

    return success({
        recordId: record.id,
        status: "VERIFIED",
        checkInAt: now.toISOString(),
        distanceM: Math.round(distanceM),
        officeName: office.name,
    }, 201);
}

export const POST = withAuth(handleCheckIn);
