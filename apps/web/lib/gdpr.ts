// NEXUS — GDPR & Data Retention Utilities
// Right-to-erasure, data export, and automated retention cleanup

import { prisma } from "@nexus/db";

// ─── Data Retention Periods (in days) ───────────────────

const RETENTION_PERIODS: Record<string, number> = {
    auditEvents: 2555,      // 7 years (compliance)
    notifications: 90,       // 3 months
    attendanceRecords: 1825, // 5 years
    leaveRequests: 1825,     // 5 years
    approvalWorkflows: 365,  // 1 year after completion
};

// ─── Right to Erasure (GDPR Article 17) ─────────────────

export interface ErasureResult {
    userId: string;
    itemsErased: Record<string, number>;
    anonymizedFields: string[];
    completedAt: string;
}

export async function executeGdprErasure(
    userId: string,
    retainAuditTrail: boolean = true
): Promise<ErasureResult> {
    const result: Record<string, number> = {};

    // 1. Delete notifications
    const notifications = await prisma.notification.deleteMany({ where: { userId } });
    result["notifications"] = notifications.count;

    // 2. Anonymize leave requests (keep for aggregate stats, remove PII)
    const leaveRequests = await prisma.leaveRequest.updateMany({
        where: { userId },
        data: { reason: "[REDACTED]" },
    });
    result["leaveRequests_anonymized"] = leaveRequests.count;

    // 3. Anonymize attendance records (remove location PII)
    const attendance = await prisma.attendanceRecord.updateMany({
        where: { userId },
        data: {
            checkInLat: null,
            checkInLng: null,
            checkOutLat: null,
            checkOutLng: null,
        },
    });
    result["attendance_anonymized"] = attendance.count;

    // 4. Anonymize user record (don't delete — preserve referential integrity)
    await prisma.user.update({
        where: { id: userId },
        data: {
            fullName: `[GDPR Erased User]`,
            email: `erased_${userId.substring(0, 8)}@nexus.deleted`,
            status: "INACTIVE",
        },
    });
    result["user_anonymized"] = 1;

    // 5. Remove device associations (after user anonymization to avoid FK issues)
    const devices = await prisma.device.deleteMany({ where: { userId } });
    result["devices"] = devices.count;

    // 6. Optionally anonymize audit trail (usually retained for compliance)
    if (!retainAuditTrail) {
        const audits = await prisma.auditEvent.updateMany({
            where: { actorId: userId },
            data: {
                actorId: null,
                ipAddress: null,
                geoLocation: undefined,
                metadata: undefined,
            },
        });
        result["audit_anonymized"] = audits.count;
    }

    const anonymizedFields = [
        "fullName", "email", "checkInLat", "checkInLng",
        "checkOutLat", "checkOutLng", "anomalyFlags", "reason",
    ];

    if (!retainAuditTrail) {
        anonymizedFields.push("actorId", "ipAddress", "geoLocation");
    }

    return {
        userId,
        itemsErased: result,
        anonymizedFields,
        completedAt: new Date().toISOString(),
    };
}

// ─── Data Export (GDPR Article 20 — Data Portability) ───

export interface DataExport {
    userId: string;
    exportedAt: string;
    user: Record<string, unknown>;
    attendance: Record<string, unknown>[];
    leaves: Record<string, unknown>[];
    notifications: Record<string, unknown>[];
}

export async function exportUserData(userId: string): Promise<DataExport> {
    const [user, attendance, leaves, notifications] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
            select: {
                fullName: true,
                email: true,
                employeeId: true,
                designation: true,
                status: true,
                createdAt: true,
            },
        }),
        prisma.attendanceRecord.findMany({
            where: { userId },
            select: {
                date: true,
                checkInAt: true,
                checkOutAt: true,
                status: true,
                totalHours: true,
                overtimeHours: true,
            },
            orderBy: { date: "desc" },
            take: 500,
        }),
        prisma.leaveRequest.findMany({
            where: { userId },
            include: { leaveType: { select: { name: true } } },
            orderBy: { createdAt: "desc" },
            take: 200,
        }),
        prisma.notification.findMany({
            where: { userId },
            select: { type: true, title: true, body: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 500,
        }),
    ]);

    return {
        userId,
        exportedAt: new Date().toISOString(),
        user: (user as Record<string, unknown>) || {},
        attendance: attendance.map((a: any) => ({
            date: a.date.toISOString().split("T")[0],
            checkIn: a.checkInAt?.toISOString() || null,
            checkOut: a.checkOutAt?.toISOString() || null,
            status: a.status,
            hours: a.totalHours,
            overtime: a.overtimeHours,
        })),
        leaves: leaves.map((l: any) => ({
            type: l.leaveType.name,
            startDate: l.startDate.toISOString().split("T")[0],
            endDate: l.endDate.toISOString().split("T")[0],
            status: l.status,
            reason: l.reason,
        })),
        notifications: notifications.map((n: any) => ({
            type: n.type,
            title: n.title,
            body: n.body,
            date: n.createdAt.toISOString(),
        })),
    };
}

// ─── Automated Data Retention Cleanup ───────────────────

export async function runDataRetentionCleanup(): Promise<Record<string, number>> {
    const results: Record<string, number> = {};
    const now = new Date();

    // Delete old notifications
    const notifCutoff = new Date(now.getTime() - RETENTION_PERIODS["notifications"]! * 24 * 60 * 60 * 1000);
    const notifs = await prisma.notification.deleteMany({
        where: { createdAt: { lt: notifCutoff } },
    });
    results["notifications_deleted"] = notifs.count;

    // Delete completed approval workflows past retention
    const workflowCutoff = new Date(now.getTime() - RETENTION_PERIODS["approvalWorkflows"]! * 24 * 60 * 60 * 1000);
    const workflows = await prisma.approvalWorkflow.deleteMany({
        where: {
            status: { in: ["APPROVED", "REJECTED"] },
            completedAt: { lt: workflowCutoff },
        },
    });
    results["workflows_deleted"] = workflows.count;

    return results;
}
