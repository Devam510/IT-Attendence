// Vibe Tech Labs — Linear Approval Chain Engine
// Manages step-by-step approval workflows with SLA deadlines and escalation

import { prisma } from "@nexus/db";

export interface ApprovalStep {
    approverId: string;
    status: "PENDING" | "APPROVED" | "REJECTED" | "DELEGATED" | "ESCALATED";
    actedAt: string | null;
    comment: string | null;
    delegatedTo?: string;
    metadata?: Record<string, unknown>;
}

export interface ApprovalDecision {
    workflowId: string;
    action: "approve" | "reject";
    actorId: string;
    comment?: string;
}

export interface ApprovalResult {
    success: boolean;
    newStatus: string;
    isComplete: boolean;
    message: string;
}

// ─── SLA Configuration ──────────────────────────────────

const SLA_HOURS: Record<string, number> = {
    leave: 48,        // 48 hours to approve a leave
    regularization: 24,
    expense: 72,
    default: 48,
};

export function calculateSlaDeadline(entityType: string): Date {
    const hours = SLA_HOURS[entityType] || SLA_HOURS["default"]!;
    return new Date(Date.now() + hours * 60 * 60 * 1000);
}

// ─── Process Approval Decision ──────────────────────────

export async function processApprovalDecision(
    decision: ApprovalDecision
): Promise<ApprovalResult> {
    const workflow = await prisma.approvalWorkflow.findUnique({
        where: { id: decision.workflowId },
    });

    if (!workflow) {
        return { success: false, newStatus: "", isComplete: false, message: "Workflow not found" };
    }

    if (workflow.status !== "PENDING" && workflow.status !== "IN_PROGRESS") {
        return { success: false, newStatus: workflow.status, isComplete: true, message: `Workflow already ${workflow.status}` };
    }

    const steps = workflow.steps as unknown as ApprovalStep[];
    const currentStep = steps[workflow.currentStep];

    if (!currentStep) {
        return { success: false, newStatus: workflow.status, isComplete: false, message: "Invalid step" };
    }

    // Verify the actor is the current approver (or delegate)
    if (currentStep.approverId !== decision.actorId && currentStep.delegatedTo !== decision.actorId) {
        return { success: false, newStatus: workflow.status, isComplete: false, message: "Not authorized to act on this step" };
    }

    // Update step
    const now = new Date().toISOString();
    currentStep.status = decision.action === "approve" ? "APPROVED" : "REJECTED";
    currentStep.actedAt = now;
    currentStep.comment = decision.comment || null;

    if (decision.action === "reject") {
        // Rejection ends the workflow immediately
        await prisma.approvalWorkflow.update({
            where: { id: workflow.id },
            data: {
                steps: JSON.parse(JSON.stringify(steps)),
                status: "REJECTED",
                completedAt: new Date(),
            },
        });

        return { success: true, newStatus: "REJECTED", isComplete: true, message: "Workflow rejected" };
    }

    // Approval — advance to next step or complete
    const nextStepIndex = workflow.currentStep + 1;

    if (nextStepIndex >= steps.length) {
        // All steps approved — workflow complete
        await prisma.approvalWorkflow.update({
            where: { id: workflow.id },
            data: {
                steps: JSON.parse(JSON.stringify(steps)),
                status: "APPROVED",
                currentStep: nextStepIndex,
                completedAt: new Date(),
            },
        });

        return { success: true, newStatus: "APPROVED", isComplete: true, message: "Workflow fully approved" };
    }

    // Move to next step
    await prisma.approvalWorkflow.update({
        where: { id: workflow.id },
        data: {
            steps: JSON.parse(JSON.stringify(steps)),
            status: "IN_PROGRESS",
            currentStep: nextStepIndex,
            slaDeadline: calculateSlaDeadline(workflow.entityType),
        },
    });

    return { success: true, newStatus: "IN_PROGRESS", isComplete: false, message: `Approved — moved to step ${nextStepIndex + 1}` };
}

// ─── Delegate Approval ──────────────────────────────────

export async function delegateApproval(
    workflowId: string,
    currentApproverId: string,
    delegateToId: string,
    reason?: string
): Promise<ApprovalResult> {
    const workflow = await prisma.approvalWorkflow.findUnique({
        where: { id: workflowId },
    });

    if (!workflow || (workflow.status !== "PENDING" && workflow.status !== "IN_PROGRESS" && workflow.status !== "DELEGATED")) {
        return { success: false, newStatus: workflow?.status || "", isComplete: false, message: "Workflow not found or already completed" };
    }

    const steps = workflow.steps as unknown as ApprovalStep[];
    const currentStep = steps[workflow.currentStep];

    if (!currentStep || currentStep.approverId !== currentApproverId) {
        return { success: false, newStatus: workflow.status, isComplete: false, message: "Not the current approver" };
    }

    // Set delegation
    currentStep.delegatedTo = delegateToId;
    currentStep.status = "DELEGATED";
    currentStep.comment = reason || `Delegated to ${delegateToId}`;

    await prisma.approvalWorkflow.update({
        where: { id: workflowId },
        data: {
            steps: JSON.parse(JSON.stringify(steps)),
            status: "DELEGATED",
            slaDeadline: calculateSlaDeadline(workflow.entityType),
        },
    });

    return { success: true, newStatus: "DELEGATED", isComplete: false, message: `Delegated to ${delegateToId}` };
}

// ─── Check SLA & Escalate ───────────────────────────────

export async function checkAndEscalateExpired(): Promise<number> {
    const now = new Date();
    const expiredWorkflows = await prisma.approvalWorkflow.findMany({
        where: {
            status: { in: ["PENDING", "IN_PROGRESS", "DELEGATED"] },
            slaDeadline: { lt: now },
        },
    });

    let escalatedCount = 0;

    for (const workflow of expiredWorkflows) {
        const steps = workflow.steps as unknown as ApprovalStep[];
        const currentStep = steps[workflow.currentStep];

        if (currentStep) {
            currentStep.status = "ESCALATED";
            currentStep.comment = `Auto-escalated: SLA expired at ${workflow.slaDeadline?.toISOString()}`;
        }

        await prisma.approvalWorkflow.update({
            where: { id: workflow.id },
            data: {
                steps: JSON.parse(JSON.stringify(steps)),
                status: "ESCALATED",
                escalationCount: workflow.escalationCount + 1,
                slaDeadline: new Date(now.getTime() + 24 * 60 * 60 * 1000), // Extend by 24h
            },
        });

        escalatedCount++;
    }

    return escalatedCount;
}

// ─── Get Pending Approvals For User ─────────────────────

export async function getPendingApprovalsForUser(
    userId: string
): Promise<{ id: string; entityType: string; entityId: string; requesterId: string; currentStep: number; slaDeadline: Date | null; createdAt: Date }[]> {
    const workflows = await prisma.approvalWorkflow.findMany({
        where: {
            status: { in: ["PENDING", "IN_PROGRESS", "DELEGATED"] },
        },
        orderBy: { createdAt: "desc" },
    });

    // Filter to those where current step approver matches userId
    return workflows.filter((w) => {
        const steps = w.steps as unknown as ApprovalStep[];
        const step = steps[w.currentStep];
        return step && (step.approverId === userId || step.delegatedTo === userId);
    }).map((w) => ({
        id: w.id,
        entityType: w.entityType,
        entityId: w.entityId,
        requesterId: w.requesterId,
        currentStep: w.currentStep,
        slaDeadline: w.slaDeadline,
        createdAt: w.createdAt,
    }));
}
