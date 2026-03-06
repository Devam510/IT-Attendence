import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const leaves = await prisma.leaveRequest.findMany({
        where: {
            status: 'APPROVED',
            user: { fullName: { contains: 'Sara' } }
        },
        select: {
            startDate: true,
            endDate: true,
            halfDay: true,
        }
    });
    console.log(JSON.stringify(leaves, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
