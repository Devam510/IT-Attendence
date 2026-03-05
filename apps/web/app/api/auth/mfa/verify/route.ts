// Vibe Tech Labs — POST /api/auth/mfa/verify — Confirm MFA enrollment

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nexus/db";
import { withAuth } from "@/lib/auth";
import { verifyTotp } from "@/lib/mfa";
import { logAuditEvent } from "@/lib/audit";
import { success, error, logger } from "@/lib/errors";
import type { JwtPayload } from "@nexus/shared";

async function handleVerify(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    // Safe JSON parse
    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return error("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const { token } = body as { token?: string };

    if (!token) return error("INVALID_INPUT", "TOTP token is required", 400);

    const user = await prisma.user.findUnique({
        where: { id: auth.sub },
        select: { mfaSecret: true, mfaEnabled: true },
    });

    if (!user || !user.mfaSecret) {
        return error("MFA_NOT_SETUP", "Call POST /api/auth/mfa/setup first", 400);
    }

    if (user.mfaEnabled) {
        return error("MFA_ALREADY_ENABLED", "MFA is already verified and active", 409);
    }

    if (!verifyTotp(user.mfaSecret, token)) {
        return error("MFA_INVALID", "Invalid TOTP token. Check your authenticator app.", 401);
    }

    // Activate MFA
    await prisma.user.update({
        where: { id: auth.sub },
        data: { mfaEnabled: true },
    });

    await logAuditEvent({
        actorId: auth.sub,
        actorRole: auth.role,
        action: "auth.mfa_enabled",
        resourceType: "user",
        resourceId: auth.sub,
    });

    logger.info({ userId: auth.sub }, "MFA enabled successfully");

    return success({ message: "MFA enabled successfully" });
}

export const POST = withAuth(handleVerify);
