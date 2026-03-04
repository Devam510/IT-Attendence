// NEXUS — Anomaly Detection Engine
// Flags impossible travel, pattern deviations, and suspicious check-ins

import { haversineDistance } from "./geofence";

export interface AnomalyInput {
    userId: string;
    currentLat: number;
    currentLng: number;
    currentTime: Date;
    previousCheckIn?: {
        lat: number;
        lng: number;
        timestamp: Date;
    } | null;
    averageCheckInHour?: number; // e.g. 9.0 for 9:00 AM
    checkInStreak?: number; // consecutive days on-time
}

export interface AnomalyResult {
    flags: AnomalyFlag[];
    riskScore: number; // 0–100
    isAnomaly: boolean; // riskScore >= 50
}

export interface AnomalyFlag {
    type: "IMPOSSIBLE_TRAVEL" | "TIME_DEVIATION" | "VELOCITY_ANOMALY" | "EARLY_CHECKIN" | "LATE_CHECKIN";
    severity: "LOW" | "MEDIUM" | "HIGH";
    message: string;
    metadata?: Record<string, unknown>;
}

// Maximum realistic travel speed (km/h) — anything above is suspicious
const MAX_TRAVEL_SPEED_KPH = 900; // Allow flights
const SUSPICIOUS_SPEED_KPH = 200; // Flagged but not blocked

export function detectAnomalies(input: AnomalyInput): AnomalyResult {
    const flags: AnomalyFlag[] = [];
    let riskScore = 0;

    // 1. Impossible Travel Detection
    if (input.previousCheckIn) {
        const distanceKm = haversineDistance(
            input.currentLat, input.currentLng,
            input.previousCheckIn.lat, input.previousCheckIn.lng
        ) / 1000;

        const timeDiffHours =
            (input.currentTime.getTime() - input.previousCheckIn.timestamp.getTime()) / (1000 * 60 * 60);

        if (timeDiffHours > 0) {
            const speedKph = distanceKm / timeDiffHours;

            if (speedKph > MAX_TRAVEL_SPEED_KPH) {
                flags.push({
                    type: "IMPOSSIBLE_TRAVEL",
                    severity: "HIGH",
                    message: `Impossible travel: ${Math.round(distanceKm)}km in ${timeDiffHours.toFixed(1)}h (${Math.round(speedKph)} km/h)`,
                    metadata: { distanceKm: Math.round(distanceKm), timeDiffHours: +timeDiffHours.toFixed(1), speedKph: Math.round(speedKph) },
                });
                riskScore += 50;
            } else if (speedKph > SUSPICIOUS_SPEED_KPH) {
                flags.push({
                    type: "VELOCITY_ANOMALY",
                    severity: "MEDIUM",
                    message: `Unusual travel speed: ${Math.round(speedKph)} km/h over ${Math.round(distanceKm)}km`,
                    metadata: { speedKph: Math.round(speedKph) },
                });
                riskScore += 20;
            }
        }
    }

    // 2. Time Deviation (check-in time vs. average)
    if (input.averageCheckInHour != null) {
        const currentHour = input.currentTime.getHours() + input.currentTime.getMinutes() / 60;
        const deviation = Math.abs(currentHour - input.averageCheckInHour);

        if (deviation > 4) {
            flags.push({
                type: "TIME_DEVIATION",
                severity: "HIGH",
                message: `Check-in ${deviation.toFixed(1)}h from usual time (avg: ${input.averageCheckInHour.toFixed(1)}h)`,
                metadata: { currentHour: +currentHour.toFixed(1), averageHour: input.averageCheckInHour, deviationHours: +deviation.toFixed(1) },
            });
            riskScore += 30;
        } else if (deviation > 2) {
            flags.push({
                type: "TIME_DEVIATION",
                severity: "LOW",
                message: `Check-in ${deviation.toFixed(1)}h from usual time`,
                metadata: { deviationHours: +deviation.toFixed(1) },
            });
            riskScore += 10;
        }
    }

    // 3. Early / Late check-in flags
    const hour = input.currentTime.getHours();
    if (hour < 5) {
        flags.push({
            type: "EARLY_CHECKIN",
            severity: "MEDIUM",
            message: `Unusually early check-in at ${hour}:${String(input.currentTime.getMinutes()).padStart(2, "0")}`,
        });
        riskScore += 15;
    } else if (hour > 22) {
        flags.push({
            type: "LATE_CHECKIN",
            severity: "LOW",
            message: `Late check-in at ${hour}:${String(input.currentTime.getMinutes()).padStart(2, "0")}`,
        });
        riskScore += 10;
    }

    return {
        flags,
        riskScore: Math.min(100, riskScore),
        isAnomaly: riskScore >= 50,
    };
}
