// Vibe Tech Labs — GET /api/face/status
// Diagnostic: returns face profile status for the logged-in user
// Used to debug enrollment issues without exposing the actual descriptor

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import { success } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

async function handleFaceStatus(
    _req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    const profile = await prisma.faceProfile.findUnique({
        where: { userId: auth.sub },
        select: {
            id: true,
            embeddingVector: true,
            createdAt: true,
            updatedAt: true,
        }
    });

    if (!profile) {
        return success({
            enrolled: false,
            message: "No face profile found for this user. Please enroll via the HR admin panel.",
        });
    }

    // Check descriptor validity without exposing it
    let descriptorLength = 0;
    const raw = profile.embeddingVector;
    if (Array.isArray(raw)) {
        descriptorLength = raw.length;
    } else if (raw && typeof raw === "object") {
        descriptorLength = Object.keys(raw as object).length;
    }

    return success({
        enrolled: true,
        descriptorLength,
        valid: descriptorLength === 128,
        enrolledAt: profile.createdAt,
        lastUpdated: profile.updatedAt,
        userId: auth.sub,
        message: descriptorLength === 128
            ? "Face profile is valid (128 dimensions)."
            : `Face profile is CORRUPTED (only ${descriptorLength} dimensions). Re-enroll required.`,
    });
}

export const GET = withAuth(handleFaceStatus);
