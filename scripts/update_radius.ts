import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const locations = await prisma.location.findMany();
  if (locations.length > 0) {
      const res = await prisma.location.updateMany({
          where: {},
          data: { radiusM: 100 }
      });
      console.log(`Updated radius for ${res.count} locations to 100 meters.`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
