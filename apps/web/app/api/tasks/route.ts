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

        // Block assigning tasks to employees on approved leave
        // Check against task due date (if provided) or today, to catch immediate assignments
        const istOffsetMs = 5.5 * 60 * 60 * 1000;
        const refDate = dueDate ? new Date(dueDate) : new Date();
        const refIst = new Date(refDate.getTime() + istOffsetMs);
        const checkStart = new Date(Date.UTC(refIst.getUTCFullYear(), refIst.getUTCMonth(), refIst.getUTCDate()) - istOffsetMs);
        const checkEnd = new Date(checkStart.getTime() + 24 * 60 * 60 * 1000);

        // Also always check today for immediate assignments (due date could be future but task is assigned now)
        const nowIst = new Date(Date.now() + istOffsetMs);
        const todayStart = new Date(Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()) - istOffsetMs);
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

        const leaveConflict = await prisma.leaveRequest.findFirst({
            where: {
                userId: assignedToId,
                status: "APPROVED",
                OR: [
                    // Conflicts with today (can't assign tasks to someone who is out today)
                    { startDate: { lte: todayEnd }, endDate: { gte: todayStart } },
                    // Conflicts with the due date (can't assign tasks due on their leave day)
                    ...(dueDate ? [{ startDate: { lte: checkEnd }, endDate: { gte: checkStart } }] : []),
                ],
            },
            select: { leaveType: { select: { name: true } }, startDate: true, endDate: true },
        });

        if (leaveConflict) {
            const leaveName = (leaveConflict as any).leaveType?.name || "Leave";
            const leaveStart = (leaveConflict.startDate as Date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
            const leaveEnd = (leaveConflict.endDate as Date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
            return NextResponse.json({
                error: `${assignee.fullName} is on approved ${leaveName} (${leaveStart} – ${leaveEnd}). Tasks cannot be assigned to employees on leave.`,
            }, { status: 409 });
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
