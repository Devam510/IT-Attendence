// Vibe Tech Labs — Event Queue
// Gracefully degrades without Redis (e.g. on Vercel)
// When Redis unavailable, events are written directly to DB

import { Queue } from "bullmq";

const QUEUE_NAMES = {
    AUDIT: "audit-events",
    NOTIFICATIONS: "notification-dispatch",
    ATTENDANCE: "attendance-events",
    APPROVAL: "approval-events",
} as const;

type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

let redisAvailable: boolean | null = null; // null = not checked yet
const queues = new Map<string, Queue>();

async function isRedisAvailable(): Promise<boolean> {
    if (redisAvailable !== null) return redisAvailable;

    // If no REDIS_URL is set, skip entirely
    if (!process.env.REDIS_URL) {
        redisAvailable = false;
        return false;
    }

    try {
        const queue = new Queue("health-check", {
            connection: { url: process.env.REDIS_URL },
        });
        await queue.close();
        redisAvailable = true;
        return true;
    } catch {
        console.warn("[Queue] Redis not available — queues disabled");
        redisAvailable = false;
        return false;
    }
}

export function getQueue(name: QueueName): Queue | null {
    if (redisAvailable === false) return null;

    if (!queues.has(name)) {
        const queue = new Queue(name, {
            connection: {
                url: process.env.REDIS_URL || "redis://localhost:6379",
            },
            defaultJobOptions: {
                removeOnComplete: 100,
                removeOnFail: 500,
                attempts: 3,
                backoff: { type: "exponential", delay: 1000 },
            },
        });
        queues.set(name, queue);
    }
    return queues.get(name)!;
}

// ─── Event Publishing ───────────────────────────────────

export interface NexusEvent {
    type: string;
    actorId: string;
    actorRole: string;
    resourceType: string;
    resourceId?: string;
    data: Record<string, unknown>;
    timestamp: string;
}

export async function publishEvent(
    queueName: QueueName,
    event: NexusEvent
): Promise<void> {
    const available = await isRedisAvailable();
    if (!available) return; // Silently skip when no Redis

    const queue = getQueue(queueName);
    if (!queue) return;

    try {
        await queue.add(event.type, event, {
            jobId: `${event.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        });
    } catch {
        console.warn(`[Queue] Failed to publish to ${queueName}, skipping`);
    }
}

// ─── Convenience Publishers ─────────────────────────────

export async function publishAuditEvent(event: NexusEvent): Promise<void> {
    await publishEvent(QUEUE_NAMES.AUDIT, event);
}

export async function publishNotification(data: {
    userId: string;
    type: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
}): Promise<void> {
    const available = await isRedisAvailable();
    if (!available) return;

    const queue = getQueue(QUEUE_NAMES.NOTIFICATIONS);
    if (!queue) return;

    try {
        await queue.add("notification.send", data);
    } catch {
        console.warn("[Queue] Failed to publish notification, skipping");
    }
}

export async function publishAttendanceEvent(event: NexusEvent): Promise<void> {
    await publishEvent(QUEUE_NAMES.ATTENDANCE, event);
}

export async function publishApprovalEvent(event: NexusEvent): Promise<void> {
    await publishEvent(QUEUE_NAMES.APPROVAL, event);
}

export { QUEUE_NAMES };
