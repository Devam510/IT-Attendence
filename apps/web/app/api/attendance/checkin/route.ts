// NEXUS — POST /api/attendance/checkin
// Composite verification: geo + biometric + device + optional QR

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nexus/db";
import { CheckInSchema } from "@nexus/shared";
import { withAuth } from "@/lib/auth";
import { verifyLocation } from "@/lib/geofence";
import { verifyQrToken } from "@/lib/qr-totp";
import { detectAnomalies } from "@/lib/anomaly";
import { isWithinShiftWindow } from "@/lib/overtime";
import { logAuditEvent } from "@/lib/audit";
import { success, error, logger } from "@/lib/errors";
import type { JwtPayload } from "@nexus/shared";

async function handleCheckIn(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    // Safe JSON parse
    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
        return error("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const parsed = CheckInSchema.safeParse(body);
    if (!parsed.success) {
        return error("VALIDATION_ERROR", "Invalid check-in data", 422, parsed.error.errors);
    }

    const input = parsed.data;
    const now = new Date();

    // 1. Check if already checked in today
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const existingRecord = await prisma.attendanceRecord.findFirst({
        where: {
            userId: auth.sub,
            date: { gte: todayStart, lt: tomorrowStart },
        },
    });

    if (existingRecord) {
        return error("ALREADY_CHECKED_IN", "Already checked in today", 409);
    }

    // 2. Verify device
    const device = await prisma.device.findUnique({
        where: { id: input.deviceId },
        select: { id: true, userId: true, trustScore: true, isJailbroken: true },
    });

    if (!device || device.userId !== auth.sub) {
        return error("DEVICE_NOT_FOUND", "Device not registered or belongs to another user", 403);
    }

    if (device.isJailbroken) {
        return error("DEVICE_COMPROMISED", "Jailbroken/rooted device cannot check in", 403);
    }

    // 3. Get user's location
    const user = await prisma.user.findUnique({
        where: { id: auth.sub },
        select: {
            locationId: true,
            location: true,
            entity: { select: { country: true, timezone: true } },
        },
    });

    if (!user?.location) {
        return error("NO_OFFICE", "No office location assigned to user", 400);
    }

    const office = user.location;

    // 4. Geofence verification
    const geoResult = verifyLocation({
        userLocation: {
            lat: input.lat,
            lng: input.lng,
            altitude: input.altitude,
            accuracy: input.accuracy,
            speed: input.speed,
        },
        office: {
            lat: office.latitude,
            lng: office.longitude,
            altitudeM: office.altitudeM ?? undefined,
            radiusM: office.radiusM,
            geofencePolygon: office.geofencePolygon as { lat: number; lng: number }[] | null,
            wifiBssids: office.wifiBssids,
        },
        biometricVerified: input.biometricVerified,
        wifiBssid: input.wifiBssid,
    });

    if (!geoResult.passed) {
        return error("GEOFENCE_FAILED", `Location verification failed (score: ${geoResult.score}/100, need ≥75)`, 403, {
            score: geoResult.score,
            factors: geoResult.factors,
            distanceM: geoResult.distanceM,
        });
    }

    // 5. QR verification (if provided)
    let qrVerified = false;
    if (input.qrToken) {
        const nonce = crypto.randomUUID();
        const qrResult = await verifyQrToken(user.locationId!, input.qrToken, nonce);
        if (!qrResult.valid) {
            return error("QR_INVALID", qrResult.reason, 403);
        }
        qrVerified = true;
    }

    // 6. Anomaly detection
    const lastCheckIn = await prisma.attendanceRecord.findFirst({
        where: { userId: auth.sub, checkInAt: { not: null } },
        orderBy: { date: "desc" },
        select: { checkInLat: true, checkInLng: true, checkInAt: true },
    });

    const anomaly = detectAnomalies({
        userId: auth.sub,
        currentLat: input.lat,
        currentLng: input.lng,
        currentTime: now,
        previousCheckIn: (lastCheckIn?.checkInLat != null && lastCheckIn?.checkInLng != null && lastCheckIn?.checkInAt != null) ? {
            lat: lastCheckIn.checkInLat,
            lng: lastCheckIn.checkInLng,
            timestamp: lastCheckIn.checkInAt,
        } : null,
    });

    // 7. Determine check-in method (matches Prisma CheckInMethod enum)
    const checkInMethod: "GEO_BIO" | "QR_BIO" = qrVerified ? "QR_BIO" : "GEO_BIO";

    // 8. Shift time check
    const shiftCheck = isWithinShiftWindow(now);

    // 9. Create attendance record
    const record = await prisma.attendanceRecord.create({
        data: {
            userId: auth.sub,
            date: todayStart,
            deviceId: input.deviceId,
            locationId: user.locationId!,
            checkInAt: now,
            checkInLat: input.lat,
            checkInLng: input.lng,
            checkInMethod: checkInMethod,
            verificationScore: geoResult.score,
            status: anomaly.isAnomaly ? "FLAGGED" : "VERIFIED",
            anomalyFlags: anomaly.flags.length > 0
                ? JSON.parse(JSON.stringify(anomaly.flags))
                : undefined,
        },
    });

    // 10. Update device lastSeenAt
    await prisma.device.update({
        where: { id: input.deviceId },
        data: { lastSeenAt: now },
    });

    // 11. Audit log
    await logAuditEvent({
        actorId: auth.sub,
        actorRole: auth.role,
        action: "attendance.checkin",
        resourceType: "attendance",
        resourceId: record.id,
        geoLocation: { lat: input.lat, lng: input.lng },
        metadata: {
            checkInMethod,
            verificationScore: geoResult.score,
            distanceM: geoResult.distanceM,
            anomalyFlags: anomaly.flags.length,
            lateMinutes: shiftCheck.minutesLate,
        },
    });

    logger.info({
        userId: auth.sub,
        recordId: record.id,
        score: geoResult.score,
        checkInMethod,
        anomaly: anomaly.isAnomaly,
    }, "Check-in recorded");

    return success({
        recordId: record.id,
        status: record.status,
        checkInAt: now.toISOString(),
        verificationScore: geoResult.score,
        locationFactors: geoResult.factors,
        distanceM: geoResult.distanceM,
        anomalyFlags: anomaly.flags,
        shiftStatus: {
            onTime: shiftCheck.onTime,
            minutesLate: shiftCheck.minutesLate,
        },
    }, 201);
}

export const POST = withAuth(handleCheckIn);
