import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const locations = await prisma.location.findMany();
  console.log("Locations:", locations);
  const usersNoLoc = await prisma.user.findMany({ where: { locationId: null } });
  console.log("Users without location:", usersNoLoc.length);
  
  if (locations.length > 0) {
      const targetLoc = locations.find(l => l.name.includes("Vibe Tech")) || locations[0];
      console.log(`Will update ${usersNoLoc.length} users to location: ${targetLoc.name} (${targetLoc.id})`);
      
      const res = await prisma.user.updateMany({
          where: { locationId: null },
          data: { locationId: targetLoc.id }
      });
      console.log("Updated count:", res.count);
  }
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
