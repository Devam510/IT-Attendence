import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const dateParam = '2026-03-07';
    const istOffsetMs = 5.5 * 60 * 60 * 1000;

    let dayStart, dayEnd;
    const parts = dateParam.split("-").map(Number);
    const y = parts[0], m = parts[1], d = parts[2];
    dayStart = new Date(Date.UTC(y, m - 1, d) - istOffsetMs);
    dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const leavesToday = await prisma.leaveRequest.findMany({
        where: {
            status: "APPROVED",
            startDate: { lte: dayEnd },
            endDate: { gte: dayStart },
        },
        include: { user: { select: { fullName: true } } }
    });

    console.log("Leaves for", dateParam, "(", dayStart.toISOString(), "to", dayEnd.toISOString(), "):");
    console.log(JSON.stringify(leavesToday, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
