"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiGet, apiPost } from "@/lib/api-client";

interface TodayData {
    checkedIn: boolean;
    checkInTime?: string;
    checkOutTime?: string;
    location?: string;
    verificationScore?: number;
    totalMinutes?: number;
}

interface HistoryDay {
    date: string;
    status: "verified" | "flagged" | "absent" | "leave" | "weekend" | "future";
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function AttendancePage() {
    const now = new Date();
    const [month, setMonth] = useState(now.getMonth());
    const [year, setYear] = useState(now.getFullYear());
    const [today, setToday] = useState<TodayData>({ checkedIn: false });
    const [history, setHistory] = useState<HistoryDay[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    // Load data
    useEffect(() => {
        async function load() {
            setLoading(true);
            const [todayRes, historyRes] = await Promise.all([
                apiGet<TodayData>("/api/attendance/today"),
                apiGet<{ records: HistoryDay[] }>(`/api/attendance/history?month=${month + 1}&year=${year}`),
            ]);
            if (todayRes.data) setToday(todayRes.data);
            if (historyRes.data?.records) setHistory(historyRes.data.records);
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
        const res = await apiPost("/api/attendance/checkin", {
            latitude: 19.076,
            longitude: 72.8777,
            deviceId: "web-browser",
        });
        if (res.data) {
            setToday(prev => ({
                ...prev,
                checkedIn: true,
                checkInTime: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
                totalMinutes: 0,
            }));
        }
        setActionLoading(false);
    }, []);

    const handleCheckOut = useCallback(async () => {
        setActionLoading(true);
        const res = await apiPost("/api/attendance/checkout", {});
        if (res.data) {
            setToday(prev => ({ ...prev, checkedIn: false, checkOutTime: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) }));
            if (intervalRef.current) clearInterval(intervalRef.current);
        }
        setActionLoading(false);
    }, []);

    // Calendar generation
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayDate = now.getDate();
    const todayMonth = now.getMonth();
    const todayYear = now.getFullYear();

    function getDotClass(day: number): string {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const record = history.find(h => h.date === dateStr);
        if (record) return record.status;
        const d = new Date(year, month, day);
        if (d > now) return "future";
        if (d.getDay() === 0 || d.getDay() === 6) return "future";
        return "";
    }

    function prevMonth() {
        if (month === 0) { setMonth(11); setYear(y => y - 1); }
        else setMonth(m => m - 1);
    }

    function nextMonth() {
        if (month === 11) { setMonth(0); setYear(y => y + 1); }
        else setMonth(m => m + 1);
    }

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

                    {/* Empty cells before first day */}
                    {Array.from({ length: firstDay }).map((_, i) => (
                        <div key={`e${i}`} className="att-calendar-day empty" />
                    ))}

                    {/* Day cells */}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const isToday = day === todayDate && month === todayMonth && year === todayYear;
                        const dotClass = getDotClass(day);
                        return (
                            <div
                                key={day}
                                className={`att-calendar-day ${isToday ? "today" : ""}`}
                            >
                                {day}
                                {dotClass && <span className={`att-dot ${dotClass}`} />}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Today Card */}
            <div className="att-today-card animate-slideUp">
                <h3 style={{ fontWeight: "var(--font-semibold)", marginBottom: "var(--space-4)" }}>Today</h3>

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
                        {today.verificationScore !== undefined ? (
                            <span className={`badge ${today.verificationScore >= 80 ? "badge-success" : today.verificationScore >= 50 ? "badge-warning" : "badge-danger"}`}>
                                {today.verificationScore}/100
                            </span>
                        ) : "—"}
                    </span>
                </div>

                <div style={{ marginTop: "var(--space-6)" }}>
                    {today.checkedIn ? (
                        <button
                            className="btn btn-danger btn-full"
                            onClick={handleCheckOut}
                            disabled={actionLoading}
                        >
                            {actionLoading ? <><span className="spinner" /> Checking out...</> : "Check Out"}
                        </button>
                    ) : (
                        <button
                            className="btn btn-primary btn-full"
                            onClick={handleCheckIn}
                            disabled={actionLoading}
                        >
                            {actionLoading ? <><span className="spinner" /> Checking in...</> : "Check In"}
                        </button>
                    )}
                </div>
            </div>

            {/* Summary */}
            <div className="att-summary">
                <span>Present: <strong>—</strong></span>
                <span>Late: <strong>—</strong></span>
                <span>Overtime: <strong>—</strong></span>
            </div>
        </div>
    );
}
