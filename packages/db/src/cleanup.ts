// Quick cleanup: Delete fake seeded attendance records from past dates
// Keep today's real check-in records

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanup() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Delete all attendance records BEFORE today (the seeded fake ones)
    const result = await prisma.attendanceRecord.deleteMany({
        where: {
            date: { lt: today },
        },
    });

    console.log(`🧹 Deleted ${result.count} fake past attendance records`);
    console.log("✅ Only today's real check-ins remain");
}

cleanup()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
