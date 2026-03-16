import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import { success, error, logger } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

// GET: Fetch all leave types and the user's current balances for the year
async function getLeaveBalances(
    req: NextRequest,
    context: { auth: JwtPayload; params?: Record<string, string> }
): Promise<NextResponse> {
    const userId = context.params?.id;
    if (!userId) return error("BAD_REQUEST", "Missing user ID", 400);
    const year = new Date().getFullYear();
    const entityId = context.auth.entityId;

    // Verify the user exists and belongs to the caller's entity
    const user = await prisma.user.findUnique({
        where: { id: userId, entityId },
        select: { id: true, fullName: true }
    });

    if (!user) {
        return error("NOT_FOUND", "User not found", 404);
    }

    // Get all active leave types for the entity
    const leaveTypes = await prisma.leaveType.findMany({
        where: { entityId },
        select: { id: true, name: true, code: true, defaultBalance: true }
    });

    // Get existing balances for this year
    const balances = await prisma.leaveBalance.findMany({
        where: { userId, year },
        select: { leaveTypeId: true, opening: true, accrued: true, used: true, pending: true, closing: true }
    });

    // Merge them together for the frontend
    const merged = leaveTypes.map(lt => {
        const existing = balances.find(b => b.leaveTypeId === lt.id);
        return {
            leaveTypeId: lt.id,
            name: lt.name,
            code: lt.code,
            opening: existing ? existing.opening : 0,
            accrued: existing ? existing.accrued : 0,
            used: existing ? existing.used : 0,
            pending: existing ? existing.pending : 0,
            closing: existing ? existing.closing : 0
        };
    });

    return success({ user: user.fullName, balances: merged, year });
}

// POST: Update leave balances manually
async function updateLeaveBalances(
    req: NextRequest,
    context: { auth: JwtPayload; params?: Record<string, string> }
): Promise<NextResponse> {
    const userId = context.params?.id;
    if (!userId) return error("BAD_REQUEST", "Missing user ID", 400);
    const year = new Date().getFullYear();
    const entityId = context.auth.entityId;

    // Verify the user exists and belongs to the caller's entity
    const user = await prisma.user.findUnique({
        where: { id: userId, entityId },
        select: { id: true }
    });

    if (!user) {
        return error("NOT_FOUND", "User not found", 404);
    }

    const body = await req.json().catch(() => ({}));
    const updates: Array<{ leaveTypeId: string; newOpening: number }> = body.updates;

    if (!Array.isArray(updates) || updates.length === 0) {
        return error("BAD_REQUEST", "Updates array is required", 400);
    }

    // Process each update in a transaction
    await prisma.$transaction(async (tx) => {
        for (const update of updates) {
            const { leaveTypeId, newOpening } = update;
            
            // Validate the leave type belongs to this entity
            const lt = await tx.leaveType.findUnique({
                where: { id: leaveTypeId, entityId }
            });
            if (!lt) continue;

            const existing = await tx.leaveBalance.findUnique({
                where: { userId_leaveTypeId_year: { userId, leaveTypeId, year } }
            });

            if (existing) {
                // Update existing: Recalculate closing balance safely
                const newClosing = Math.max(0, newOpening + existing.accrued - existing.used - existing.pending);
                await tx.leaveBalance.update({
                    where: { id: existing.id },
                    data: {
                        opening: newOpening,
                        closing: Number(newClosing.toFixed(2))
                    }
                });
            } else {
                // Create new record (used and pending will be 0)
                await tx.leaveBalance.create({
                    data: {
                        userId,
                        leaveTypeId,
                        year,
                        opening: newOpening,
                        accrued: 0,
                        used: 0,
                        pending: 0,
                        closing: newOpening
                    }
                });
            }
        }
    });

    logger.info({ actorId: context.auth.sub, targetUserId: userId }, "Manual leave balances updated");

    return success({ message: "Balances updated successfully" });
}

export const GET = withAuth(getLeaveBalances);
export const POST = withAuth(updateLeaveBalances);
