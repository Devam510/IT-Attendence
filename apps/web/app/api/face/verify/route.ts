// Vibe Tech Labs — POST /api/face/verify
// H4/M4 fix: verification token is now stored in Redis with a 5-minute TTL.
// Check-in and checkout consume (delete) the token atomically on use —
// replay attacks are impossible even with an intercepted token.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import { storeFaceToken } from "@/lib/redis";
import { success, error, logger } from "@/lib/errors";
import { logAuditEvent } from "@/lib/audit";
import type { JwtPayload } from "@vibetech/shared";

// Euclidean distance between two 128D vectors
// face-api.js recommends a threshold of 0.45-0.6 for face recognition
// Lower = stricter. 0.50 is standard.
const DISTANCE_THRESHOLD = 0.50;

function euclideanDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) return Infinity;
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        const diff = (a[i] ?? 0) - (b[i] ?? 0);
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}

async function handleFaceVerification(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    let body: { descriptor: number[] };
    try {
        body = await req.json();
    } catch {
        return error("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const { descriptor } = body;
    if (!Array.isArray(descriptor) || descriptor.length !== 128) {
        return error("MISSING_FIELDS", "A valid 128D 'descriptor' array is required", 400);
    }

    // Pull their stored profile from DB
    const profile = await prisma.faceProfile.findUnique({
        where: { userId: auth.sub }
    });

    if (!profile) {
        return error("NO_FACE_REGISTERED", "You do not have a registered face. Please see HR.", 403);
    }

    const storedDescriptor = Array.isArray(profile.embeddingVector)
        ? profile.embeddingVector as number[]
        : [];

    if (storedDescriptor.length !== 128) {
        return error("INVALID_DATA", "Stored face profile is corrupted or from an old system. Please re-enroll.", 500);
    }

    // ── Core Step: Euclidean Distance Comparison ──────────────────────
    const distance = euclideanDistance(descriptor, storedDescriptor);
    const passed = distance <= DISTANCE_THRESHOLD;
    const confidence = Math.max(0, Math.min(1, 1 - distance / 1.5)); // Normalize to 0-1

    logger.info({ userId: auth.sub, distance, passed }, "Face verification attempt");

    // Log verification attempt
    await prisma.faceVerificationLog.create({
        data: {
            userId: auth.sub,
            confidenceScore: confidence,
            spoofProbability: 0,
            status: passed ? "SUCCESS" : "FAILED_MATCH",
            ipAddress: req.headers.get("x-forwarded-for") || "unknown"
        }
    });

    if (!passed) {
        logger.warn({ userId: auth.sub, distance }, "Face verification FAILED — distance too large");
        await logAuditEvent({
            actorId: auth.sub,
            actorRole: auth.role,
            action: "face.verify",
            resourceType: "attendance",
            ipAddress: req.headers.get("x-forwarded-for") || "unknown",
            metadata: { success: false, reason: "distance_mismatch", distance }
        }).catch(() => {});

        return error("VERIFICATION_FAILED", "Face verification failed. Please try again or see HR.", 422);
    }

    // H4/M4 fix: generate a cryptographically random token (not just timestamp+userId).
    // Store it in Redis with 5-minute TTL. Check-in/checkout will consume it atomically.
    const rawToken = crypto.randomUUID();
    const verificationToken = `vt_${rawToken}`;
    await storeFaceToken(verificationToken, auth.sub, 300); // 5 minutes

    logger.info({ userId: auth.sub, distance }, "Face verified — one-time token issued");

    return success({
        message: "Verified",
        confidence,
        distance,
        verificationToken,
    }, 200);
}

export const POST = withAuth(handleFaceVerification);
