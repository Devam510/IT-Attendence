import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function run() {
    console.log("Migrating departments...");
    const entity = await prisma.entity.findFirst();
    if(!entity) {
        console.log("No entity found");
        return;
    }
    
    // 1. Clear department heads
    await prisma.department.updateMany({ data: { headId: null } });

    // 2. Unassign all users from their departments
    await prisma.user.updateMany({ data: { departmentId: null } });

    // 3. Delete existing departments
    await prisma.department.deleteMany();

    // 4. Create Sales and Developers
    await prisma.department.create({ data: { name: "Sales", entityId: entity.id } });
    await prisma.department.create({ data: { name: "Developers", entityId: entity.id } });

    console.log("Successfully updated departments in the database to Sales and Developers");
}

run().catch(console.error).finally(() => prisma.$disconnect());
