// Vibe Tech Labs — POST /api/face/verify
// Verifies an employee's face during check-in

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import { success, error, logger } from "@/lib/errors";
import { verifyFace } from "@/lib/face-api";
import { logAuditEvent } from "@/lib/audit";
import type { JwtPayload } from "@vibetech/shared";

async function handleFaceVerification(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    let body: { image: string };
    try {
        body = await req.json();
    } catch {
        return error("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const { image } = body;
    if (!image) {
        return error("MISSING_FIELDS", "Live image is required", 400);
    }

    // Attempt to pull their profile from DB
    const profile = await prisma.faceProfile.findUnique({
        where: { userId: auth.sub }
    });

    if (!profile) {
        return error("NO_FACE_REGISTERED", "You do not have a registered face. Please see HR.", 403);
    }

    // Call ML API
    // Ensure casting embeddingVector to number array since Prisma handles JSON natively
    const storedVector = Array.isArray(profile.embeddingVector) 
        ? profile.embeddingVector as number[] 
        : [];

    if (storedVector.length === 0) {
        return error("INVALID_DATA", "Stored face embedding is corrupt.", 500);
    }

    const result = await verifyFace(image, storedVector);
    const passed = result.success && result.match;
    
    // Log verification attempt (Success or Failure)
    await prisma.faceVerificationLog.create({
        data: {
            userId: auth.sub,
            confidenceScore: result.confidence || 0,
            spoofProbability: result.spoofProbability || 0,
            status: passed ? "SUCCESS" : "FAILED_MATCH",
            ipAddress: req.headers.get("x-forwarded-for") || "unknown"
        }
    });

    if (!passed) {
        logger.warn({ userId: auth.sub, score: result.confidence }, "Employee face verification failed");
        
        await logAuditEvent({
            actorId: auth.sub,
            actorRole: auth.role,
            action: "face.verify",
            resourceType: "attendance",
            ipAddress: req.headers.get("x-forwarded-for") || "unknown",
            metadata: { success: false, reason: "mismatch" }
        }).catch(() => {});

        return error("VERIFICATION_FAILED", "Face verification failed. Please try again or see HR.", 401);
    }

    logger.info({ userId: auth.sub }, "Employee face verified successfully");

    return success({
        message: "Verified",
        confidence: result.confidence,
        // Optional: Return a short-lived token that the check-in API will consume to guarantee it isn't bypassed.
        verificationToken: `v_token_${Date.now()}_${auth.sub}`
    }, 200);
}

export const POST = withAuth(handleFaceVerification);
