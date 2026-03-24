// Vibe Tech Labs — DELETE /api/push/unsubscribe
// Removes a push subscription from the database (called on logout or revoke).

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth";
import { prisma } from "@vibetech/db";
import { success, error, logger } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

async function handleUnsubscribe(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    let body: { endpoint?: string } = {};
    try { body = await req.json(); } catch { return error("BAD_REQUEST", "Invalid request body", 400); }

    if (!body.endpoint) {
        return error("BAD_REQUEST", "Missing endpoint", 400);
    }

    await prisma.pushSubscription.deleteMany({
        where: { endpoint: body.endpoint, userId: auth.sub },
    });

    logger.info({ userId: auth.sub }, "Push subscription removed");
    return success({ unsubscribed: true });
}

export const DELETE = withAuth(handleUnsubscribe);
