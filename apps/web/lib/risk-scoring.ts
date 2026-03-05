// Vibe Tech Labs — Risk Scoring Engine
// Composite 0–100 risk score for user sessions and requests

export interface RiskFactors {
    // Device factors
    isRooted?: boolean;            // Jailbroken/rooted device
    isEmulator?: boolean;          // Running in emulator
    certificatePinningFailed?: boolean;
    unknownDevice?: boolean;       // First-time device
    multipleDevicesToday?: boolean;

    // Location factors
    impossibleTravel?: boolean;     // Two locations too far apart in too little time
    vpnDetected?: boolean;
    locationSpoofing?: boolean;
    outsideGeofence?: boolean;

    // Behavioral factors
    unusualHours?: boolean;         // Login outside normal working hours
    rapidActions?: boolean;         // Too many actions in short period
    failedAuthAttempts?: number;    // Recent failed login count
    patternDeviation?: boolean;     // Significant deviation from normal behavior

    // Network factors
    torExit?: boolean;              // Request from Tor exit node
    highRiskCountry?: boolean;      // Request from high-risk geolocation
    suspiciousUserAgent?: boolean;
}

export interface RiskResult {
    score: number;          // 0-100, higher = riskier
    level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    factors: string[];      // List of triggered factors
    actions: string[];      // Recommended actions
}

// ─── Risk Weights ───────────────────────────────────────

const WEIGHTS: Record<string, number> = {
    isRooted: 25,
    isEmulator: 20,
    certificatePinningFailed: 30,
    unknownDevice: 10,
    multipleDevicesToday: 8,
    impossibleTravel: 25,
    vpnDetected: 5,
    locationSpoofing: 30,
    outsideGeofence: 15,
    unusualHours: 5,
    rapidActions: 10,
    failedAuthAttempts: 15,  // per attempt above threshold
    patternDeviation: 10,
    torExit: 20,
    highRiskCountry: 15,
    suspiciousUserAgent: 10,
};

// ─── Calculate Risk Score ───────────────────────────────

export function calculateRiskScore(factors: RiskFactors): RiskResult {
    let score = 0;
    const triggeredFactors: string[] = [];

    // Boolean factors
    const boolFactors: (keyof RiskFactors)[] = [
        "isRooted", "isEmulator", "certificatePinningFailed", "unknownDevice",
        "multipleDevicesToday", "impossibleTravel", "vpnDetected", "locationSpoofing",
        "outsideGeofence", "unusualHours", "rapidActions", "patternDeviation",
        "torExit", "highRiskCountry", "suspiciousUserAgent",
    ];

    for (const factor of boolFactors) {
        if (factors[factor]) {
            const weight = WEIGHTS[factor] || 0;
            score += weight;
            triggeredFactors.push(factor);
        }
    }

    // Numeric factors
    if (factors.failedAuthAttempts && factors.failedAuthAttempts > 2) {
        const excess = factors.failedAuthAttempts - 2;
        const weight = (WEIGHTS["failedAuthAttempts"] || 0) * excess;
        score += weight;
        triggeredFactors.push(`failedAuthAttempts:${factors.failedAuthAttempts}`);
    }

    // Clamp to 0-100
    score = Math.min(100, Math.max(0, score));

    // Determine level
    let level: RiskResult["level"] = "LOW";
    if (score >= 70) level = "CRITICAL";
    else if (score >= 45) level = "HIGH";
    else if (score >= 20) level = "MEDIUM";

    // Recommend actions
    const actions: string[] = [];
    if (level === "CRITICAL") {
        actions.push("BLOCK_REQUEST", "FORCE_REAUTHENTICATION", "NOTIFY_ADMIN", "LOG_INCIDENT");
    } else if (level === "HIGH") {
        actions.push("REQUIRE_MFA", "NOTIFY_ADMIN", "ENHANCED_LOGGING");
    } else if (level === "MEDIUM") {
        actions.push("ENHANCED_LOGGING", "MONITOR");
    }

    return { score, level, factors: triggeredFactors, actions };
}

// ─── Device Trust Assessment ────────────────────────────

export function assessDeviceTrust(deviceInfo: {
    isRooted?: boolean;
    isEmulator?: boolean;
    certPinningOk?: boolean;
    isKnownDevice?: boolean;
    deviceAge?: number;       // days since first seen
}): { trusted: boolean; score: number; reason: string } {
    let trustScore = 100;
    const deductions: string[] = [];

    if (deviceInfo.isRooted) {
        trustScore -= 40;
        deductions.push("rooted/jailbroken");
    }
    if (deviceInfo.isEmulator) {
        trustScore -= 35;
        deductions.push("emulator detected");
    }
    if (deviceInfo.certPinningOk === false) {
        trustScore -= 50;
        deductions.push("certificate pinning failed");
    }
    if (!deviceInfo.isKnownDevice) {
        trustScore -= 15;
        deductions.push("unknown device");
    }
    if (deviceInfo.deviceAge != null && deviceInfo.deviceAge < 1) {
        trustScore -= 10;
        deductions.push("device registered < 1 day");
    }

    trustScore = Math.max(0, trustScore);

    return {
        trusted: trustScore >= 50,
        score: trustScore,
        reason: deductions.length > 0
            ? `Trust reduced: ${deductions.join(", ")}`
            : "Device fully trusted",
    };
}
