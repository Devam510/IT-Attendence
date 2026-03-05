// Vibe Tech Labs — GET /api/notifications
// Returns paginated notifications for the current user

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nexus/db";
import { withAuth } from "@/lib/auth";
import { success } from "@/lib/errors";
import type { JwtPayload } from "@nexus/shared";

async function handleGetNotifications(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;
    const url = new URL(req.url);

    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)));
    const unreadOnly = url.searchParams.get("unread") === "true";

    const where: Record<string, unknown> = { userId: auth.sub };
    if (unreadOnly) where["isRead"] = false;

    const [notifications, total, unreadCount] = await Promise.all([
        prisma.notification.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: (page - 1) * limit,
            take: limit,
            select: {
                id: true,
                type: true,
                title: true,
                body: true,
                data: true,
                isRead: true,
                createdAt: true,
            },
        }),
        prisma.notification.count({ where }),
        prisma.notification.count({ where: { userId: auth.sub, isRead: false } }),
    ]);

    return success({
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        unreadCount,
        notifications: notifications.map((n: any) => ({
            id: n.id,
            type: n.type,
            title: n.title,
            body: n.body,
            data: n.data,
            isRead: n.isRead,
            createdAt: n.createdAt.toISOString(),
        })),
    });
}

export const GET = withAuth(handleGetNotifications);
