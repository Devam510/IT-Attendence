"use client";

import { useState, useEffect } from "react";
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
    present?: number;
    onLeave?: number;
    absent?: number;
    remote?: number;
    pendingApprovals?: number;
    approvalItems?: Array<{ id: string; name: string; type: string; dates: string }>;
}

export default function DashboardPage() {
    const { user } = useAuth();
    const [data, setData] = useState<DashboardData>({});
    const [managerData, setManagerData] = useState<ManagerData>({});
    const [loading, setLoading] = useState(true);

    const isManager = user?.role === "MGR" || user?.role === "HRA" || user?.role === "SADM";

    useEffect(() => {
        async function load() {
            if (isManager) {
                const res = await apiGet<any>("/api/dashboard/manager");
                if (res.data) {
                    const d = res.data;
                    setManagerData({
                        present: d.teamSummary?.present ?? 0,
                        onLeave: d.teamSummary?.onLeave ?? 0,
                        absent: d.teamSummary?.absent ?? 0,
                        remote: d.teamSummary?.remote ?? 0,
                        pendingApprovals: d.approvals?.pending ?? 0,
                    });
                }
            }
            const res = await apiGet<any>("/api/dashboard/employee");
            if (res.data) {
                const d = res.data;
                const todayInfo = d.today || {};
                const todayStatus = todayInfo.status; // "NOT_CHECKED_IN" | "CHECKED_IN" | "CHECKED_OUT"
                const checkedIn = todayStatus === "CHECKED_IN";
                const checkedOut = todayStatus === "CHECKED_OUT";
                const checkInAt = todayInfo.checkInAt ? new Date(todayInfo.checkInAt) : null;
                const checkOutAt = todayInfo.checkOutAt ? new Date(todayInfo.checkOutAt) : null;
                // Compute total hours from timestamps if DB value is 0 and we have both times
                let workingHours = todayInfo.totalHours ?? 0;
                if (workingHours === 0 && checkInAt && checkOutAt) {
                    workingHours = +((checkOutAt.getTime() - checkInAt.getTime()) / 3600000).toFixed(2);
                }
                setData({
                    checkedIn,
                    checkedOut,
                    checkInTime: checkInAt ? checkInAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : undefined,
                    checkOutTime: checkOutAt ? checkOutAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : undefined,
                    workingHours,
                    location: d.user?.department || undefined,
                    pendingCount: d.pendingApprovals ?? 0,
                });
            }
            setLoading(false);
        }
        load();
    }, [isManager]);

    const now = new Date();
    const greetingText = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
    const dateText = now.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    if (loading) {
        return (
            <div>
                <div className="skeleton skeleton-title" style={{ width: "40%", marginBottom: 24 }} />
                <div className="skeleton skeleton-card" style={{ marginBottom: 24 }} />
                <div className="dash-stats">
                    {[1, 2, 3, 4].map(i => <div key={i} className="skeleton skeleton-card" style={{ height: 80 }} />)}
                </div>
            </div>
        );
    }

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

            {/* Check-In Status Card */}
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
                            ? `Working: ${data.workingHours?.toFixed(1) || 0}h`
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
