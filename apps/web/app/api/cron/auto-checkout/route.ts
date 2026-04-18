import { NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { logger } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        // Security: always require CRON_SECRET — do NOT make this conditional.
        // If CRON_SECRET env var is missing, reject ALL requests to prevent open access.
        const authHeader = req.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
            logger.warn({ ip: req.headers.get("x-forwarded-for") }, "Unauthorized cron trigger attempt");
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        logger.info("Starting auto-checkout cron job");
        
        // Find all records that are still checked in (checkOutAt is null)
        const openRecords = await prisma.attendanceRecord.findMany({
            where: {
                checkInAt: { not: null },
                checkOutAt: null,
            },
            include: { user: true }
        });

        if (openRecords.length === 0) {
            return NextResponse.json({ message: "No open check-ins found to auto-checkout" });
        }

        const updatedCount = openRecords.length;
        const now = new Date();

        for (const record of openRecords) {
            const checkInTime = new Date(record.checkInAt!);
            
            // STRICT 8-HOUR RULE requested by user
            // We calculate 8 hours after check-in, or use `now` if 8 hours hasn't elapsed (e.g. running cron early manually)
            // But realistically, this cron runs at 11:59PM or 3AM, so 8 hours is safe.
            let simulatedCheckOut = new Date(checkInTime.getTime() + (8 * 60 * 60 * 1000));
            
            // If the strict 8 hours would push it past current time, floor it to current time just in case
            if (simulatedCheckOut > now) {
                simulatedCheckOut = now;
            }

            const totalHours = 8.0;

            await prisma.attendanceRecord.update({
                where: { id: record.id },
                data: {
                    checkOutAt: simulatedCheckOut,
                    status: "FLAGGED", // Requires employee to regularize next day
                    totalHours: totalHours,
                    overtimeHours: 0,
                    // Optionally push anomaly flag
                    anomalyFlags: record.anomalyFlags 
                        ? { ...(record.anomalyFlags as any), autoCheckout: true, note: "Forced checkout at 8h mark by System" }
                        : { autoCheckout: true, note: "Forced checkout at 8h mark by System" }
                }
            });
            
            logger.info({ recordId: record.id, userId: record.userId }, "Auto-checked out employee");
        }

        return NextResponse.json({ 
            success: true, 
            message: `Auto-checkout completed for ${updatedCount} records.`,
            count: updatedCount
        });

    } catch (error) {
        logger.error({ error }, "Error in auto-checkout cron job");
        return NextResponse.json({ error: "Failed to execute cron job" }, { status: 500 });
    }
}
