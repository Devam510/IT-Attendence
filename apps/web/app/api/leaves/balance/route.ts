// Vibe Tech Labs — GET /api/leaves/balance
// Returns all leave type balances for the current user

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import { success } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

interface BalanceItem {
    leaveTypeId: string;
    name: string;
    code: string;
    year: number;
    entitlement: number;
    accrualType: string;
    carryForwardMax: number | null;
    opening: number;
    accrued: number;
    used: number;
    pending: number;
    available: number;
    closing: number;
}

async function handleBalance(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;
    const url = new URL(req.url);
    const yearParam = url.searchParams.get("year");
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

    // Get user's entity to find available leave types
    const user = await prisma.user.findUnique({
        where: { id: auth.sub },
        select: { entityId: true },
    });

    if (!user) {
        return success({ balances: [] });
    }

    // Get all leave types for the entity
    const leaveTypes = await prisma.leaveType.findMany({
        where: { entityId: user.entityId },
        select: { id: true, name: true, code: true, defaultBalance: true, accrualType: true, carryForwardMax: true },
    });

    // Get balances
    const balances = await prisma.leaveBalance.findMany({
        where: { userId: auth.sub, year },
    });

    const balanceMap = new Map<string, Record<string, any>>(balances.map((b: any) => [b.leaveTypeId, b]));

    const result: BalanceItem[] = leaveTypes.map((lt: any) => {
        const bal = balanceMap.get(lt.id);
        const opening = bal?.opening ?? 0;
        const accrued = bal?.accrued ?? 0;
        const used = bal?.used ?? 0;
        const pending = bal?.pending ?? 0;
        const available = Math.max(0, +(opening + accrued - used - pending).toFixed(2));

        return {
            leaveTypeId: lt.id,
            name: lt.name,
            code: lt.code,
            year,
            entitlement: bal ? opening + accrued : lt.defaultBalance,
            accrualType: lt.accrualType,
            carryForwardMax: lt.carryForwardMax,
            opening,
            accrued,
            used,
            pending,
            available,
            closing: bal?.closing ?? available,
        };
    });

    return success({
        year,
        balances: result,
        summary: {
            totalEntitlement: result.reduce((sum, b) => sum + b.entitlement, 0),
            totalUsed: result.reduce((sum, b) => sum + b.used, 0),
            totalPending: result.reduce((sum, b) => sum + b.pending, 0),
            totalAvailable: result.reduce((sum, b) => sum + b.available, 0),
        },
    });
}

export const GET = withAuth(handleBalance);
