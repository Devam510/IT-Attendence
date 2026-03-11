import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
    const inactiveUsers = await prisma.user.findMany({
        where: {
            status: "INACTIVE"
        }
    });

    let updated = 0;
    for (const user of inactiveUsers) {
        if (!user.email.includes("_deleted_")) {
            const timestamp = Date.now();
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    email: `${user.email}_deleted_${timestamp}`,
                    employeeId: `${user.employeeId}_deleted_${timestamp}`,
                }
            });
            updated++;
            console.log(`Updated deleted user ${user.id} (${user.email})`);
        }
    }

    console.log(`Retroactively updated ${updated} previously deleted users.`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
