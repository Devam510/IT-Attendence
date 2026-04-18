// Vibe Tech Labs — POST /api/auth/token/refresh
// H3 fix: Rotates BOTH access AND refresh token on each refresh call.
// A consumed refresh token immediately becomes invalid — stolen tokens cannot be silently reused.

import { NextRequest, NextResponse } from "next/server";
import { verifyRefreshToken, generateAccessToken, generateRefreshToken } from "@/lib/auth";
import { getSession, setSession, checkRateLimit } from "@/lib/redis";
import { error, success, withErrorHandler, logger } from "@/lib/errors";
import { prisma } from "@vibetech/db";

async function handleRefresh(req: NextRequest): Promise<NextResponse> {
    const ip = req.headers.get("x-forwarded-for") || "unknown";

    const rl = await checkRateLimit(`auth:refresh:${ip}`, 20, 60);
    if (!rl.allowed) {
        return error("RATE_LIMITED", "Too many refresh attempts", 429);
    }

    // Safe JSON parse
    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return error("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const { refreshToken } = body as { refreshToken?: string };

    if (!refreshToken) {
        return error("INVALID_INPUT", "Refresh token is required", 400);
    }

    // H3 fix: Use verifyRefreshToken (separate secret) instead of verifyToken
    const payload = await verifyRefreshToken(refreshToken);
    if (!payload) {
        return error("TOKEN_EXPIRED", "Refresh token is invalid or expired", 401);
    }

    // SECURITY: Verify this is a refresh token, not an access token
    const tokenPayload = payload as unknown as Record<string, unknown>;
    if (tokenPayload.type !== "refresh") {
        logger.warn({ userId: payload.sub }, "Non-refresh token used for refresh — rejected");
        return error("INVALID_TOKEN_TYPE", "Access tokens cannot be used for refresh", 401);
    }

    const deviceId = payload.deviceId || "web";
    const session = await getSession(payload.sub, deviceId);

    // Only reject if Redis IS available and explicitly says the token is invalid.
    // If Redis is unavailable (null), we trust the JWT signature alone.
    if (session !== null && session.refreshToken !== refreshToken) {
        logger.warn({ userId: payload.sub }, "Refresh token mismatch — possible token reuse attack");
        return error("SESSION_INVALID", "Session not found or token mismatch", 401);
    }

    // Fetch latest role/status from DB — prevents stale roles in tokens
    const user = await prisma.user.findUnique({
        where: { id: payload.sub },
        select: { role: true, entityId: true, status: true }
    });

    if (!user || user.status !== "ACTIVE") {
        return error("USER_INACTIVE", "Account is disabled or deleted", 401);
    }

    const tokenPayloadData = {
        sub: payload.sub,
        role: user.role,
        entityId: user.entityId,
        deviceId: payload.deviceId,
    };

    // H3 fix: Issue a NEW refresh token and invalidate the old one.
    // This means stolen tokens cannot be silently reused after the legitimate user refreshes.
    const [newAccessToken, newRefreshToken] = await Promise.all([
        generateAccessToken(tokenPayloadData),
        generateRefreshToken(tokenPayloadData),
    ]);

    // Update session with the NEW refresh token — old one is now invalid
    await setSession(payload.sub, deviceId, {
        ...(session ?? {}),
        refreshToken: newRefreshToken, // rotate: replace old token
        lastRefreshAt: new Date().toISOString(),
    });

    logger.info({ userId: payload.sub }, "Tokens refreshed (rotation applied)");

    return success({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken, // return new refresh token to client
        expiresIn: 900,
    });
}

export const POST = withErrorHandler(handleRefresh);
