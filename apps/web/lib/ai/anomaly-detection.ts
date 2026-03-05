// Vibe Tech Labs — AI Anomaly Detection Engine
// Statistical anomaly detection for attendance patterns

import { prisma } from "@vibetech/db";

// ─── Types ──────────────────────────────────────────────

export interface AnomalyResult {
    userId: string;
    anomalies: AnomalyFlag[];
    riskLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH";
    score: number; // 0-100
}

export interface AnomalyFlag {
    type: string;
    severity: "INFO" | "WARNING" | "CRITICAL";
    description: string;
    data: Record<string, unknown>;
}

// ─── Thresholds ─────────────────────────────────────────

const THRESHOLDS = {
    LATE_CHECKIN_MINUTES: 15,         // Minutes after shift start
    EARLY_CHECKOUT_MINUTES: 30,       // Minutes before shift end
    SHORT_SHIFT_HOURS: 4,             // Minimum expected hours
    LONG_SHIFT_HOURS: 14,             // Maximum expected hours
    RAPID_CHECKIN_MINUTES: 2,         // Suspiciously fast check-in
    LOCATION_DEVIATION_KM: 1.0,      // Max distance from office location
    CONSECUTIVE_LATE_DAYS: 3,         // Days in a row late
    MONTHLY_ABSENT_THRESHOLD: 5,     // Days absent in a month
    WEEKEND_CHECKIN_FLAG: true,       // Flag weekend check-ins
};

// ─── Detect Anomalies ───────────────────────────────────

export async function detectAnomalies(
    userId: string,
    lookbackDays: number = 30
): Promise<AnomalyResult> {
    const anomalies: AnomalyFlag[] = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

    // Fetch recent attendance
    const records = await prisma.attendanceRecord.findMany({
        where: { userId, date: { gte: cutoffDate } },
        orderBy: { date: "desc" },
        select: {
            date: true,
            checkInAt: true,
            checkOutAt: true,
            totalHours: true,
            status: true,
            checkInLat: true,
            checkInLng: true,
            verificationScore: true,
        },
    });

    if (records.length === 0) {
        return { userId, anomalies: [], riskLevel: "NONE", score: 0 };
    }

    // ─── Analysis 1: Short shifts ───────────────────────
    const shortShifts = records.filter((r: any) =>
        r.totalHours != null && r.totalHours < THRESHOLDS.SHORT_SHIFT_HOURS && r.totalHours > 0
    );
    if (shortShifts.length > 2) {
        anomalies.push({
            type: "FREQUENT_SHORT_SHIFTS",
            severity: "WARNING",
            description: `${shortShifts.length} shifts under ${THRESHOLDS.SHORT_SHIFT_HOURS} hours in last ${lookbackDays} days`,
            data: { count: shortShifts.length, threshold: THRESHOLDS.SHORT_SHIFT_HOURS },
        });
    }

    // ─── Analysis 2: Excessively long shifts ────────────
    const longShifts = records.filter((r: any) =>
        r.totalHours != null && r.totalHours > THRESHOLDS.LONG_SHIFT_HOURS
    );
    if (longShifts.length > 0) {
        anomalies.push({
            type: "EXCESSIVE_HOURS",
            severity: "WARNING",
            description: `${longShifts.length} shifts over ${THRESHOLDS.LONG_SHIFT_HOURS} hours detected`,
            data: { count: longShifts.length, maxHours: Math.max(...longShifts.map((s: any) => s.totalHours || 0)) },
        });
    }

    // ─── Analysis 3: Missing check-outs ─────────────────
    const missingCheckouts = records.filter((r: any) =>
        r.checkInAt && !r.checkOutAt
    );
    if (missingCheckouts.length > 2) {
        anomalies.push({
            type: "MISSING_CHECKOUTS",
            severity: "WARNING",
            description: `${missingCheckouts.length} records with check-in but no check-out`,
            data: { count: missingCheckouts.length },
        });
    }

    // ─── Analysis 4: Low verification scores ───────────
    const lowVerification = records.filter((r: any) =>
        r.verificationScore != null && r.verificationScore < 50
    );
    if (lowVerification.length > 1) {
        anomalies.push({
            type: "LOW_VERIFICATION",
            severity: "CRITICAL",
            description: `${lowVerification.length} check-ins with verification score below 50%`,
            data: { count: lowVerification.length, avgScore: Math.round(lowVerification.reduce((s: number, r: any) => s + (r.verificationScore || 0), 0) / lowVerification.length) },
        });
    }

    // ─── Analysis 5: Weekend check-ins ──────────────────
    if (THRESHOLDS.WEEKEND_CHECKIN_FLAG) {
        const weekendCheckins = records.filter((r: any) => {
            const day = new Date(r.date).getDay();
            return day === 0 || day === 6;
        });
        if (weekendCheckins.length > 2) {
            anomalies.push({
                type: "WEEKEND_ACTIVITY",
                severity: "INFO",
                description: `${weekendCheckins.length} weekend check-ins detected`,
                data: { count: weekendCheckins.length },
            });
        }
    }

    // ─── Analysis 6: Flagged records ratio ──────────────
    const flaggedRecords = records.filter((r: any) => r.status === "FLAGGED");
    const flaggedRatio = flaggedRecords.length / records.length;
    if (flaggedRatio > 0.2) {
        anomalies.push({
            type: "HIGH_FLAG_RATE",
            severity: "CRITICAL",
            description: `${(flaggedRatio * 100).toFixed(0)}% of attendance records flagged (${flaggedRecords.length}/${records.length})`,
            data: { flagged: flaggedRecords.length, total: records.length, ratio: +flaggedRatio.toFixed(2) },
        });
    }

    // Calculate composite score
    let score = 0;
    for (const a of anomalies) {
        if (a.severity === "CRITICAL") score += 30;
        else if (a.severity === "WARNING") score += 15;
        else score += 5;
    }
    score = Math.min(100, score);

    let riskLevel: AnomalyResult["riskLevel"] = "NONE";
    if (score >= 60) riskLevel = "HIGH";
    else if (score >= 30) riskLevel = "MEDIUM";
    else if (score > 0) riskLevel = "LOW";

    return { userId, anomalies, riskLevel, score };
}
