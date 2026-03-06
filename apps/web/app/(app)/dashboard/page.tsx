"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { apiGet } from "@/lib/api-client";

/* ─── Types ──────────────────────────────────────────────────── */
interface DashboardData {
    checkedIn?: boolean;
    checkedOut?: boolean;
    checkInTime?: string;
    checkOutTime?: string;
    workingHours?: number;
    checkInAt?: Date | null;
    pendingItems?: Array<{ id: string; title: string; meta: string; priority?: string }>;
}

interface TeamMember {
    id: string;
    fullName: string;
    employeeId: string;
    designation: string;
    status: "PRESENT" | "ON_LEAVE" | "ABSENT";
    checkInAt: string | null;
    checkOutAt: string | null;
    leaveType: string | null;
}

interface RecentNotif {
    id: string;
    type: string;
    title: string;
    body: string;
    isRead: boolean;
    createdAt: string;
}

interface ManagerData {
    totalMembers: number;
    present: number;
    onLeave: number;
    absent: number;
    attendanceRate: number;
    pendingApprovals: number;
    overdueApprovals: number;
    pendingLeaveRequests: number;
    teamStatus: TeamMember[];
    recentNotifications: RecentNotif[];
}

/* ─── Helpers ────────────────────────────────────────────────── */
function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "Just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

