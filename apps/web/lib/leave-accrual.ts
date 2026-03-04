// NEXUS — Leave Accrual Engine
// Monthly pro-rata accrual, yearly reset, carry-forward with cap

import { prisma } from "@nexus/db";

export interface AccrualResult {
    userId: string;
    leaveTypeId: string;
    year: number;
    accrued: number;
    carryForward: number;
    opening: number;
    closing: number;
}

// ─── Monthly Pro-Rata Accrual ───────────────────────────

export function calculateMonthlyAccrual(
    annualEntitlement: number,
    monthsWorked: number
): number {
    const perMonth = annualEntitlement / 12;
    return +(perMonth * monthsWorked).toFixed(2);
}

// ─── Carry-Forward Calculation ──────────────────────────

export function calculateCarryForward(
    unusedBalance: number,
    carryForwardMax: number | null
): number {
    if (carryForwardMax == null) return 0; // No carry-forward allowed
    return Math.min(unusedBalance, carryForwardMax);
}

// ─── Calculate Leave Days (accounting for half-days) ────

export function calculateLeaveDays(
    startDate: Date,
    endDate: Date,
    halfDay: "NONE" | "FIRST_HALF" | "SECOND_HALF"
): number {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    const diffMs = end.getTime() - start.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1; // inclusive

    if (diffDays <= 0) return 0;

    // Count only weekdays
    let weekdays = 0;
    const cursor = new Date(start);
    for (let i = 0; i < diffDays; i++) {
        const dow = cursor.getDay();
        if (dow !== 0 && dow !== 6) weekdays++;
        cursor.setDate(cursor.getDate() + 1);
    }

    // Half-day adjustment
    if (halfDay !== "NONE" && weekdays > 0) {
        return weekdays - 0.5;
    }

    return weekdays;
}

// ─── Get Available Balance ──────────────────────────────

export async function getAvailableBalance(
    userId: string,
    leaveTypeId: string,
    year: number
): Promise<{ available: number; balance: { opening: number; accrued: number; used: number; pending: number; closing: number } | null }> {
    const balance = await prisma.leaveBalance.findUnique({
        where: {
            userId_leaveTypeId_year: {
                userId,
                leaveTypeId,
                year,
            },
        },
    });

    if (!balance) {
        return { available: 0, balance: null };
    }

    const available = +(balance.opening + balance.accrued - balance.used - balance.pending).toFixed(2);
    return {
        available: Math.max(0, available),
        balance: {
            opening: balance.opening,
            accrued: balance.accrued,
            used: balance.used,
            pending: balance.pending,
            closing: balance.closing,
        },
    };
}

// ─── Debit Balance (when leave is approved) ─────────────

export async function debitLeaveBalance(
    userId: string,
    leaveTypeId: string,
    year: number,
    days: number,
    fromPending: boolean = true
): Promise<void> {
    const balance = await prisma.leaveBalance.findUnique({
        where: {
            userId_leaveTypeId_year: { userId, leaveTypeId, year },
        },
    });

    if (!balance) return;

    if (fromPending) {
        // Move from pending to used
        await prisma.leaveBalance.update({
            where: { id: balance.id },
            data: {
                pending: Math.max(0, +(balance.pending - days).toFixed(2)),
                used: +(balance.used + days).toFixed(2),
                closing: +(balance.opening + balance.accrued - balance.used - days - Math.max(0, balance.pending - days)).toFixed(2),
            },
        });
    } else {
        // Direct debit (manual adjustment)
        await prisma.leaveBalance.update({
            where: { id: balance.id },
            data: {
                used: +(balance.used + days).toFixed(2),
                closing: +(balance.opening + balance.accrued - balance.used - days - balance.pending).toFixed(2),
            },
        });
    }
}

// ─── Reserve Balance (when leave request is submitted) ──

export async function reserveLeaveBalance(
    userId: string,
    leaveTypeId: string,
    year: number,
    days: number
): Promise<void> {
    const balance = await prisma.leaveBalance.findUnique({
        where: {
            userId_leaveTypeId_year: { userId, leaveTypeId, year },
        },
    });

    if (!balance) return;

    await prisma.leaveBalance.update({
        where: { id: balance.id },
        data: {
            pending: +(balance.pending + days).toFixed(2),
            closing: +(balance.opening + balance.accrued - balance.used - balance.pending - days).toFixed(2),
        },
    });
}

// ─── Release Reserved Balance (when leave is cancelled) ─

export async function releaseLeaveBalance(
    userId: string,
    leaveTypeId: string,
    year: number,
    days: number
): Promise<void> {
    const balance = await prisma.leaveBalance.findUnique({
        where: {
            userId_leaveTypeId_year: { userId, leaveTypeId, year },
        },
    });

    if (!balance) return;

    await prisma.leaveBalance.update({
        where: { id: balance.id },
        data: {
            pending: Math.max(0, +(balance.pending - days).toFixed(2)),
            closing: +(balance.opening + balance.accrued - balance.used - Math.max(0, balance.pending - days)).toFixed(2),
        },
    });
}
