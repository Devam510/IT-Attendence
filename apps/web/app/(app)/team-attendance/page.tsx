"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { apiGet } from "@/lib/api-client";
import { ChevronLeft, ChevronRight, Users, UserCheck, UserX, CalendarDays, Download, RefreshCw, Eye } from "lucide-react";

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
    breaks?: { start: string; end?: string | null; duration?: number }[];
    earlyReason?: string | null;
    isHalfDay?: boolean;
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

// ─── Employee Month Modal ─────────────────────────────────────────────────────
const MODAL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MODAL_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface EmpCalDay {
    date: string;
    status: string;
    checkInAt: string | null;
    checkOutAt: string | null;
    totalHours: number | null;
    verificationScore?: number | null;
    remark?: string | null;
    breaks?: { start: string; end?: string | null; duration?: number }[];
    earlyReason?: string | null;
    isHalfDay?: boolean;
}
interface EmpHistoryData {
    month: string;
    employee: { id: string; fullName: string; employeeId: string; department?: string; designation?: string };
    calendar: EmpCalDay[];
    summary: { totalPresent: number; totalAbsent: number; totalHours: number; flaggedDays: number; daysInMonth: number };
}

function EmployeeMonthModal({ employee, onClose }: {
    employee: { id: string; fullName: string; employeeId: string };
    onClose: () => void;
}) {
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth());
    const [year, setYear] = useState(now.getFullYear());
    const [data, setData] = useState<EmpHistoryData | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedDay, setSelectedDay] = useState<EmpCalDay | null>(null);

    useEffect(() => {
        setLoading(true);
        setSelectedDay(null);
        const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
        apiGet<EmpHistoryData>(`/api/attendance/employee-history?userId=${employee.id}&month=${monthStr}`)
            .then(res => { if (res.data) setData(res.data); })
            .finally(() => setLoading(false));
    }, [employee.id, month, year]);

    function prevMonth() {
        if (month === 0) { setMonth(11); setYear(y => y - 1); }
        else setMonth(m => m - 1);
    }
    function nextMonth() {
        const isCurrentMonth = month === now.getMonth() && year === now.getFullYear();
        if (isCurrentMonth) return;
        if (month === 11) { setMonth(0); setYear(y => y + 1); }
        else setMonth(m => m + 1);
    }
    const isCurrentMonth = month === now.getMonth() && year === now.getFullYear();

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    function getDayData(day: number): EmpCalDay | undefined {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        return data?.calendar.find(c => c.date === dateStr);
    }

    function dotColor(status: string): string {
        if (["PRESENT", "VERIFIED", "REGULARIZED"].includes(status)) return "#16a34a";
        if (status === "ABSENT") return "#dc2626";
        if (status === "LEAVE" || status === "ON_LEAVE") return "#d97706";
        if (status === "FLAGGED") return "#7c3aed";
        if (status === "WEEKEND") return "#94a3b8";
        return "transparent";
    }

    const s = data?.summary;

    const modal = (
        <div
            onClick={onClose}
            style={{
                position: "fixed", inset: 0, zIndex: 9999,
                background: "rgba(10,20,40,0.65)", backdropFilter: "blur(6px)",
                display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: "var(--bg-primary)", borderRadius: 16, padding: 24,
                    width: "100%", maxWidth: 620, maxHeight: "90vh", overflowY: "auto",
                    boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
                    border: "1px solid var(--border-primary)",
                }}
            >
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 18 }}>📅 {employee.fullName}</div>
                        <div style={{ fontSize: 12, color: "var(--text-secondary)", fontFamily: "monospace", marginTop: 2 }}>{employee.employeeId}</div>
                    </div>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <button
                            onClick={() => {
                                if (!data?.calendar) return;
                                const csvContent = [
                                    ["Date", "Status", "Check In", "Check Out", "Total Hours", "Remark", "Half Day", "Early Checkout Reason"],
                                    ...data.calendar.map(d => [
                                        d.date,
                                        d.status,
                                        d.checkInAt ? new Date(d.checkInAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "-",
                                        d.checkOutAt ? new Date(d.checkOutAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "-",
                                        d.totalHours?.toFixed(2) || "-",
                                        d.remark ? `"${d.remark.replace(/"/g, '""')}"` : "-",
                                        d.isHalfDay ? "Yes" : "No",
                                        d.earlyReason ? `"${d.earlyReason.replace(/"/g, '""')}"` : "-"
                                    ])
                                ].map(row => row.join(",")).join("\n");
                                const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = `attendance_${employee.employeeId}_${MODAL_MONTHS[month]}_${year}.csv`;
                                a.click();
                                URL.revokeObjectURL(url);
                            }}
                            title="Export to CSV"
                            style={{
                                display: "flex", alignItems: "center", gap: 6,
                                padding: "6px 12px", background: "none", border: "1px solid var(--border-primary)", borderRadius: 6,
                                cursor: "pointer", fontSize: 13, color: "var(--text-secondary)", fontWeight: 500
                            }}
                        >
                            <Download size={14} /> Export CSV
                        </button>
                        <button
                            onClick={onClose}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-secondary)", padding: "0 4px", lineHeight: 1 }}
                            aria-label="Close"
                        >✕</button>
                    </div>
                </div>

                {/* Month nav */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 16 }}>
                    <button onClick={prevMonth} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-primary)", display: "flex" }}>
                        <ChevronLeft size={18} />
                    </button>
                    <span style={{ fontWeight: 600, fontSize: 15, minWidth: 150, textAlign: "center" }}>
                        {MODAL_MONTHS[month]} {year}
                    </span>
                    <button onClick={nextMonth} disabled={isCurrentMonth} style={{ background: "none", border: "none", cursor: isCurrentMonth ? "not-allowed" : "pointer", opacity: isCurrentMonth ? 0.3 : 1, color: "var(--text-primary)", display: "flex" }}>
                        <ChevronRight size={18} />
                    </button>
                </div>

                {/* Summary pills */}
                {s && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, justifyContent: "center" }}>
                        {[
                            { label: "Present", value: s.totalPresent, color: "#16a34a", bg: "#dcfce7" },
                            { label: "Absent", value: s.totalAbsent, color: "#dc2626", bg: "#fee2e2" },
                            { label: "Hours", value: `${s.totalHours.toFixed(1)}h`, color: "#2563eb", bg: "#dbeafe" },
                            { label: "Flagged", value: s.flaggedDays, color: "#7c3aed", bg: "#ede9fe" },
                        ].map(p => (
                            <div key={p.label} style={{ background: p.bg, color: p.color, borderRadius: 20, padding: "4px 14px", fontSize: 13, fontWeight: 600 }}>
                                {p.value} {p.label}
                            </div>
                        ))}
                    </div>
                )}

                {loading ? (
                    <div style={{ textAlign: "center", padding: 40, color: "var(--text-tertiary)" }}>Loading…</div>
                ) : (
                    <>
                        {/* Calendar grid */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 16 }}>
                            {MODAL_WEEKDAYS.map(d => (
                                <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", paddingBottom: 4 }}>{d}</div>
                            ))}
                            {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                            {Array.from({ length: daysInMonth }).map((_, i) => {
                                const day = i + 1;
                                const dayData = getDayData(day);
                                const status = dayData?.status || "UPCOMING";
                                const color = dotColor(status);
                                const isSelected = selectedDay?.date === dayData?.date;
                                const isToday = day === now.getDate() && month === now.getMonth() && year === now.getFullYear();
                                return (
                                    <div
                                        key={day}
                                        onClick={() => dayData && setSelectedDay(isSelected ? null : dayData)}
                                        style={{
                                            textAlign: "center", padding: "6px 2px",
                                            borderRadius: 8, cursor: dayData ? "pointer" : "default",
                                            background: isSelected ? "var(--bg-secondary)" : isToday ? "rgba(37,99,235,0.08)" : "transparent",
                                            border: isToday ? "1.5px solid #2563eb" : isSelected ? "1.5px solid var(--border-secondary)" : "1.5px solid transparent",
                                            transition: "background 0.1s",
                                        }}
                                    >
                                        <div style={{ fontSize: 13, fontWeight: isToday ? 700 : 400, color: "var(--text-primary)", lineHeight: 1.3 }}>{day}</div>
                                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, margin: "3px auto 0" }} />
                                    </div>
                                );
                            })}
                        </div>

                        {/* Day detail panel */}
                        {selectedDay ? (
                            <div style={{ background: "var(--bg-secondary)", borderRadius: 10, padding: "12px 16px", fontSize: 13, lineHeight: 2, border: "1px solid var(--border-primary)" }}>
                                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                                    {new Date(selectedDay.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 16px" }}>
                                    <div style={{ color: "var(--text-secondary)" }}>Status</div>
                                    <div style={{ fontWeight: 600, color: dotColor(selectedDay.status) }}>{selectedDay.status}</div>
                                    <div style={{ color: "var(--text-secondary)" }}>Check In</div>
                                    <div>{selectedDay.checkInAt ? new Date(selectedDay.checkInAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—"}</div>
                                    <div style={{ color: "var(--text-secondary)" }}>Check Out</div>
                                    <div>{selectedDay.checkOutAt ? new Date(selectedDay.checkOutAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—"}</div>
                                    <div style={{ color: "var(--text-secondary)" }}>Hours</div>
                                    <div>{selectedDay.totalHours != null ? `${selectedDay.totalHours.toFixed(1)}h` : "—"}</div>
                                    {selectedDay.verificationScore != null && <>
                                        <div style={{ color: "var(--text-secondary)" }}>Score</div>
                                        <div>{selectedDay.verificationScore}/100</div>
                                    </>}
                                    {selectedDay.remark && <>
                                        <div style={{ color: "var(--text-secondary)" }}>Remark</div>
                                        <div style={{ fontStyle: "italic" }}>💬 {selectedDay.remark}</div>
                                    </>}
                                    {selectedDay.isHalfDay && <>
                                        <div style={{ color: "var(--text-secondary)" }}>Half Day</div>
                                        <div style={{ color: "#d97706", fontWeight: 600 }}>Yes</div>
                                    </>}
                                    {selectedDay.earlyReason && <>
                                        <div style={{ color: "var(--text-secondary)" }}>Early Checkout</div>
                                        <div style={{ fontStyle: "italic", color: "#dc2626" }}>{selectedDay.earlyReason}</div>
                                    </>}
                                    {selectedDay.breaks && selectedDay.breaks.length > 0 && <>
                                        <div style={{ color: "var(--text-secondary)" }}>Breaks</div>
                                        <div>
                                            {selectedDay.breaks.map((b, i) => (
                                                <div key={i} style={{ fontSize: 11, background: "rgba(0,0,0,0.05)", padding: "2px 6px", borderRadius: 4, display: "inline-block", marginRight: 4, marginBottom: 4 }}>
                                                    ☕ {new Date(b.start).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })} - {b.end ? new Date(b.end).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "Ongoing"}
                                                </div>
                                            ))}
                                        </div>
                                    </>}
                                </div>
                            </div>
                        ) : (
                            <div style={{ textAlign: "center", fontSize: 12, color: "var(--text-tertiary)", padding: "8px 0" }}>Click a day to see details</div>
                        )}

                        {/* Legend */}
                        <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap", justifyContent: "center" }}>
                            {[
                                { label: "Present", color: "#16a34a" },
                                { label: "Absent", color: "#dc2626" },
                                { label: "Leave", color: "#d97706" },
                                { label: "Flagged", color: "#7c3aed" },
                                { label: "Weekend", color: "#94a3b8" },
                            ].map(l => (
                                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-secondary)" }}>
                                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: l.color }} />
                                    {l.label}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );

    return createPortal(modal, document.body);
}

// ─── Advanced Export Modal ─────────────────────────────────────────────────────
function AdvancedExportModal({ onClose }: { onClose: () => void }) {
    const [loading, setLoading] = useState(true);
    const [options, setOptions] = useState<{ employees: { id: string; fullName: string; employeeId: string }[]; departments: { id: string; name: string }[] }>({ employees: [], departments: [] });

    const now = new Date();
    const firstDayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const [start, setStart] = useState(firstDayStr);
    const [end, setEnd] = useState(todayStr);
    const [empId, setEmpId] = useState("all");
    const [deptId, setDeptId] = useState("all");
    const [role, setRole] = useState("all");
    const [stats, setStats] = useState(true);
    const [downloading, setDownloading] = useState(false);

    useEffect(() => {
        apiGet<{ employees: any[]; departments: any[] }>("/api/attendance/export-options")
            .then(res => {
                if (res.data) setOptions(res.data);
            })
            .finally(() => setLoading(false));
    }, []);

    const handleDownload = async () => {
        setDownloading(true);
        try {
            const params = new URLSearchParams({
                start, end, empId, deptId, role, stats: stats.toString()
            });
            const res = await fetch(`/api/attendance/export-advanced?${params.toString()}`);
            if (!res.ok) {
                const text = await res.text();
                alert(`Export failed: ${text}`);
                return;
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `attendance-export-${start}-to-${end}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            onClose();
        } catch (e: any) {
            alert(`Error: ${e.message}`);
        } finally {
            setDownloading(false);
        }
    };

    const modal = (
        <div
            onClick={onClose}
            style={{
                position: "fixed", inset: 0, zIndex: 9999,
                background: "rgba(10,20,40,0.65)", backdropFilter: "blur(6px)",
                display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: "var(--bg-primary)", borderRadius: 16, padding: 24,
                    width: "100%", maxWidth: 500,
                    boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
                    border: "1px solid var(--border-primary)",
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <h2 style={{ margin: 0, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
                        <Download size={20} className="text-primary" /> Advanced Export
                    </h2>
                    <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-secondary)" }}>✕</button>
                </div>

                {loading ? (
                    <div style={{ padding: 40, textAlign: "center", color: "var(--text-tertiary)" }}>Loading options…</div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div>
                                <label style={{ display: "block", fontSize: 13, marginBottom: 6, fontWeight: 500, color: "var(--text-secondary)" }}>From Date</label>
                                <input type="date" value={start} onChange={e => setStart(e.target.value)} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }} />
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: 13, marginBottom: 6, fontWeight: 500, color: "var(--text-secondary)" }}>To Date</label>
                                <input type="date" value={end} onChange={e => setEnd(e.target.value)} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }} />
                            </div>
                        </div>

                        <div>
                            <label style={{ display: "block", fontSize: 13, marginBottom: 6, fontWeight: 500, color: "var(--text-secondary)" }}>Employee</label>
                            <select value={empId} onChange={e => setEmpId(e.target.value)} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}>
                                <option value="all">All Employees</option>
                                {options.employees.map(e => (
                                    <option key={e.id} value={e.id}>{e.fullName} ({e.employeeId})</option>
                                ))}
                            </select>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div>
                                <label style={{ display: "block", fontSize: 13, marginBottom: 6, fontWeight: 500, color: "var(--text-secondary)" }}>Department</label>
                                <select value={deptId} onChange={e => setDeptId(e.target.value)} disabled={empId !== "all"} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)", opacity: empId !== "all" ? 0.5 : 1 }}>
                                    <option value="all">All Departments</option>
                                    {options.departments.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ display: "block", fontSize: 13, marginBottom: 6, fontWeight: 500, color: "var(--text-secondary)" }}>Role</label>
                                <select value={role} onChange={e => setRole(e.target.value)} disabled={empId !== "all"} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-secondary)", color: "var(--text-primary)", opacity: empId !== "all" ? 0.5 : 1 }}>
                                    <option value="all">All Roles</option>
                                    <option value="EMP">Employee (EMP)</option>
                                    <option value="MGR">Manager (MGR)</option>
                                    <option value="HRBP">HR Business Partner</option>
                                </select>
                            </div>
                        </div>

                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 8 }}>
                            <input type="checkbox" checked={stats} onChange={e => setStats(e.target.checked)} style={{ width: 16, height: 16, accentColor: "var(--color-primary, #2563eb)", cursor: "pointer" }} />
                            <span style={{ fontSize: 14, color: "var(--text-primary)" }}>Include Statistics Summary</span>
                        </label>

                        <button
                            onClick={handleDownload}
                            disabled={downloading || !start || !end}
                            style={{
                                marginTop: 12, width: "100%", padding: "12px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: (downloading || !start || !end) ? "not-allowed" : "pointer",
                                background: "var(--color-primary, #2563eb)", color: "white", border: "none", opacity: (downloading || !start || !end) ? 0.7 : 1,
                                display: "flex", justifyContent: "center", alignItems: "center", gap: 8
                            }}
                        >
                            {downloading ? "Generating CSV..." : <><Download size={16} /> Download Report</>}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );

    return createPortal(modal, document.body);
}



export default function TeamAttendancePage() {
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [data, setData] = useState<DayData | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [filter, setFilter] = useState<Filter>("ALL");
    const [search, setSearch] = useState("");
    const [viewingEmployee, setViewingEmployee] = useState<{ id: string; fullName: string; employeeId: string } | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [showExportModal, setShowExportModal] = useState(false);

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

                <div style={{ flex: 1 }} />

                {/* Export button */}
                <button
                    onClick={() => setShowExportModal(true)}
                    style={{
                        padding: "7px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer",
                        background: "none", color: "var(--text-primary)", border: "1px solid var(--border)",
                        fontWeight: 600, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                        marginLeft: "auto"
                    }}
                >
                    <Download size={15} /> Export CSV
                </button>
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
                                            <td style={{ padding: "11px 14px", fontWeight: 500 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                    {m.fullName}
                                                    <button
                                                        onClick={() => setViewingEmployee({ id: m.id, fullName: m.fullName, employeeId: m.employeeId })}
                                                        title={`View ${m.fullName}'s monthly attendance`}
                                                        style={{
                                                            background: "none", border: "none", cursor: "pointer",
                                                            color: "var(--text-tertiary)", display: "flex", alignItems: "center",
                                                            padding: 0, borderRadius: 4, transition: "color 0.15s",
                                                        }}
                                                        onMouseEnter={e => (e.currentTarget.style.color = "#2563eb")}
                                                        onMouseLeave={e => (e.currentTarget.style.color = "var(--text-tertiary)")}
                                                        aria-label={`View ${m.fullName}'s attendance`}
                                                    >
                                                        <Eye size={14} />
                                                    </button>
                                                </div>
                                            </td>
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
                                            <td style={{ padding: "11px 14px", color: "var(--text-secondary)" }}>
                                                {fmtHours(m.totalHours)}
                                                {m.breaks && m.breaks.length > 0 && (
                                                    <span title={`${m.breaks.length} break(s)`} style={{ marginLeft: 6, fontSize: 11, background: "var(--bg-card)", padding: "2px 6px", borderRadius: 10, border: "1px solid var(--border)" }}>
                                                        ☕ {m.breaks.length}
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: "11px 14px", maxWidth: 220 }}>
                                                {m.isHalfDay && (
                                                    <span style={{ fontSize: 11, background: "#fef3c7", color: "#92400e", padding: "1px 6px", borderRadius: 4, fontWeight: 600, display: "inline-block", marginBottom: 3 }}>
                                                        Half Day
                                                    </span>
                                                )}
                                                {m.earlyReason && (
                                                    <span title={m.earlyReason} style={{ fontSize: 12, color: "#dc2626", fontStyle: "italic", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                        Early: {m.earlyReason}
                                                    </span>
                                                )}
                                                {m.remark && (
                                                    <span title={m.remark} style={{
                                                        fontSize: 12, color: "var(--text-secondary)", fontStyle: "italic", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                                    }}>
                                                        💬 {m.remark}
                                                    </span>
                                                )}
                                                {!m.isHalfDay && !m.earlyReason && !m.remark && (
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

            {/* Employee Month Modal */}
            {viewingEmployee && (
                <EmployeeMonthModal
                    employee={viewingEmployee}
                    onClose={() => setViewingEmployee(null)}
                />
            )}

            {/* Advanced Export Modal */}
            {showExportModal && (
                <AdvancedExportModal onClose={() => setShowExportModal(false)} />
            )}
        </div>
    );
}
