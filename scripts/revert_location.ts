import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const locations = await prisma.location.findMany({ where: { name: { contains: "Vibe Tech" } } });
  if (locations.length > 0) {
      const targetLoc = locations[0];
      const res = await prisma.user.updateMany({
          where: { locationId: targetLoc.id },
          data: { locationId: null }
      });
      console.log("Reverted count:", res.count);
      
      await prisma.location.update({
          where: { id: targetLoc.id },
          data: {
              latitude: 23.0264,
              longitude: 72.5574
          }
      });
      console.log("Updated Vibe Tech Labs coordinates to 23.0264, 72.5574");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
