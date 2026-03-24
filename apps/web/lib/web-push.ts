// Vibe Tech Labs — Server-side Web Push helper
// Sends OS-level push notifications to all subscribed browser sessions of a user.

import webpush from "web-push";
import { prisma } from "@vibetech/db";
import { logger } from "@/lib/errors";

// ── VAPID setup (runs once on cold start) ─────────────────────────────────
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY!;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY!;
const vapidEmail = process.env.VAPID_EMAIL || "mailto:admin@vibetech.com";

if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
}

// ── Push payload type ─────────────────────────────────────────────────────
export interface PushPayload {
    title: string;
    body: string;
    url?: string;          // URL to open when notification is clicked
    tag?: string;          // Groups notifications of same type (prevents duplicates)
    requireInteraction?: boolean; // Keep notification on screen until dismissed
}

// ── Send push to all subscribed devices of a user ────────────────────────
export async function sendPushToUser(
    userId: string,
    payload: PushPayload
): Promise<void> {
    if (!vapidPublicKey || !vapidPrivateKey) {
        logger.warn({}, "VAPID keys not configured — push skipped");
        return;
    }

    const subscriptions = await prisma.pushSubscription.findMany({
        where: { userId },
    });

    if (subscriptions.length === 0) return;

    const results = await Promise.allSettled(
        subscriptions.map(async (sub) => {
            try {
                await webpush.sendNotification(
                    {
                        endpoint: sub.endpoint,
                        keys: { p256dh: sub.p256dh, auth: sub.auth },
                    },
                    JSON.stringify(payload)
                );
            } catch (err: any) {
                // 410 Gone = subscription expired/revoked — clean it up
                if (err?.statusCode === 410 || err?.statusCode === 404) {
                    logger.info({ userId, endpoint: sub.endpoint.slice(-20) }, "Stale push subscription removed");
                    await prisma.pushSubscription.delete({ where: { id: sub.id } });
                } else {
                    throw err;
                }
            }
        })
    );

    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
        logger.warn({ userId, failed, total: subscriptions.length }, "Some push notifications failed");
    }
}

// ── Send push to multiple users at once (for bulk cron alerts) ────────────
export async function sendPushToUsers(
    userIds: string[],
    payload: PushPayload
): Promise<void> {
    await Promise.allSettled(userIds.map((id) => sendPushToUser(id, payload)));
}
