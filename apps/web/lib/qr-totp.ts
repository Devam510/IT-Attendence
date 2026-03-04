// NEXUS — QR TOTP Generator & Verifier
// Location-bound, 30-second rotating QR codes with Redis nonce replay protection

import * as speakeasy from "speakeasy";
import { createHash } from "crypto";
import { storeQrNonce, isQrNonceUsed } from "./redis";

// ─── Generate Location-Bound QR Secret ──────────────────

function locationSecret(locationId: string, masterSecret: string): string {
    return createHash("sha256")
        .update(`${masterSecret}:${locationId}`)
        .digest("hex")
        .slice(0, 32); // 32-char base32-safe secret
}

// ─── Generate Current QR Token ──────────────────────────

export function generateQrToken(
    locationId: string,
    masterSecret: string = process.env.QR_SECRET || "nexus-qr-default-secret"
): { token: string; expiresIn: number } {
    const secret = locationSecret(locationId, masterSecret);
    const token = speakeasy.totp({
        secret,
        encoding: "ascii",
        step: 30, // 30-second rotation
    });

    // Seconds until next rotation
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 30 - (now % 30);

    return { token, expiresIn };
}

// ─── Verify QR Token ────────────────────────────────────

export interface QrVerifyResult {
    valid: boolean;
    reason: string;
}

export async function verifyQrToken(
    locationId: string,
    token: string,
    nonce: string,
    masterSecret: string = process.env.QR_SECRET || "nexus-qr-default-secret"
): Promise<QrVerifyResult> {
    // 1. Check nonce replay
    const used = await isQrNonceUsed(nonce);
    if (used) {
        return { valid: false, reason: "QR code already used (replay detected)" };
    }

    // 2. Verify TOTP
    const secret = locationSecret(locationId, masterSecret);
    const isValid = speakeasy.totp.verify({
        secret,
        encoding: "ascii",
        token,
        step: 30,
        window: 1, // Allow 1 step tolerance (±30s)
    });

    if (!isValid) {
        return { valid: false, reason: "QR code expired or invalid" };
    }

    // 3. Mark nonce as used (60s TTL — prevents reuse even if token window overlaps)
    await storeQrNonce(nonce, 60);

    return { valid: true, reason: "QR verified" };
}
