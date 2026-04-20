"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { apiGet, apiPost } from "@/lib/api-client";
import { FaceVerificationModal } from "@/components/attendance/FaceVerificationModal";

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

    // ── Attendance widget state ─────────────────────────────────────
    const [actionLoading, setActionLoading] = useState<"checkin" | "checkout" | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [sessionToken, setSessionToken] = useState<string | null>(null);

    // Early checkout modal
    const [showEarlyModal, setShowEarlyModal] = useState(false);
    const [earlyReason, setEarlyReason] = useState("");
    const [earlyReasonError, setEarlyReasonError] = useState(false);

    // Compliance check modal
    const [showComplianceModal, setShowComplianceModal] = useState(false);

    // Face Verification Check-In Modal
    const [showFaceVerification, setShowFaceVerification] = useState(false);

    // Face Verification Check-Out Modal
    const [showCheckoutFaceModal, setShowCheckoutFaceModal] = useState(false);
    const [pendingCheckoutReason, setPendingCheckoutReason] = useState("");

    // Fix (Puja): Cache location before opening face modal so the geolocation request
    // runs in the original user-gesture activation context (Chrome Android requires this).
    // Without this, the request happens inside an async callback chain after the modal
    // closes — at which point Chrome considers the user gesture consumed and may deny it.
    const [cachedCheckoutPosition, setCachedCheckoutPosition] = useState<GeolocationPosition | null>(null);

    // 8-hour countdown (in seconds)
    const WORK_SECS = 8 * 3600;
    const [countdown, setCountdown] = useState(WORK_SECS);
    const [countdownColor, setCountdownColor] = useState("#16a34a");
    const [overtimeSecs, setOvertimeSecs] = useState(0);

    // Break state — log-based so multiple breaks can be recorded
    interface BreakEntry { start: string; end: string | null; }
    const [breakLog, setBreakLog] = useState<BreakEntry[]>([]);
    const [onBreak, setOnBreak] = useState(false);
    const [breakStartedAt, setBreakStartedAt] = useState<Date | null>(null);
    const [breakElapsed, setBreakElapsed] = useState(0); // live current break secs
    const [breakLoading, setBreakLoading] = useState(false); // prevent double-tap
    const [breakError, setBreakError] = useState<string | null>(null); // shown in widget

    // Refs so ticker closure never reads stale values
    const breakLogRef = useRef<BreakEntry[]>([]);
    const breakStartedAtRef = useRef<Date | null>(null);
    const onBreakRef = useRef(false);

    const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const breakTickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Helper: compute total finished break seconds from log
    function totalBreakSecs(log: BreakEntry[]): number {
        return log.reduce((sum, b) => {
            if (!b.end) return sum;
            return sum + Math.floor((new Date(b.end).getTime() - new Date(b.start).getTime()) / 1000);
        }, 0);
    }

    const isManager = ["MGR", "HRA", "SADM", "HRBP"].includes(user?.role ?? "");
    const isAdmin = user?.role === "SADM";

    const loadEmpData = useCallback(async () => {
        const res = await apiGet<any>("/api/dashboard/employee");
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
            pendingItems: d.pendingItems ?? [],
        });

        // Fix (Divya): If DB confirms user is still checked in, a stale actionError
        // from a previous failed checkout attempt is misleading. Clear it.
        // This handles the case where the checkout API returned NO_CHECKIN for a
        // previously completed/corrupted record, but the dashboard still shows CHECKED_IN.
        if (checkedIn) {
            setActionError(null);
        }

        // Sync break state from API
        if (info.breaks && Array.isArray(info.breaks)) {
            const bLog: BreakEntry[] = info.breaks;
            setBreakLog(bLog);
            breakLogRef.current = bLog;
            const last = bLog[bLog.length - 1];
            if (last && !last.end) {
                const startDate = new Date(last.start);
                setOnBreak(true);
                setBreakStartedAt(startDate);
                onBreakRef.current = true;
                breakStartedAtRef.current = startDate;
            } else {
                setOnBreak(false);
                setBreakStartedAt(null);
                onBreakRef.current = false;
                breakStartedAtRef.current = null;
            }
        }
    }, []);

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
            if (!isAdmin) promises.push(loadEmpData());
            await Promise.all(promises);
            setLoading(false);
        }
        load();
    }, [isManager, isAdmin, loadEmpData]);

    // ── Restore sessionToken + break log from localStorage on mount ──
    useEffect(() => {
        if (!user?.id) return;
        const saved = localStorage.getItem(`dash_sessionToken_${user.id}`);
        if (saved) setSessionToken(saved);
        const breakState = localStorage.getItem(`dash_break_${user.id}`);
        if (breakState && breakLogRef.current.length === 0 && !empData.checkedIn) {
            // Only fallback to localStorage if no checkedIn state yet (optimistic load)
            try {
                const parsed = JSON.parse(breakState);
                const log: BreakEntry[] = parsed.log ?? [];
                // Bug fix: only restore break log if it was saved TODAY in IST.
                // Stale break data from a previous day causes phantom breaks.
                const todayIst = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // "YYYY-MM-DD"
                const savedDate = parsed.date as string | undefined;
                if (savedDate !== todayIst) {
                    // Stale data from a different day — clear it and bail
                    localStorage.removeItem(`dash_break_${user.id}`);
                    return;
                }
                setBreakLog(log);
                breakLogRef.current = log;
                const last = log[log.length - 1];
                if (last && !last.end) {
                    const startDate = new Date(last.start);
                    setOnBreak(true);
                    setBreakStartedAt(startDate);
                    onBreakRef.current = true;
                    breakStartedAtRef.current = startDate;
                }
            } catch { /* ignore corrupt data */ }
        }
    }, [user?.id, empData.checkedIn]);

    // ── 8-hour countdown ticker — uses refs to avoid stale closures ──
    useEffect(() => {
        if (tickerRef.current) clearInterval(tickerRef.current);
        if (empData.checkedIn && empData.checkInAt) {
            const checkInTime = (empData.checkInAt as Date).getTime();
            const tick = () => {
                const elapsed = Math.floor((Date.now() - checkInTime) / 1000);
                const finishedBreak = totalBreakSecs(breakLogRef.current);
                const liveBreak = (onBreakRef.current && breakStartedAtRef.current)
                    ? Math.floor((Date.now() - breakStartedAtRef.current.getTime()) / 1000)
                    : 0;
                const netWorked = elapsed - finishedBreak - liveBreak;
                const rem = Math.max(0, WORK_SECS - netWorked);
                const ot = Math.max(0, netWorked - WORK_SECS);
                setCountdown(rem);
                setOvertimeSecs(ot);
                const pct = rem / WORK_SECS;
                setCountdownColor(pct > 0.5 ? "#16a34a" : pct > 0.2 ? "#d97706" : "#dc2626");
            };
            tick();
            tickerRef.current = setInterval(tick, 1000);
        }
        return () => { if (tickerRef.current) clearInterval(tickerRef.current); };
    }, [empData.checkedIn, empData.checkInAt]);

    // ── Live break elapsed ticker ─────────────────────────────────
    useEffect(() => {
        if (breakTickerRef.current) clearInterval(breakTickerRef.current);
        if (onBreak && breakStartedAt) {
            const tick = () => setBreakElapsed(Math.floor((Date.now() - breakStartedAt.getTime()) / 1000));
            tick();
            breakTickerRef.current = setInterval(tick, 1000);
        } else {
            setBreakElapsed(0);
        }
        return () => { if (breakTickerRef.current) clearInterval(breakTickerRef.current); };
    }, [onBreak, breakStartedAt]);

    // ── Handlers ─────────────────────────────────────────────────
    function fmtCountdown(secs: number) {
        const h = Math.floor(secs / 3600).toString().padStart(2, "0");
        const m = Math.floor((secs % 3600) / 60).toString().padStart(2, "0");
        const s = (secs % 60).toString().padStart(2, "0");
        return `${h}:${m}:${s}`;
    }

    async function initiateCheckIn() {
        setShowFaceVerification(true);
    }

    async function handleCheckIn(faceToken: string) {
        setShowFaceVerification(false);
        setActionError(null);
        setActionLoading("checkin");
        try {
            // Bug fix: always use high-accuracy GPS with no cached position for reliable mobile geo
            const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
                navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
            );
            const res = await apiPost<any>("/api/attendance/checkin", {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                faceToken // Pass token to API
            });
            if (res.error) {
                setActionError(res.error || "Check-in failed");
            } else {
                const token = res.data?.sessionToken;
                if (token) {
                    setSessionToken(token);
                    if (user?.id) localStorage.setItem(`dash_sessionToken_${user.id}`, token);
                }
                await loadEmpData();
            }
        } catch (e: any) {
            if (e?.code === 1) setActionError("Location access denied. Please enable location in browser settings.");
            else if (e?.code === 2) setActionError("Location unavailable. Please try again.");
            else if (e?.code === 3) setActionError("Location request timed out.");
            else setActionError("Check-in failed. Please try again.");
        } finally {
            setActionLoading(null);
        }
    }

    async function handleCheckOutClick() {
        setActionError(null);
        setActionLoading("checkout");

        // Fix (Puja): Pre-acquire geolocation NOW while we are still in the user-gesture
        // activation context (direct button tap). Android Chrome may deny geolocation
        // requests that happen inside async callback chains after the face modal closes,
        // because the browser considers the user-gesture "consumed" after the first await.
        // By caching the position here, we avoid a second geolocation call later.
        let prefetchedPos: GeolocationPosition | null = null;
        try {
            prefetchedPos = await new Promise<GeolocationPosition>((resolve, reject) =>
                navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
            );
            setCachedCheckoutPosition(prefetchedPos);
        } catch (e: any) {
            setActionLoading(null);
            if (e?.code === 1) setActionError("Location access denied. Please enable location in browser settings.");
            else if (e?.code === 2) setActionError("Location unavailable. Please check your GPS signal and try again.");
            else if (e?.code === 3) setActionError("Location request timed out. Please try again.");
            else setActionError("Could not get your location. Please try again.");
            return;
        }

        // Check compliance
        try {
            const compRes = await apiGet<{ hasSubmittedToday: boolean }>("/api/updates/check-compliance");
            if (compRes.data && !compRes.data.hasSubmittedToday) {
                setShowComplianceModal(true);
                setActionLoading(null);
                return;
            }
        } catch {
            // If compliance check fails, let them proceed to checkout anyway
        }
        setActionLoading(null);
        // Proceed to early-check then face verification
        handleCheckOut(false, "", "", prefetchedPos);
    }

    // Fix (Puja): Accept an optional pre-cached position from handleCheckOutClick.
    // This avoids a second geolocation call inside async callback chains where
    // Chrome Android may deny the request due to lost user-activation context.
    async function handleCheckOut(force = false, reason = "", faceToken = "", prePos: GeolocationPosition | null = null) {
        setActionError(null);
        // Skip early-checkout check if already in overtime — no need to ask for a reason
        if (!force && empData.checkInAt && overtimeSecs === 0) {
            const workedSecs = Math.floor((Date.now() - (empData.checkInAt as Date).getTime()) / 1000)
                - totalBreakSecs(breakLogRef.current)
                - (onBreakRef.current && breakStartedAtRef.current
                    ? Math.floor((Date.now() - breakStartedAtRef.current.getTime()) / 1000) : 0);
            const workedHours = workedSecs / 3600;
            if (workedHours < WORK_SECS / 3600) {
                setEarlyReason("");
                setEarlyReasonError(false);
                setShowEarlyModal(true);
                return;
            }
        }
        // Gate: require face verification — open modal and let it call back with faceToken
        if (!faceToken) {
            setPendingCheckoutReason(reason);
            setShowCheckoutFaceModal(true);
            return;
        }
        setActionLoading("checkout");
        try {
            // Use pre-cached position if available (from handleCheckOutClick, acquired at tap time).
            // Fall back to fresh request only if no cache — this covers early-checkout and retry paths.
            const pos = prePos ?? cachedCheckoutPosition ?? await new Promise<GeolocationPosition>((resolve, reject) =>
                navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
            );
            // Clear cached position after use so it's not reused for future checkouts
            setCachedCheckoutPosition(null);
            const body: Record<string, unknown> = { 
                faceToken,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude
            };
            if (reason) body.earlyReason = reason;
            const res = await apiPost<any>("/api/attendance/checkout", body);
            if (res.error) {
                setActionError(res.error || "Check-out failed");
            } else {
                if (user?.id) {
                    localStorage.removeItem(`dash_sessionToken_${user.id}`);
                    localStorage.removeItem(`dash_break_${user.id}`);
                }
                setSessionToken(null);
                setOnBreak(false);
                onBreakRef.current = false;
                setBreakLog([]);
                breakLogRef.current = [];
                setBreakStartedAt(null);
                breakStartedAtRef.current = null;
                await loadEmpData();
            }
        } catch (e: any) {
            if (e?.code === 1) setActionError("Location access denied. Please enable location in browser settings.");
            else if (e?.code === 2) setActionError("Location unavailable. Please try again.");
            else if (e?.code === 3) setActionError("Location request timed out.");
            else setActionError("Check-out failed. Please try again.");
        } finally {
            setActionLoading(null);
        }
    }

    function confirmEarlyCheckout() {
        if (!earlyReason.trim()) { setEarlyReasonError(true); return; }
        setShowEarlyModal(false);
        // Pass reason + cached position (if available), let face modal open next
        handleCheckOut(true, earlyReason.trim(), "", cachedCheckoutPosition);
    }

    async function handleBreakStart() {
        if (breakLoading) return; // prevent double-tap
        setBreakLoading(true);
        setBreakError(null);

        const now = new Date();
        const todayIst = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        const newEntry: BreakEntry = { start: now.toISOString(), end: null };
        const newLog = [...breakLog, newEntry];

        // Optimistic UI update
        setBreakLog(newLog);
        breakLogRef.current = newLog;
        setOnBreak(true);
        onBreakRef.current = true;
        setBreakStartedAt(now);
        breakStartedAtRef.current = now;
        if (user?.id) localStorage.setItem(`dash_break_${user.id}`, JSON.stringify({ log: newLog, date: todayIst }));

        try {
            const res = await apiPost("/api/attendance/break", { action: "start" });
            if (res.error) {
                // API rejected — rollback
                const prevLog = breakLog; // before the push
                setBreakLog(prevLog);
                breakLogRef.current = prevLog;
                setOnBreak(false);
                onBreakRef.current = false;
                setBreakStartedAt(null);
                breakStartedAtRef.current = null;
                if (user?.id) localStorage.setItem(`dash_break_${user.id}`, JSON.stringify({ log: prevLog, date: todayIst }));
                setBreakError(res.error || "Failed to start break. Please try again.");
            }
        } catch {
            // Network error — rollback
            const prevLog = breakLog;
            setBreakLog(prevLog);
            breakLogRef.current = prevLog;
            setOnBreak(false);
            onBreakRef.current = false;
            setBreakStartedAt(null);
            breakStartedAtRef.current = null;
            if (user?.id) localStorage.setItem(`dash_break_${user.id}`, JSON.stringify({ log: prevLog, date: todayIst }));
            setBreakError("Network error — break not saved. Check your connection and try again.");
        } finally {
            setBreakLoading(false);
        }
    }

    async function handleBreakEnd() {
        if (breakLoading) return; // prevent double-tap
        setBreakLoading(true);
        setBreakError(null);

        const now = new Date();
        const todayIst = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
        const newLog = breakLog.map((b, i) =>
            i === breakLog.length - 1 && !b.end ? { ...b, end: now.toISOString() } : b
        );

        // Optimistic UI update
        setBreakLog(newLog);
        breakLogRef.current = newLog;
        setOnBreak(false);
        onBreakRef.current = false;
        setBreakStartedAt(null);
        breakStartedAtRef.current = null;
        if (user?.id) localStorage.setItem(`dash_break_${user.id}`, JSON.stringify({ log: newLog, date: todayIst }));

        try {
            const res = await apiPost("/api/attendance/break", { action: "end" });
            if (res.error) {
                // API rejected — rollback: restore open break
                setBreakLog(breakLog); // original log (open break intact)
                breakLogRef.current = breakLog;
                setOnBreak(true);
                onBreakRef.current = true;
                if (breakStartedAtRef.current === null && breakLog.length > 0) {
                    const last = breakLog[breakLog.length - 1]!;
                    if (!last.end) {
                        const s = new Date(last.start);
                        setBreakStartedAt(s);
                        breakStartedAtRef.current = s;
                    }
                }
                if (user?.id) localStorage.setItem(`dash_break_${user.id}`, JSON.stringify({ log: breakLog, date: todayIst }));
                setBreakError(res.error || "Failed to end break. Please tap \"Resume Work\" again.");
            }
        } catch {
            // Network error — rollback
            setBreakLog(breakLog);
            breakLogRef.current = breakLog;
            setOnBreak(true);
            onBreakRef.current = true;
            if (user?.id) localStorage.setItem(`dash_break_${user.id}`, JSON.stringify({ log: breakLog, date: todayIst }));
            setBreakError("Network error — break not ended in system. Check your connection and tap \"Resume Work\" again.");
        } finally {
            setBreakLoading(false);
        }
    }

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

    // ── Compliance Check Modal ───────────────────────────────────────
    const ComplianceModal = showComplianceModal ? (
        <div style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
            <div style={{
                background: "var(--bg-primary)", borderRadius: 16, padding: "28px 32px",
                maxWidth: 440, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
                border: "1.5px solid #d97706",
            }}>
                <div style={{ fontSize: 32, marginBottom: 8, textAlign: "center" }}>⚠️</div>
                <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "#d97706", textAlign: "center", margin: "0 0 8px" }}>Missing Daily Update</h3>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", textAlign: "center", margin: "0 0 20px" }}>
                    You haven't submitted your <strong>Daily Update</strong> for today. Please post your update so your team knows what you accomplished!
                </p>
                <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                    <button onClick={() => setShowComplianceModal(false)}
                        style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1.5px solid var(--border-primary)", background: "var(--bg-secondary)", color: "var(--text-primary)", fontWeight: 600, cursor: "pointer" }}>
                        Cancel Check Out
                    </button>
                    <Link href="/updates?from=checkout"
                        style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: "#d97706", color: "white", fontWeight: 700, cursor: "pointer", textAlign: "center", textDecoration: "none", display: "inline-block" }}>
                        Go to Updates
                    </Link>
                </div>
            </div>
        </div>
    ) : null;

    const EarlyCheckoutModal = showEarlyModal ? (
        <div style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
            <div style={{
                background: "var(--bg-primary)", borderRadius: 16, padding: "28px 32px",
                maxWidth: 440, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
                border: "1.5px solid #f87171",
            }}>
                <div style={{ fontSize: 32, marginBottom: 8, textAlign: "center" }}>⚠️</div>
                <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 700, color: "#dc2626", textAlign: "center", margin: "0 0 8px" }}>
                    Early Check-Out
                </h3>
                <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", textAlign: "center", margin: "0 0 20px" }}>
                    You have not completed your 8-hour shift. Please provide a reason.
                </p>
                <textarea
                    value={earlyReason}
                    onChange={(e) => {
                        setEarlyReason(e.target.value);
                        if (e.target.value.trim()) setEarlyReasonError(false);
                    }}
                    placeholder="E.g., Doctor appointment, Family emergency..."
                    rows={3}
                    style={{
                        width: "100%", padding: "12px", borderRadius: 8, border: `1px solid ${earlyReasonError ? "#ef4444" : "var(--border-light)"}`,
                        background: "var(--bg-secondary)", color: "var(--text-primary)", fontSize: "var(--text-sm)", resize: "none",
                        marginBottom: 16
                    }}
                />
                {earlyReasonError && <div style={{ color: "#ef4444", fontSize: "12px", marginTop: "-12px", marginBottom: "16px" }}>Reason is required.</div>}
                <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setShowEarlyModal(false)}
                        style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "1.5px solid var(--border-primary)", background: "var(--bg-secondary)", color: "var(--text-primary)", fontWeight: 600, cursor: "pointer" }}>
                        Cancel
                    </button>
                    <button onClick={confirmEarlyCheckout}
                        style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: "none", background: "#ef4444", color: "white", fontWeight: 700, cursor: "pointer" }}>
                        Confirm Early Checkout
                    </button>
                </div>
            </div>
        </div>
    ) : null;

    // Admin gets the full redesign

    // Admin gets the full redesign
    if (isAdmin) return <AdminDashboard user={user} md={managerData} />;

    // Everyone else (EMP / MGR / HR) keeps the original layout
    return (
        <div>
            {/* Check-In Modal */}
            <FaceVerificationModal 
               isOpen={showFaceVerification} 
               mode="checkin"
               onClose={() => setShowFaceVerification(false)} 
               onSuccess={handleCheckIn} 
            />

            {/* Check-Out Modal */}
            <FaceVerificationModal
                isOpen={showCheckoutFaceModal}
                mode="checkout"
                onClose={() => {
                    setShowCheckoutFaceModal(false);
                    // Clear cached position if user cancels — don't reuse a potentially stale one
                    setCachedCheckoutPosition(null);
                }}
                onSuccess={(faceToken) => {
                    setShowCheckoutFaceModal(false);
                    // Pass pre-cached position acquired at button-tap time (user gesture context)
                    handleCheckOut(true, pendingCheckoutReason, faceToken, cachedCheckoutPosition);
                }}
            />

            {/* ComplianceModal */}
            {ComplianceModal}
            {EarlyCheckoutModal}
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

            {/* ─── Attendance Widget ─────────────────────────────────────── */}
            {!isAdmin && (
                <div className="animate-slideUp" style={{
                    borderRadius: 16,
                    overflow: "hidden",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
                    marginBottom: "var(--space-4)",
                    background: empData.checkedOut
                        ? "linear-gradient(135deg,#0f766e,#0d9488)"
                        : onBreak
                            ? "linear-gradient(135deg,#92400e,#d97706)"
                            : empData.checkedIn && overtimeSecs > 0
                                ? "linear-gradient(135deg,#92400e,#b45309)"
                                : empData.checkedIn
                                    ? "linear-gradient(135deg,#15803d,#16a34a)"
                                    : "linear-gradient(135deg,#1d4ed8,#2563eb)",
                    transition: "background 0.5s",
                }}>
                    {/* Top status row */}
                    <div style={{ padding: "16px 20px 0", color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>
                            {empData.checkedOut ? "✅ DAY COMPLETE"
                                : onBreak ? "☕ ON BREAK"
                                    : empData.checkedIn ? "🟢 CHECKED IN"
                                        : "⬜ NOT CHECKED IN"}
                        </span>
                        {empData.checkedIn && !empData.checkedOut && (
                            <span style={{ fontSize: 11, opacity: 0.75 }}>Check In Since {empData.checkInTime}</span>
                        )}
                    </div>

                    {/* Main time display */}
                    <div style={{ padding: "8px 20px 0", color: "white" }}>
                        {empData.checkedOut ? (
                            <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1 }}>
                                {empData.checkInTime} → {empData.checkOutTime}
                            </div>
                        ) : empData.checkedIn ? (
                            <div>
                                {overtimeSecs > 0 ? (
                                    <>
                                        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", fontWeight: 700, marginBottom: 2, letterSpacing: "0.08em" }}>🔥 OVERTIME</div>
                                        <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: -2, fontVariantNumeric: "tabular-nums", fontFamily: "monospace", color: "#fef08a" }}>
                                            +{fmtCountdown(overtimeSecs)}
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: -2, fontVariantNumeric: "tabular-nums", fontFamily: "monospace" }}>
                                        {fmtCountdown(countdown)}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ fontSize: 32, fontWeight: 700 }}>
                                {now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}
                            </div>
                        )}

                        {/* Subtitle */}
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 2, marginBottom: 8 }}>
                            {empData.checkedOut
                                ? `Total: ${empData.workingHours && empData.workingHours > 0 ? `${(empData.workingHours).toFixed(1)}h worked` : "—"}`
                                : empData.checkedIn
                                    ? onBreak
                                        ? `Break: ${fmtCountdown(breakElapsed)}  ·  Remaining work time`
                                        : overtimeSecs > 0
                                            ? "You're in overtime — great work! 💪"
                                            : "Remaining work time"
                                    : "Tap check in to start your day"}
                        </div>

                        {empData.checkedIn && !empData.checkedOut && (
                            <div style={{ height: 5, borderRadius: 99, background: "rgba(255,255,255,0.2)", marginBottom: 14, overflow: "hidden" }}>
                                {overtimeSecs > 0 ? (
                                    // Overtime bar — grows from left in yellow
                                    <div style={{
                                        height: "100%", borderRadius: 99,
                                        background: "rgba(254,240,138,0.9)",
                                        width: `${Math.min(100, (overtimeSecs / (2 * 3600)) * 100)}%`,
                                        transition: "width 1s linear",
                                    }} />
                                ) : (
                                    <div style={{
                                        height: "100%", borderRadius: 99,
                                        background: countdown === 0 ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.7)",
                                        width: `${(countdown / WORK_SECS) * 100}%`,
                                        transition: "width 1s linear",
                                    }} />
                                )}
                            </div>
                        )}

                        {/* Overtime section below progress bar */}
                        {empData.checkedIn && !empData.checkedOut && overtimeSecs === 0 && countdown === 0 && (
                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.9)", marginBottom: 10, fontWeight: 600 }}>🎉 8-hour workday complete!</div>
                        )}
                    </div>

                    {/* Attendance action error */}
                    {actionError && (
                        <div style={{ margin: "0 20px 10px", padding: "8px 12px", borderRadius: 8, background: "rgba(0,0,0,0.25)", color: "#fecaca", fontSize: 12 }}>
                            ⚠️ {actionError}
                        </div>
                    )}

                    {/* Break-specific error — separate so it survives actionError clearing */}
                    {breakError && (
                        <div
                            role="alert"
                            style={{
                                margin: "0 20px 10px", padding: "10px 14px", borderRadius: 8,
                                background: "rgba(239,68,68,0.85)", color: "white", fontSize: 13,
                                fontWeight: 600, display: "flex", alignItems: "center", gap: 8,
                                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                            }}
                        >
                            <span style={{ fontSize: 16 }}>⚠️</span>
                            <span style={{ flex: 1 }}>{breakError}</span>
                            <button
                                onClick={() => setBreakError(null)}
                                style={{
                                    background: "none", border: "none", cursor: "pointer",
                                    color: "white", fontSize: 16, padding: 0, lineHeight: 1,
                                }}
                                aria-label="Dismiss break error"
                            >×</button>
                        </div>
                    )}

                    {/* Action buttons */}
                    <div style={{ padding: "0 20px 16px", display: "flex", gap: 8 }}>
                        {!empData.checkedIn && !empData.checkedOut && (
                            <button
                                onClick={initiateCheckIn}
                                disabled={actionLoading === "checkin"}
                                style={{
                                    flex: 1, padding: "10px 0", borderRadius: 10, border: "none",
                                    background: "rgba(255,255,255,0.2)", color: "white",
                                    fontWeight: 700, fontSize: 14, cursor: actionLoading ? "not-allowed" : "pointer",
                                    backdropFilter: "blur(4px)",
                                    opacity: actionLoading ? 0.7 : 1,
                                    transition: "opacity 0.2s",
                                }}
                            >
                                {actionLoading === "checkin" ? "Locating…" : "✅ Check In"}
                            </button>
                        )}

                        {empData.checkedIn && !empData.checkedOut && (
                            <>
                                {onBreak ? (
                                    <button
                                        onClick={handleBreakEnd}
                                        disabled={breakLoading}
                                        style={{
                                            flex: 1, padding: "10px 0", borderRadius: 10, border: "1.5px solid rgba(255,255,255,0.5)",
                                            background: "rgba(255,255,255,0.15)", color: "white",
                                            fontWeight: 700, fontSize: 14,
                                            cursor: breakLoading ? "not-allowed" : "pointer",
                                            opacity: breakLoading ? 0.6 : 1,
                                        }}
                                    >
                                        {breakLoading ? "Saving…" : "▶ Resume Work"}
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleBreakStart}
                                        disabled={breakLoading}
                                        style={{
                                            flex: 1, padding: "10px 0", borderRadius: 10, border: "1.5px solid rgba(255,255,255,0.5)",
                                            background: "rgba(255,255,255,0.15)", color: "white",
                                            fontWeight: 700, fontSize: 14,
                                            cursor: breakLoading ? "not-allowed" : "pointer",
                                            opacity: breakLoading ? 0.6 : 1,
                                        }}
                                    >
                                        {breakLoading ? "Saving…" : "☕ Break"}
                                    </button>
                                )}
                                <button
                                    onClick={() => handleCheckOutClick()}
                                    disabled={actionLoading === "checkout"}
                                    style={{
                                        flex: 1, padding: "10px 0", borderRadius: 10, border: "none",
                                        background: "rgba(220,38,38,0.75)", color: "white",
                                        fontWeight: 700, fontSize: 14, cursor: actionLoading ? "not-allowed" : "pointer",
                                        opacity: actionLoading ? 0.7 : 1,
                                        transition: "opacity 0.2s",
                                    }}
                                >
                                    {actionLoading === "checkout" ? "Checking out…" : "🔴 Check Out"}
                                </button>
                            </>
                        )}

                        {empData.checkedOut && (
                            <Link href="/attendance"
                                style={{
                                    flex: 1, padding: "10px 0", borderRadius: 10, textAlign: "center",
                                    border: "1.5px solid rgba(255,255,255,0.4)",
                                    background: "rgba(255,255,255,0.15)", color: "white",
                                    fontWeight: 700, fontSize: 14, textDecoration: "none",
                                }}
                            >
                                View Details
                            </Link>
                        )}
                    </div>

                    {/* Break History */}
                    {breakLog.length > 0 && empData.checkedIn && (
                        <div style={{ padding: "0 20px 16px" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: "0.08em", marginBottom: 6 }}>☕ BREAK HISTORY</div>
                            {breakLog.map((b, i) => {
                                const start = new Date(b.start);
                                const end = b.end ? new Date(b.end) : null;
                                const durSecs = end
                                    ? Math.floor((end.getTime() - start.getTime()) / 1000)
                                    : breakElapsed;
                                const durMin = Math.floor(durSecs / 60);
                                const durSec = durSecs % 60;
                                const fmtT = (d: Date) => d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
                                return (
                                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,0.85)", marginBottom: 3 }}>
                                        <span>{fmtT(start)} → {end ? fmtT(end) : "ongoing…"}</span>
                                        <span style={{ opacity: 0.7 }}>{durMin > 0 ? `${durMin}m ` : ""}{durSec}s</span>
                                    </div>
                                );
                            })}
                            {breakLog.filter(b => b.end).length > 1 && (
                                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>
                                    Total break: {fmtCountdown(totalBreakSecs(breakLog))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

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
