const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    console.log("Fetching leaves...");
    const leaves = await prisma.leaveRequest.findMany({
        where: {
            status: 'APPROVED',
            user: { fullName: { contains: 'Sara' } }
        },
        include: { user: true }
    });
    console.log(JSON.stringify(leaves, null, 2));
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
