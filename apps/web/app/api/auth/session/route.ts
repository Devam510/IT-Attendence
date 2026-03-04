// NEXUS — GET /api/auth/session — Session status + risk score
// NEXUS — DELETE /api/auth/session — Logout

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nexus/db";
import { withAuth } from "@/lib/auth";
import { getSession, deleteSession } from "@/lib/redis";
import { logAuditEvent } from "@/lib/audit";
import { success, error, logger } from "@/lib/errors";
import type { JwtPayload } from "@nexus/shared";

// ─── GET — Current session status ───────────────────────

async function handleGetSession(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;
    const deviceId = auth.deviceId || "web";

    const session = await getSession(auth.sub, deviceId);
    if (!session) {
        return error("SESSION_NOT_FOUND", "No active session", 401);
    }

    const user = await prisma.user.findUnique({
        where: { id: auth.sub },
        select: {
            id: true,
            employeeId: true,
            email: true,
            fullName: true,
            role: true,
            status: true,
            mfaEnabled: true,
            entity: { select: { name: true, timezone: true } },
            department: { select: { name: true } },
            location: { select: { name: true } },
        },
    });

    if (!user) {
        return error("USER_NOT_FOUND", "User not found", 404);
    }

    let device = null;
    if (auth.deviceId) {
        device = await prisma.device.findUnique({
            where: { id: auth.deviceId },
            select: {
                id: true,
                platform: true,
                model: true,
                trustScore: true,
                isJailbroken: true,
                mdmEnrolled: true,
                lastSeenAt: true,
            },
        });
    }

    // ─── Risk Score Calculation ──────────────────────────
    let riskScore = 0;

    if (device) {
        // Device-specific risks
        if (device.isJailbroken) riskScore += 40;
        if (!device.mdmEnrolled) riskScore += 15;
        if (device.trustScore < 60) riskScore += 20;
    } else {
        // No device bound — web-only login carries its own risk
        riskScore += 15; // Unbound session risk
    }

    if (!user.mfaEnabled) riskScore += 10;

    // Cap at 100
    riskScore = Math.min(100, riskScore);

    return success({
        user,
        device,
        session: {
            loginAt: session.loginAt,
            lastRefreshAt: session.lastRefreshAt || null,
            ip: session.ip,
        },
        riskScore,
        riskLevel: riskScore >= 60 ? "HIGH" : riskScore >= 30 ? "MEDIUM" : "LOW",
    });
}

export const GET = withAuth(handleGetSession);

// ─── DELETE — Logout ────────────────────────────────────

async function handleLogout(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;
    const deviceId = auth.deviceId || "web";
    const ip = req.headers.get("x-forwarded-for") || "unknown";

    await deleteSession(auth.sub, deviceId);

    await logAuditEvent({
        actorId: auth.sub,
        actorRole: auth.role,
        action: "auth.logout",
        resourceType: "user",
        resourceId: auth.sub,
        ipAddress: ip,
        deviceId: auth.deviceId,
    });

    logger.info({ userId: auth.sub }, "User logged out");

    return success({ message: "Logged out successfully" });
}

export const DELETE = withAuth(handleLogout);
