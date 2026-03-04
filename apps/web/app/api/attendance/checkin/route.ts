// NEXUS — POST /api/attendance/checkin
// Geofence-enforced check-in with device session token to prevent buddy check-out

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

    // Accept both lat/lng and latitude/longitude field names
    const lat = Number(body.lat ?? body.latitude);
    const lng = Number(body.lng ?? body.longitude);
    if (isNaN(lat) || isNaN(lng) || (lat === 0 && lng === 0)) {
        return error("VALIDATION_ERROR", "Location coordinates are required for check-in", 422);
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
    const maxRadius = office.radiusM || 500;

    if (distanceM > maxRadius) {
        return error("GEOFENCE_FAILED",
            `You are ${Math.round(distanceM)}m from office. Must be within ${maxRadius}m to check in.`,
            403,
            { distanceM: Math.round(distanceM), maxRadius, officeName: office.name }
        );
    }

    // 4. Generate unique session token for this check-in (device binding)
    const sessionToken = crypto.randomUUID();

    // Capture device info from request headers
    const userAgent = req.headers.get("user-agent") || "Unknown device";
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || req.headers.get("x-real-ip")
        || "Unknown IP";

    // Detect device type from user agent
    const deviceType = /mobile|android|iphone|ipad/i.test(userAgent) ? "Mobile" : "Desktop/Browser";

    // 5. Create attendance record — store session token + device info in anomalyFlags JSON
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
            // Use anomalyFlags JSON to store session token + device info (no schema change needed)
            anomalyFlags: JSON.parse(JSON.stringify({
                sessionToken,
                checkInDevice: deviceType,
                checkInUserAgent: userAgent,
                checkInIp: ip,
            })),
        },
    });

    logger.info({
        userId: auth.sub,
        recordId: record.id,
        distanceM: Math.round(distanceM),
        device: deviceType,
        ip,
    }, "Check-in recorded");

    return success({
        recordId: record.id,
        status: "VERIFIED",
        checkInAt: now.toISOString(),
        distanceM: Math.round(distanceM),
        officeName: office.name,
        // Return session token — client must store this and send on check-out
        sessionToken,
        deviceInfo: { type: deviceType, ip },
    }, 201);
}

export const POST = withAuth(handleCheckIn);
