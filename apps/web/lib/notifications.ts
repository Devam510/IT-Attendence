// NEXUS — Notification Dispatcher
// Template-based notification creation and dispatch

import { prisma } from "@nexus/db";

// ─── Notification Templates ─────────────────────────────

interface NotificationTemplate {
    type: string;
    title: string;
    body: string;
}

const TEMPLATES: Record<string, (data: Record<string, string>) => NotificationTemplate> = {
    leave_approved: (d) => ({
        type: "leave_approved",
        title: "Leave Approved ✅",
        body: `Your ${d["leaveType"] || "leave"} request from ${d["startDate"] || ""} to ${d["endDate"] || ""} has been approved.`,
    }),
    leave_rejected: (d) => ({
        type: "leave_rejected",
        title: "Leave Rejected ❌",
        body: `Your ${d["leaveType"] || "leave"} request from ${d["startDate"] || ""} to ${d["endDate"] || ""} was rejected.${d["comment"] ? ` Reason: ${d["comment"]}` : ""}`,
    }),
    leave_pending_approval: (d) => ({
        type: "leave_pending_approval",
        title: "Leave Request Pending 📋",
        body: `${d["requesterName"] || "An employee"} has requested ${d["leaveType"] || "leave"} from ${d["startDate"] || ""} to ${d["endDate"] || ""}.`,
    }),
    checkin_reminder: () => ({
        type: "checkin_reminder",
        title: "Check-in Reminder ⏰",
        body: "Don't forget to check in today! Your shift starts soon.",
    }),
    checkout_reminder: () => ({
        type: "checkout_reminder",
        title: "Check-out Reminder 🏠",
        body: "Your shift has ended. Don't forget to check out.",
    }),
    sla_warning: (d) => ({
        type: "sla_warning",
        title: "Approval SLA Warning ⚠️",
        body: `You have a pending approval for ${d["entityType"] || "a request"} that is approaching its SLA deadline.`,
    }),
    sla_escalated: (d) => ({
        type: "sla_escalated",
        title: "Approval Escalated 🔺",
        body: `An approval for ${d["entityType"] || "a request"} has been escalated due to SLA breach.`,
    }),
    attendance_flagged: (d) => ({
        type: "attendance_flagged",
        title: "Attendance Flagged 🚩",
        body: `Your attendance on ${d["date"] || "a recent date"} has been flagged for review.`,
    }),
    regularization_approved: (d) => ({
        type: "regularization_approved",
        title: "Regularization Approved ✅",
        body: `Your attendance regularization for ${d["date"] || "the requested date"} has been approved.`,
    }),
    approval_delegated: (d) => ({
        type: "approval_delegated",
        title: "Approval Delegated 🔄",
        body: `An approval has been delegated to you by ${d["delegatorName"] || "a colleague"}.`,
    }),
};

// ─── Send Notification ──────────────────────────────────

export async function sendNotification(
    userId: string,
    templateKey: string,
    data: Record<string, string> = {}
): Promise<string | null> {
    const templateFn = TEMPLATES[templateKey];
    if (!templateFn) {
        console.error(`[Notification] Unknown template: ${templateKey}`);
        return null;
    }

    const template = templateFn(data);

    const notification = await prisma.notification.create({
        data: {
            userId,
            type: template.type,
            title: template.title,
            body: template.body,
            data: Object.keys(data).length > 0 ? JSON.parse(JSON.stringify(data)) : undefined,
        },
    });

    return notification.id;
}

// ─── Send Bulk Notifications ────────────────────────────

export async function sendBulkNotifications(
    userIds: string[],
    templateKey: string,
    data: Record<string, string> = {}
): Promise<number> {
    const templateFn = TEMPLATES[templateKey];
    if (!templateFn) return 0;

    const template = templateFn(data);

    const result = await prisma.notification.createMany({
        data: userIds.map((userId) => ({
            userId,
            type: template.type,
            title: template.title,
            body: template.body,
            data: Object.keys(data).length > 0 ? JSON.parse(JSON.stringify(data)) : undefined,
        })),
    });

    return result.count;
}

// ─── Get Unread Count ───────────────────────────────────

export async function getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
        where: { userId, isRead: false },
    });
}
