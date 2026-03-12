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
            phone: true,
            employeeId: true,
            role: true,
            status: true,
            dateOfJoining: true,
            plainPassword: userRole === "SADM" || userRole === "HRA" || userRole === "HRBP" ? true : false,
            faceProfile: {
                select: { id: true }
            },
            department: {
                select: { id: true, name: true }
            },
            manager: {
                select: { fullName: true }
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
    const { fullName, email, phone, employeeId, role, departmentId, managerId, dateOfJoining, password } = body;

    if (!fullName || !email || !employeeId || !role || !password) {
        return error("BAD_REQUEST", "Missing required fields (fullName, email, employeeId, role, password)");
    }

    try {
        let defaultLocationId = body.locationId;
        if (!defaultLocationId) {
            const defaultLoc = await prisma.location.findFirst({
                where: { entityId: userEntityId, name: { contains: "Vibe Tech" } }
            });
            defaultLocationId = defaultLoc?.id || (await prisma.location.findFirst({ where: { entityId: userEntityId } }))?.id;
        }
        const newUser = await prisma.user.create({
            data: {
                fullName,
                email: email.toLowerCase(),
                phone: phone || null,
                employeeId,
                role,
                entityId: userEntityId,
                departmentId: departmentId || null,
                managerId: managerId || null,
                locationId: defaultLocationId || null,
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
                faceProfile: {
                    select: { id: true }
                },
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

// PATCH: Update an existing employee
async function updateUser(req: NextRequest, ctx: { auth: JwtPayload }): Promise<NextResponse> {
    const userRole = ctx.auth.role;
    const userEntityId = ctx.auth.entityId;

    if (userRole !== "SADM" && userRole !== "HRA" && userRole !== "HRBP") {
        return error("FORBIDDEN", "You do not have permission to update users");
    }

    const body = await req.json().catch(() => ({}));
    const { id, fullName, email, phone, employeeId, role, departmentId, managerId, dateOfJoining, password } = body;

    if (!id) {
        return error("BAD_REQUEST", "User ID is required for updating");
    }

    try {
        // Ensure user belongs to this entity
        const existingUser = await prisma.user.findFirst({
            where: { id, entityId: userEntityId }
        });

        if (!existingUser) {
            return error("NOT_FOUND", "User not found or you don't have permission to edit them", 404);
        }

        const updateData: any = {};
        if (fullName) updateData.fullName = fullName;
        if (email) updateData.email = email.toLowerCase();
        if (phone !== undefined) updateData.phone = phone || null;
        if (employeeId) updateData.employeeId = employeeId;
        if (role) updateData.role = role;
        if (departmentId !== undefined) updateData.departmentId = departmentId || null;
        if (managerId !== undefined) updateData.managerId = managerId || null;
        if (dateOfJoining) updateData.dateOfJoining = new Date(dateOfJoining);
        
        // If password is provided, re-hash it and update the plainPassword record
        if (password) {
            updateData.passwordHash = hashPassword(password);
            updateData.plainPassword = password;
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: updateData,
            select: {
                id: true,
                fullName: true,
                email: true,
                employeeId: true,
                role: true,
                status: true,
                dateOfJoining: true,
                faceProfile: { select: { id: true } },
                department: { select: { id: true, name: true } },
                manager: { select: { fullName: true } }
            }
        });

        return success(updatedUser);
    } catch (e: any) {
        if (e.code === 'P2002') {
            return error("CONFLICT", "A user with this email or employee ID already exists", 409);
        }
        console.error("Update User Error:", e);
        return error("INTERNAL_ERROR", "Failed to update user", 500);
    }
}

// DELETE: Remove a user (soft delete by setting status to INACTIVE)
async function deleteUser(req: NextRequest, ctx: { auth: JwtPayload }): Promise<NextResponse> {
    const userRole = ctx.auth.role;
    const userEntityId = ctx.auth.entityId;

    if (userRole !== "SADM" && userRole !== "HRA" && userRole !== "HRBP") {
        return error("FORBIDDEN", "You do not have permission to delete users");
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("id");

    if (!userId) {
        return error("BAD_REQUEST", "User ID is required");
    }

    try {
        // Fetch the user first to ensure they exist and we can get their current email/id
        const user = await prisma.user.findFirst({
            where: {
                id: userId,
                entityId: userEntityId,
            }
        });

        if (!user) {
            return error("NOT_FOUND", "User not found or you don't have permission to delete them", 404);
        }

        const timestamp = Date.now();
        // Soft delete user by setting status to INACTIVE, and mangling unique fields
        await prisma.user.update({
            where: { id: userId },
            data: {
                status: "INACTIVE",
                email: `${user.email}_deleted_${timestamp}`,
                employeeId: `${user.employeeId}_deleted_${timestamp}`,
            }
        });

        return success({ message: "User successfully removed" });
    } catch (e) {
        console.error(e);
        return error("INTERNAL_ERROR", "Failed to delete user", 500);
    }
}

// Export auth-wrapped handlers
// Only SADM, HRA, HRBP can view or manage users
export const GET = withRole("SADM", "HRA", "HRBP")(getUsers);
export const POST = withRole("SADM", "HRA", "HRBP")(createUser);
export const PATCH = withRole("SADM", "HRA", "HRBP")(updateUser);
export const DELETE = withRole("SADM", "HRA", "HRBP")(deleteUser);
