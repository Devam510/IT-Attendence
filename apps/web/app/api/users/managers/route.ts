import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withRole } from "@/lib/auth";
import { success, error } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

// Fetch users who can be assigned as a manager/superior
async function getManagers(req: NextRequest, ctx: { auth: JwtPayload }): Promise<NextResponse> {
    const userRole = ctx.auth.role;
    const userEntityId = ctx.auth.entityId;

    if (userRole !== "SADM" && userRole !== "HRA" && userRole !== "HRBP") {
        return error("FORBIDDEN", "You do not have permission to view superiors");
    }

    try {
        const managers = await prisma.user.findMany({
            where: {
                entityId: userEntityId,
                status: "ACTIVE",
                role: {
                    in: ["MGR", "HRA", "HRBP", "SADM"] // People who can have direct reports
                }
            },
            select: {
                id: true,
                fullName: true,
                role: true,
            },
            orderBy: {
                fullName: "asc"
            }
        });

        return success({ managers });
    } catch (e) {
        console.error(e);
        return error("INTERNAL_ERROR", "Failed to fetch managers", 500);
    }
}

export const GET = withRole("SADM", "HRA", "HRBP")(getManagers);
