// NEXUS — Event Queue (Bull)
// Lightweight event bus for MVP; swap to Kafka in Phase 3

import { Queue } from "bullmq";

// ─── Queue Definitions ──────────────────────────────────

const QUEUE_NAMES = {
    AUDIT: "audit-events",
    NOTIFICATIONS: "notification-dispatch",
    ATTENDANCE: "attendance-events",
    APPROVAL: "approval-events",
} as const;

type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const queues = new Map<string, Queue>();

export function getQueue(name: QueueName): Queue {
    if (!queues.has(name)) {
        const queue = new Queue(name, {
            connection: {
                url: process.env.REDIS_URL || "redis://localhost:6379",
            },
            defaultJobOptions: {
                removeOnComplete: 100,
                removeOnFail: 500,
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 1000,
                },
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
    const queue = getQueue(queueName);
    await queue.add(event.type, event, {
        jobId: `${event.type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    });
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
    const queue = getQueue(QUEUE_NAMES.NOTIFICATIONS);
    await queue.add("notification.send", data);
}

export async function publishAttendanceEvent(event: NexusEvent): Promise<void> {
    await publishEvent(QUEUE_NAMES.ATTENDANCE, event);
}

export async function publishApprovalEvent(event: NexusEvent): Promise<void> {
    await publishEvent(QUEUE_NAMES.APPROVAL, event);
}

export { QUEUE_NAMES };
