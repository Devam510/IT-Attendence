// Vibe Tech Labs — Tasks API (GET list + POST create)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import type { JwtPayload } from "@vibetech/shared";

// GET /api/tasks — role-filtered task list
export const GET = withAuth(async (req: NextRequest, { auth }: { auth: JwtPayload }) => {
    try {
        let tasks;

        if (auth.role === "SADM" || auth.role === "HRA" || auth.role === "HRBP") {
            // HR / Admin: see ALL tasks in entity
            tasks = await prisma.task.findMany({
                where: {
                    assignedTo: { entityId: auth.entityId },
                },
                include: {
                    assignedTo: { select: { id: true, fullName: true, designation: true } },
                    assignedBy: { select: { id: true, fullName: true } },
                },
                orderBy: { createdAt: "desc" },
            });
        } else if (auth.role === "MGR") {
            // Manager: tasks they assigned + tasks assigned to their direct reports
            const directReports = await prisma.user.findMany({
                where: { managerId: auth.sub },
                select: { id: true },
            });
            const reportIds = directReports.map((r) => r.id);

            tasks = await prisma.task.findMany({
                where: {
                    OR: [
                        { assignedById: auth.sub },
                        { assignedToId: { in: reportIds } },
                    ],
                },
                include: {
                    assignedTo: { select: { id: true, fullName: true, designation: true } },
                    assignedBy: { select: { id: true, fullName: true } },
                },
                orderBy: { createdAt: "desc" },
            });
        } else {
            // Employee: only their own tasks
            tasks = await prisma.task.findMany({
                where: { assignedToId: auth.sub },
                include: {
                    assignedTo: { select: { id: true, fullName: true, designation: true } },
                    assignedBy: { select: { id: true, fullName: true } },
                },
                orderBy: { createdAt: "desc" },
            });
        }

        return NextResponse.json({ tasks });
    } catch (err) {
        console.error("[GET /api/tasks]", err);
        return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
    }
});

// POST /api/tasks — create a new task (MGR / HR / Admin only)
export const POST = withAuth(async (req: NextRequest, { auth }: { auth: JwtPayload }) => {
    const allowed = ["MGR", "HRA", "HRBP", "SADM"];
    if (!allowed.includes(auth.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const body = await req.json();
        const { title, description, assignedToId, priority, dueDate } = body;

        if (!title || !assignedToId) {
            return NextResponse.json({ error: "title and assignedToId are required" }, { status: 400 });
        }

        // Validate assignee exists and is in the same entity
        const assignee = await prisma.user.findFirst({
            where: { id: assignedToId, entityId: auth.entityId },
        });
        if (!assignee) {
            return NextResponse.json({ error: "Assignee not found" }, { status: 404 });
        }

        // For managers: can only assign to their direct reports
        if (auth.role === "MGR" && assignee.managerId !== auth.sub) {
            return NextResponse.json({ error: "Managers can only assign tasks to their direct reports" }, { status: 403 });
        }

        const task = await prisma.task.create({
            data: {
                title,
                description: description || null,
                assignedToId,
                assignedById: auth.sub,
                priority: priority || "MEDIUM",
                dueDate: dueDate ? new Date(dueDate) : null,
            },
            include: {
                assignedTo: { select: { id: true, fullName: true } },
                assignedBy: { select: { id: true, fullName: true } },
            },
        });

        // Notify assignee immediately
        await prisma.notification.create({
            data: {
                userId: assignedToId,
                type: "task_assigned",
                title: "📋 New Task Assigned",
                body: `You have been assigned a new task: "${title}"`,
                data: { taskId: task.id },
            },
        });

        return NextResponse.json({ task }, { status: 201 });
    } catch (err) {
        console.error("[POST /api/tasks]", err);
        return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
    }
});
