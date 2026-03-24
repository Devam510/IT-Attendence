// Vibe Tech Labs — POST /api/push/subscribe
// Saves a browser's push subscription to the database.
// Called by the frontend after the user grants notification permission.

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { prisma } from "@vibetech/db";
import { success, error, logger } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

async function handleSubscribe(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } = {};
    try { body = await req.json(); } catch { return error("BAD_REQUEST", "Invalid request body", 400); }

    const { endpoint, keys } = body;

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return error("BAD_REQUEST", "Missing push subscription fields", 400);
    }

    // Upsert: if this endpoint already exists just update it — handles browser refresh of subscription
    await prisma.pushSubscription.upsert({
        where: { endpoint },
        create: {
            userId: auth.sub,
            endpoint,
            p256dh: keys.p256dh,
            auth: keys.auth,
        },
        update: {
            userId: auth.sub,
            p256dh: keys.p256dh,
            auth: keys.auth,
        },
    });

    logger.info({ userId: auth.sub }, "Push subscription saved");
    return success({ subscribed: true });
}

export const POST = withAuth(handleSubscribe);
