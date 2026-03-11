// Vibe Tech Labs — /api/departments
// Handles fetching departments for an entity

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withRole } from "@/lib/auth";
import { success, error } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

// GET: Fetch all departments for the entity
async function getDepartments(req: NextRequest, ctx: { auth: JwtPayload }): Promise<NextResponse> {
    const userEntityId = ctx.auth.entityId;

    try {
        const departments = await prisma.department.findMany({
            where: {
                entityId: userEntityId
            },
            select: {
                id: true,
                name: true
            },
            orderBy: {
                name: "asc"
            }
        });

        return success(departments);
    } catch (e) {
        console.error("Failed to fetch departments", e);
        return error("INTERNAL_ERROR", "Failed to load departments");
    }
}

// Export auth-wrapped handlers
export const GET = withRole("SADM", "HRA", "HRBP", "MGR", "EMP")(getDepartments);
