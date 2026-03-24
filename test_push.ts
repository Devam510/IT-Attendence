import { PrismaClient } from "@prisma/client";
import { sendPushToUsers } from "./apps/web/lib/web-push";

const prisma = new PrismaClient();

async function run() {
    console.log("Fetching users with subscriptions...");
    const subs = await prisma.pushSubscription.findMany({
        include: { user: true }
    });
    
    console.log(`Found ${subs.length} total subscriptions in DB.`);
    subs.forEach(s => console.log(`- User: ${s.user.fullName} (${s.user.email}), Endpoint: ${s.endpoint.substring(0, 40)}...`));

    if (subs.length > 0) {
        const userIds = [...new Set(subs.map(s => s.userId))];
        console.log(`\nTesting push to ${userIds.length} unique users...`);
        
        try {
            await sendPushToUsers(userIds, {
                title: "🧪 Test Push",
                body: "This is a test to verify Web Push Notifications are working.",
                url: "/dashboard",
                tag: "test-push"
            });
            console.log("Success! Push sent.");
        } catch (err) {
            console.error("Failed to send push:", err);
        }
    }
}

run().catch(console.error).finally(() => prisma.$disconnect());
