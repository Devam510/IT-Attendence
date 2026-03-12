// Vibe Tech Labs — POST /api/face/enroll
// Enrolls a new face profile for an employee

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import { success, error, logger } from "@/lib/errors";
import { enrollFace } from "@/lib/face-api";
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

    let body: { userId: string; image: string };
    try {
        body = await req.json();
    } catch {
        return error("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const { userId, image } = body;
    if (!userId || !image) {
        return error("MISSING_FIELDS", "Both 'userId' and 'image' are required", 400);
    }

    // Check if the user exists
    const targetUser = await prisma.user.findFirst({
        where: { id: userId, entityId: auth.entityId }
    });

    if (!targetUser) {
        return error("NOT_FOUND", "User not found or does not belong to your entity", 404);
    }

    // Check if they already have an active profile
    const existingProfile = await prisma.faceProfile.findUnique({
        where: { userId }
    });

    if (existingProfile) {
        // We could alternatively OVERWRITE the face profile, but for security, 
        // we bounce it out or require a specific "force" flag.
        return error("CONFLICT", "User already has an enrolled face profile.", 409);
    }

    // Call ML API
    const result = await enrollFace(image);
    
    if (!result.success || !result.embeddingVector) {
        return error("ML_ERROR", result.error || "Failed to extract face features", 500);
    }

    // Save mapping to Database
    const newProfile = await prisma.faceProfile.create({
        data: {
            userId,
            embeddingVector: result.embeddingVector
        }
    });

    await logAuditEvent({
        actorId: auth.sub,
        actorRole: auth.role,
        action: "face.enroll",
        resourceType: "user",
        resourceId: userId,
        ipAddress: req.headers.get("x-forwarded-for") || "unknown",
        metadata: { success: true }
    }).catch(() => {});

    logger.info({ adminId: auth.sub, employeeId: userId }, "Face Enrolled Successfully");

    return success({
        message: "Face enrolled successfully",
        profileId: newProfile.id
    }, 201);
}

export const POST = withAuth(handleFaceEnrollment);
