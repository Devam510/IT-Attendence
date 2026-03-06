// Vibe Tech Labs — GET /api/attendance/export-options
// Returns employees and departments relevant to the calling manager/admin for export filtering

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import { success, error } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

async function handleGetExportOptions(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    // Must be at least a manager
    if (auth.role === "EMP") {
        return error("FORBIDDEN", "Only managers and admins can export team data", 403);
    }

    const isHraOrAdmin = auth.role === "HRA" || auth.role === "SADM" || auth.role === "HRBP";

    // Scope users to entity (if admin) or manager's directs
    const employeeWhere = isHraOrAdmin
        ? { entityId: auth.entityId, status: "ACTIVE" as const, role: { notIn: ["SADM"] as any[] } }
        : { managerId: auth.sub, status: "ACTIVE" as const };

    const users = await prisma.user.findMany({
        where: employeeWhere,
        select: {
            id: true,
            fullName: true,
            employeeId: true,
            department: { select: { id: true, name: true } },
        },
        orderBy: { fullName: "asc" },
    });

    // Extract unique departments from the users we fetched
    const deptMap = new Map<string, string>();
    users.forEach(u => {
        if (u.department) {
            deptMap.set(u.department.id, u.department.name);
        }
    });

    const departments = Array.from(deptMap.entries()).map(([id, name]) => ({ id, name }));

    const employees = users.map(u => ({
        id: u.id,
        fullName: u.fullName,
        employeeId: u.employeeId,
    }));

    return success({ employees, departments });
}

export const GET = withAuth(handleGetExportOptions);
