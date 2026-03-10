// Vibe Tech Labs — /api/updates/check-compliance
// Checks if the current user has submitted their daily update for today.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import { success } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

async function checkCompliance(req: NextRequest, ctx: { auth: JwtPayload }): Promise<NextResponse> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const update = await prisma.dailyUpdate.findUnique({
        where: {
            userId_date: {
                userId: ctx.auth.sub,
                date: today,
            },
        },
    });

    return success({
        hasSubmittedToday: !!update,
    });
}

export const GET = withAuth(checkCompliance);
