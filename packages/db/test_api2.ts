import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const dateParam = '2026-03-07';

    // We only need the UTC midnight of the day we're targeting for leave requests
    const targetDateUtc = new Date(`${dateParam}T00:00:00Z`);

    const leavesToday = await prisma.leaveRequest.findMany({
        where: {
            status: "APPROVED",
            startDate: { lte: targetDateUtc },
            endDate: { gte: targetDateUtc },
        },
        include: { user: { select: { fullName: true } } }
    });

    console.log("Leaves for", dateParam, "( using", targetDateUtc.toISOString(), "):");
    console.log(JSON.stringify(leavesToday, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
