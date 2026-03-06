// Vibe Tech Labs — Assignable Employees API

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import type { JwtPayload } from "@vibetech/shared";

// GET /api/tasks/employees — returns list of employees the caller can assign tasks to
export const GET = withAuth(async (req: NextRequest, { auth }: { auth: JwtPayload }) => {
    const allowed = ["MGR", "HRA", "HRBP", "SADM"];
    if (!allowed.includes(auth.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        let users;

        if (auth.role === "MGR") {
            // Managers can only assign to their direct reports
            users = await prisma.user.findMany({
                where: { managerId: auth.sub, status: "ACTIVE" },
                select: { id: true, fullName: true, designation: true, employeeId: true },
                orderBy: { fullName: "asc" },
            });
        } else {
            // HR / Admin: all active employees in entity (including managers)
            users = await prisma.user.findMany({
                where: { entityId: auth.entityId, status: "ACTIVE" },
                select: { id: true, fullName: true, designation: true, employeeId: true },
                orderBy: { fullName: "asc" },
            });
        }

        return NextResponse.json({ employees: users });
    } catch (err) {
        console.error("[GET /api/tasks/employees]", err);
        return NextResponse.json({ error: "Failed to fetch employees" }, { status: 500 });
    }
});
