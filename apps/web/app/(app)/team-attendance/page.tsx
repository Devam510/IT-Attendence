"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiGet } from "@/lib/api-client";
import { ChevronLeft, ChevronRight, Users, UserCheck, UserX, CalendarDays, Download, RefreshCw } from "lucide-react";

type Status = "PRESENT" | "ABSENT" | "ON_LEAVE";
type Filter = "ALL" | Status;

interface StaffMember {
    id: string;
    fullName: string;
    employeeId: string;
    designation?: string;
    department?: string;
    status: Status;
    checkInAt?: string | null;
    checkOutAt?: string | null;
    totalHours?: number | null;
    leaveType?: string | null;
    remark?: string | null;
}

interface DayData {
    date: string;
    summary: { total: number; present: number; absent: number; onLeave: number };
    staff: StaffMember[];
}

function toISTDateString(date: Date): string {
    const ist = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
    return ist.toISOString().slice(0, 10);
}

function fmtTime(iso?: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

function fmtHours(h?: number | null): string {
    if (!h) return "—";
    const hrs = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

const STATUS_CONFIG: Record<Status, { label: string; bg: string; color: string; icon: string }> = {
    PRESENT: { label: "Present", bg: "#dcfce7", color: "#15803d", icon: "✅" },
    ABSENT: { label: "Absent", bg: "#fee2e2", color: "#991b1b", icon: "❌" },
    ON_LEAVE: { label: "On Leave", bg: "#fef3c7", color: "#92400e", icon: "🏖️" },
};

export default function TeamAttendancePage() {
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [data, setData] = useState<DayData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [filter, setFilter] = useState<Filter>("ALL");
    const [search, setSearch] = useState("");
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const loadData = useCallback(async (date: Date, silent = false) => {
        if (silent) setRefreshing(true);
        else setLoading(true);
        const dateStr = toISTDateString(date);
        const res = await apiGet<DayData>(`/api/team/attendance?date=${dateStr}`);
        if (res.data) setData(res.data);
        setLastUpdated(new Date());
        if (silent) setRefreshing(false);
        else setLoading(false);
    }, []);

    // Initial load + auto-refresh every 30s when viewing today
    useEffect(() => {
        loadData(selectedDate);

        // Clear any existing interval first
        if (intervalRef.current) clearInterval(intervalRef.current);

        const viewingToday = toISTDateString(selectedDate) === toISTDateString(new Date());
        if (viewingToday) {
            intervalRef.current = setInterval(() => {
                loadData(selectedDate, true); // silent refresh (no spinner)
            }, 30_000); // every 30 seconds
        }

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [selectedDate, loadData]);

    const changeDate = (delta: number) => {
        setSelectedDate(prev => {
            const d = new Date(prev);
            d.setDate(d.getDate() + delta);
            return d;
        });
    };

    const isToday = toISTDateString(selectedDate) === toISTDateString(new Date());

    const displayDate = selectedDate.toLocaleDateString("en-US", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
    });

    const lastUpdatedStr = lastUpdated
        ? lastUpdated.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" })
        : null;

    const filtered = (data?.staff || []).filter(m => {
        const matchFilter = filter === "ALL" || m.status === filter;
        const matchSearch = !search || m.fullName.toLowerCase().includes(search.toLowerCase())
            || m.employeeId.toLowerCase().includes(search.toLowerCase())
            || (m.designation || "").toLowerCase().includes(search.toLowerCase());
        return matchFilter && matchSearch;
    });

    const s = data?.summary;

    return (
        <div>
            {/* Header */}
            <div className="dash-greeting animate-fadeIn" style={{ marginBottom: 0 }}>
                <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Users size={24} /> Team Attendance
                </h1>
                <p>View and track staff attendance for any date</p>
            </div>

            {/* Date Navigator */}
            <div style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                margin: "20px 0 16px",
                flexWrap: "wrap",
            }}>
                {/* Compact arrow + date pill */}
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    overflow: "hidden",
                    flex: 1,
                    minWidth: 220,
                }}>
                    <button
                        onClick={() => changeDate(-1)}
                        style={{
                            padding: "9px 13px", cursor: "pointer", border: "none",
                            borderRight: "1px solid var(--border)",
                            background: "transparent", display: "flex", alignItems: "center",
                            color: "var(--text-primary)",
                        }}
                    >
                        <ChevronLeft size={16} />
                    </button>

                    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 14px", flex: 1, justifyContent: "center" }}>
                        <CalendarDays size={15} color="var(--color-primary, #2563eb)" />
                        <span style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap" }}>
                            {isToday ? "Today — " : ""}{displayDate}
                        </span>
                    </div>

                    <button
                        onClick={() => changeDate(1)}
                        disabled={isToday}
                        style={{
                            padding: "9px 13px", cursor: isToday ? "not-allowed" : "pointer",
                            border: "none", borderLeft: "1px solid var(--border)",
                            background: "transparent", display: "flex", alignItems: "center",
                            opacity: isToday ? 0.35 : 1, color: "var(--text-primary)",
                        }}
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>

                {/* Date picker + Today */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                        type="date"
                        value={toISTDateString(selectedDate)}
                        max={toISTDateString(new Date())}
                        onChange={e => e.target.value && setSelectedDate(new Date(e.target.value + "T12:00:00"))}
                        style={{
                            padding: "7px 10px", borderRadius: 8, border: "1px solid var(--border)",
                            background: "var(--bg-card)", color: "var(--text-primary)", fontSize: 13,
                        }}
                    />
                    {!isToday && (
                        <button
                            onClick={() => setSelectedDate(new Date())}
                            style={{
                                padding: "7px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                                background: "var(--color-primary, #2563eb)", color: "white",
                                border: "none", fontWeight: 600, whiteSpace: "nowrap",
                            }}
                        >
                            Today
                        </button>
                    )}
                </div>
            </div>

            {/* Summary Cards */}
            {s && (
                <div className="dash-stats animate-slideUp" style={{ marginBottom: 16 }}>
                    {[
                        { label: "Total Staff", value: s.total, color: "#2563eb", bg: "#dbeafe", icon: <Users size={20} color="#2563eb" /> },
                        { label: "Present", value: s.present, color: "#15803d", bg: "#dcfce7", icon: <UserCheck size={20} color="#15803d" /> },
                        { label: "Absent", value: s.absent, color: "#991b1b", bg: "#fee2e2", icon: <UserX size={20} color="#991b1b" /> },
                        { label: "On Leave", value: s.onLeave, color: "#92400e", bg: "#fef3c7", icon: <span style={{ fontSize: 18 }}>🏖️</span> },
                    ].map(card => (
                        <div key={card.label} className="dash-stat-card" style={{ cursor: "default" }}>
                            <div style={{ width: 40, height: 40, borderRadius: 10, background: card.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                {card.icon}
                            </div>
                            <div>
                                <div className="dash-stat-value" style={{ color: card.color }}>{card.value}</div>
                                <div className="dash-stat-label">{card.label}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Table Controls */}
            <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
                {/* Search */}
                <input
                    type="text"
                    placeholder="Search by name, ID, or role…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{
                        flex: 1, minWidth: 200, padding: "8px 12px", borderRadius: 8,
                        border: "1px solid var(--border)", background: "var(--bg-secondary)",
                        color: "var(--text-primary)", fontSize: 13,
                    }}
                />
                {/* Filter pills */}
                {(["ALL", "PRESENT", "ABSENT", "ON_LEAVE"] as Filter[]).map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        style={{
                            padding: "6px 14px", borderRadius: 20, border: "1px solid var(--border)",
                            fontSize: 12, cursor: "pointer", fontWeight: filter === f ? 700 : 400,
                            background: filter === f
                                ? f === "PRESENT" ? "#15803d" : f === "ABSENT" ? "#991b1b" : f === "ON_LEAVE" ? "#92400e" : "var(--primary)"
                                : "var(--bg-secondary)",
                            color: filter === f ? "white" : "var(--text-secondary)",
                            transition: "all 0.15s",
                        }}
                    >
                        {f === "ALL" ? `All${s ? ` (${s.total})` : ""}` : f === "ON_LEAVE" ? `On Leave${s ? ` (${s.onLeave})` : ""}` : `${f.charAt(0) + f.slice(1).toLowerCase()}${s ? ` (${s[f.toLowerCase() as "present" | "absent"]})` : ""}`}
                    </button>
                ))}
            </div>

            {/* Table */}
            <div style={{
                background: "var(--bg-card)",
                borderRadius: 12,
                border: "1px solid var(--border)",
                overflow: "hidden",
            }}>
                {loading ? (
                    <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)" }}>
                        Loading attendance…
                    </div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)" }}>
                        No records found
                    </div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                            <thead>
                                <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border)" }}>
                                    {["Employee", "ID", "Dept / Role", "Status", "Check In", "Check Out", "Hours", "Remark"].map(h => (
                                        <th key={h} style={{ padding: "10px 14px", fontWeight: 600, textAlign: "left", color: "var(--text-secondary)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((m, i) => {
                                    const cfg = STATUS_CONFIG[m.status];
                                    const label = m.status === "ON_LEAVE" && m.leaveType
                                        ? `On Leave (${m.leaveType})` : cfg.label;
                                    return (
                                        <tr key={m.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "transparent" : "var(--bg-secondary)" }}>
                                            <td style={{ padding: "11px 14px", fontWeight: 500 }}>{m.fullName}</td>
                                            <td style={{ padding: "11px 14px", fontFamily: "monospace", color: "var(--text-secondary)", fontSize: 13 }}>{m.employeeId}</td>
                                            <td style={{ padding: "11px 14px", color: "var(--text-secondary)" }}>
                                                {m.designation || "—"}
                                                {m.department && <span style={{ display: "block", fontSize: 11, color: "var(--text-tertiary)" }}>{m.department}</span>}
                                            </td>
                                            <td style={{ padding: "11px 14px" }}>
                                                <span style={{ background: cfg.bg, color: cfg.color, padding: "3px 10px", borderRadius: 12, fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>
                                                    {cfg.icon} {label}
                                                </span>
                                            </td>
                                            <td style={{ padding: "11px 14px", color: "var(--text-secondary)" }}>
                                                {fmtTime(m.checkInAt)}
                                            </td>
                                            <td style={{ padding: "11px 14px", color: "var(--text-secondary)" }}>{fmtTime(m.checkOutAt)}</td>
                                            <td style={{ padding: "11px 14px", color: "var(--text-secondary)" }}>{fmtHours(m.totalHours)}</td>
                                            <td style={{ padding: "11px 14px", maxWidth: 220 }}>
                                                {m.remark ? (
                                                    <span title={m.remark} style={{
                                                        fontSize: 12,
                                                        color: "var(--text-secondary)",
                                                        fontStyle: "italic",
                                                        display: "block",
                                                        overflow: "hidden",
                                                        textOverflow: "ellipsis",
                                                        whiteSpace: "nowrap",
                                                    }}>
                                                        💬 {m.remark}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div style={{ color: "var(--text-tertiary)", fontSize: 12 }}>
                    Showing {filtered.length} of {data?.staff?.length ?? 0} employees
                    {lastUpdatedStr && (
                        <span style={{ marginLeft: 10 }}>
                            · Last updated: <strong>{lastUpdatedStr}</strong> IST
                            {isToday && <span style={{ marginLeft: 6, color: "var(--color-primary, #2563eb)" }}>· Auto-refreshes every 30s</span>}
                        </span>
                    )}
                </div>
                <button
                    onClick={() => loadData(selectedDate, true)}
                    disabled={refreshing}
                    style={{
                        display: "flex", alignItems: "center", gap: 5,
                        padding: "5px 12px", borderRadius: 8, border: "1px solid var(--border)",
                        background: "var(--bg-card)", color: "var(--text-secondary)",
                        fontSize: 12, cursor: refreshing ? "not-allowed" : "pointer",
                        opacity: refreshing ? 0.6 : 1,
                    }}
                >
                    <RefreshCw size={12} style={{ animation: refreshing ? "spin 1s linear infinite" : "none" }} />
                    {refreshing ? "Refreshing…" : "Refresh"}
                </button>
            </div>
        </div>
    );
}
