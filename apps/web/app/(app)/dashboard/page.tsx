"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { apiGet } from "@/lib/api-client";

interface DashboardData {
    greeting?: string;
    checkedIn?: boolean;
    checkInTime?: string;
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
                        present: d.teamSummary?.present ?? d.present ?? 0,
                        onLeave: d.teamSummary?.onLeave ?? d.onLeave ?? 0,
                        absent: d.teamSummary?.absent ?? d.absent ?? 0,
                        remote: d.teamSummary?.remote ?? d.remote ?? 0,
                        pendingApprovals: d.approvals?.pending ?? d.pendingApprovals ?? 0,
                    });
                }
            }
            const res = await apiGet<any>("/api/dashboard/employee");
            if (res.data) {
                const d = res.data;
                const todayInfo = d.today || {};
                const checkedIn = todayInfo.status === "CHECKED_IN";
                const checkInAt = todayInfo.checkInAt ? new Date(todayInfo.checkInAt) : null;
                setData({
                    checkedIn,
                    checkInTime: checkInAt ? checkInAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : undefined,
                    workingHours: todayInfo.totalHours ?? 0,
                    location: d.user?.department || undefined,
                    pendingCount: d.pendingApprovals ?? 0,
                    // Also handle direct flat shape if API already returns it
                    ...(d.checkedIn !== undefined ? { checkedIn: d.checkedIn, checkInTime: d.checkInTime, workingHours: d.workingHours, location: d.location } : {}),
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
                    <div className="dash-stat-card">
                        <div className="dash-stat-icon blue">🏠</div>
                        <div>
                            <div className="dash-stat-value">{managerData.remote ?? 0}</div>
                            <div className="dash-stat-label">Remote</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Check-In Status Card */}
            <div className="dash-checkin-card animate-slideUp">
                <div className="dash-checkin-status">
                    {data.checkedIn ? "✅ CHECKED IN" : "⬜ NOT CHECKED IN"}
                </div>
                <div className="dash-checkin-time">
                    {data.checkInTime || "--:--"} {data.checkedIn && data.location && `· ${data.location}`}
                </div>
                <div className="dash-checkin-location">
                    {data.checkedIn
                        ? `Working: ${data.workingHours?.toFixed(1) || 0}h`
                        : "Tap below to check in"}
                </div>
                <Link
                    href="/attendance"
                    className="btn btn-primary"
                    style={{ background: "rgba(255,255,255,0.2)", color: "white", borderColor: "rgba(255,255,255,0.3)" }}
                >
                    {data.checkedIn ? "View Attendance" : "Check In Now"}
                </Link>
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
