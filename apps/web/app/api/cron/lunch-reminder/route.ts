// Vibe Tech Labs — GET /api/cron/lunch-reminder
// Vercel Cron: runs at 07:30 UTC = 1:00 PM IST every day
// Sends a lunch break reminder notification to all checked-in employees who haven't taken a break yet today

import { NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { logger } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        // Security: Only Vercel or cron-job.org can call this
        const authHeader = req.headers.get("authorization");
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            logger.warn({}, "Unauthorized lunch-reminder cron trigger");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const now = new Date();
        const istOffsetMs = 5.5 * 60 * 60 * 1000;
        const nowIst = new Date(now.getTime() + istOffsetMs);
        const todayStart = new Date(
            Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()) - istOffsetMs
        );
        const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

        // Find all employees who are currently checked in (no checkout), and have no open break today
        const openRecords = await prisma.attendanceRecord.findMany({
            where: {
                checkInAt: { gte: todayStart, lt: tomorrowStart },
                checkOutAt: null,
            },
            select: {
                id: true,
                userId: true,
                anomalyFlags: true,
            },
        });

        if (openRecords.length === 0) {
            return NextResponse.json({ message: "No active check-ins found", count: 0 });
        }

        // Filter to employees who haven't taken any break yet today
        const eligibleUserIds: string[] = [];
        for (const record of openRecords) {
            const flags = (record.anomalyFlags as Record<string, unknown>) || {};
            const breaks = (flags.breaks as Array<{ start: string; end: string | null }>) || [];
            const hasOpenBreak = breaks.some((b) => b.end === null);
            const hasTakenBreakToday = breaks.length > 0;

            // Notify if they haven't started any break at all today
            if (!hasOpenBreak && !hasTakenBreakToday) {
                eligibleUserIds.push(record.userId);
            }
        }

        if (eligibleUserIds.length === 0) {
            return NextResponse.json({ message: "All checked-in employees already on or had a break", count: 0 });
        }

        // Create in-app notifications in bulk
        await prisma.notification.createMany({
            data: eligibleUserIds.map((userId) => ({
                userId,
                type: "SYSTEM_ALERT",
                title: "🍽️ Lunch Break Reminder",
                body: "It's 1:00 PM — time to take your lunch break! Stay refreshed and productive.",
                data: { type: "lunch_reminder" },
            })),
            skipDuplicates: true,
        });

        logger.info({ count: eligibleUserIds.length }, "Lunch break reminders sent");

        return NextResponse.json({
            success: true,
            message: `Lunch reminder sent to ${eligibleUserIds.length} employees.`,
            count: eligibleUserIds.length,
        });
    } catch (err) {
        logger.error({ err }, "Error in lunch-reminder cron");
        return NextResponse.json({ error: "Failed to send lunch reminders" }, { status: 500 });
    }
}
