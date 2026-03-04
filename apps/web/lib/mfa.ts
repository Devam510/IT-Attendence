// NEXUS — MFA (TOTP) Service
// Generates and verifies time-based one-time passwords

import * as speakeasy from "speakeasy";
import * as QRCode from "qrcode";

const APP_NAME = "NEXUS";

// ─── Generate TOTP Secret ───────────────────────────────

export function generateTotpSecret(userEmail: string): {
    secret: string;
    otpAuthUrl: string;
} {
    const generated = speakeasy.generateSecret({
        name: `${APP_NAME} (${userEmail})`,
        issuer: APP_NAME,
        length: 32,
    });

    return {
        secret: generated.base32,
        otpAuthUrl: generated.otpauth_url || "",
    };
}

// ─── Generate QR Code ───────────────────────────────────

export async function generateTotpQrCode(otpAuthUrl: string): Promise<string> {
    return QRCode.toDataURL(otpAuthUrl, {
        width: 256,
        margin: 2,
        color: { dark: "#1A56DB", light: "#FFFFFF" },
    });
}

// ─── Verify TOTP Token ──────────────────────────────────

export function verifyTotp(secret: string, token: string): boolean {
    return speakeasy.totp.verify({
        secret,
        encoding: "base32",
        token,
        window: 1, // Allow 1 step before/after (±30 seconds)
    });
}

// ─── Generate Current TOTP (for testing) ────────────────

export function generateCurrentTotp(secret: string): string {
    return speakeasy.totp({
        secret,
        encoding: "base32",
    });
}
