// Vibe Tech Labs — Assignable Employees API

import { NextRequest, NextResponse } from "next/server";
import { prisma, Role } from "@vibetech/db";
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
            // Managers can only assign to their direct reports (excluding themselves)
            users = await prisma.user.findMany({
                where: { managerId: auth.sub, status: "ACTIVE", id: { not: auth.sub } },
                select: { id: true, fullName: true, designation: true, employeeId: true },
                orderBy: { fullName: "asc" },
            });
        } else {
            // HR / Admin: all active employees in entity, excluding:
            //   - The caller themselves (so they don't see their own name)
            //   - SADM role (HR/HRBP should not be able to assign tasks to admins)
            const excludeRoles: Role[] = ["SADM"];
            users = await prisma.user.findMany({
                where: {
                    entityId: auth.entityId,
                    status: "ACTIVE",
                    id: { not: auth.sub },
                    role: { notIn: excludeRoles },
                },
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
