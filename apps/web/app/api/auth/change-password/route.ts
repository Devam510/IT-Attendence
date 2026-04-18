// Vibe Tech Labs — POST /api/auth/change-password
// H1 fix: Uses bcrypt for password verification and hashing (was SHA-256)
// C3 fix: Removed plainPassword update — never store plaintext passwords

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import bcrypt from "bcryptjs";
import { withAuth } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { success, error } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

const BCRYPT_ROUNDS = 12;

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

    if (newPassword.length > 128) {
        return error("BAD_REQUEST", "New password must be at most 128 characters", 400);
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

    if (!user.passwordHash) {
        return error("AUTH_FAILED", "No password set on this account. Please contact HR.", 401);
    }

    // H1 fix: verify with bcrypt. Also handles legacy SHA-256 hashes transparently.
    let currentPasswordValid = false;
    let needsMigration = false;

    if (user.passwordHash.startsWith("$2")) {
        // Modern bcrypt hash
        currentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    } else {
        // Legacy SHA-256 — verify and migrate on success
        const { createHash } = await import("crypto");
        const legacyHash = createHash("sha256").update(currentPassword).digest("hex");
        currentPasswordValid = user.passwordHash === legacyHash;
        needsMigration = currentPasswordValid;
    }

    if (!currentPasswordValid) {
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

    // Hash new password with bcrypt
    const newHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    // Update — C3 fix: never store plainPassword
    await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
    });

    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    logAuditEvent({
        actorId: user.id,
        actorRole: user.role,
        action: "auth.password_changed",
        resourceType: "user",
        resourceId: user.id,
        ipAddress: ip,
        metadata: { method: "self_service", migratedFromSha256: needsMigration },
    }).catch(() => { });

    return success({ message: "Password changed successfully" });
}

export const POST = withAuth(handleChangePassword);
