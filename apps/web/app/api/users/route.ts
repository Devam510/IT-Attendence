// Vibe Tech Labs — /api/users
// Handles fetching all users and creating new users (Admin/HR only)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withRole } from "@/lib/auth";
import { success, error } from "@/lib/errors";
import { createHash } from "crypto";
import type { JwtPayload } from "@vibetech/shared";

function hashPassword(password: string): string {
    return createHash("sha256").update(password).digest("hex");
}

// GET: Fetch all active users for the HR/Admin's entity
async function getUsers(req: NextRequest, ctx: { auth: JwtPayload }): Promise<NextResponse> {
    const userRole = ctx.auth.role;
    const userEntityId = ctx.auth.entityId;

    const users = await prisma.user.findMany({
        where: {
            entityId: userEntityId,
            status: { not: "INACTIVE" }
        },
        select: {
            id: true,
            fullName: true,
            email: true,
            employeeId: true,
            role: true,
            status: true,
            dateOfJoining: true,
            plainPassword: userRole === "SADM" || userRole === "HRA" || userRole === "HRBP" ? true : false,
            department: {
                select: { id: true, name: true }
            }
        },
        orderBy: {
            createdAt: "desc"
        }
    });

    return success(users);
}

// POST: Add a new employee
async function createUser(req: NextRequest, ctx: { auth: JwtPayload }): Promise<NextResponse> {
    const userEntityId = ctx.auth.entityId;
    
    const body = await req.json().catch(() => ({}));
    const { fullName, email, employeeId, role, departmentId, dateOfJoining, password } = body;

    if (!fullName || !email || !employeeId || !role || !password) {
        return error("BAD_REQUEST", "Missing required fields (fullName, email, employeeId, role, password)");
    }

    try {
        const newUser = await prisma.user.create({
            data: {
                fullName,
                email: email.toLowerCase(),
                employeeId,
                role,
                entityId: userEntityId,
                departmentId: departmentId || null,
                dateOfJoining: dateOfJoining ? new Date(dateOfJoining) : new Date(),
                passwordHash: hashPassword(password),
                plainPassword: password, // As requested by user for admin visibility
            },
            select: {
                id: true,
                fullName: true,
                email: true,
                employeeId: true,
                role: true,
                status: true,
                dateOfJoining: true,
                department: {
                    select: { id: true, name: true }
                }
            }
        });

        return success(newUser, 201);
    } catch (e: any) {
        if (e.code === 'P2002') {
            return error("CONFLICT", "A user with this email or employee ID already exists", 409);
        }
        console.error(e);
        return error("INTERNAL_ERROR", "Failed to create user", 500);
    }
}

// Export auth-wrapped handlers
// Only SADM, HRA, HRBP can view or manage users
export const GET = withRole("SADM", "HRA", "HRBP")(getUsers);
export const POST = withRole("SADM", "HRA", "HRBP")(createUser);