function fmt(iso: string) {
    return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

const STATUS_COLOR = { PRESENT: "#16a34a", ON_LEAVE: "#d97706", ABSENT: "#dc2626" } as const;
const STATUS_BG = { PRESENT: "#dcfce7", ON_LEAVE: "#fef3c7", ABSENT: "#fee2e2" } as const;
const STATUS_LABEL = { PRESENT: "Present", ON_LEAVE: "On Leave", ABSENT: "Absent" } as const;

/* ─── Admin Dashboard ────────────────────────────────────────── */
function AdminDashboard({ user, md }: { user: any; md: ManagerData }) {
    const now = new Date();
    const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
    const dateStr = now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const firstName = user?.fullName?.split(" ")[0] ?? "Admin";

    const attendPct = md.attendanceRate;
    const attendColor = attendPct >= 80 ? "#16a34a" : attendPct >= 60 ? "#d97706" : "#dc2626";

    const kpis = [
        { label: "Total Employees", value: md.totalMembers, icon: "👥", accent: "#6366f1", bg: "#eef2ff" },
        { label: "Present Today", value: md.present, icon: "✅", accent: "#16a34a", bg: "#dcfce7" },
        { label: "On Leave", value: md.onLeave, icon: "🏖️", accent: "#d97706", bg: "#fef3c7" },
        { label: "Absent", value: md.absent, icon: "❌", accent: "#dc2626", bg: "#fee2e2" },
        { label: "Pending Approvals", value: md.pendingApprovals, icon: "⏳", accent: "#0ea5e9", bg: "#e0f2fe" },
    ];

    const adminLinks = [
        { href: "/team-attendance", icon: "📅", label: "Team Attendance", badge: md.present + "/" + md.totalMembers },
        { href: "/approvals", icon: "✅", label: "Approvals", badge: md.pendingApprovals > 0 ? String(md.pendingApprovals) : undefined },
        { href: "/tasks", icon: "📋", label: "Tasks", badge: undefined },
        { href: "/audit-logs", icon: "🗂️", label: "Audit Logs", badge: undefined },
        { href: "/system-health", icon: "💚", label: "System Health", badge: undefined },
        { href: "/security", icon: "🔒", label: "Security", badge: undefined },
    ];

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)" }}>

            {/* ── Header ─────────────────────────────────────────── */}
            <div className="animate-fadeIn" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-3)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
                    <div style={{
                        width: 50, height: 50, borderRadius: "var(--radius-xl)",
                        background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0,
                        boxShadow: "0 4px 12px rgba(99,102,241,.35)",
                    }}>🛡️</div>
                    <div>
                        <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)", lineHeight: 1.2, margin: 0 }}>
                            {greeting}, {firstName}
                        </h1>
                        <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "var(--text-sm)", marginTop: 2 }}>
                            {dateStr}
                        </p>
                    </div>
                </div>
                <span style={{
                    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
                    color: "white", fontSize: "var(--text-xs)", padding: "5px 14px",
                    borderRadius: "var(--radius-full)", fontWeight: "var(--font-bold)",
                    letterSpacing: "0.08em", alignSelf: "center",
                    boxShadow: "0 2px 8px rgba(99,102,241,.3)",
                }}>SUPER ADMIN</span>
            </div>

            {/* ── KPI Cards ──────────────────────────────────────── */}
            <div className="animate-slideUp" style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: "var(--space-4)",
            }}>
                {kpis.map(({ label, value, icon, accent, bg }) => (
                    <div key={label} style={{
                        background: "var(--surface-primary)",
                        borderRadius: "var(--radius-xl)",
                        border: "1px solid var(--border)",
                        padding: "var(--space-5)",
                        display: "flex", flexDirection: "column", gap: "var(--space-3)",
                        boxShadow: "var(--shadow-sm)",
                        transition: "box-shadow 0.2s",
                    }}
                        onMouseEnter={e => (e.currentTarget.style.boxShadow = "var(--shadow-md)")}
                        onMouseLeave={e => (e.currentTarget.style.boxShadow = "var(--shadow-sm)")}
                    >
                        <div style={{
                            width: 40, height: 40, borderRadius: "var(--radius-lg)",
                            background: bg, display: "flex", alignItems: "center",
                            justifyContent: "center", fontSize: 20,
                        }}>{icon}</div>
                        <div style={{ fontSize: "var(--text-3xl)", fontWeight: "var(--font-bold)", color: accent, lineHeight: 1 }}>
                            {value}
                        </div>
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontWeight: "var(--font-medium)" }}>
                            {label}
                            {label === "Present Today" && md.totalMembers > 0 && (
                                <div style={{ marginTop: 6, height: 4, borderRadius: 99, background: "var(--border)", overflow: "hidden" }}>
                                    <div style={{
                                        height: "100%", borderRadius: 99,
                                        background: attendColor,
                                        width: `${attendPct}%`,
                                        transition: "width 1s ease",
                                    }} />
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Main 2-col layout ──────────────────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: "var(--space-5)", alignItems: "start" }}>

                {/* Left — Team Status + Recent Activity */}
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-5)" }}>

                    {/* Team Status */}
                    <div className="animate-slideUp" style={{
                        background: "var(--surface-primary)", borderRadius: "var(--radius-xl)",
                        border: "1px solid var(--border)", overflow: "hidden", boxShadow: "var(--shadow-sm)",
                    }}>
                        <div style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "var(--space-4) var(--space-5)",
                            borderBottom: "1px solid var(--border)",
                            background: "var(--surface-secondary)",
                        }}>
                            <div style={{ fontWeight: "var(--font-semibold)", fontSize: "var(--text-sm)", display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                                👥 <span>Today's Team Status</span>
                            </div>
                            <Link href="/team-attendance" style={{ fontSize: "var(--text-xs)", color: "var(--accent-primary)", textDecoration: "none", fontWeight: "var(--font-medium)" }}>
                                View all →
                            </Link>
                        </div>
                        <div>
                            {md.teamStatus.length === 0 ? (
                                <div style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--text-tertiary)", fontSize: "var(--text-sm)" }}>
                                    No team members found
                                </div>
                            ) : md.teamStatus.map((m, i) => (
                                <div key={m.id} style={{
                                    display: "flex", alignItems: "center", justifyContent: "space-between",
                                    padding: "var(--space-3) var(--space-5)",
                                    borderBottom: i < md.teamStatus.length - 1 ? "1px solid var(--border)" : "none",
                                    transition: "background 0.15s",
                                }}
                                    onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-secondary)")}
                                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                >
                                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                                        <div style={{
                                            width: 36, height: 36, borderRadius: "var(--radius-full)",
                                            background: `linear-gradient(135deg, ${STATUS_COLOR[m.status]}88, ${STATUS_COLOR[m.status]})`,
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            color: "white", fontSize: "var(--text-sm)", fontWeight: "var(--font-bold)", flexShrink: 0,
                                        }}>
                                            {m.fullName.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", color: "var(--text-primary)" }}>
                                                {m.fullName}
                                            </div>
                                            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>
                                                {m.designation || m.employeeId}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                                        {m.status === "PRESENT" && m.checkInAt && (
                                            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>
                                                In {fmt(m.checkInAt)}
                                            </span>
                                        )}
                                        {m.status === "ON_LEAVE" && m.leaveType && (
                                            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>
                                                {m.leaveType}
                                            </span>
                                        )}
                                        <span style={{
                                            padding: "3px 10px", borderRadius: "var(--radius-full)",
                                            fontSize: "11px", fontWeight: "var(--font-semibold)",
                                            background: STATUS_BG[m.status],
                                            color: STATUS_COLOR[m.status],
                                        }}>
                                            {STATUS_LABEL[m.status]}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Recent Activity */}
                    {md.recentNotifications.length > 0 && (
                        <div className="animate-slideUp" style={{
                            background: "var(--surface-primary)", borderRadius: "var(--radius-xl)",
                            border: "1px solid var(--border)", overflow: "hidden", boxShadow: "var(--shadow-sm)",
                        }}>
                            <div style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: "var(--space-4) var(--space-5)",
                                borderBottom: "1px solid var(--border)",
                                background: "var(--surface-secondary)",
                            }}>
                                <div style={{ fontWeight: "var(--font-semibold)", fontSize: "var(--text-sm)" }}>
                                    🕐 Recent Activity
                                </div>
                                <Link href="/notifications" style={{ fontSize: "var(--text-xs)", color: "var(--accent-primary)", textDecoration: "none", fontWeight: "var(--font-medium)" }}>
                                    View all →
                                </Link>
                            </div>
                            <div>
                                {md.recentNotifications.map((n, i) => (
                                    <div key={n.id} style={{
                                        display: "flex", alignItems: "flex-start", gap: "var(--space-3)",
                                        padding: "var(--space-4) var(--space-5)",
                                        borderBottom: i < md.recentNotifications.length - 1 ? "1px solid var(--border)" : "none",
                                        borderLeft: !n.isRead ? "3px solid var(--accent-primary)" : "3px solid transparent",
                                        transition: "background 0.15s",
                                    }}
                                        onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-secondary)")}
                                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                    >
                                        <span style={{ fontSize: 16, flexShrink: 0, marginTop: 2 }}>
                                            {n.type === "task" ? "📋" : n.type === "approval" ? "✅" : "🔔"}
                                        </span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", color: "var(--text-primary)" }}>
                                                {n.title}
                                            </div>
                                            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {n.body}
                                            </div>
                                        </div>
                                        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", whiteSpace: "nowrap", flexShrink: 0 }}>
                                            {timeAgo(n.createdAt)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Sidebar ─────────────────────────────────── */}
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>

                    {/* Quick Actions */}
                    <div className="animate-slideUp" style={{
                        background: "var(--surface-primary)", borderRadius: "var(--radius-xl)",
                        border: "1px solid var(--border)", overflow: "hidden", boxShadow: "var(--shadow-sm)",
                    }}>
                        <div style={{
                            padding: "var(--space-4) var(--space-5)",
                            borderBottom: "1px solid var(--border)",
                            background: "var(--surface-secondary)",
                            fontWeight: "var(--font-semibold)", fontSize: "var(--text-sm)",
                        }}>
                            ⚡ Admin Actions
                        </div>
                        <div style={{ padding: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                            {adminLinks.map(({ href, icon, label, badge }) => (
                                <Link key={href} href={href} style={{ textDecoration: "none" }}>
                                    <div style={{
                                        display: "flex", alignItems: "center", justifyContent: "space-between",
                                        padding: "var(--space-3) var(--space-3)",
                                        borderRadius: "var(--radius-lg)", cursor: "pointer",
                                        transition: "all 0.15s",
                                    }}
                                        onMouseEnter={e => {
                                            e.currentTarget.style.background = "var(--surface-secondary)";
                                            e.currentTarget.style.transform = "translateX(3px)";
                                        }}
                                        onMouseLeave={e => {
                                            e.currentTarget.style.background = "transparent";
                                            e.currentTarget.style.transform = "translateX(0)";
                                        }}
                                    >
                                        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                                            <span style={{
                                                width: 32, height: 32, borderRadius: "var(--radius-md)",
                                                background: "var(--surface-secondary)",
                                                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                                            }}>{icon}</span>
                                            <span style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", fontWeight: "var(--font-medium)" }}>
                                                {label}
                                            </span>
                                        </div>
                                        {badge ? (
                                            <span style={{
                                                fontSize: "11px", fontWeight: "var(--font-bold)",
                                                background: "var(--accent-primary)", color: "white",
                                                padding: "2px 8px", borderRadius: "var(--radius-full)",
                                            }}>{badge}</span>
                                        ) : (
                                            <span style={{ color: "var(--text-tertiary)", fontSize: 14 }}>›</span>
                                        )}
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>

                    {/* Alerts */}
                    {(md.overdueApprovals > 0 || md.pendingLeaveRequests > 0) && (
                        <div className="animate-slideUp" style={{
                            background: "var(--surface-primary)", borderRadius: "var(--radius-xl)",
                            border: "1px solid var(--border)", overflow: "hidden", boxShadow: "var(--shadow-sm)",
                        }}>
                            <div style={{
                                padding: "var(--space-4) var(--space-5)",
                                borderBottom: "1px solid var(--border)",
                                background: "var(--surface-secondary)",
                                fontWeight: "var(--font-semibold)", fontSize: "var(--text-sm)",
                            }}>
                                🚨 Needs Attention
                            </div>
                            <div style={{ padding: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                                {md.overdueApprovals > 0 && (
                                    <Link href="/approvals" style={{ textDecoration: "none" }}>
                                        <div style={{
                                            padding: "var(--space-3)", borderRadius: "var(--radius-lg)",
                                            background: "#fee2e2", border: "1px solid #fca5a5",
                                            cursor: "pointer",
                                        }}>
                                            <div style={{ fontWeight: "var(--font-semibold)", fontSize: "var(--text-sm)", color: "#991b1b" }}>
                                                🚨 {md.overdueApprovals} Overdue Approval{md.overdueApprovals > 1 ? "s" : ""}
                                            </div>
                                            <div style={{ fontSize: "var(--text-xs)", color: "#b91c1c", marginTop: 2 }}>Past SLA deadline</div>
                                        </div>
                                    </Link>
                                )}
                                {md.pendingLeaveRequests > 0 && (
                                    <Link href="/approvals" style={{ textDecoration: "none" }}>
                                        <div style={{
                                            padding: "var(--space-3)", borderRadius: "var(--radius-lg)",
                                            background: "#fef9c3", border: "1px solid #fde68a",
                                            cursor: "pointer",
                                        }}>
                                            <div style={{ fontWeight: "var(--font-semibold)", fontSize: "var(--text-sm)", color: "#92400e" }}>
                                                📋 {md.pendingLeaveRequests} Leave Request{md.pendingLeaveRequests > 1 ? "s" : ""}
                                            </div>
                                            <div style={{ fontSize: "var(--text-xs)", color: "#b45309", marginTop: 2 }}>Awaiting approval</div>
                                        </div>
                                    </Link>
                                )}
                            </div>
                        </div>
                    )}

                    {/* All clear */}
                    {md.overdueApprovals === 0 && md.pendingLeaveRequests === 0 && (
                        <div style={{
                            background: "#dcfce7", border: "1px solid #86efac",
                            borderRadius: "var(--radius-xl)", padding: "var(--space-4) var(--space-5)",
                            textAlign: "center",
                        }}>
                            <div style={{ fontSize: 24, marginBottom: 4 }}>✅</div>
                            <div style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-semibold)", color: "#15803d" }}>All clear</div>
                            <div style={{ fontSize: "var(--text-xs)", color: "#166534", marginTop: 2 }}>No pending actions</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ─── Main Page ──────────────────────────────────────────────── */
export default function DashboardPage() {
    const { user } = useAuth();
    const [empData, setEmpData] = useState<DashboardData>({});
    const [managerData, setManagerData] = useState<ManagerData>({
        totalMembers: 0, present: 0, onLeave: 0, absent: 0, attendanceRate: 0,
        pendingApprovals: 0, overdueApprovals: 0, pendingLeaveRequests: 0,
        teamStatus: [], recentNotifications: [],
    });
    const [loading, setLoading] = useState(true);
    const [liveWorking, setLiveWorking] = useState("0m");
    const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const isManager = ["MGR", "HRA", "SADM", "HRBP"].includes(user?.role ?? "");
    const isAdmin = user?.role === "SADM";

    useEffect(() => {
        async function load() {
            const promises: Promise<void>[] = [];

            if (isManager) {
                promises.push(
                    apiGet<any>("/api/dashboard/manager").then(res => {
                        if (!res.data) return;
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
                    })
                );
            }

            if (!isAdmin) {
                promises.push(
                    apiGet<any>("/api/dashboard/employee").then(res => {
                        if (!res.data) return;
                        const d = res.data;
                        const info = d.today || {};
                        const checkedIn = info.status === "CHECKED_IN";
                        const checkedOut = info.status === "CHECKED_OUT";
                        const checkInAt = info.checkInAt ? new Date(info.checkInAt) : null;
                        const checkOutAt = info.checkOutAt ? new Date(info.checkOutAt) : null;
                        let wh = info.totalHours ?? 0;
                        if (wh === 0 && checkInAt && checkOutAt)
                            wh = +((checkOutAt.getTime() - checkInAt.getTime()) / 3600000).toFixed(2);
                        setEmpData({
                            checkedIn, checkedOut, checkInAt, workingHours: wh,
                            checkInTime: checkInAt ? fmt(checkInAt.toISOString()) : undefined,
                            checkOutTime: checkOutAt ? fmt(checkOutAt.toISOString()) : undefined,
                        });
                    })
                );
            }

            await Promise.all(promises);
            setLoading(false);
        }
        load();
    }, [isManager, isAdmin]);

    // Live ticker for employees
    useEffect(() => {
        if (tickerRef.current) clearInterval(tickerRef.current);
        if (empData.checkedIn && empData.checkInAt) {
            const tick = () => {
                const ms = Date.now() - (empData.checkInAt as Date).getTime();
                const h = Math.floor(ms / 3600000);
                const m = Math.floor((ms % 3600000) / 60000);
                setLiveWorking(h > 0 ? `${h}h ${m}m` : `${m}m`);
            };
            tick();
            tickerRef.current = setInterval(tick, 1000);
        } else {
            setLiveWorking(empData.workingHours ? `${empData.workingHours.toFixed(1)}h` : "0m");
        }
        return () => { if (tickerRef.current) clearInterval(tickerRef.current); };
    }, [empData.checkedIn, empData.checkInAt, empData.workingHours]);

    const now = new Date();
    const greetingText = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
    const dateText = now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    if (loading) {
        return (
            <div>
                <div className="skeleton skeleton-title" style={{ width: "40%", marginBottom: 24 }} />
                <div className="dash-stats">
                    {[1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton skeleton-card" style={{ height: 100 }} />)}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20, marginTop: 20 }}>
                    <div className="skeleton skeleton-card" style={{ height: 320 }} />
                    <div className="skeleton skeleton-card" style={{ height: 320 }} />
                </div>
            </div>
        );
    }

    // Admin gets the full redesign
    if (isAdmin) return <AdminDashboard user={user} md={managerData} />;

    // Everyone else (EMP / MGR / HR) keeps the original layout
    return (
        <div>
            <div className="dash-greeting animate-fadeIn">
                <h1>{greetingText}, {user?.fullName?.split(" ")[0] || "there"}</h1>
                <p>{dateText}</p>
            </div>

            {isManager && (
                <div className="dash-stats animate-slideUp">
                    {[
                        { icon: "✅", val: managerData.present, label: "Present", cls: "green" },
                        { icon: "🏖️", val: managerData.onLeave, label: "On Leave", cls: "orange" },
                        { icon: "❌", val: managerData.absent, label: "Absent", cls: "red" },
                    ].map(({ icon, val, label, cls }) => (
                        <div key={label} className="dash-stat-card">
                            <div className={`dash-stat-icon ${cls}`}>{icon}</div>
                            <div>
                                <div className="dash-stat-value">{val ?? 0}</div>
                                <div className="dash-stat-label">{label}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div className="dash-checkin-card animate-slideUp" style={{
                background: empData.checkedOut
                    ? "linear-gradient(135deg,#0f766e,#0d9488)"
                    : empData.checkedIn
                        ? "linear-gradient(135deg,#15803d,#16a34a)"
                        : "linear-gradient(135deg,#1d4ed8,#2563eb)",
            }}>
                <div className="dash-checkin-status">
                    {empData.checkedOut ? "✅ DAY COMPLETE" : empData.checkedIn ? "🟢 CHECKED IN" : "⬜ NOT CHECKED IN"}
                </div>
                <div className="dash-checkin-time">
                    {empData.checkedOut
                        ? `${empData.checkInTime ?? "--:--"} → ${empData.checkOutTime ?? "--:--"}`
                        : empData.checkedIn
                            ? `Since ${empData.checkInTime ?? "--:--"}`
                            : now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                </div>
                <div className="dash-checkin-location">
                    {empData.checkedOut
                        ? `Total: ${empData.workingHours && empData.workingHours > 0 ? `${(empData.workingHours * 60).toFixed(0)} min (${empData.workingHours.toFixed(2)}h)` : "—"}`
                        : empData.checkedIn ? `Working: ${liveWorking}` : "Tap below to check in"}
                </div>
                {!empData.checkedOut && (
                    <Link href="/attendance" className="btn btn-primary"
                        style={{ background: "rgba(255,255,255,0.2)", color: "white", borderColor: "rgba(255,255,255,0.3)" }}>
                        {empData.checkedIn ? "View Attendance" : "Check In Now"}
                    </Link>
                )}
                {empData.checkedOut && (
                    <Link href="/attendance" className="btn btn-primary"
                        style={{ background: "rgba(255,255,255,0.15)", color: "white", borderColor: "rgba(255,255,255,0.3)" }}>
                        View Details
                    </Link>
                )}
            </div>

            <div className="dash-quick-actions animate-slideUp" style={{ animationDelay: "100ms" }}>
                {[
                    { href: "/leaves/apply", icon: "🗓️", label: "Apply Leave" },
                    { href: "/approvals", icon: "✅", label: "Approvals" },
                    { href: "/attendance", icon: "⏱️", label: "Attendance" },
                    { href: "/profile", icon: "👤", label: "Profile" },
                ].map(({ href, icon, label }) => (
                    <Link key={href} href={href} className="dash-quick-action">
                        <span className="dash-quick-action-icon">{icon}</span>
                        <span className="dash-quick-action-label">{label}</span>
                    </Link>
                ))}
            </div>

            <div className="dash-section animate-slideUp" style={{ animationDelay: "200ms" }}>
                <div className="dash-section-header">
                    <h2 className="dash-section-title">
                        Pending ({empData.pendingItems?.length || 0})
                    </h2>
                </div>
                {empData.pendingItems && empData.pendingItems.length > 0 ? (
                    empData.pendingItems.map(item => (
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
