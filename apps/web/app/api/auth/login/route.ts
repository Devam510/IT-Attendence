// NEXUS — POST /api/auth/login
// Authenticates user via email/password, returns JWT pair

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nexus/db";
import { createHash } from "crypto";
import { generateAccessToken, generateRefreshToken } from "@/lib/auth";
import { setSession, checkRateLimit } from "@/lib/redis";
import { logAuditEvent } from "@/lib/audit";
import { verifyTotp } from "@/lib/mfa";
import { success, error, withErrorHandler, logger } from "@/lib/errors";

function hashPassword(password: string): string {
    return createHash("sha256").update(password).digest("hex");
}

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

    const { email, password, totpToken, deviceId } = body as {
        email?: string;
        password?: string;
        totpToken?: string;
        deviceId?: string;
    };

    if (!email || !password) {
        return error("INVALID_INPUT", "Email and password are required", 400);
    }

    // Find user
    const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase().trim() },
        include: {
            entity: { select: { id: true, timezone: true } },
            location: { select: { id: true, name: true } },
            department: { select: { id: true, name: true } },
        },
    });

    if (!user) {
        logger.warn({ email }, "Login attempt for non-existent user");
        return error("AUTH_FAILED", "Invalid credentials", 401);
    }

    if (user.status !== "ACTIVE") {
        return error("ACCOUNT_INACTIVE", `Account is ${user.status.toLowerCase()}`, 403);
    }

    // Verify password
    // SECURITY: If passwordHash is null (first login / SSO-only user),
    // set the hash from the provided password (first-time password setup).
    // In production, this would be a separate /set-password endpoint.
    const expectedHash = hashPassword(password);
    if (!user.passwordHash) {
        // First login: set the password hash
        await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash: expectedHash },
        });
        logger.info({ userId: user.id }, "First-time password set on login");
    } else if (user.passwordHash !== expectedHash) {
        // Password mismatch
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
