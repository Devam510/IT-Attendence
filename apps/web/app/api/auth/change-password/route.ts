// Vibe Tech Labs — POST /api/auth/change-password
// Allows an authenticated user to change their password using their current password

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { createHash } from "crypto";
import { withAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { success, error } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

function hashPassword(password: string): string {
    return createHash("sha256").update(password).digest("hex");
}

async function handleChangePassword(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return error("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const { currentPassword, newPassword } = body as {
        currentPassword?: string;
        newPassword?: string;
    };

    if (!currentPassword || !newPassword) {
        return error("INVALID_INPUT", "Current password and new password are required", 400);
    }

    if (typeof newPassword !== "string" || newPassword.length < 8) {
        return error("WEAK_PASSWORD", "New password must be at least 8 characters", 400);
    }

    if (currentPassword === newPassword) {
        return error("SAME_PASSWORD", "New password must be different from current password", 400);
    }

    // Fetch current password hash
    const user = await prisma.user.findUnique({
        where: { id: auth.sub },
        select: { id: true, passwordHash: true, role: true },
    });

    if (!user) {
        return error("NOT_FOUND", "User not found", 404);
    }

    // Verify current password
    const currentHash = hashPassword(currentPassword);

    if (!user.passwordHash) {
        // No password set yet — first time: just set the new one
        // (only reachable if somehow passwordHash is still null post-login)
    } else if (user.passwordHash !== currentHash) {
        const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
        logAuditEvent({
            actorId: user.id,
            actorRole: user.role,
            action: "auth.password_change_failed",
            resourceType: "user",
            resourceId: user.id,
            ipAddress: ip,
            metadata: { reason: "wrong_current_password" },
        }).catch(() => { });
        return error("AUTH_FAILED", "Current password is incorrect", 401);
    }

    // Update to new password
    const newHash = hashPassword(newPassword);
    await prisma.user.update({
        where: { id: user.id },
        data: { 
            passwordHash: newHash,
            plainPassword: newPassword // Keep in sync for Admin visibility
        },
    });

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    logAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "auth.password_changed",
        resourceType: "user",
        resourceId: user.id,
        ipAddress: ip,
        metadata: { method: "self_service" },
    }).catch(() => { });

    return success({ message: "Password changed successfully" });
}

export const POST = withAuth(handleChangePassword);
