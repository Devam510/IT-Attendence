// Vibe Tech Labs — GET /api/attendance/export-advanced
// Generates a comprehensive CSV for a date range, with optional filtering and statistics.
// Accessible by MGR, HRA, HRBP, SADM

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vibetech/db";
import { withAuth } from "@/lib/auth";
import { error } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

function formatTime(isoStr: Date | null): string {
    if (!isoStr) return "";
    try {
        return isoStr.toLocaleTimeString("en-US", {
            hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
        });
    } catch {
        return "";
    }
}

function totalBreakSecs(anomalyFlags: any): number {
    if (!anomalyFlags || typeof anomalyFlags !== "object") return 0;
    const breaks = (anomalyFlags as Record<string, any>).breaks;
    if (!Array.isArray(breaks)) return 0;

    return breaks.reduce((sum, b) => {
        if (!b.start || !b.end) return sum;
        return sum + Math.floor((new Date(b.end).getTime() - new Date(b.start).getTime()) / 1000);
    }, 0);
}

async function handleExportAdvanced(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    if (auth.role === "EMP") {
        return error("FORBIDDEN", "Only managers and admins can export team data.", 403);
    }

    const { searchParams } = new URL(req.url);
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");
    const empId = searchParams.get("empId");
    const deptId = searchParams.get("deptId");
    const roleId = searchParams.get("role");
    const statusFilter = searchParams.get("statusFilter") || "all"; // "all" | "PRESENT" | "ABSENT" | "ON_LEAVE"
    const includeStats = searchParams.get("stats") === "true";

    const istOffsetMs = 5.5 * 60 * 60 * 1000;

    // Parse Dates
    if (!startParam || !endParam || !/^\d{4}-\d{2}-\d{2}$/.test(startParam) || !/^\d{4}-\d{2}-\d{2}$/.test(endParam)) {
        return error("BAD_REQUEST", "Start and end dates are required in YYYY-MM-DD format.", 400);
    }

    const pStart = startParam.split("-").map(Number);
    const dayStart = new Date(Date.UTC(pStart[0] ?? 2026, (pStart[1] ?? 1) - 1, pStart[2] ?? 1) - istOffsetMs);

    const pEnd = endParam.split("-").map(Number);
    const dayEnd = new Date(Date.UTC(pEnd[0] ?? 2026, (pEnd[1] ?? 1) - 1, pEnd[2] ?? 1) - istOffsetMs + 24 * 60 * 60 * 1000); // end of that day

    // For PostgreSQL DATE columns, we must compare against absolute 00:00:00Z 
    const queryStartDateUtc = new Date(`${startParam}T00:00:00Z`);
    const queryEndDateUtc = new Date(`${endParam}T00:00:00Z`);

    // Base scoping logic
    const isHraOrAdmin = auth.role === "HRA" || auth.role === "SADM" || auth.role === "HRBP";

    let userWhere: any = isHraOrAdmin
        ? { entityId: auth.entityId, status: "ACTIVE" }
        : { managerId: auth.sub, status: "ACTIVE" };

    // Apply Filters
    if (empId && empId !== "all") userWhere.id = empId;
    if (deptId && deptId !== "all") userWhere.departmentId = deptId;
    if (roleId && roleId !== "all") {
        // Only allow filtering out SADM if not one yourself, but simpler: just apply it
        userWhere.role = roleId;
    } else if (isHraOrAdmin) {
        // Exclude super admins from general entity-wide pulls unless searching for SADM
        userWhere.role = { notIn: ["SADM"] };
    }

    // 1. Fetch Users
    const users = await prisma.user.findMany({
        where: userWhere,
        select: {
            id: true,
            fullName: true,
            employeeId: true,
            designation: true,
            department: { select: { name: true } },
        },
        orderBy: { fullName: "asc" },
    });

    if (users.length === 0) {
        return new NextResponse("No users found matching the given criteria.", {
            status: 404,
            headers: { "Content-Type": "text/plain" }
        });
    }

    const userIds = users.map(u => u.id);

    // 2. Fetch Attendance + Leaves within range for those users
    const [attendanceRows, leaveRows] = await Promise.all([
        prisma.attendanceRecord.findMany({
            where: {
                userId: { in: userIds },
                checkInAt: { gte: dayStart, lt: dayEnd }
            },
            select: {
                userId: true,
                status: true,
                checkInAt: true,
                checkOutAt: true,
                totalHours: true,
                verificationScore: true,
                anomalyFlags: true,
            },
            orderBy: { checkInAt: "asc" }
        }),
        prisma.leaveRequest.findMany({
            where: {
                userId: { in: userIds },
                status: "APPROVED",
                startDate: { lte: queryEndDateUtc },
                endDate: { gte: queryStartDateUtc },
            },
            select: {
                userId: true,
                startDate: true,
                endDate: true,
                leaveType: { select: { name: true } }
            }
        })
    ]);

    // Build fast lookups
    const userMap = new Map(users.map(u => [u.id, u]));

    // We group attendance by user and day. 
    // Format for day string: YYYY-MM-DD
    const buildDayKey = (d: Date) => {
        const ist = new Date(d.getTime() + istOffsetMs);
        return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}-${String(ist.getUTCDate()).padStart(2, "0")}`;
    };

    // Calculate total days required
    const totalMs = dayEnd.getTime() - dayStart.getTime();
    const daysRequested = Math.ceil(totalMs / (24 * 3600 * 1000));

    // Summary structures
    type Stats = { present: number, absent: number, leave: number, totalHours: number, breaksSecs: number };
    const statsMap = new Map<string, Stats>();
    users.forEach(u => statsMap.set(u.id, { present: 0, absent: 0, leave: 0, totalHours: 0, breaksSecs: 0 }));

    // CSV Output lines
    const csvRows: string[][] = [];
    csvRows.push([
        "Employee Name", "Employee ID", "Department", "Designation",
        "Date", "Status", "Check In", "Check Out", "Total Hours",
        "Breaks (Mins)", "Remarks"
    ]);

    // Go sequentially day by day to structure output gracefully
    for (const u of users) {
        // Prebuild dates for this user
        const uAtt = attendanceRows.filter(a => a.userId === u.id);
        const uLeave = leaveRows.filter(l => l.userId === u.id);
        const userStats = statsMap.get(u.id)!;

        for (let i = 0; i < daysRequested; i++) {
            const currentDayDate = new Date(dayStart.getTime() + i * 24 * 3600 * 1000);
            const currentDayStr = buildDayKey(currentDayDate);

            // Check if on leave
            const onLeave = uLeave.find(l => {
                // Adjust leave start/end to be inclusive for full day overlaps
                const lStart = new Date(l.startDate);
                const lEnd = new Date(l.endDate);
                return currentDayDate >= lStart && currentDayDate <= lEnd;
            });

            // Check if present
            const att = uAtt.find(a => a.checkInAt && buildDayKey(a.checkInAt) === currentDayStr);

            let status = "ABSENT";
            let checkIn = "";
            let checkOut = "";
            let hours = "";
            let breaksMins = "";
            let remark = "";

            if (onLeave) {
                status = "ON LEAVE";
                remark = onLeave.leaveType.name;
                userStats.leave++;
            } else if (att && att.checkInAt) {
                status = "PRESENT";
                checkIn = formatTime(att.checkInAt);
                checkOut = formatTime(att.checkOutAt);

                let wHours = att.totalHours;
                if (!wHours && att.checkOutAt) {
                    wHours = (att.checkOutAt.getTime() - att.checkInAt.getTime()) / 3600000;
                }
                hours = wHours ? wHours.toFixed(2) : "";

                if (wHours) userStats.totalHours += wHours;

                const flags: any = att.anomalyFlags || {};
                if (flags.isHalfDay) {
                    status = "HALF DAY";
                    remark = flags.earlyReason ? `Early Checkout: ${flags.earlyReason}` : "Half day mark";
                }

                const bSecs = totalBreakSecs(flags);
                if (bSecs > 0) {
                    breaksMins = (bSecs / 60).toFixed(0);
                    userStats.breaksSecs += bSecs;
                }

                userStats.present++;
            } else {
                userStats.absent++;
            }

            // Apply status filter — skip rows that don't match the requested status
            const normalizedStatus = status.replace(" ", "_"); // "ON LEAVE" -> "ON_LEAVE"
            if (statusFilter !== "all" && normalizedStatus !== statusFilter) continue;

            csvRows.push([
                u.fullName,
                u.employeeId,
                u.department?.name || "N/A",
                u.designation || "N/A",
                currentDayStr,
                status,
                checkIn,
                checkOut,
                hours,
                breaksMins,
                remark
            ]);
        }
    }

    if (includeStats) {
        csvRows.push([]); // blank line
        csvRows.push(["--- STATISTICS SUMMARY ---"]);
        csvRows.push(["Employee Name", "Employee ID", "Days Present", "Days Absent", "Days on Leave", "Total Worked Hours", "Total Break Hours"]);

        for (const u of users) {
            const st = statsMap.get(u.id)!;
            csvRows.push([
                u.fullName,
                u.employeeId,
                String(st.present),
                String(st.absent),
                String(st.leave),
                st.totalHours.toFixed(2),
                (st.breaksSecs / 3600).toFixed(2)
            ]);
        }
    }

    // Convert string arrays to CSV
    const csvContent = csvRows
        .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
        .join("\n");

    return new NextResponse(csvContent, {
        status: 200,
        headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="attendance-export-${startParam}-to-${endParam}.csv"`,
        },
    });
}

export const GET = withAuth(handleExportAdvanced);
