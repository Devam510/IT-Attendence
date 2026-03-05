// Vibe Tech Labs — Database Seed Script
// Creates test data: entity, departments, locations, shifts, users, leave types, balances

import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const prisma = new PrismaClient();

// Simple password hasher (matches auth flow)
function hashPassword(password: string): string {
    return createHash("sha256").update(password).digest("hex");
}

async function main() {
    console.log("🌱 Seeding NEXUS database...\n");

    // Clean existing data (in FK-safe order)
    console.log("🧹 Clearing existing data...");
    await prisma.auditEvent.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.approvalWorkflow.deleteMany();
    await prisma.leaveRequest.deleteMany();
    await prisma.leaveBalance.deleteMany();
    await prisma.attendanceRecord.deleteMany();
    await prisma.device.deleteMany();
    await prisma.user.deleteMany();
    await prisma.leaveType.deleteMany();
    await prisma.shift.deleteMany();
    await prisma.department.deleteMany();
    await prisma.location.deleteMany();
    await prisma.entity.deleteMany();
    console.log("✅ Database cleared\n");

    // ─── 1. Entity (Organization) ───────────────────────
    const entity = await prisma.entity.upsert({
        where: { code: "NEXUS-IN" },
        update: {},
        create: {
            name: "Nexus Technologies India",
            code: "NEXUS-IN",
            country: "India",
            timezone: "Asia/Kolkata",
        },
    });
    console.log("✅ Entity:", entity.name);

    // ─── 2. Location ────────────────────────────────────
    const location = await prisma.location.create({
        data: {
            name: "Vibe Tech Labs",
            address: "Maradia Plaza, B-913, Chimanlal Girdharlal Rd, Ellisbridge, Ahmedabad, Gujarat 380006",
            latitude: 23.026127,
            longitude: 72.557264,
            radiusM: 100,
            wifiBssids: ["AA:BB:CC:DD:EE:01", "AA:BB:CC:DD:EE:02"],
            entityId: entity.id,
        },
    });
    console.log("✅ Location:", location.name);

    // ─── 3. Departments ─────────────────────────────────
    const engineering = await prisma.department.create({
        data: { name: "Vibe Tech Labs", entityId: entity.id },
    });
    const hr = await prisma.department.create({
        data: { name: "Human Resources", entityId: entity.id },
    });
    const product = await prisma.department.create({
        data: { name: "Product", entityId: entity.id },
    });
    console.log("✅ Departments: Engineering, HR, Product");

    // ─── 4. Shift ───────────────────────────────────────
    const shift = await prisma.shift.create({
        data: {
            name: "General Shift",
            startTime: "09:00",
            endTime: "18:00",
            graceMinutes: 15,
            entityId: entity.id,
        },
    });
    console.log("✅ Shift:", shift.name);

    // ─── 5. Users ───────────────────────────────────────
    const password = hashPassword("Nexus@123");

    const admin = await prisma.user.create({
        data: {
            employeeId: "NX-001",
            email: "admin@nexus.dev",
            fullName: "Arjun Mehta",
            role: "SADM",
            departmentId: hr.id,
            designation: "System Administrator",
            entityId: entity.id,
            locationId: location.id,
            passwordHash: password,
            dateOfJoining: new Date("2024-01-01"),
        },
    });

    const hrManager = await prisma.user.create({
        data: {
            employeeId: "NX-002",
            email: "priya@nexus.dev",
            fullName: "Priya Sharma",
            role: "HRA",
            departmentId: hr.id,
            designation: "HR Manager",
            entityId: entity.id,
            locationId: location.id,
            passwordHash: password,
            dateOfJoining: new Date("2024-02-15"),
        },
    });

    const manager = await prisma.user.create({
        data: {
            employeeId: "NX-003",
            email: "rahul@nexus.dev",
            fullName: "Rahul Verma",
            role: "MGR",
            departmentId: engineering.id,
            designation: "Engineering Manager",
            entityId: entity.id,
            locationId: location.id,
            passwordHash: password,
            dateOfJoining: new Date("2024-03-01"),
        },
    });

    const emp1 = await prisma.user.create({
        data: {
            employeeId: "NX-004",
            email: "neha@nexus.dev",
            fullName: "Neha Gupta",
            role: "EMP",
            departmentId: engineering.id,
            designation: "Senior Developer",
            managerId: manager.id,
            entityId: entity.id,
            locationId: location.id,
            passwordHash: password,
            dateOfJoining: new Date("2024-04-01"),
        },
    });

    const emp2 = await prisma.user.create({
        data: {
            employeeId: "NX-005",
            email: "amit@nexus.dev",
            fullName: "Amit Patel",
            role: "EMP",
            departmentId: engineering.id,
            designation: "Full Stack Developer",
            managerId: manager.id,
            entityId: entity.id,
            locationId: location.id,
            passwordHash: password,
            dateOfJoining: new Date("2024-05-15"),
        },
    });

    const emp3 = await prisma.user.create({
        data: {
            employeeId: "NX-006",
            email: "sara@nexus.dev",
            fullName: "Sara Khan",
            role: "EMP",
            departmentId: product.id,
            designation: "Product Designer",
            managerId: manager.id,
            entityId: entity.id,
            locationId: location.id,
            passwordHash: password,
            dateOfJoining: new Date("2024-06-01"),
        },
    });

    // Update department heads
    await prisma.department.update({ where: { id: engineering.id }, data: { headId: manager.id } });
    await prisma.department.update({ where: { id: hr.id }, data: { headId: hrManager.id } });

    console.log("✅ Users: 6 created (admin, HR, manager, 3 employees)");

    // ─── 6. Leave Types ─────────────────────────────────
    const casualLeave = await prisma.leaveType.create({
        data: { name: "Casual Leave", code: "CL", defaultBalance: 12, accrualType: "MONTHLY", carryForwardMax: 5, entityId: entity.id },
    });
    const sickLeave = await prisma.leaveType.create({
        data: { name: "Sick Leave", code: "SL", defaultBalance: 10, accrualType: "YEARLY", entityId: entity.id },
    });
    const earnedLeave = await prisma.leaveType.create({
        data: { name: "Earned Leave", code: "EL", defaultBalance: 15, accrualType: "MONTHLY", carryForwardMax: 30, entityId: entity.id },
    });
    console.log("✅ Leave Types: CL (12), SL (10), EL (15)");

    // ─── 7. Leave Balances (2026) ───────────────────────
    const employees = [admin, hrManager, manager, emp1, emp2, emp3];
    const leaveTypes = [
        { type: casualLeave, opening: 12 },
        { type: sickLeave, opening: 10 },
        { type: earnedLeave, opening: 15 },
    ];

    for (const emp of employees) {
        for (const lt of leaveTypes) {
            await prisma.leaveBalance.create({
                data: {
                    userId: emp.id,
                    leaveTypeId: lt.type.id,
                    year: 2026,
                    opening: lt.opening,
                    accrued: 0,
                    used: 0,
                    pending: 0,
                    closing: lt.opening,
                },
            });
        }
    }
    console.log("✅ Leave Balances: 18 records (6 users × 3 types)");

    // No sample attendance data — only real check-ins will be shown
    console.log("✅ Attendance: No seed data (real check-ins only)");

    // ─── Summary ────────────────────────────────────────
    console.log("\n" + "═".repeat(50));
    console.log("🎉 NEXUS database seeded successfully!\n");
    console.log("📋 Test Accounts (all passwords: Nexus@123):\n");
    console.log("   Role       Email              Name");
    console.log("   ─────────  ─────────────────  ──────────────");
    console.log("   SADM       admin@nexus.dev     Arjun Mehta");
    console.log("   HRA        priya@nexus.dev     Priya Sharma");
    console.log("   MGR        rahul@nexus.dev     Rahul Verma");
    console.log("   EMP        neha@nexus.dev      Neha Gupta");
    console.log("   EMP        amit@nexus.dev      Amit Patel");
    console.log("   EMP        sara@nexus.dev      Sara Khan");
    console.log("\n" + "═".repeat(50));
}

main()
    .catch((e) => {
        console.error("❌ Seed failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
