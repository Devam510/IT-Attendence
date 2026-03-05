// Vibe Tech Labs — POST /api/auth/mfa/setup — Start MFA enrollment
// Vibe Tech Labs — DELETE /api/auth/mfa/setup — Disable MFA

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import { generateTotpSecret, generateTotpQrCode, verifyTotp } from "@/lib/mfa";
import { logAuditEvent } from "@/lib/audit";
import { success, error, logger } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

// ─── POST — Start MFA enrollment ────────────────────────

async function handleSetup(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    const user = await prisma.user.findUnique({
        where: { id: auth.sub },
        select: { email: true, mfaEnabled: true },
    });

    if (!user) return error("USER_NOT_FOUND", "User not found", 404);
    if (user.mfaEnabled) return error("MFA_ALREADY_ENABLED", "MFA is already enabled", 409);

    const { secret, otpAuthUrl } = generateTotpSecret(user.email);

    await prisma.user.update({
        where: { id: auth.sub },
        data: { mfaSecret: secret, mfaEnabled: false },
    });

    const qrCode = await generateTotpQrCode(otpAuthUrl);

    logger.info({ userId: auth.sub }, "MFA setup initiated");

    return success({
        secret,
        qrCode,
        message: "Scan the QR code with your authenticator app, then verify with POST /api/auth/mfa/verify",
    });
}

export const POST = withAuth(handleSetup);

// ─── DELETE — Disable MFA ───────────────────────────────

async function handleDisable(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;
    const body = await req.json().catch(() => ({}));
    const { token } = body as { token?: string };

    const user = await prisma.user.findUnique({
        where: { id: auth.sub },
        select: { mfaSecret: true, mfaEnabled: true },
    });

    if (!user || !user.mfaEnabled || !user.mfaSecret) {
        return error("MFA_NOT_ENABLED", "MFA is not enabled", 400);
    }

    if (!token) return error("INVALID_INPUT", "Current TOTP token required to disable MFA", 400);
    if (!verifyTotp(user.mfaSecret, token)) return error("MFA_INVALID", "Invalid TOTP token", 401);

    await prisma.user.update({
        where: { id: auth.sub },
        data: { mfaSecret: null, mfaEnabled: false },
    });

    await logAuditEvent({
        actorId: auth.sub,
        actorRole: auth.role,
        action: "auth.mfa_disabled",
        resourceType: "user",
        resourceId: auth.sub,
    });

    logger.info({ userId: auth.sub }, "MFA disabled");

    return success({ message: "MFA disabled successfully" });
}

export const DELETE = withAuth(handleDisable);
