// Vibe Tech Labs — /api/updates
// Handles retrieving and posting daily updates/standups.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import { success, error } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

// POST: Submit a daily update
async function createDailyUpdate(req: NextRequest, ctx: { auth: JwtPayload }): Promise<NextResponse> {
    const body = await req.json().catch(() => ({}));
    const content = body.content?.trim();

    if (!content) {
        return error("BAD_REQUEST", "Update content is required");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Enforce attendance constraints:
    // 1. Must be checked in today
    // 2. Cannot edit/post after checking out for today
    const attendance = await prisma.attendanceRecord.findUnique({
        where: {
            userId_date: {
                userId: ctx.auth.sub,
                date: today,
            }
        }
    });

    if (!attendance || !attendance.checkInAt) {
        return error("BAD_REQUEST", "You must check in before posting a daily update.");
    }

    if (attendance.checkOutAt) {
        return error("FORBIDDEN", "You cannot post or edit your update after checking out for the day.");
    }

    // Upsert the daily update (only 1 per day per user is allowed in the UI concept, but they can edit it)
    const update = await prisma.dailyUpdate.upsert({
        where: {
            userId_date: {
                userId: ctx.auth.sub,
                date: today,
            },
        },
        update: {
            content,
        },
        create: {
            userId: ctx.auth.sub,
            date: today,
            content,
        },
    });

    return success(update);
}

// GET: Fetch daily updates for a specific date (defaults to today)
async function getDailyUpdates(req: NextRequest, ctx: { auth: JwtPayload }): Promise<NextResponse> {
    const url = new URL(req.url);
    const dateQuery = url.searchParams.get("date");

    // Default to today if no date provided
    let targetDate = new Date();
    targetDate.setHours(0, 0, 0, 0);

    if (dateQuery) {
        const parsed = new Date(dateQuery);
        if (!isNaN(parsed.getTime())) {
            targetDate = parsed;
            targetDate.setHours(0, 0, 0, 0);
        }
    }

    // Role-based filtering:
    // HR, Admin, Super Admin can see everyone's updates in their entity.
    // Managers see their own updates and their reports' updates.
    // Employees ideally see only their own updates.

    const userRole = ctx.auth.role;
    const userEntityId = ctx.auth.entityId;
    const userId = ctx.auth.sub;

    let userFilter: any = { entityId: userEntityId }; // Default for Admins/HR

    if (userRole === "MGR") {
        userFilter = {
            entityId: userEntityId,
            OR: [
                { id: userId },
                { managerId: userId }
            ]
        };
    } else if (!["SADM", "HRA", "HRBP"].includes(userRole as string)) {
        // Regular EMP or others
        userFilter = {
            id: userId
        };
    }

    const updates = await prisma.dailyUpdate.findMany({
        where: {
            date: targetDate,
            user: userFilter,
        },
        include: {
            user: {
                select: {
                    id: true,
                    fullName: true,
                    email: true,
                    role: true,
                    department: {
                        select: { name: true }
                    }
                }
            }
        },
        orderBy: {
            updatedAt: "desc"
        }
    });

    return success({
        date: targetDate.toISOString(),
        updates: updates.map(u => ({
            id: u.id,
            content: u.content,
            createdAt: u.createdAt.toISOString(),
            updatedAt: u.updatedAt.toISOString(),
            user: {
                id: u.user.id,
                name: u.user.fullName,
                email: u.user.email,
                role: u.user.role,
                department: u.user.department?.name || "Unassigned",
            }
        }))
    });
}

// Export auth-wrapped handlers
export const POST = withAuth(createDailyUpdate);
export const GET = withAuth(getDailyUpdates);
