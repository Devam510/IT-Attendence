"use client";

import { useState, useEffect } from "react";
import { apiGet, apiPost } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
// import "@/styles/tasks.css"; // We'll just reuse task styles for buttons/loaders or inline styles for feed

interface UserProfile {
    id: string;
    name: string;
    email: string;
    role: string;
    department: string;
}

interface DailyUpdate {
    id: string;
    content: string;
    createdAt: string;
    updatedAt: string;
    user: UserProfile;
}

const avatarColors = ["#1A56DB", "#E02424", "#FF8A4C", "#6366F1", "#0E9F6E", "#D97706"];

function getAvatarColor(name: string) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return avatarColors[Math.abs(hash) % avatarColors.length];
}

function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "Just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return new Date(dateStr).toLocaleDateString();
}

export default function UpdatesPage() {
    const { user } = useAuth();
    const [updates, setUpdates] = useState<DailyUpdate[]>([]);
    const [loading, setLoading] = useState(true);
    const [myUpdate, setMyUpdate] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: "error" | "success" } | null>(null);

    // Auto-dismiss toast
    useEffect(() => {
        if (toast) {
            const t = setTimeout(() => setToast(null), 5000);
            return () => clearTimeout(t);
        }
    }, [toast]);

    // Date filter
    const today = new Date().toISOString().split("T")[0] || "";
    const [selectedDate, setSelectedDate] = useState<string>(today);

    async function loadUpdates(dateStr: string) {
        setLoading(true);
        const res = await apiGet<{ date: string; updates: DailyUpdate[] }>(`/api/updates?date=${dateStr}`);
        if (res.data) {
            setUpdates(res.data.updates);
            // Pre-fill if the current user already posted on this date
            if (dateStr === today && user) {
                const existing = res.data.updates.find(u => u.user.id === user.id);
                if (existing) {
                    setMyUpdate(existing.content);
                } else {
                    setMyUpdate("");
                }
            }
        }
        setLoading(false);
    }

    useEffect(() => {
        loadUpdates(selectedDate);
    }, [selectedDate, user?.id]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!myUpdate.trim()) return;

        setIsSubmitting(true);
        const res = await apiPost<DailyUpdate>("/api/updates", { content: myUpdate });
        if (res.error) {
            setToast({ message: res.error, type: "error" });
        } else if (res.data) {
            setToast({ message: "Update posted successfully!", type: "success" });
            // Refresh to put it in the list (or update if edited)
            await loadUpdates(selectedDate);
        }
        setIsSubmitting(false);
    }

    const isToday = selectedDate === today;

    return (
        <div style={{ maxWidth: "800px", margin: "0 auto", paddingBottom: "var(--space-8)" }}>
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

            <div className="leave-header animate-fadeIn" style={{ marginBottom: "var(--space-6)" }}>
                <div>
                    <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)" }}>
                        Daily Updates
                    </h1>
                    <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", marginTop: "var(--space-1)" }}>
                        Share your progress and see what the team accomplished.
                    </p>
                </div>
                <div>
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="input"
                        style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-light)" }}
                        max={today}
                    />
                </div>
            </div>

            {/* Post update section (only on "Today" and NOT for Super Admins) */}
            {isToday && user?.role !== "SADM" && (
                <div className="update-composer animate-slideUp" style={{
                    background: "white",
                    borderRadius: "12px",
                    padding: "16px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                    marginBottom: "var(--space-6)",
                    border: "1px solid var(--border-light)"
                }}>
                    <form onSubmit={handleSubmit}>
                        <textarea
                            className="input"
                            style={{
                                width: "100%",
                                minHeight: "100px",
                                resize: "vertical",
                                padding: "12px",
                                outline: "none",
                                border: "1px solid var(--border-light)",
                                borderRadius: "8px",
                                fontSize: "var(--text-sm)",
                                marginBottom: "12px"
                            }}
                            placeholder="What did you work on today?"
                            value={myUpdate}
                            onChange={e => setMyUpdate(e.target.value)}
                        />
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={isSubmitting || !myUpdate.trim()}
                            >
                                {isSubmitting ? "Posting..." : "Post Update"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Feed Section */}
            <div className="updates-feed animate-slideUp" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="skeleton" style={{ height: 120, borderRadius: 12 }} />
                    ))
                ) : updates.length === 0 ? (
                    <div style={{
                        textAlign: "center",
                        padding: "48px 24px",
                        background: "white",
                        borderRadius: "12px",
                        border: "1px dashed var(--border-light)",
                        color: "var(--text-tertiary)"
                    }}>
                        <div style={{ fontSize: "2rem", marginBottom: "8px" }}>📝</div>
                        No updates posted on {isToday ? "today" : new Date(selectedDate).toLocaleDateString()} yet.
                    </div>
                ) : (
                    updates.map(update => (
                        <div key={update.id} style={{
                            background: "white",
                            borderRadius: "12px",
                            padding: "20px",
                            boxShadow: "0 2px 8px rgba(0,0,0,0.03)",
                            border: "1px solid var(--border-light)"
                        }}>
                            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", marginBottom: "12px" }}>
                                <div style={{
                                    width: "40px",
                                    height: "40px",
                                    borderRadius: "50%",
                                    background: getAvatarColor(update.user.name),
                                    color: "white",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontWeight: "bold",
                                    fontSize: "14px",
                                    flexShrink: 0
                                }}>
                                    {update.user.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <div style={{ fontWeight: "var(--font-semibold)", fontSize: "var(--text-sm)" }}>
                                            {update.user.name}
                                        </div>
                                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                                            {timeAgo(update.createdAt)} {update.createdAt !== update.updatedAt && "(edited)"}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                                        {update.user.department} • {update.user.role}
                                    </div>
                                </div>
                            </div>
                            <div style={{
                                fontSize: "var(--text-sm)",
                                color: "var(--text-primary)",
                                lineHeight: 1.6,
                                whiteSpace: "pre-wrap",
                                marginLeft: "52px"
                            }}>
                                {update.content}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
