// NEXUS — POST /api/auth/device/register
// Registers a mobile device and calculates trust score

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nexus/db";
import { DeviceRegisterSchema } from "@nexus/shared";
import { withAuth } from "@/lib/auth";
import { calculateDeviceTrust } from "@/lib/device-trust";
import { logAuditEvent } from "@/lib/audit";
import { success, error, logger } from "@/lib/errors";
import type { JwtPayload } from "@nexus/shared";

async function handleDeviceRegister(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;
    const body = await req.json();

    const parsed = DeviceRegisterSchema.safeParse(body);
    if (!parsed.success) {
        return error("VALIDATION_ERROR", "Invalid device data", 422, parsed.error.errors);
    }

    const input = parsed.data;

    // Check duplicate binding
    const existing = await prisma.device.findUnique({
        where: { deviceFingerprint: input.deviceFingerprint },
    });

    if (existing && existing.userId !== auth.sub) {
        return error("DEVICE_BOUND", "This device is registered to another user", 409);
    }

    // Calculate trust score
    const trust = calculateDeviceTrust({
        platform: input.platform,
        osVersion: input.osVersion || "0",
        isJailbroken: input.isJailbroken,
        mdmEnrolled: input.mdmEnrolled,
    });

    if (existing) {
        const updated = await prisma.device.update({
            where: { id: existing.id },
            data: {
                osVersion: input.osVersion,
                model: input.model,
                isJailbroken: input.isJailbroken,
                mdmEnrolled: input.mdmEnrolled,
                trustScore: trust.score,
                lastSeenAt: new Date(),
            },
        });

        return success({
            deviceId: updated.id,
            trustScore: trust.score,
            trustBreakdown: trust.factors,
            isTrusted: trust.score >= 60,
        });
    }

    // Limit 3 devices per user
    const deviceCount = await prisma.device.count({
        where: { userId: auth.sub },
    });

    if (deviceCount >= 3) {
        return error("MAX_DEVICES", "Maximum 3 devices per user", 409);
    }

    const device = await prisma.device.create({
        data: {
            userId: auth.sub,
            deviceFingerprint: input.deviceFingerprint,
            platform: input.platform,
            osVersion: input.osVersion,
            model: input.model,
            isJailbroken: input.isJailbroken,
            mdmEnrolled: input.mdmEnrolled,
            trustScore: trust.score,
            lastSeenAt: new Date(),
        },
    });

    await logAuditEvent({
        actorId: auth.sub,
        actorRole: auth.role,
        action: "auth.device_registered",
        resourceType: "device",
        resourceId: device.id,
        metadata: { platform: input.platform, trustScore: trust.score, model: input.model },
    });

    logger.info({ userId: auth.sub, deviceId: device.id, trustScore: trust.score }, "New device registered");

    return success({
        deviceId: device.id,
        trustScore: trust.score,
        trustBreakdown: trust.factors,
        isTrusted: trust.score >= 60,
    }, 201);
}

export const POST = withAuth(handleDeviceRegister);
