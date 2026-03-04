// NEXUS — GET /api/profile
// User profile view and update

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nexus/db";
import { withAuth } from "@/lib/auth";
import { success, error } from "@/lib/errors";
import type { JwtPayload } from "@nexus/shared";

// GET — View own profile
async function handleGetProfile(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    const user = await prisma.user.findUnique({
        where: { id: auth.sub },
        select: {
            id: true,
            employeeId: true,
            email: true,
            fullName: true,
            designation: true,
            role: true,
            status: true,
            dateOfJoining: true,
            mfaEnabled: true,
            createdAt: true,
            department: { select: { id: true, name: true } },
            entity: { select: { id: true, name: true, country: true, timezone: true } },
            manager: { select: { id: true, fullName: true, email: true } },
            location: { select: { id: true, name: true } },
        },
    });

    if (!user) {
        return error("NOT_FOUND", "User not found", 404);
    }

    return success({
        profile: {
            id: user.id,
            employeeId: user.employeeId || "—",
            email: user.email,
            fullName: user.fullName,
            designation: user.designation || "—",
            role: user.role,
            status: user.status,
            // Flatten nested objects → strings (profile page expects strings)
            department: user.department?.name || "—",
            workLocation: user.location?.name || "—",
            manager: user.manager?.fullName || "—",
            joinDate: user.dateOfJoining.toISOString().split("T")[0],
            mfaEnabled: user.mfaEnabled,
            activeSessions: 1,
            memberSince: user.createdAt.toISOString(),
        },
    });
}

// PATCH — Update own profile (limited fields)
async function handleUpdateProfile(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
        return error("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    // Only allow updating designation (other fields need admin approval)
    const allowedFields: Record<string, unknown> = {};
    if (typeof body["designation"] === "string" && body["designation"].length <= 100) {
        allowedFields["designation"] = body["designation"];
    }

    if (Object.keys(allowedFields).length === 0) {
        return error("NO_CHANGES", "No valid fields to update", 400);
    }

    const updated = await prisma.user.update({
        where: { id: auth.sub },
        data: allowedFields,
        select: { id: true, fullName: true, designation: true },
    });

    return success({ updated });
}

export const GET = withAuth(handleGetProfile);
export const PATCH = withAuth(handleUpdateProfile);
