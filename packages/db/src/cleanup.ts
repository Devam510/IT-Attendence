// Cleanup: Delete ALL attendance records so each user starts fresh
// This removes stale UTC-midnight records that were causing cross-midnight IST display bugs

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanup() {
    // Delete ALL attendance records - they were created with wrong UTC-midnight date
    // Users will check in fresh going forward with the fixed IST-aware routes
    const result = await prisma.attendanceRecord.deleteMany({});
    console.log(`🧹 Deleted ${result.count} attendance records`);
    console.log("✅ Database clean — all users can check in fresh");
}

cleanup()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
