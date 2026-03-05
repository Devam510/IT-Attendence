// Vibe Tech Labs — AI Burnout Risk Predictor
// Multi-signal burnout risk assessment for employees

import { prisma } from "@nexus/db";

// ─── Types ──────────────────────────────────────────────

export interface BurnoutAssessment {
    userId: string;
    riskScore: number;        // 0-100
    riskLevel: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
    signals: BurnoutSignal[];
    recommendations: string[];
}

export interface BurnoutSignal {
    category: "HOURS" | "PATTERNS" | "LEAVE" | "BEHAVIOR";
    signal: string;
    weight: number;
    value: number | string;
}

// ─── Burnout Calculation ────────────────────────────────

export async function assessBurnoutRisk(
    userId: string,
    lookbackDays: number = 60
): Promise<BurnoutAssessment> {
    const signals: BurnoutSignal[] = [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookbackDays);
    const year = new Date().getFullYear();

    // Parallel data fetch
    const [attendance, leaveBalances, pendingLeaves, recentLeaves] = await Promise.all([
        prisma.attendanceRecord.findMany({
            where: { userId, date: { gte: cutoff } },
            select: { totalHours: true, overtimeHours: true, date: true, status: true },
            orderBy: { date: "desc" },
        }),
        prisma.leaveBalance.findMany({
            where: { userId, year },
            select: { opening: true, accrued: true, used: true, pending: true },
        }),
        prisma.leaveRequest.count({
            where: { userId, status: "PENDING" },
        }),
        prisma.leaveRequest.findMany({
            where: { userId, status: "APPROVED", startDate: { gte: cutoff } },
            select: { startDate: true, endDate: true },
        }),
    ]);

    // ─── Signal 1: Excessive overtime ───────────────────
    const totalOvertime = attendance.reduce((sum: number, a: any) => sum + (a.overtimeHours || 0), 0);
    const avgDailyOvertime = attendance.length > 0 ? totalOvertime / attendance.length : 0;
    if (avgDailyOvertime > 2) {
        signals.push({
            category: "HOURS",
            signal: "High average daily overtime",
            weight: 25,
            value: `${avgDailyOvertime.toFixed(1)}h/day`,
        });
    } else if (avgDailyOvertime > 1) {
        signals.push({
            category: "HOURS",
            signal: "Moderate daily overtime",
            weight: 12,
            value: `${avgDailyOvertime.toFixed(1)}h/day`,
        });
    }

    // ─── Signal 2: Long working hours ───────────────────
    const avgHours = attendance.length > 0
        ? attendance.reduce((sum: number, a: any) => sum + (a.totalHours || 0), 0) / attendance.length
        : 0;
    if (avgHours > 10) {
        signals.push({
            category: "HOURS",
            signal: "Very long average working hours",
            weight: 20,
            value: `${avgHours.toFixed(1)}h/day`,
        });
    }

    // ─── Signal 3: No leave taken ───────────────────────
    const totalUsed = leaveBalances.reduce((sum: number, b: any) => sum + (b.used || 0), 0);
    const totalAvailable = leaveBalances.reduce((sum: number, b: any) =>
        sum + Math.max(0, (b.opening || 0) + (b.accrued || 0) - (b.used || 0) - (b.pending || 0)), 0
    );

    if (totalUsed === 0 && totalAvailable > 5) {
        signals.push({
            category: "LEAVE",
            signal: "No leave taken despite available balance",
            weight: 20,
            value: `${totalAvailable} days available, 0 used`,
        });
    }

    // ─── Signal 4: Leave balance hoarding ───────────────
    if (totalAvailable > 15 && recentLeaves.length === 0) {
        signals.push({
            category: "LEAVE",
            signal: "Leave balance hoarding — no recent leave",
            weight: 15,
            value: `${totalAvailable} days unused`,
        });
    }

    // ─── Signal 5: Consecutive work days ────────────────
    let maxConsecutive = 0;
    let currentStreak = 0;
    const sortedDates = attendance
        .map((a: any) => new Date(a.date).getTime())
        .sort((a: number, b: number) => a - b);

    for (let i = 0; i < sortedDates.length; i++) {
        if (i === 0) {
            currentStreak = 1;
        } else {
            const diff = (sortedDates[i]! - sortedDates[i - 1]!) / (1000 * 60 * 60 * 24);
            currentStreak = diff <= 1.5 ? currentStreak + 1 : 1;
        }
        maxConsecutive = Math.max(maxConsecutive, currentStreak);
    }

    if (maxConsecutive >= 14) {
        signals.push({
            category: "PATTERNS",
            signal: "Extended consecutive work days without break",
            weight: 25,
            value: `${maxConsecutive} days`,
        });
    } else if (maxConsecutive >= 7) {
        signals.push({
            category: "PATTERNS",
            signal: "Long consecutive work streak",
            weight: 12,
            value: `${maxConsecutive} days`,
        });
    }

    // ─── Signal 6: Weekend work ─────────────────────────
    const weekendWork = attendance.filter((a: any) => {
        const day = new Date(a.date).getDay();
        return day === 0 || day === 6;
    });
    if (weekendWork.length > 4) {
        signals.push({
            category: "PATTERNS",
            signal: "Frequent weekend work",
            weight: 15,
            value: `${weekendWork.length} weekend days in ${lookbackDays} days`,
        });
    }

    // ─── Calculate composite score ──────────────────────
    let score = signals.reduce((sum, s) => sum + s.weight, 0);
    score = Math.min(100, score);

    let riskLevel: BurnoutAssessment["riskLevel"] = "LOW";
    if (score >= 70) riskLevel = "CRITICAL";
    else if (score >= 45) riskLevel = "HIGH";
    else if (score >= 20) riskLevel = "MODERATE";

    // ─── Recommendations ────────────────────────────────
    const recommendations: string[] = [];
    if (riskLevel === "CRITICAL" || riskLevel === "HIGH") {
        recommendations.push("Schedule a 1:1 wellness check with the employee");
        recommendations.push("Review and redistribute workload across the team");
        if (totalAvailable > 5) {
            recommendations.push(`Encourage taking leave — ${totalAvailable} days available`);
        }
    }
    if (avgDailyOvertime > 1.5) {
        recommendations.push("Cap overtime and review project deadlines");
    }
    if (maxConsecutive >= 10) {
        recommendations.push("Mandate a rest day within the next 7 days");
    }
    if (weekendWork.length > 4) {
        recommendations.push("Reduce weekend work assignments");
    }

    return { userId, riskScore: score, riskLevel, signals, recommendations };
}
