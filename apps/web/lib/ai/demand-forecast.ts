// NEXUS — AI Demand Forecasting Engine
// Predict staffing needs based on historical attendance and leave patterns

import { prisma } from "@nexus/db";

// ─── Types ──────────────────────────────────────────────

export interface DemandForecast {
    departmentId: string;
    period: { from: string; to: string };
    predictions: DayPrediction[];
    summary: ForecastSummary;
}

export interface DayPrediction {
    date: string;
    dayOfWeek: string;
    expectedPresent: number;
    expectedAbsent: number;
    expectedOnLeave: number;
    confidence: number;    // 0-1
    isRiskDay: boolean;    // below minimum staffing threshold
}

export interface ForecastSummary {
    avgExpectedPresent: number;
    riskDaysCount: number;
    peakAbsenceDate: string;
    peakAbsenceCount: number;
    recommendation: string;
}

// ─── Day Names ──────────────────────────────────────────

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ─── Forecast Demand ────────────────────────────────────

export async function forecastDemand(
    departmentId: string,
    forecastDays: number = 14,
    minStaffingRatio: number = 0.6
): Promise<DemandForecast> {
    const now = new Date();
    const lookbackDays = 90;
    const lookbackStart = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

    // Get department members
    const members = await prisma.user.findMany({
        where: { departmentId, status: "ACTIVE" },
        select: { id: true },
    });
    const memberIds = members.map((m: any) => m.id);
    const totalStaff = memberIds.length;

    if (totalStaff === 0) {
        return {
            departmentId,
            period: { from: formatDate(now), to: formatDate(addDays(now, forecastDays)) },
            predictions: [],
            summary: { avgExpectedPresent: 0, riskDaysCount: 0, peakAbsenceDate: "", peakAbsenceCount: 0, recommendation: "No active staff in department" },
        };
    }

    // Historical attendance by day-of-week
    const historicalAttendance = await prisma.attendanceRecord.findMany({
        where: { userId: { in: memberIds }, date: { gte: lookbackStart } },
        select: { date: true, userId: true, status: true },
    });

    // Compute day-of-week attendance rates
    const dayRates: Record<number, { present: number; total: number }> = {};
    for (let d = 0; d < 7; d++) {
        dayRates[d] = { present: 0, total: 0 };
    }

    for (const record of historicalAttendance) {
        const dayOfWeek = new Date(record.date).getDay();
        const entry = dayRates[dayOfWeek]!;
        entry.total++;
        if (record.status === "VERIFIED" || record.status === "REGULARIZED") {
            entry.present++;
        }
    }

    // Get approved future leaves
    const futureStart = new Date(now);
    futureStart.setHours(0, 0, 0, 0);
    const futureEnd = addDays(futureStart, forecastDays);

    const approvedLeaves = await prisma.leaveRequest.findMany({
        where: {
            userId: { in: memberIds },
            status: "APPROVED",
            startDate: { lte: futureEnd },
            endDate: { gte: futureStart },
        },
        select: { userId: true, startDate: true, endDate: true },
    });

    // Build predictions
    const predictions: DayPrediction[] = [];

    for (let i = 0; i < forecastDays; i++) {
        const targetDate = addDays(futureStart, i);
        const dayOfWeek = targetDate.getDay();
        const dateStr = formatDate(targetDate);

        // Skip weekends
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;

        // Count known leaves for this day
        let onLeave = 0;
        for (const leave of approvedLeaves) {
            if (targetDate >= new Date(leave.startDate) && targetDate <= new Date(leave.endDate)) {
                onLeave++;
            }
        }

        // Historical attendance rate for this day of week
        const dayRate = dayRates[dayOfWeek]!;
        const historicalRate = dayRate.total > 0 ? dayRate.present / dayRate.total : 0.85;

        // Predict
        const remainingStaff = totalStaff - onLeave;
        const expectedPresent = Math.round(remainingStaff * historicalRate);
        const expectedAbsent = remainingStaff - expectedPresent;
        const minRequired = Math.ceil(totalStaff * minStaffingRatio);

        // Confidence based on data volume
        const dataPoints = dayRate.total;
        const confidence = Math.min(1, dataPoints / 20); // 20+ data points = full confidence

        predictions.push({
            date: dateStr,
            dayOfWeek: DAY_NAMES[dayOfWeek]!,
            expectedPresent,
            expectedAbsent: expectedAbsent + onLeave,
            expectedOnLeave: onLeave,
            confidence: +confidence.toFixed(2),
            isRiskDay: expectedPresent < minRequired,
        });
    }

    // Summary
    const avgPresent = predictions.length > 0
        ? predictions.reduce((s, p) => s + p.expectedPresent, 0) / predictions.length
        : 0;
    const riskDays = predictions.filter(p => p.isRiskDay);
    const peakAbsence = predictions.reduce((max, p) => p.expectedAbsent > max.expectedAbsent ? p : max, predictions[0]!);

    let recommendation = "Staffing levels appear adequate for the forecast period.";
    if (riskDays.length > 3) {
        recommendation = `⚠️ ${riskDays.length} risk days detected. Consider hiring temporary staff or rescheduling non-critical work.`;
    } else if (riskDays.length > 0) {
        recommendation = `${riskDays.length} day(s) may be understaffed. Monitor and adjust assignments.`;
    }

    return {
        departmentId,
        period: { from: formatDate(futureStart), to: formatDate(futureEnd) },
        predictions,
        summary: {
            avgExpectedPresent: +avgPresent.toFixed(1),
            riskDaysCount: riskDays.length,
            peakAbsenceDate: peakAbsence?.date || "",
            peakAbsenceCount: peakAbsence?.expectedAbsent || 0,
            recommendation,
        },
    };
}

// ─── Helpers ────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function formatDate(date: Date): string {
    return date.toISOString().split("T")[0]!;
}
