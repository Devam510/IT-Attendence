// NEXUS — Device Trust Score Calculator
// Computes a 0–100 trust score based on device security posture

export interface DeviceTrustInput {
    platform: "IOS" | "ANDROID";
    osVersion: string;
    isJailbroken: boolean;
    mdmEnrolled: boolean;
    isEmulator?: boolean;
    hasBiometric?: boolean;
    isEncrypted?: boolean;
    patchLevel?: string; // "2026-01" format for Android
}

interface TrustBreakdown {
    score: number;
    factors: Record<string, { score: number; max: number; reason: string }>;
}

// Minimum OS versions considered secure
const MIN_SECURE_OS: Record<string, number> = {
    IOS: 17,
    ANDROID: 14,
};

export function calculateDeviceTrust(input: DeviceTrustInput): TrustBreakdown {
    const factors: TrustBreakdown["factors"] = {};

    // 1. Jailbreak / Root (30 points)
    if (input.isJailbroken) {
        factors.jailbreak = { score: 0, max: 30, reason: "Device is jailbroken/rooted" };
    } else {
        factors.jailbreak = { score: 30, max: 30, reason: "No jailbreak/root detected" };
    }

    // 2. OS Version (25 points)
    const majorVersion = parseInt(input.osVersion?.split(".")[0] || "0", 10);
    const minSecure = MIN_SECURE_OS[input.platform] ?? 14;
    if (majorVersion >= minSecure) {
        factors.osVersion = { score: 25, max: 25, reason: `OS ${input.osVersion} is current` };
    } else if (majorVersion >= minSecure - 2) {
        factors.osVersion = { score: 15, max: 25, reason: `OS ${input.osVersion} is aging` };
    } else {
        factors.osVersion = { score: 5, max: 25, reason: `OS ${input.osVersion} is outdated` };
    }

    // 3. MDM Enrollment (20 points)
    if (input.mdmEnrolled) {
        factors.mdm = { score: 20, max: 20, reason: "MDM enrolled and managed" };
    } else {
        factors.mdm = { score: 5, max: 20, reason: "Not MDM enrolled" };
    }

    // 4. Biometric Capability (15 points)
    if (input.hasBiometric !== false) {
        factors.biometric = { score: 15, max: 15, reason: "Biometric hardware available" };
    } else {
        factors.biometric = { score: 0, max: 15, reason: "No biometric hardware" };
    }

    // 5. Encryption (10 points)
    if (input.isEncrypted !== false) {
        // iOS is always encrypted, Android since 6.0
        factors.encryption = { score: 10, max: 10, reason: "Storage encrypted" };
    } else {
        factors.encryption = { score: 0, max: 10, reason: "Storage not encrypted" };
    }

    // Emulator penalty
    if (input.isEmulator) {
        factors.emulator = { score: -50, max: 0, reason: "Emulator detected — high risk" };
    }

    const score = Math.max(0, Math.min(100,
        Object.values(factors).reduce((sum, f) => sum + f.score, 0)
    ));

    return { score, factors };
}

// Threshold checks
export function isTrusted(score: number): boolean {
    return score >= 60;
}

export function isHighTrust(score: number): boolean {
    return score >= 80;
}
