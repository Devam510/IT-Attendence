// Vibe Tech Labs — GET /api/cron/break-monitor
// Called every 30 minutes by cron-job.org (FREE, no Vercel Pro needed)
// 
// Does two things:
//   1. After 30 min on break → send a reminder notification
//   2. After 60 min on break → auto-resume (close the break) + send alert

import { NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { logger } from "@/lib/errors";
import { sendPushToUser } from "@/lib/web-push";

export const dynamic = "force-dynamic";

const BREAK_REMINDER_MINUTES = 30;  // Send reminder after this many minutes
const BREAK_AUTO_RESUME_MINUTES = 60; // Auto-close break after this many minutes

export async function GET(req: Request) {
    try {
        // Security: validates CRON_SECRET from Vercel or cron-job.org Authorization header
        const authHeader = req.headers.get("authorization");
        if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            logger.warn({}, "Unauthorized break-monitor cron trigger");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const now = new Date();
        const istOffsetMs = 5.5 * 60 * 60 * 1000;
        const nowIst = new Date(now.getTime() + istOffsetMs);
        const todayStart = new Date(
            Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()) - istOffsetMs
        );
        const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

        // Find all attendance records with an open break today
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

        let remindersCount = 0;
        let autoResumedCount = 0;

        for (const record of openRecords) {
            const flags = (record.anomalyFlags as Record<string, unknown>) || {};
            const breaks = (flags.breaks as Array<{ start: string; end: string | null }>) || [];

            // Find the currently open break (end === null)
            let openBreakIndex = -1;
            for (let i = breaks.length - 1; i >= 0; i--) {
                const b = breaks[i];
                if (b && b.end === null) {
                    openBreakIndex = i;
                    break;
                }
            }
            if (openBreakIndex === -1) continue; // No open break, skip

            const openBreak = breaks[openBreakIndex];
            if (!openBreak || !openBreak.start) continue; // Type safety check

            const breakStartTime = new Date(openBreak.start);
            const breakDurationMinutes = (now.getTime() - breakStartTime.getTime()) / (1000 * 60);

            // ── Auto-Resume after 60 min ──────────────────────────────
            if (breakDurationMinutes >= BREAK_AUTO_RESUME_MINUTES) {
                // Close the break
                breaks[openBreakIndex] = { start: openBreak.start, end: now.toISOString() };

                await prisma.attendanceRecord.update({
                    where: { id: record.id },
                    data: {
                        anomalyFlags: JSON.parse(JSON.stringify({
                            ...flags,
                            breaks,
                            lastAutoResumedAt: now.toISOString(),
                        })),
                    },
                });

                // Notify the employee (in-app + OS push)
                await prisma.notification.create({
                    data: {
                        userId: record.userId,
                        type: "SYSTEM_ALERT",
                        title: "⚠️ Break Auto-Ended",
                        body: `Your break was automatically ended after ${BREAK_AUTO_RESUME_MINUTES} minutes. Your attendance has been updated — please verify it if needed.`,
                        data: { type: "break_auto_resumed", attendanceId: record.id },
                    },
                });

                // OS-level push notification
                await sendPushToUser(record.userId, {
                    title: "⚠️ Break Auto-Ended",
                    body: `Your break exceeded ${BREAK_AUTO_RESUME_MINUTES} minutes and was automatically closed. Please review your attendance.`,
                    url: "/attendance",
                    tag: "break-auto-resume",
                    requireInteraction: true,
                });

                autoResumedCount++;
                logger.info({ recordId: record.id, userId: record.userId, breakDurationMinutes }, "Break auto-resumed");

            // ── Reminder after 30 min ─────────────────────────────────
            } else if (breakDurationMinutes >= BREAK_REMINDER_MINUTES) {
                // Avoid sending duplicate reminders — check if we already sent one for this break
                const reminderSentAt = (flags.breakReminderSentAt as string) || null;
                const breakStartStr = openBreak.start;

                // Only send if we haven't sent a reminder since this break started
                const alreadyReminded = reminderSentAt && new Date(reminderSentAt) > new Date(breakStartStr);
                if (alreadyReminded) continue;

                // Mark that we sent the reminder
                await prisma.attendanceRecord.update({
                    where: { id: record.id },
                    data: {
                        anomalyFlags: JSON.parse(JSON.stringify({
                            ...flags,
                            breakReminderSentAt: now.toISOString(),
                        })),
                    },
                });

                // Notify the employee (in-app + OS push)
                await prisma.notification.create({
                    data: {
                        userId: record.userId,
                        type: "SYSTEM_ALERT",
                        title: "⏰ Break Reminder",
                        body: "You've been on break for 30 minutes. Don't forget to resume work! Your break will be automatically ended after 60 minutes.",
                        data: { type: "break_reminder", attendanceId: record.id },
                    },
                });

                // OS-level push notification
                await sendPushToUser(record.userId, {
                    title: "⏰ Break Reminder",
                    body: "You've been on break for 30 minutes. Don't forget to resume work!",
                    url: "/attendance",
                    tag: "break-reminder",
                    requireInteraction: true,
                });

                remindersCount++;
                logger.info({ recordId: record.id, userId: record.userId, breakDurationMinutes }, "Break reminder sent");
            }
        }

        return NextResponse.json({
            success: true,
            reminders: remindersCount,
            autoResumed: autoResumedCount,
            message: `Sent ${remindersCount} reminder(s), auto-resumed ${autoResumedCount} break(s).`,
        });
    } catch (err) {
        logger.error({ err }, "Error in break-monitor cron");
        return NextResponse.json({ error: "Failed to run break monitor" }, { status: 500 });
    }
}
