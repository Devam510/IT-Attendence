"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { apiGet } from "@/lib/api-client";

interface DashboardData {
    greeting?: string;
    checkedIn?: boolean;
    checkedOut?: boolean;
    checkInTime?: string;
    checkOutTime?: string;
    workingHours?: number;
    location?: string;
    pendingCount?: number;
    pendingItems?: Array<{ id: string; title: string; meta: string; priority?: string }>;
}

interface ManagerData {
    totalMembers?: number;
    present?: number;
    onLeave?: number;
    absent?: number;
    attendanceRate?: number;
    pendingApprovals?: number;
    overdueApprovals?: number;
    pendingLeaveRequests?: number;
    teamStatus?: Array<{
        id: string;
        fullName: string;
        employeeId: string;
        designation: string;
        status: "PRESENT" | "ON_LEAVE" | "ABSENT";
        checkInAt: string | null;
        checkOutAt: string | null;
        leaveType: string | null;
    }>;
    recentNotifications?: Array<{
        id: string;
        type: string;
        title: string;
        body: string;
        isRead: boolean;
        createdAt: string;
    }>;
}

function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "Just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

function AttendanceRing({ rate }: { rate: number }) {
    const r = 36;
    const circ = 2 * Math.PI * r;
    const filled = (rate / 100) * circ;
    return (
        <svg width="96" height="96" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
            <circle
                cx="48" cy="48" r={r} fill="none"
                stroke={rate >= 80 ? "#16a34a" : rate >= 60 ? "#f59e0b" : "#dc2626"}
                strokeWidth="8"
                strokeDasharray={`${filled} ${circ - filled}`}
                strokeLinecap="round"
                transform="rotate(-90 48 48)"
                style={{ transition: "stroke-dasharray 1s ease" }}
            />
            <text x="48" y="45" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--text-primary)">{rate}%</text>
            <text x="48" y="60" textAnchor="middle" fontSize="9" fill="var(--text-secondary)">Present</text>
        </svg>
    );
}

