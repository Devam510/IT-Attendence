"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiGet, apiPost } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";

interface TodayData {
    checkedIn: boolean;
    checkInTime?: string;
    checkOutTime?: string;
    location?: string;
    verificationScore?: number;
    totalMinutes?: number;
}

interface CalendarDay {
    date: string;
    status: string;
    checkInAt: string | null;
    checkOutAt: string | null;
    totalHours: number | null;
    overtimeHours?: number | null;
    verificationScore?: number | null;
    checkInMethod?: string;
}

interface HistoryResponse {
    calendar: CalendarDay[];
    summary: {
        totalPresent: number;
        totalHours: number;
        totalOvertime: number;
        flaggedDays: number;
        daysInMonth: number;
    };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Format an ISO date string to IST time
function formatTime(isoStr: string | null): string {
    if (!isoStr) return "--:--";
    try {
        return new Date(isoStr).toLocaleTimeString("en-US", {
            hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata",
        });
    } catch {
        return "--:--";
    }
}

export default function AttendancePage() {
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth());
    const [year, setYear] = useState(now.getFullYear());
    const [today, setToday] = useState<TodayData>({ checkedIn: false });
    const [calendar, setCalendar] = useState<CalendarDay[]>([]);
    const [summary, setSummary] = useState<HistoryResponse["summary"] | null>(null);
    const [selectedDate, setSelectedDate] = useState<string | null>(null); // "2026-03-04" or null = today
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [toast, setToast] = useState<{ message: string; type: "error" | "success" } | null>(null);
    const { user } = useAuth();
    // Token key is scoped per user so switching accounts never mixes tokens
    const tokenKey = `nexus-checkin-token-${user?.id || "guest"}`;
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    // Auto-dismiss toast
    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 5000);
            return () => clearTimeout(t);
        }
    }, [toast]);

    // Load data
    useEffect(() => {
        async function load() {
            setLoading(true);
            // API expects ?month=2026-03 format
            const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
            const [todayRes, historyRes] = await Promise.all([
                apiGet<TodayData>("/api/attendance/today"),
                apiGet<HistoryResponse>(`/api/attendance/history?month=${monthStr}`),
            ]);
            if (todayRes.data) setToday(todayRes.data);
            if (historyRes.data) {
                setCalendar(historyRes.data.calendar || []);
                setSummary(historyRes.data.summary || null);
            }
            setLoading(false);
        }
        load();
    }, [month, year]);

    // Live timer when checked in
    useEffect(() => {
        if (today.checkedIn && today.totalMinutes) {
            setElapsed(today.totalMinutes * 60);
            intervalRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [today.checkedIn, today.totalMinutes]);

    const formatElapsed = (secs: number) => {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
    };

    const handleCheckIn = useCallback(async () => {
        setActionLoading(true);
        setToast(null);

        // Get real browser location
        let latitude = 0, longitude = 0;
        try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
                navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
            );
            latitude = pos.coords.latitude;
            longitude = pos.coords.longitude;
        } catch {
            setToast({ message: "📍 Location access required for check-in", type: "error" });
            setActionLoading(false);
            return;
        }

        const res = await apiPost<TodayData & { sessionToken?: string }>("/api/attendance/checkin", { latitude, longitude });
        if (res.data) {
            setToday(prev => ({
                ...prev,
                checkedIn: true,
                checkInTime: res.data!.checkInTime || new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }),
                location: res.data!.location || "Office",
            }));
            // Store session token scoped to this user
            if (res.data.sessionToken) {
                localStorage.setItem(tokenKey, res.data.sessionToken);
            }
            setToast({ message: "✅ Checked in successfully!", type: "success" });
            setSelectedDate(null); // Show today
        } else {
            setToast({ message: res.error || "Check-in failed", type: "error" });
        }
        setActionLoading(false);
    }, []);

    const handleCheckOut = useCallback(async () => {
        setActionLoading(true);
        setToast(null);

        const sessionToken = localStorage.getItem(tokenKey) || "";

        const res = await apiPost<TodayData>("/api/attendance/checkout", { sessionToken });
        if (res.data) {
            setToday(prev => ({
                ...prev,
                checkedIn: false,
                checkOutTime: res.data!.checkOutTime || new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }),
            }));
            localStorage.removeItem(tokenKey);
            if (intervalRef.current) clearInterval(intervalRef.current);
            setToast({ message: "✅ Checked out successfully!", type: "success" });
        } else {
            setToast({ message: res.error || "Check-out failed", type: "error" });
        }
        setActionLoading(false);
    }, []);

    // Calendar generation
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayDate = now.getDate();
    const todayMonth = now.getMonth();
    const todayYear = now.getFullYear();

    // Build today's date string for comparison
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    function getCalendarDay(day: number): CalendarDay | undefined {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        return calendar.find(c => c.date === dateStr);
    }

    function getDotClass(day: number): string {
        const calDay = getCalendarDay(day);
        if (!calDay) return "";
        const s = calDay.status;
        if (s === "VERIFIED" || s === "PRESENT" || s === "REGULARIZED") return "verified";
        if (s === "FLAGGED") return "flagged";
        if (s === "ABSENT") return "absent";
        if (s === "LEAVE") return "leave";
        if (s === "WEEKEND") return "future";
        if (s === "UPCOMING") return "future";
        // If has check-in, show as verified
        if (calDay.checkInAt) return "verified";
        return "";
    }

    function handleDateClick(day: number) {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const d = new Date(year, month, day);
        // Don't select future dates
        if (d > now) return;
        // Toggle: click same date = go back to today
        if (selectedDate === dateStr) {
            setSelectedDate(null);
        } else {
            setSelectedDate(dateStr);
        }
    }

    function prevMonth() {
        if (month === 0) { setMonth(11); setYear(y => y - 1); }
        else setMonth(m => m - 1);
        setSelectedDate(null);
    }

    function nextMonth() {
        if (month === 11) { setMonth(0); setYear(y => y + 1); }
        else setMonth(m => m + 1);
        setSelectedDate(null);
    }

    // Get data for the selected day
    const isShowingToday = !selectedDate || selectedDate === todayStr;
    const selectedCalDay = selectedDate ? calendar.find(c => c.date === selectedDate) : null;

    // Format the selected date label
    const selectedLabel = isShowingToday
        ? "Today"
        : (() => {
            try {
                const d = new Date(selectedDate + "T12:00:00");
                return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
            } catch { return selectedDate; }
        })();

    if (loading) {
        return (
            <div>
                <div className="skeleton skeleton-title" style={{ marginBottom: 24 }} />
                <div className="skeleton skeleton-card" style={{ height: 300, marginBottom: 24 }} />
                <div className="skeleton skeleton-card" style={{ height: 150 }} />
            </div>
        );
    }

    return (
        <div>
            {/* Toast Notification */}
            {toast && (
                <div
                    style={{
                        position: "fixed",
                        top: 80,
                        left: "50%",
                        transform: "translateX(-50%)",
                        zIndex: 9999,
                        padding: "12px 24px",
                        borderRadius: "12px",
                        background: toast.type === "error" ? "#dc2626" : "#16a34a",
                        color: "white",
                        fontSize: "var(--text-sm)",
                        fontWeight: "var(--font-medium)",
                        boxShadow: "0 8px 30px rgba(0,0,0,0.3)",
                        maxWidth: 420,
                        textAlign: "center",
                        animation: "slideDown 0.3s ease-out",
                        cursor: "pointer",
                    }}
                    onClick={() => setToast(null)}
                >
                    {toast.message}
                </div>
            )}

            {/* Header */}
            <div className="att-header">
                <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)" }}>Attendance</h1>
            </div>

            {/* Month Navigation */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "var(--space-4)" }}>
                <button className="att-month-btn" onClick={prevMonth} aria-label="Previous month">◀</button>
                <span className="att-month" style={{ minWidth: 180, justifyContent: "center" }}>
                    {MONTHS[month]} {year}
                </span>
                <button className="att-month-btn" onClick={nextMonth} aria-label="Next month">▶</button>
            </div>

            {/* Calendar Grid */}
            <div className="att-calendar animate-fadeIn">
                <div className="att-calendar-grid">
                    {WEEKDAYS.map(d => (
                        <div key={d} className="att-calendar-header">{d}</div>
                    ))}
                    {Array.from({ length: firstDay }).map((_, i) => (
                        <div key={`e${i}`} className="att-calendar-day empty" />
                    ))}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const isToday = day === todayDate && month === todayMonth && year === todayYear;
                        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                        const isSelected = selectedDate === dateStr;
                        const isPast = new Date(year, month, day) <= now;
                        const dotClass = getDotClass(day);
                        return (
                            <div
                                key={day}
                                className={`att-calendar-day ${isToday ? "today" : ""} ${isSelected ? "selected" : ""}`}
                                onClick={() => isPast && handleDateClick(day)}
                                style={{
                                    cursor: isPast ? "pointer" : "default",
                                    outline: isSelected ? "2px solid var(--color-primary, #6366f1)" : undefined,
                                    borderRadius: isSelected ? 10 : undefined,
                                    opacity: !isPast && !isToday ? 0.4 : 1,
                                }}
                            >
                                {day}
                                {dotClass && <span className={`att-dot ${dotClass}`} />}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Day Detail Card */}
            <div className="att-today-card animate-slideUp">
                <h3 style={{ fontWeight: "var(--font-semibold)", marginBottom: "var(--space-4)", display: "flex", alignItems: "center", gap: 8 }}>
                    {selectedLabel}
                    {!isShowingToday && (
                        <button
                            onClick={() => setSelectedDate(null)}
                            style={{
                                background: "none", border: "none", cursor: "pointer",
                                color: "var(--color-primary)", fontSize: "var(--text-xs)",
                                padding: "2px 8px", borderRadius: 6,
                                backgroundColor: "var(--color-primary-light, rgba(99,102,241,0.1))",
                            }}
                        >
                            ← Back to Today
                        </button>
                    )}
                </h3>

                {isShowingToday ? (
                    <>
                        {/* Today's live data */}
                        <div className="att-today-row">
                            <span className="att-today-label">🟢 Check In</span>
                            <span className="att-today-value">{today.checkInTime || "--:--"}</span>
                        </div>
                        <div className="att-today-row">
                            <span className="att-today-label">🔴 Check Out</span>
                            <span className="att-today-value">{today.checkOutTime || "--:--"}</span>
                        </div>
                        <div className="att-today-row">
                            <span className="att-today-label">📍 Location</span>
                            <span className="att-today-value">{today.location || "—"}</span>
                        </div>
                        <div className="att-today-row">
                            <span className="att-today-label">⏱️ Working Time</span>
                            <span className="att-today-value" style={{ color: "var(--color-primary)", fontFamily: "var(--font-mono)" }}>
                                {today.checkedIn ? formatElapsed(elapsed) : (today.totalMinutes ? `${(today.totalMinutes / 60).toFixed(1)}h` : "—")}
                            </span>
                        </div>
                        <div className="att-today-row">
                            <span className="att-today-label">🛡️ Verification</span>
                            <span className="att-today-value">
                                {today.verificationScore !== undefined && today.verificationScore !== null ? (
                                    <span className={`badge ${today.verificationScore >= 80 ? "badge-success" : today.verificationScore >= 50 ? "badge-warning" : "badge-danger"}`}>
                                        {today.verificationScore}/100
                                    </span>
                                ) : "—"}
                            </span>
                        </div>

                        <div style={{ marginTop: "var(--space-6)" }}>
                            {today.checkedIn ? (
                                <button className="btn btn-danger btn-full" onClick={handleCheckOut} disabled={actionLoading}>
                                    {actionLoading ? <><span className="spinner" /> Checking out...</> : "Check Out"}
                                </button>
                            ) : (
                                <button className="btn btn-primary btn-full" onClick={handleCheckIn} disabled={actionLoading}>
                                    {actionLoading ? <><span className="spinner" /> Checking in...</> : "Check In"}
                                </button>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        {/* Selected past day data */}
                        {selectedCalDay ? (
                            <>
                                <div className="att-today-row">
                                    <span className="att-today-label">📋 Status</span>
                                    <span className="att-today-value">
                                        <span className={`badge ${selectedCalDay.status === "PRESENT" || selectedCalDay.status === "VERIFIED" || selectedCalDay.status === "REGULARIZED" ? "badge-success" :
                                            selectedCalDay.status === "ABSENT" ? "badge-danger" :
                                                selectedCalDay.status === "LEAVE" ? "badge-warning" :
                                                    selectedCalDay.status === "WEEKEND" ? "badge-warning" : ""
                                            }`}>
                                            {selectedCalDay.status}
                                        </span>
                                    </span>
                                </div>
                                <div className="att-today-row">
                                    <span className="att-today-label">🟢 Check In</span>
                                    <span className="att-today-value">{formatTime(selectedCalDay.checkInAt)}</span>
                                </div>
                                <div className="att-today-row">
                                    <span className="att-today-label">🔴 Check Out</span>
                                    <span className="att-today-value">{formatTime(selectedCalDay.checkOutAt)}</span>
                                </div>
                                <div className="att-today-row">
                                    <span className="att-today-label">⏱️ Working Time</span>
                                    <span className="att-today-value" style={{ color: "var(--color-primary)", fontFamily: "var(--font-mono)" }}>
                                        {selectedCalDay.totalHours != null ? `${selectedCalDay.totalHours.toFixed(1)}h` : "—"}
                                    </span>
                                </div>

                                {selectedCalDay.verificationScore != null && (
                                    <div className="att-today-row">
                                        <span className="att-today-label">🛡️ Verification</span>
                                        <span className="att-today-value">
                                            <span className={`badge ${selectedCalDay.verificationScore >= 80 ? "badge-success" : selectedCalDay.verificationScore >= 50 ? "badge-warning" : "badge-danger"}`}>
                                                {selectedCalDay.verificationScore}/100
                                            </span>
                                        </span>
                                    </div>
                                )}
                                {selectedCalDay.checkInMethod && (
                                    <div className="att-today-row">
                                        <span className="att-today-label">📱 Method</span>
                                        <span className="att-today-value">{selectedCalDay.checkInMethod}</span>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div style={{ textAlign: "center", padding: "var(--space-6)", color: "var(--text-secondary)" }}>
                                <div style={{ fontSize: "2rem", marginBottom: 8 }}>📋</div>
                                No attendance record for this day
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Summary */}
            <div className="att-summary">
                <span>Present: <strong>{summary?.totalPresent ?? "—"}</strong></span>
                <span>Hours: <strong>{summary?.totalHours ? `${summary.totalHours.toFixed(1)}h` : "—"}</strong></span>

            </div>
        </div>
    );
}
