import { NextResponse } from "next/server";
import { sendPushToUsers } from "@/lib/web-push";
import { prisma } from "@vibetech/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        let targetUserId = searchParams.get("userId");

        if (!targetUserId) {
            // Pick a random user that has a subscription
            const sub = await prisma.pushSubscription.findFirst({
                include: { user: true }
            });
            if (!sub) {
                return NextResponse.json({ error: "No pushed subscriptions found in DB" }, { status: 404 });
            }
            targetUserId = sub.userId;
        }

        console.log(`Testing push to user: ${targetUserId}`);

        const results = await sendPushToUsers([targetUserId], {
            title: "Test Push",
            body: "This is a direct test from the API",
            url: "/dashboard",
            tag: "test"
        });

        return NextResponse.json({ success: true, targetUserId, results });

    } catch (e: any) {
        console.error("Test push error:", e);
        return NextResponse.json({ error: e.message || "Unknown error" }, { status: 500 });
    }
}