export default function DashboardPage() {
    const { user } = useAuth();
    const [data, setData] = useState<DashboardData & { checkInAt?: Date | null }>({});
    const [managerData, setManagerData] = useState<ManagerData>({});
    const [loading, setLoading] = useState(true);
    const [liveWorking, setLiveWorking] = useState<string>("0m");
    const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const isManager = user?.role === "MGR" || user?.role === "HRA" || user?.role === "SADM" || user?.role === "HRBP";
    const isAdmin = user?.role === "SADM";

    useEffect(() => {
        async function load() {
            if (isManager) {
                const res = await apiGet<any>("/api/dashboard/manager");
                if (res.data) {
                    const d = res.data;
                    setManagerData({
                        totalMembers: d.teamSummary?.totalMembers ?? 0,
                        present: d.teamSummary?.present ?? 0,
                        onLeave: d.teamSummary?.onLeave ?? 0,
                        absent: d.teamSummary?.absent ?? 0,
                        attendanceRate: d.teamSummary?.attendanceRate ?? 0,
                        pendingApprovals: d.approvals?.pending ?? 0,
                        overdueApprovals: d.approvals?.overdue ?? 0,
                        pendingLeaveRequests: d.approvals?.pendingLeaveRequests ?? 0,
                        teamStatus: d.teamStatus ?? [],
                        recentNotifications: d.notifications?.recent ?? [],
                    });
                }
            }
            if (!isAdmin) {
                const res = await apiGet<any>("/api/dashboard/employee");
                if (res.data) {
                    const d = res.data;
                    const todayInfo = d.today || {};
                    const todayStatus = todayInfo.status;
                    const checkedIn = todayStatus === "CHECKED_IN";
                    const checkedOut = todayStatus === "CHECKED_OUT";
                    const checkInAt = todayInfo.checkInAt ? new Date(todayInfo.checkInAt) : null;
                    const checkOutAt = todayInfo.checkOutAt ? new Date(todayInfo.checkOutAt) : null;
                    let workingHours = todayInfo.totalHours ?? 0;
                    if (workingHours === 0 && checkInAt && checkOutAt) {
                        workingHours = +((checkOutAt.getTime() - checkInAt.getTime()) / 3600000).toFixed(2);
                    }
                    setData({
                        checkedIn,
                        checkedOut,
                        checkInAt,
                        checkInTime: checkInAt ? checkInAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : undefined,
                        checkOutTime: checkOutAt ? checkOutAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : undefined,
                        workingHours,
                        location: d.user?.department || undefined,
                        pendingCount: d.pendingApprovals ?? 0,
                    });
                }
            }
            setLoading(false);
        }
        load();
    }, [isManager, isAdmin]);

    // Live working-time ticker
    useEffect(() => {
        if (tickerRef.current) clearInterval(tickerRef.current);
        if (data.checkedIn && data.checkInAt) {
            const tick = () => {
                const elapsedMs = Date.now() - (data.checkInAt as Date).getTime();
                const totalMins = Math.floor(elapsedMs / 60000);
                const h = Math.floor(totalMins / 60);
                const m = totalMins % 60;
                setLiveWorking(h > 0 ? `${h}h ${m}m` : `${m}m`);
            };
            tick();
            tickerRef.current = setInterval(tick, 1000);
        } else {
            setLiveWorking(data.workingHours ? `${data.workingHours.toFixed(1)}h` : "0m");
        }
        return () => { if (tickerRef.current) clearInterval(tickerRef.current); };
    }, [data.checkedIn, data.checkInAt, data.workingHours]);

    const now = new Date();
    const greetingText = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
    const dateText = now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    if (loading) {
        return (
            <div>
                <div className="skeleton skeleton-title" style={{ width: "40%", marginBottom: 24 }} />
                <div className="dash-stats">
                    {[1, 2, 3, 4].map(i => <div key={i} className="skeleton skeleton-card" style={{ height: 100 }} />)}
                </div>
                <div className="skeleton skeleton-card" style={{ marginBottom: 24, height: 200 }} />
            </div>
        );
    }

    // ── ADMIN DASHBOARD ─────────────────────────────────────
    if (isAdmin) {
        const statusColors: Record<string, string> = {
            PRESENT: "#16a34a",
            ON_LEAVE: "#f59e0b",
            ABSENT: "#dc2626",
        };
        const statusLabels: Record<string, string> = {
            PRESENT: "Present",
            ON_LEAVE: "On Leave",
            ABSENT: "Absent",
        };

        return (
            <div>
                {/* Header */}
                <div className="dash-greeting animate-fadeIn" style={{ marginBottom: "var(--space-6)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                        <div style={{
                            width: 42, height: 42, borderRadius: "var(--radius-full)",
                            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 20,
                        }}>🛡️</div>
                        <div>
                            <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)", lineHeight: 1.2 }}>
                                {greetingText}, {user?.fullName?.split(" ")[0] || "Admin"}
                            </h1>
                            <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>{dateText}</p>
                        </div>
                    </div>
                    <span style={{
                        background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                        color: "white", fontSize: "var(--text-xs)",
                        padding: "4px 12px", borderRadius: "var(--radius-full)",
                        fontWeight: "var(--font-semibold)", letterSpacing: "0.05em",
                    }}>SUPER ADMIN</span>
                </div>

                {/* KPI Cards row */}
                <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    gap: "var(--space-4)",
                    marginBottom: "var(--space-6)",
                }}>
                    {[
                        { label: "Total Employees", value: managerData.totalMembers ?? 0, icon: "👥", color: "#6366f1", bg: "#ede9fe" },
                        { label: "Present Today", value: managerData.present ?? 0, icon: "✅", color: "#16a34a", bg: "#dcfce7" },
                        { label: "On Leave", value: managerData.onLeave ?? 0, icon: "🏖️", color: "#f59e0b", bg: "#fef9c3" },
                        { label: "Absent", value: managerData.absent ?? 0, icon: "❌", color: "#dc2626", bg: "#fee2e2" },
                        { label: "Pending Approvals", value: managerData.pendingApprovals ?? 0, icon: "⏳", color: "#0ea5e9", bg: "#e0f2fe" },
                    ].map(({ label, value, icon, color, bg }) => (
                        <div key={label} className="dash-stat-card animate-slideUp" style={{
                            display: "flex", flexDirection: "column", gap: "var(--space-2)",
                            padding: "var(--space-4)", borderRadius: "var(--radius-xl)",
                        }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: "var(--radius-lg)",
                                background: bg, display: "flex", alignItems: "center",
                                justifyContent: "center", fontSize: 18,
                            }}>{icon}</div>
                            <div style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)", color }}>
                                {value}
                            </div>
                            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontWeight: "var(--font-medium)" }}>
                                {label}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Middle row: Attendance ring + Alerts + Quick actions */}
                <div style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    gap: "var(--space-4)",
                    marginBottom: "var(--space-6)",
                    alignItems: "start",
                }}>
                    {/* Attendance rate ring */}
                    <div className="dash-stat-card animate-slideUp" style={{
                        display: "flex", flexDirection: "column", alignItems: "center",
                        gap: "var(--space-2)", padding: "var(--space-5)",
                    }}>
                        <AttendanceRing rate={managerData.attendanceRate ?? 0} />
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontWeight: "var(--font-medium)" }}>
                            Attendance Rate
                        </div>
                    </div>

                    {/* Alerts / action items */}
                    <div className="dash-stat-card animate-slideUp" style={{ padding: "var(--space-5)" }}>
                        <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", marginBottom: "var(--space-3)", color: "var(--text-primary)" }}>
                            🔔 Action Items
                        </div>
                        {(managerData.pendingApprovals ?? 0) === 0 && (managerData.overdueApprovals ?? 0) === 0 && (managerData.pendingLeaveRequests ?? 0) === 0 ? (
                            <div style={{ color: "var(--text-tertiary)", fontSize: "var(--text-sm)", textAlign: "center", padding: "var(--space-4)" }}>
                                ✅ All clear — no pending actions
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                                {(managerData.overdueApprovals ?? 0) > 0 && (
                                    <Link href="/approvals" style={{ textDecoration: "none" }}>
                                        <div style={{
                                            display: "flex", alignItems: "center", gap: "var(--space-3)",
                                            padding: "var(--space-3)", borderRadius: "var(--radius-lg)",
                                            background: "#fee2e2", border: "1px solid #fca5a5",
                                        }}>
                                            <span style={{ fontSize: 18 }}>🚨</span>
                                            <div>
                                                <div style={{ fontWeight: "var(--font-semibold)", fontSize: "var(--text-sm)", color: "#991b1b" }}>
                                                    {managerData.overdueApprovals} Overdue Approvals
                                                </div>
                                                <div style={{ fontSize: "var(--text-xs)", color: "#b91c1c" }}>Past SLA deadline</div>
                                            </div>
                                        </div>
                                    </Link>
                                )}
                                {(managerData.pendingLeaveRequests ?? 0) > 0 && (
                                    <Link href="/approvals" style={{ textDecoration: "none" }}>
                                        <div style={{
                                            display: "flex", alignItems: "center", gap: "var(--space-3)",
                                            padding: "var(--space-3)", borderRadius: "var(--radius-lg)",
                                            background: "#fef9c3", border: "1px solid #fde68a",
                                        }}>
                                            <span style={{ fontSize: 18 }}>📋</span>
                                            <div>
                                                <div style={{ fontWeight: "var(--font-semibold)", fontSize: "var(--text-sm)", color: "#92400e" }}>
                                                    {managerData.pendingLeaveRequests} Leave Requests
                                                </div>
                                                <div style={{ fontSize: "var(--text-xs)", color: "#b45309" }}>Awaiting your approval</div>
                                            </div>
                                        </div>
                                    </Link>
                                )}
                                {(managerData.pendingApprovals ?? 0) > 0 && (
                                    <Link href="/approvals" style={{ textDecoration: "none" }}>
                                        <div style={{
                                            display: "flex", alignItems: "center", gap: "var(--space-3)",
                                            padding: "var(--space-3)", borderRadius: "var(--radius-lg)",
                                            background: "#e0f2fe", border: "1px solid #7dd3fc",
                                        }}>
                                            <span style={{ fontSize: 18 }}>⏳</span>
                                            <div>
                                                <div style={{ fontWeight: "var(--font-semibold)", fontSize: "var(--text-sm)", color: "#075985" }}>
                                                    {managerData.pendingApprovals} Pending Approvals
                                                </div>
                                                <div style={{ fontSize: "var(--text-xs)", color: "#0369a1" }}>Requires action</div>
                                            </div>
                                        </div>
                                    </Link>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Admin quick actions */}
                    <div className="dash-stat-card animate-slideUp" style={{ padding: "var(--space-5)", minWidth: 160 }}>
                        <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", marginBottom: "var(--space-3)", color: "var(--text-primary)" }}>
                            ⚡ Admin Tools
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                            {[
                                { href: "/team-attendance", icon: "📅", label: "Team Attendance" },
                                { href: "/approvals", icon: "✅", label: "Approvals" },
                                { href: "/tasks", icon: "📋", label: "Tasks" },
                                { href: "/audit-logs", icon: "🗂️", label: "Audit Logs" },
                                { href: "/system-health", icon: "💚", label: "System Health" },
                                { href: "/security", icon: "🔒", label: "Security" },
                            ].map(({ href, icon, label }) => (
                                <Link key={href} href={href} style={{ textDecoration: "none" }}>
                                    <div style={{
                                        display: "flex", alignItems: "center", gap: "var(--space-2)",
                                        padding: "6px var(--space-3)", borderRadius: "var(--radius-md)",
                                        fontSize: "var(--text-sm)", color: "var(--text-secondary)",
                                        transition: "all 0.15s",
                                        cursor: "pointer",
                                    }}
                                        onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-secondary)")}
                                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                    >
                                        <span>{icon}</span>
                                        <span>{label}</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Team status table */}
                {(managerData.teamStatus?.length ?? 0) > 0 && (
                    <div className="dash-stat-card animate-slideUp" style={{ padding: "var(--space-5)", marginBottom: "var(--space-6)" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
                            <div style={{ fontWeight: "var(--font-semibold)", fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>
                                👥 Today's Team Status
                            </div>
                            <Link href="/team-attendance" style={{
                                fontSize: "var(--text-xs)", color: "var(--accent-primary)", textDecoration: "none",
                                fontWeight: "var(--font-medium)",
                            }}>
                                View all →
                            </Link>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                            {(managerData.teamStatus ?? []).slice(0, 6).map(member => (
                                <div key={member.id} style={{
                                    display: "flex", alignItems: "center", justifyContent: "space-between",
                                    padding: "var(--space-3) var(--space-3)",
                                    borderRadius: "var(--radius-lg)",
                                    background: "var(--surface-secondary)",
                                }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                                        <div style={{
                                            width: 32, height: 32, borderRadius: "var(--radius-full)",
                                            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            color: "white", fontSize: "var(--text-sm)", fontWeight: "var(--font-bold)",
                                        }}>
                                            {member.fullName.charAt(0)}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)", color: "var(--text-primary)" }}>
                                                {member.fullName}
                                            </div>
                                            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>
                                                {member.designation || member.employeeId}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                                        {member.status === "PRESENT" && member.checkInAt && (
                                            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>
                                                {new Date(member.checkInAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                                            </span>
                                        )}
                                        {member.status === "ON_LEAVE" && member.leaveType && (
                                            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>{member.leaveType}</span>
                                        )}
                                        <span style={{
                                            padding: "2px 10px", borderRadius: "var(--radius-full)",
                                            fontSize: "var(--text-xs)", fontWeight: "var(--font-semibold)",
                                            background: member.status === "PRESENT" ? "#dcfce7"
                                                : member.status === "ON_LEAVE" ? "#fef9c3" : "#fee2e2",
                                            color: statusColors[member.status],
                                        }}>
                                            {statusLabels[member.status]}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Recent Activity */}
                {(managerData.recentNotifications?.length ?? 0) > 0 && (
                    <div className="dash-stat-card animate-slideUp" style={{ padding: "var(--space-5)" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
                            <div style={{ fontWeight: "var(--font-semibold)", fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>
                                🕐 Recent Activity
                            </div>
                            <Link href="/notifications" style={{
                                fontSize: "var(--text-xs)", color: "var(--accent-primary)", textDecoration: "none",
                                fontWeight: "var(--font-medium)",
                            }}>
                                View all →
                            </Link>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                            {(managerData.recentNotifications ?? []).map(n => (
                                <div key={n.id} style={{
                                    display: "flex", alignItems: "flex-start", gap: "var(--space-3)",
                                    padding: "var(--space-3)", borderRadius: "var(--radius-lg)",
                                    background: n.isRead ? "transparent" : "var(--surface-secondary)",
                                    borderLeft: n.isRead ? "none" : "3px solid var(--accent-primary)",
                                }}>
                                    <span style={{ fontSize: 16, marginTop: 2 }}>
                                        {n.type === "task" ? "📋" : n.type === "approval" ? "✅" : "🔔"}
                                    </span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)", color: "var(--text-primary)" }}>
                                            {n.title}
                                        </div>
                                        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {n.body}
                                        </div>
                                    </div>
                                    <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                                        {timeAgo(n.createdAt)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ── EMPLOYEE / MANAGER / HR DASHBOARD ──────────────────
    return (
        <div>
            {/* Greeting */}
            <div className="dash-greeting animate-fadeIn">
                <h1>{greetingText}, {user?.fullName?.split(" ")[0] || "there"}</h1>
                <p>{dateText}</p>
            </div>

            {/* Manager Stats */}
            {isManager && (
                <div className="dash-stats animate-slideUp">
                    <div className="dash-stat-card">
                        <div className="dash-stat-icon green">✅</div>
                        <div>
                            <div className="dash-stat-value">{managerData.present ?? 0}</div>
                            <div className="dash-stat-label">Present</div>
                        </div>
                    </div>
                    <div className="dash-stat-card">
                        <div className="dash-stat-icon orange">🏖️</div>
                        <div>
                            <div className="dash-stat-value">{managerData.onLeave ?? 0}</div>
                            <div className="dash-stat-label">On Leave</div>
                        </div>
                    </div>
                    <div className="dash-stat-card">
                        <div className="dash-stat-icon red">❌</div>
                        <div>
                            <div className="dash-stat-value">{managerData.absent ?? 0}</div>
                            <div className="dash-stat-label">Absent</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Check-In Status Card — hidden for SADM */}
            {!isAdmin && (
                <div className="dash-checkin-card animate-slideUp"
                    style={{
                        background: data.checkedOut
                            ? "linear-gradient(135deg, #0f766e, #0d9488)"
                            : data.checkedIn
                                ? "linear-gradient(135deg, #15803d, #16a34a)"
                                : "linear-gradient(135deg, #1d4ed8, #2563eb)",
                    }}
                >
                    <div className="dash-checkin-status">
                        {data.checkedOut ? "✅ DAY COMPLETE" : data.checkedIn ? "🟢 CHECKED IN" : "⬜ NOT CHECKED IN"}
                    </div>
                    <div className="dash-checkin-time">
                        {data.checkedOut
                            ? `${data.checkInTime || "--:--"} → ${data.checkOutTime || "--:--"}`
                            : data.checkedIn
                                ? `Since ${data.checkInTime || "--:--"}`
                                : new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })
                        }
                    </div>
                    <div className="dash-checkin-location">
                        {data.checkedOut
                            ? `Total: ${data.workingHours && data.workingHours > 0 ? `${(data.workingHours * 60).toFixed(0)} min (${data.workingHours.toFixed(2)}h)` : "—"}`
                            : data.checkedIn
                                ? `Working: ${liveWorking}`
                                : "Tap below to check in"}
                    </div>
                    {!data.checkedOut && (
                        <Link
                            href="/attendance"
                            className="btn btn-primary"
                            style={{ background: "rgba(255,255,255,0.2)", color: "white", borderColor: "rgba(255,255,255,0.3)" }}
                        >
                            {data.checkedIn ? "View Attendance" : "Check In Now"}
                        </Link>
                    )}
                    {data.checkedOut && (
                        <Link
                            href="/attendance"
                            className="btn btn-primary"
                            style={{ background: "rgba(255,255,255,0.15)", color: "white", borderColor: "rgba(255,255,255,0.3)" }}
                        >
                            View Details
                        </Link>
                    )}
                </div>
            )}

            {/* Quick Actions */}
            <div className="dash-quick-actions animate-slideUp" style={{ animationDelay: "100ms" }}>
                <Link href="/leaves/apply" className="dash-quick-action">
                    <span className="dash-quick-action-icon">🗓️</span>
                    <span className="dash-quick-action-label">Apply Leave</span>
                </Link>
                <Link href="/approvals" className="dash-quick-action">
                    <span className="dash-quick-action-icon">✅</span>
                    <span className="dash-quick-action-label">Approvals</span>
                </Link>
                <Link href="/attendance" className="dash-quick-action">
                    <span className="dash-quick-action-icon">⏱️</span>
                    <span className="dash-quick-action-label">Attendance</span>
                </Link>
                <Link href="/profile" className="dash-quick-action">
                    <span className="dash-quick-action-icon">👤</span>
                    <span className="dash-quick-action-label">Profile</span>
                </Link>
            </div>

            {/* Pending Items */}
            <div className="dash-section animate-slideUp" style={{ animationDelay: "200ms" }}>
                <div className="dash-section-header">
                    <h2 className="dash-section-title">
                        Pending ({data.pendingItems?.length || 0})
                    </h2>
                </div>
                {data.pendingItems && data.pendingItems.length > 0 ? (
                    data.pendingItems.map(item => (
                        <div key={item.id} className="dash-pending-item">
                            <div className="dash-pending-info">
                                <div className="dash-pending-title">{item.title}</div>
                                <div className="dash-pending-meta">{item.meta}</div>
                            </div>
                            {item.priority && (
                                <span className={`badge badge-${item.priority === "high" ? "danger" : "warning"}`}>
                                    {item.priority}
                                </span>
                            )}
                        </div>
                    ))
                ) : (
                    <div className="dash-pending-item" style={{ justifyContent: "center", color: "var(--text-tertiary)" }}>
                        All caught up! No pending items 🎉
                    </div>
                )}
            </div>
        </div>
    );
}
