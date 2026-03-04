// NEXUS — POST /api/auth/token/refresh
// Rotates access token using a valid refresh token

import { NextRequest, NextResponse } from "next/server";
import { verifyToken, generateAccessToken } from "@/lib/auth";
import { getSession, setSession, checkRateLimit } from "@/lib/redis";
import { error, success, withErrorHandler, logger } from "@/lib/errors";

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

    const payload = await verifyToken(refreshToken);
    if (!payload) {
        return error("TOKEN_EXPIRED", "Refresh token is invalid or expired", 401);
    }

    // SECURITY: Verify this is a refresh token, not an access token
    const tokenPayload = payload as unknown as Record<string, unknown>;
    if (tokenPayload.type !== "refresh") {
        logger.warn({ userId: payload.sub }, "Access token used as refresh token — rejected");
        return error("INVALID_TOKEN_TYPE", "Access tokens cannot be used for refresh", 401);
    }

    const deviceId = payload.deviceId || "web";
    const session = await getSession(payload.sub, deviceId);
    if (!session || session.refreshToken !== refreshToken) {
        logger.warn({ userId: payload.sub }, "Refresh token mismatch — possible token reuse");
        return error("SESSION_INVALID", "Session not found or token mismatch", 401);
    }

    const newAccessToken = await generateAccessToken({
        sub: payload.sub,
        role: payload.role,
        entityId: payload.entityId,
        deviceId: payload.deviceId,
    });

    await setSession(payload.sub, deviceId, {
        ...session,
        lastRefreshAt: new Date().toISOString(),
    });

    return success({
        accessToken: newAccessToken,
        expiresIn: 900,
    });
}

export const POST = withErrorHandler(handleRefresh);
