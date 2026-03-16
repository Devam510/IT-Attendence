"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGet, apiPost } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import "@/styles/leaves.css";

type FilterType = "all" | "leave";
type FilterStatus = "pending" | "approved" | "rejected";

interface ApprovalItem {
    id: string;   // NOTE: This represents workflowId for regularizations!
    employeeId: string;
    employeeName: string;
    employeeRole: string;
    department: string;
    type: "leave" | "regularization";
    leaveType?: string;
    startDate: string;
    endDate: string;
    days: number;
    reason: string;
    status: "pending" | "approved" | "rejected";
    appliedAt: string;
}

const TYPE_LABELS: Record<string, string> = {
    annual: "Annual Leave", sick: "Sick Leave",
    casual: "Casual Leave", comp: "Comp Off",
    regularization: "Time Regularization",
};

const TYPE_ICONS: Record<string, string> = {
    annual: "🏖️", sick: "🤒", casual: "☀️", comp: "🔄",
    leave: "🗓️", regularization: "⏰",
};

export default function ApprovalsPage() {
    const { user } = useAuth();
    const [items, setItems] = useState<ApprovalItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState<FilterType>("all");
    const [filterStatus, setFilterStatus] = useState<FilterStatus>("pending");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [comment, setComment] = useState<Record<string, string>>({});

    const isManager = user?.role === "MGR" || user?.role === "HRA" || user?.role === "SADM";

    const load = useCallback(async () => {
        setLoading(true);
        const res = await apiGet<{ approvals: ApprovalItem[] }>(
            `/api/approvals/pending?status=${filterStatus}&type=${filterType}`
        );
        if (res.data?.approvals) setItems(res.data.approvals);
        setLoading(false);
        setSelected(new Set());
    }, [filterType, filterStatus]);

    useEffect(() => { load(); }, [load]);

    async function handleAction(item: ApprovalItem, action: "approved" | "rejected") {
        setActionLoading(item.id);
        
        if (item.type === "regularization") {
            await apiPost("/api/attendance/regularize/respond", {
                workflowId: item.id,
                action,
            });
        } else {
            await apiPost("/api/leaves/respond", {
                leaveId: item.id,
                action,
                comment: comment[item.id] || "",
            });
        }
        
        setActionLoading(null);
        await load();
    }

    async function handleBulkAction(action: "approved" | "rejected") {
        setActionLoading("bulk");
        await Promise.all(
            Array.from(selected).map(id => {
                const item = items.find(i => i.id === id);
                if (!item) return Promise.resolve();
                
                if (item.type === "regularization") {
                    return apiPost("/api/attendance/regularize/respond", { workflowId: item.id, action });
                } else {
                    return apiPost("/api/leaves/respond", { leaveId: item.id, action, comment: "" });
                }
            })
        );
        setSelected(new Set());
        setActionLoading(null);
        await load();
    }

    function toggleSelect(id: string) {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    function selectAll() {
        setSelected(new Set(items.filter(i => i.status === "pending").map(i => i.id)));
    }

    const pendingItems = items.filter(i => i.status === "pending");
    const avatarColor = ["#1A56DB", "#0E9F6E", "#E02424", "#FF8A4C", "#6366F1"];

    if (loading) {
        return (
            <div>
                <div className="skeleton skeleton-title" style={{ marginBottom: 24 }} />
                {[1, 2, 3].map(i => (
                    <div key={i} className="skeleton" style={{ height: 160, borderRadius: 12, marginBottom: 16 }} />
                ))}
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="leave-header animate-fadeIn">
                <div>
                    <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)" }}>
                        {isManager ? "Approval Queue" : "My Requests"}
                    </h1>
                    {isManager && pendingItems.length > 0 && (
                        <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", marginTop: "var(--space-1)" }}>
                            {pendingItems.length} request{pendingItems.length > 1 ? "s" : ""} awaiting your action
                        </p>
                    )}
                </div>
                {isManager && pendingItems.length > 1 && (
                    <button className="btn btn-ghost btn-sm" onClick={selectAll}>
                        Select All
                    </button>
                )}
            </div>

            {/* Bulk Action Bar */}
            {selected.size > 0 && (
                <div className="approval-bulk-bar">
                    <span>{selected.size} selected</span>
                    <div style={{ display: "flex", gap: "var(--space-3)" }}>
                        <button
                            className="btn btn-sm"
                            style={{ background: "rgba(255,255,255,0.2)", color: "white", borderColor: "rgba(255,255,255,0.3)" }}
                            onClick={() => handleBulkAction("approved")}
                            disabled={actionLoading === "bulk"}
                        >
                            ✅ Approve All
                        </button>
                        <button
                            className="btn btn-sm"
                            style={{ background: "rgba(220,38,38,0.3)", color: "white", borderColor: "rgba(220,38,38,0.4)" }}
                            onClick={() => handleBulkAction("rejected")}
                            disabled={actionLoading === "bulk"}
                        >
                            ❌ Reject All
                        </button>
                    </div>
                </div>
            )}

            {/* Filters — single row with divider */}
            <div className="approval-filters" style={{ marginBottom: "var(--space-5)", flexWrap: "wrap" }}>
                {(["pending", "approved", "rejected"] as FilterStatus[]).map(s => (
                    <button
                        key={s}
                        className={`filter-chip ${filterStatus === s ? "active" : ""}`}
                        onClick={() => setFilterStatus(s)}
                    >
                        {s === "pending" ? "⏳" : s === "approved" ? "✅" : "❌"} {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                ))}
                <span style={{ width: 1, height: 24, background: "var(--border-color, #e5e7eb)", alignSelf: "center" }} />
                {(["all", "leave", "regularization"] as FilterType[]).map(t => (
                    <button
                        key={t}
                        className={`filter-chip ${filterType === t ? "active" : ""}`}
                        onClick={() => setFilterType(t)}
                        style={{ background: filterType === t ? "var(--color-secondary, #6366f1)" : undefined }}
                    >
                        {t === "all" ? "All Types" : TYPE_ICONS[t] + " " + t.toUpperCase()}
                    </button>
                ))}
            </div>

            {/* Cards */}
            {items.length === 0 ? (
                <div className="approval-empty animate-fadeIn">
                    <span className="approval-empty-icon">🎉</span>
                    <div className="approval-empty-text">
                        {filterStatus === "pending" ? "All caught up!" : `No ${filterStatus} requests`}
                    </div>
                    <div className="approval-empty-sub">
                        {filterStatus === "pending" ? "No pending approvals right now" : "Nothing to show here"}
                    </div>
                </div>
            ) : (
                items.map((item, idx) => (
                    <div key={item.id} className="approval-card animate-slideUp" style={{ animationDelay: `${idx * 50}ms` }}>
                        {/* Card Header */}
                        <div className="approval-card-header">
                            <div className="approval-card-employee">
                                {isManager && item.status === "pending" && (
                                    <input
                                        type="checkbox"
                                        checked={selected.has(item.id)}
                                        onChange={() => toggleSelect(item.id)}
                                        style={{ width: 16, height: 16, cursor: "pointer" }}
                                    />
                                )}
                                <div
                                    className="approval-card-avatar"
                                    style={{ background: avatarColor[idx % avatarColor.length] }}
                                >
                                    {item.employeeName.split(" ").map(n => n[0]).join("").slice(0, 2)}
                                </div>
                                <div>
                                    <div className="approval-card-name">{item.employeeName}</div>
                                    <div className="approval-card-role">{item.department} · {item.employeeRole}</div>
                                </div>
                            </div>
                            <span className={`badge badge-${item.status === "approved" ? "success" : item.status === "pending" ? "warning" : "danger"}`}>
                                {item.status}
                            </span>
                        </div>

                        {/* Card Body */}
                        <div className="approval-card-body">
                            <div className="approval-card-field">
                                <span className="approval-card-label">Type</span>
                                <span className="approval-card-value">
                                    {TYPE_ICONS[item.leaveType || item.type]} {TYPE_LABELS[item.leaveType || item.type] || item.type}
                                </span>
                            </div>
                            <div className="approval-card-field">
                                <span className="approval-card-label">From</span>
                                <span className="approval-card-value">
                                    {new Date(item.startDate).toLocaleDateString("en-US", { day: "numeric", month: "short" })}
                                </span>
                            </div>
                            <div className="approval-card-field">
                                <span className="approval-card-label">To</span>
                                <span className="approval-card-value">
                                    {new Date(item.endDate).toLocaleDateString("en-US", { day: "numeric", month: "short" })}
                                </span>
                            </div>
                            <div className="approval-card-field">
                                <span className="approval-card-label">Days</span>
                                <span className="approval-card-value">{item.days}</span>
                            </div>
                            <div className="approval-card-field">
                                <span className="approval-card-label">Applied</span>
                                <span className="approval-card-value">
                                    {new Date(item.appliedAt).toLocaleDateString("en-US", { day: "numeric", month: "short" })}
                                </span>
                            </div>
                        </div>

                        {/* Reason */}
                        {item.reason && (
                            <div className="approval-card-reason">
                                💬 {item.reason}
                            </div>
                        )}

                        {/* Manager Comment + Actions */}
                        {isManager && item.status === "pending" && (
                            <>
                                <div className="input-group" style={{ marginBottom: "var(--space-4)" }}>
                                    <input
                                        type="text"
                                        className="input"
                                        placeholder="Add comment (optional)"
                                        value={comment[item.id] || ""}
                                        onChange={e => setComment(prev => ({ ...prev, [item.id]: e.target.value }))}
                                    />
                                </div>
                                <div className="approval-card-actions">
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() => handleAction(item, "rejected")}
                                        disabled={actionLoading === item.id}
                                    >
                                        {actionLoading === item.id ? <span className="spinner" /> : "❌"} Reject
                                    </button>
                                    <button
                                        className="btn btn-primary btn-sm"
                                        onClick={() => handleAction(item, "approved")}
                                        disabled={actionLoading === item.id}
                                    >
                                        {actionLoading === item.id ? <span className="spinner" /> : "✅"} Approve
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                ))
            )}
        </div>
    );
}
