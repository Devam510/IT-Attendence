// Vibe Tech Labs — GET /api/auth/session — Session status + risk score
// Vibe Tech Labs — DELETE /api/auth/session — Logout
// Works without Redis — falls back to JWT-only validation

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nexus/db";
import { withAuth } from "@/lib/auth";
import { getSession, deleteSession } from "@/lib/redis";
import { logAuditEvent } from "@/lib/audit";
import { success, logger } from "@/lib/errors";
import type { JwtPayload } from "@nexus/shared";

// ─── GET — Current session status ───────────────────────

async function handleGetSession(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;
    const deviceId = auth.deviceId || "web";

    // Try Redis session, but don't fail if unavailable
    const session = await getSession(auth.sub, deviceId);

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
        return NextResponse.json(
            { success: false, error: { code: "USER_NOT_FOUND", message: "User not found" } },
            { status: 404 }
        );
    }

    // Risk score (simplified — no device check needed for web)
    let riskScore = 15; // Base web risk
    if (!user.mfaEnabled) riskScore += 10;
    riskScore = Math.min(100, riskScore);

    return success({
        user,
        device: null,
        session: session
            ? {
                loginAt: session.loginAt,
                lastRefreshAt: session.lastRefreshAt || null,
                ip: session.ip,
            }
            : {
                loginAt: new Date().toISOString(),
                lastRefreshAt: null,
                ip: req.headers.get("x-forwarded-for") || "unknown",
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

    // Fire-and-forget audit
    logAuditEvent({
        actorId: auth.sub,
        actorRole: auth.role,
        action: "auth.logout",
        resourceType: "user",
        resourceId: auth.sub,
        ipAddress: ip,
        deviceId: auth.deviceId,
    }).catch(() => { });

    logger.info({ userId: auth.sub }, "User logged out");

    return success({ message: "Logged out successfully" });
}

export const DELETE = withAuth(handleLogout);
