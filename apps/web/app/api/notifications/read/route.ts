// Vibe Tech Labs — PATCH /api/notifications
// Mark notifications as read

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nexus/db";
import { NotificationReadSchema } from "@nexus/shared";
import { withAuth } from "@/lib/auth";
import { success, error } from "@/lib/errors";
import type { JwtPayload } from "@nexus/shared";

async function handleMarkRead(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
        return error("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    // Support both bulk ids and "all" mode
    const markAll = body["markAll"] === true;

    if (markAll) {
        // Mark all unread as read
        const result = await prisma.notification.updateMany({
            where: { userId: auth.sub, isRead: false },
            data: { isRead: true },
        });

        return success({
            marked: result.count,
            message: `${result.count} notifications marked as read`,
        });
    }

    // Mark specific IDs
    const parsed = NotificationReadSchema.safeParse(body);
    if (!parsed.success) {
        return error("VALIDATION_ERROR", "Invalid data — provide 'ids' (array of UUIDs) or 'markAll: true'", 422, parsed.error.errors);
    }

    const { ids } = parsed.data;

    // Only allow marking own notifications
    const result = await prisma.notification.updateMany({
        where: {
            id: { in: ids },
            userId: auth.sub,
            isRead: false,
        },
        data: { isRead: true },
    });

    return success({
        marked: result.count,
        requested: ids.length,
        message: `${result.count} of ${ids.length} notifications marked as read`,
    });
}

export const PATCH = withAuth(handleMarkRead);
