import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function go() {
    const subs = await prisma.pushSubscription.findMany();
    console.log(`Found ${subs.length} subscriptions`);
    subs.forEach(s => console.log(s.userId, s.endpoint.substring(0, 50)));
}
go().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
