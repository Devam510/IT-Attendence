// Vibe Tech Labs — /api/users
// H1 fix: bcrypt password hashing (was SHA-256)
// C3 fix: removed plainPassword field — no more plaintext passwords in DB or API responses

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withRole } from "@/lib/auth";
import { success, error, logger } from "@/lib/errors";
import bcrypt from "bcryptjs";
import type { JwtPayload } from "@vibetech/shared";

const BCRYPT_ROUNDS = 12;

// GET: Fetch all active users for the HR/Admin's entity
async function getUsers(req: NextRequest, ctx: { auth: JwtPayload }): Promise<NextResponse> {
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
            // C3 fix: plainPassword is never returned — admins use "Reset Password" flow
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

    // L3 fix: length limits on string inputs
    if (password.length < 8) {
        return error("WEAK_PASSWORD", "Password must be at least 8 characters", 400);
    }
    if (password.length > 128) {
        return error("BAD_REQUEST", "Password must be at most 128 characters", 400);
    }

    try {
        let defaultLocationId = body.locationId;
        if (!defaultLocationId) {
            const defaultLoc = await prisma.location.findFirst({
                where: { entityId: userEntityId, name: { contains: "Vibe Tech" } }
            });
            defaultLocationId = defaultLoc?.id || (await prisma.location.findFirst({ where: { entityId: userEntityId } }))?.id;
        }

        // H1 fix: hash with bcrypt (12 rounds) — never store plaintext
        const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

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
                passwordHash,
                // C3 fix: plainPassword field removed — never store plaintext passwords
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

        logger.info({ adminId: ctx.auth.sub, newUserId: newUser.id }, "New employee created");
        return success(newUser, 201);
    } catch (e: any) {
        if (e.code === 'P2002') {
            return error("CONFLICT", "A user with this email or employee ID already exists", 409);
        }
        logger.error({ err: e }, "Failed to create user"); // L1 fix: use structured logger
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

    // M3 fix: validate UUID format
    if (!/^[0-9a-f-]{36}$/.test(id)) {
        return error("VALIDATION_ERROR", "Invalid user ID format", 422);
    }

    try {
        // Ensure user belongs to this entity
        const existingUser = await prisma.user.findFirst({
            where: { id, entityId: userEntityId }
        });

        if (!existingUser) {
            return error("NOT_FOUND", "User not found or you don't have permission to edit them", 404);
        }

        const updateData: Record<string, unknown> = {};
        if (fullName) updateData.fullName = fullName;
        if (email) updateData.email = email.toLowerCase();
        if (phone !== undefined) updateData.phone = phone || null;
        if (employeeId) updateData.employeeId = employeeId;
        if (role) updateData.role = role;
        if (departmentId !== undefined) updateData.departmentId = departmentId || null;
        if (managerId !== undefined) updateData.managerId = managerId || null;
        if (dateOfJoining) updateData.dateOfJoining = new Date(dateOfJoining);

        // H1 fix: if password is provided, hash with bcrypt (12 rounds)
        // C3 fix: never store plainPassword
        if (password) {
            if (typeof password !== "string" || password.length < 8) {
                return error("WEAK_PASSWORD", "Password must be at least 8 characters", 400);
            }
            updateData.passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
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

        logger.info({ adminId: ctx.auth.sub, updatedUserId: id }, "Employee updated");
        return success(updatedUser);
    } catch (e: any) {
        if (e.code === 'P2002') {
            return error("CONFLICT", "A user with this email or employee ID already exists", 409);
        }
        logger.error({ err: e }, "Failed to update user"); // L1 fix: structured logger
        return error("INTERNAL_ERROR", "Failed to update user", 500);
    }
}

// DELETE: Soft delete (set status to INACTIVE)
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

    // M3 fix: validate UUID format
    if (!/^[0-9a-f-]{36}$/.test(userId)) {
        return error("VALIDATION_ERROR", "Invalid user ID format", 422);
    }

    try {
        const user = await prisma.user.findFirst({
            where: { id: userId, entityId: userEntityId },
        });

        if (!user) {
            return error("NOT_FOUND", "User not found or you don't have permission to delete them", 404);
        }

        const timestamp = Date.now();
        await prisma.user.update({
            where: { id: userId },
            data: {
                status: "INACTIVE",
                email: `${user.email}_deleted_${timestamp}`,
                employeeId: `${user.employeeId}_deleted_${timestamp}`,
            }
        });

        logger.info({ adminId: ctx.auth.sub, deletedUserId: userId }, "Employee soft-deleted");
        return success({ message: "User successfully removed" });
    } catch (e) {
        logger.error({ err: e }, "Failed to delete user"); // L1 fix: structured logger
        return error("INTERNAL_ERROR", "Failed to delete user", 500);
    }
}

export const GET = withRole("SADM", "HRA", "HRBP")(getUsers);
export const POST = withRole("SADM", "HRA", "HRBP")(createUser);
export const PATCH = withRole("SADM", "HRA", "HRBP")(updateUser);
export const DELETE = withRole("SADM", "HRA", "HRBP")(deleteUser);
