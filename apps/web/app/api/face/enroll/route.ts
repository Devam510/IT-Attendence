// Vibe Tech Labs — POST /api/face/enroll
// Enrolls a new face profile for an employee using a pre-computed 128D descriptor
// The descriptor is computed in the browser via face-api.js (10-frame average)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withRole } from "@/lib/auth";
import { success, error, logger } from "@/lib/errors";
import { logAuditEvent } from "@/lib/audit";
import type { JwtPayload } from "@vibetech/shared";

async function handleFaceEnrollment(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    // Only HR and Admins can enroll a face
    if (!["SADM", "HRA", "HRBP"].includes(auth.role)) {
        return error("FORBIDDEN", "Only HR/Admins can enroll employee faces", 403);
    }

    let body: { userId: string; descriptor: number[] };
    try {
        body = await req.json();
    } catch {
        return error("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const { userId, descriptor } = body;
    if (!userId || !Array.isArray(descriptor) || descriptor.length !== 128) {
        return error("MISSING_FIELDS", "Both 'userId' and a valid 128D 'descriptor' array are required", 400);
    }

    // Check if the user exists and belongs to this entity
    const targetUser = await prisma.user.findFirst({
        where: { id: userId, entityId: auth.entityId }
    });

    if (!targetUser) {
        return error("NOT_FOUND", "User not found or does not belong to your entity", 404);
    }

    // Upsert: if they already have a profile, overwrite it (for "Update Face" flow)
    const profile = await prisma.faceProfile.upsert({
        where: { userId },
        update: { embeddingVector: descriptor },
        create: { userId, embeddingVector: descriptor },
    });

    await logAuditEvent({
        actorId: auth.sub,
        actorRole: auth.role,
        action: "face.enroll",
        resourceType: "user",
        resourceId: userId,
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
        metadata: { success: true, descriptorLength: descriptor.length }
    }).catch(() => {});

    logger.info({ adminId: auth.sub, employeeId: userId }, "Face Enrolled Successfully (128D avg descriptor)");

    return success({
        message: "Face enrolled successfully",
        profileId: profile.id
    }, 201);
}

export const POST = withRole("SADM", "HRA", "HRBP")(handleFaceEnrollment);
