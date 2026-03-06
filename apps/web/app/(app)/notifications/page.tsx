"use client";

import { useState, useEffect } from "react";
import { apiGet, api } from "@/lib/api-client";
import "@/styles/admin.css";

type NotifCategory = "all" | "attendance" | "approval" | "alert" | "message";

interface Notification {
    id: string;
    type: "attendance" | "approval" | "alert" | "message" | "system";
    title: string;
    subtitle: string;
    time: string;
    isRead: boolean;
    createdAt: string;
}

const CATEGORY_ICONS: Record<string, string> = {
    attendance: "⏱️",
    approval: "✅",
    alert: "⚠️",
    message: "💬",
    system: "🔔",
};

function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "Just now";
    if (m < 60) return `${m} min ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

function isToday(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

export default function NotificationsPage() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<NotifCategory>("all");
    const [markingAll, setMarkingAll] = useState(false);

    useEffect(() => {
        async function load() {
            setLoading(true);
            const res = await apiGet<{ notifications: Notification[] }>("/api/notifications");
            if (res.data?.notifications) {
                setNotifications(res.data.notifications);
                // Auto-mark all as read when the page is opened
                // This clears the navbar badge immediately for the user
                const hasUnread = res.data.notifications.some(n => !n.isRead);
                if (hasUnread) {
                    await api("/api/notifications/read", {
                        method: "PATCH",
                        body: JSON.stringify({ markAll: true }),
                    });
                    // Optimistically mark all as read in local state too
                    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
                }
            }
            setLoading(false);
        }
        load();
    }, []);

    async function markAllRead() {
        setMarkingAll(true);
        // Correct payload: { markAll: true } via PATCH
        await api("/api/notifications/read", {
            method: "PATCH",
            body: JSON.stringify({ markAll: true }),
        });
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        setMarkingAll(false);
    }

    async function markOneRead(id: string) {
        // Correct payload: { ids: [id] } via PATCH
        await api("/api/notifications/read", {
            method: "PATCH",
            body: JSON.stringify({ ids: [id] }),
        });
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    }

    const filtered = filter === "all"
        ? notifications
        : notifications.filter(n => n.type === filter);

    const unreadCount = notifications.filter(n => !n.isRead).length;
    const todayItems = filtered.filter(n => isToday(n.createdAt));
    const earlierItems = filtered.filter(n => !isToday(n.createdAt));

    if (loading) {
        return (
            <div>
                <div className="skeleton skeleton-title" style={{ marginBottom: 24 }} />
                {[1, 2, 3, 4].map(i => (
                    <div key={i} className="skeleton" style={{ height: 72, borderRadius: 12, marginBottom: 8 }} />
                ))}
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="notif-header animate-fadeIn">
                <div style={{ display: "flex", alignItems: "center" }}>
                    <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)" }}>
                        Notifications
                    </h1>
                    {unreadCount > 0 && (
                        <span className="notif-unread-badge">{unreadCount}</span>
                    )}
                </div>
                {unreadCount > 0 && (
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={markAllRead}
                        disabled={markingAll}
                    >
                        {markingAll ? <span className="spinner" /> : "✓ Mark all read"}
                    </button>
                )}
            </div>

            {/* Filter chips */}
            <div className="approval-filters" style={{ marginBottom: "var(--space-5)" }}>
                {(["all", "attendance", "approval", "alert", "message"] as NotifCategory[]).map(f => (
                    <button
                        key={f}
                        className={`filter-chip ${filter === f ? "active" : ""}`}
                        onClick={() => setFilter(f)}
                    >
                        {f === "all" ? "All" : `${CATEGORY_ICONS[f]} ${f.charAt(0).toUpperCase() + f.slice(1)}`}
                    </button>
                ))}
            </div>

            {/* Empty state */}
            {filtered.length === 0 && (
                <div className="approval-empty animate-fadeIn">
                    <span className="approval-empty-icon">🔔</span>
                    <div className="approval-empty-text">No notifications</div>
                    <div className="approval-empty-sub">You're all caught up!</div>
                </div>
            )}

            {/* Today group */}
            {todayItems.length > 0 && (
                <div>
                    <div className="notif-group-label">Today</div>
                    {todayItems.map(n => (
                        <div
                            key={n.id}
                            className={`notif-item ${!n.isRead ? "unread" : ""}`}
                            onClick={() => !n.isRead && markOneRead(n.id)}
                        >
                            <div className={`notif-icon ${n.type}`}>
                                {CATEGORY_ICONS[n.type]}
                            </div>
                            <div className="notif-body">
                                <div className="notif-title">{n.title}</div>
                                <div className="notif-subtitle">{n.subtitle}</div>
                                <div className="notif-time">{timeAgo(n.createdAt)}</div>
                            </div>
                            {!n.isRead && <div className="notif-unread-dot" />}
                        </div>
                    ))}
                </div>
            )}

            {/* Earlier group */}
            {earlierItems.length > 0 && (
                <div>
                    <div className="notif-group-label">Earlier</div>
                    {earlierItems.map(n => (
                        <div
                            key={n.id}
                            className={`notif-item ${!n.isRead ? "unread" : ""}`}
                            onClick={() => !n.isRead && markOneRead(n.id)}
                        >
                            <div className={`notif-icon ${n.type}`}>
                                {CATEGORY_ICONS[n.type]}
                            </div>
                            <div className="notif-body">
                                <div className="notif-title">{n.title}</div>
                                <div className="notif-subtitle">{n.subtitle}</div>
                                <div className="notif-time">{timeAgo(n.createdAt)}</div>
                            </div>
                            {!n.isRead && <div className="notif-unread-dot" />}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
