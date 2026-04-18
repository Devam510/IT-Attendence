// Vibe Tech Labs — POST /api/auth/login
// H1 fix: Uses bcrypt for password verification (was SHA-256 — too weak)
// H2 fix: Removed first-login auto-set. Users with no password must use the initial
//         password set by HR at account creation time (always bcrypt-hashed now).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import bcrypt from "bcryptjs";
import { generateAccessToken, generateRefreshToken } from "@/lib/auth";
import { setSession, checkRateLimit } from "@/lib/redis";
import { logAuditEvent } from "@/lib/audit";
import { verifyTotp } from "@/lib/mfa";
import { success, error, withErrorHandler, logger } from "@/lib/errors";

async function handleLogin(req: NextRequest): Promise<NextResponse> {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";

    // Rate limit: 10 requests per minute per IP
    const rl = await checkRateLimit(`auth:login:${ip}`, 10, 60);
    if (!rl.allowed) {
        return error("RATE_LIMITED", "Too many login attempts. Try again later.", 429);
    }

    // Safe JSON parse
    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return error("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const { identifier, email, password, totpToken, deviceId } = body as {
        identifier?: string; // username (employeeId) or email
        email?: string;       // legacy support
        password?: string;
        totpToken?: string;
        deviceId?: string;
    };

    // Accept either new "identifier" field or legacy "email" field
    const loginId = (identifier || email || "").trim();

    if (!loginId || !password) {
        return error("INVALID_INPUT", "Username/Email and password are required", 400);
    }

    // Find user by email OR employeeId (case-insensitive)
    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { email: loginId.toLowerCase() },
                { employeeId: loginId },
            ],
        },
        include: {
            entity: { select: { id: true, timezone: true } },
            location: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
        },
    });

    if (!user) {
        logger.warn({ loginId }, "Login attempt for non-existent user");
        return error("AUTH_FAILED", "Invalid credentials", 401);
    }

    if (user.status !== "ACTIVE") {
        return error("ACCOUNT_INACTIVE", `Account is ${user.status.toLowerCase()}`, 403);
    }

    // H2 fix: Removed auto-set for first login. If passwordHash is null, the account
    // was created incorrectly (HR must set initial password using bcrypt at creation time).
    if (!user.passwordHash) {
        logger.warn({ userId: user.id }, "Login attempt on account with no password set — rejected");
        return error("AUTH_FAILED", "Invalid credentials", 401);
    }

    // H1 fix: Use bcrypt.compare() instead of SHA-256.
    // If the stored hash still uses old SHA-256 format, migrate it on successful login.
    let passwordValid = false;

    if (user.passwordHash.startsWith("$2")) {
        // Modern bcrypt hash — compare directly
        passwordValid = await bcrypt.compare(password, user.passwordHash);
    } else {
        // Legacy SHA-256 hash (hex string, 64 chars) — migrate transparently on the
        // first successful login so we don't force all users to reset passwords at once.
        const { createHash } = await import("crypto");
        const legacyHash = createHash("sha256").update(password).digest("hex");
        if (user.passwordHash === legacyHash) {
            // Password is correct — upgrade to bcrypt (12 rounds)
            const bcryptHash = await bcrypt.hash(password, 12);
            await prisma.user.update({
                where: { id: user.id },
                data: { passwordHash: bcryptHash },
            });
            logger.info({ userId: user.id }, "Password hash migrated from SHA-256 to bcrypt");
            passwordValid = true;
        }
    }

    if (!passwordValid) {
        // Fire-and-forget audit — don't slow down login
        logAuditEvent({
            actorId: user.id,
            actorRole: user.role,
            action: "auth.login_failed",
            resourceType: "user",
            resourceId: user.id,
            ipAddress: ip,
            metadata: { reason: "invalid_password" },
        }).catch(() => { });
        return error("AUTH_FAILED", "Invalid credentials", 401);
    }

    // Check MFA
    if (user.mfaEnabled && user.mfaSecret) {
        if (!totpToken) {
            return NextResponse.json(
                { success: false, error: { code: "MFA_REQUIRED", message: "TOTP token required" }, data: { mfaRequired: true } },
                { status: 403 }
            );
        }
        if (!verifyTotp(user.mfaSecret, totpToken)) {
            return error("MFA_INVALID", "Invalid TOTP token", 401);
        }
    }

    // Generate tokens
    const payload = {
        sub: user.id,
        role: user.role,
        entityId: user.entityId,
        deviceId: deviceId || undefined,
    };

    const [accessToken, refreshToken] = await Promise.all([
        generateAccessToken(payload),
        generateRefreshToken(payload),
    ]);

    // Fire-and-forget session + audit — don't block response
    setSession(user.id, deviceId || "web", {
        refreshToken,
        role: user.role,
        entityId: user.entityId,
        loginAt: new Date().toISOString(),
        ip,
    }).catch(() => { });

    logAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "auth.login",
        resourceType: "user",
        resourceId: user.id,
        ipAddress: ip,
        deviceId: deviceId || undefined,
        metadata: { method: "password" },
    }).catch(() => { });

    logger.info({ userId: user.id, role: user.role }, "User logged in");

    return success({
        accessToken,
        refreshToken,
        expiresIn: 900,
        user: {
            id: user.id,
            employeeId: user.employeeId,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            entityId: user.entityId,
            departmentName: user.department?.name,
            locationName: user.location?.name,
            mfaEnabled: user.mfaEnabled,
        },
    });
}

export const POST = withErrorHandler(handleLogin);
