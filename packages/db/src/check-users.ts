import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
    const users = await prisma.user.findMany({
        select: { id: true, fullName: true, employeeId: true, role: true, status: true, entityId: true, managerId: true },
        orderBy: { createdAt: "desc" },
        take: 5
    });
    console.log(users);
}

run().catch(console.error).finally(() => prisma.$disconnect());
