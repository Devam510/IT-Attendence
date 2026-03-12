import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const locations = await prisma.location.findMany({ where: { name: { contains: "Vibe Tech" } } });
  if (locations.length > 0) {
      const targetLoc = locations[0];
      
      const updated = await prisma.location.update({
          where: { id: targetLoc.id },
          data: {
              latitude: 23.0264,
              longitude: 72.5574
          }
      });
      console.log(`Updated Location: ${updated.name} coordinates to Lat: ${updated.latitude}, Lng: ${updated.longitude}`);
  } else {
      console.log("Target location not found!");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
