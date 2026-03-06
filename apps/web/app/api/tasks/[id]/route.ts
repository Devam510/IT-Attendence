// Vibe Tech Labs — Task [id] API (PATCH status + DELETE)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import type { JwtPayload } from "@vibetech/shared";

// PATCH /api/tasks/[id] — update status (e.g. mark complete)
export const PATCH = withAuth(async (
    req: NextRequest,
    { auth, params }: { auth: JwtPayload; params?: Record<string, string> }
) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: "Missing task id" }, { status: 400 });

    try {
        const body = await req.json();
        const { status } = body;

        const task = await prisma.task.findUnique({
            where: { id },
            include: {
                assignedBy: { select: { id: true, fullName: true } },
                assignedTo: { select: { id: true, fullName: true } },
            },
        });

        if (!task) {
            return NextResponse.json({ error: "Task not found" }, { status: 404 });
        }

        // Permission: assignee can mark complete, assigner/HR/Admin can update anything
        const isAssignee = task.assignedToId === auth.sub;
        const isAssigner = task.assignedById === auth.sub;
        const isAdminOrHR = ["SADM", "HRA", "HRBP"].includes(auth.role);

        if (!isAssignee && !isAssigner && !isAdminOrHR) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Employees can only mark their own tasks as COMPLETED
        if (auth.role === "EMP" && status !== "COMPLETED") {
            return NextResponse.json({ error: "Employees can only mark tasks as completed" }, { status: 403 });
        }

        const updatedTask = await prisma.task.update({
            where: { id },
            data: {
                status,
                ...(status === "COMPLETED" ? { completedAt: new Date() } : {}),
            },
        });

        // When task is completed — notify the assigner (manager/HR/admin)
        if (status === "COMPLETED") {
            await prisma.notification.create({
                data: {
                    userId: task.assignedById,
                    type: "task_completed",
                    title: "✅ Task Completed",
                    body: `${task.assignedTo.fullName} completed the task: "${task.title}"`,
                    data: { taskId: id },
                },
            });
        }

        return NextResponse.json({ task: updatedTask });
    } catch (err) {
        console.error("[PATCH /api/tasks/[id]]", err);
        return NextResponse.json({ error: "Failed to update task" }, { status: 500 });
    }
});

// DELETE /api/tasks/[id] — delete a task (assigner or admin only)
export const DELETE = withAuth(async (
    req: NextRequest,
    { auth, params }: { auth: JwtPayload; params?: Record<string, string> }
) => {
    const id = params?.id;
    if (!id) return NextResponse.json({ error: "Missing task id" }, { status: 400 });

    try {
        const task = await prisma.task.findUnique({ where: { id } });
        if (!task) {
            return NextResponse.json({ error: "Task not found" }, { status: 404 });
        }

        const canDelete =
            task.assignedById === auth.sub ||
            ["SADM", "HRA"].includes(auth.role);

        if (!canDelete) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await prisma.task.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[DELETE /api/tasks/[id]]", err);
        return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
    }
});
