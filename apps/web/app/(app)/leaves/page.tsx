"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiGet, apiPost } from "@/lib/api-client";
import "@/styles/leaves.css";

interface BalanceItem {
    leaveTypeId: string;
    name: string;
    code: string;
    entitlement: number;
    available: number;
}

interface LeaveRecord {
    id: string;
    type: string;
    startDate: string;
    endDate: string;
    days: number;
    status: "approved" | "pending" | "rejected" | "cancelled";
    reason?: string;
}

const getIconForType = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes("annual") || n.includes("earned")) return "🏖️";
    if (n.includes("sick")) return "🤒";
    if (n.includes("casual")) return "☀️";
    if (n.includes("comp")) return "🔄";
    if (n.includes("maternity") || n.includes("paternity")) return "👶";
    return "📋";
};

export default function LeavesPage() {
    const [balance, setBalance] = useState<BalanceItem[]>([]);
    const [history, setHistory] = useState<LeaveRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"balance" | "history">("balance");
    const [isCancelling, setIsCancelling] = useState<string | null>(null);

    const handleCancel = async (leaveId: string) => {
        if (!confirm("Are you sure you want to cancel this leave?")) return;
        setIsCancelling(leaveId);
        
        try {
            const res = await apiPost("/api/leaves/cancel", { leaveId });
            if (res.error) {
                alert(res.error || "Failed to cancel leave.");
                setIsCancelling(null);
                return;
            }
            
            // Re-fetch data to update balances and history correctly
            const [balRes, histRes] = await Promise.all([
                apiGet<any>("/api/leaves/balance"),
                apiGet<any>("/api/leaves/history"),
            ]);
            
            if (balRes.data?.balances) setBalance(balRes.data.balances);
            if (histRes.data?.records) {
                setHistory(histRes.data.records.map((r: any) => ({
                    id: r.id,
                    type: r.leaveType?.name?.toLowerCase() || r.type || "casual",
                    startDate: r.startDate,
                    endDate: r.endDate,
                    days: r.days ?? 1,
                    status: (r.status || "pending").toLowerCase() as LeaveRecord["status"],
                    reason: r.reason,
                })));
            }
        } catch (e) {
            alert("Network error. Please try again.");
        }
        setIsCancelling(null);
    };

    useEffect(() => {
        async function load() {
            setLoading(true);
            const [balRes, histRes] = await Promise.all([
                apiGet<any>("/api/leaves/balance"),
                apiGet<any>("/api/leaves/history"),
            ]);

            // Map API balances array directly to frontend state
            if (balRes.data) {
                const balArr = balRes.data.balances || [];
                setBalance(balArr);
            }

            // Map history response
            if (histRes.data) {
                const records = histRes.data.records || histRes.data || [];
                if (Array.isArray(records)) {
                    setHistory(records.map((r: any) => ({
                        id: r.id,
                        type: r.leaveType?.name?.toLowerCase() || r.type || "casual",
                        startDate: r.startDate,
                        endDate: r.endDate,
                        days: r.days ?? 1,
                        status: (r.status || "pending").toLowerCase() as LeaveRecord["status"],
                        reason: r.reason,
                    })));
                }
            }
            setLoading(false);
        }
        load();
    }, []);

    if (loading) {
        return (
            <div>
                <div className="skeleton skeleton-title" style={{ marginBottom: 24 }} />
                <div className="leave-balance-grid">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="skeleton" style={{ height: 140, borderRadius: 12 }} />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="leave-header animate-fadeIn">
                <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)" }}>
                    Leave Management
                </h1>
                <Link href="/leaves/apply" className="btn btn-primary">
                    + Apply Leave
                </Link>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-6)" }}>
                {(["balance", "history"] as const).map(tab => (
                    <button
                        key={tab}
                        className={`filter-chip ${activeTab === tab ? "active" : ""}`}
                        onClick={() => setActiveTab(tab)}
                    >
                        {tab === "balance" ? "📊 Balance" : "📋 History"}
                    </button>
                ))}
            </div>

            {/* Balance Cards */}
            {activeTab === "balance" && (
                <div className="leave-balance-grid animate-slideUp">
                    {balance.length === 0 ? (
                        <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px", color: "var(--text-tertiary)" }}>
                            No leave types configured for your account.
                        </div>
                    ) : (
                        balance.map((b) => {
                            // Provide safe fallbacks so Math doesn't fail on undefined/null
                            const total = b.entitlement || 0;
                            const remaining = b.available || 0;
                            
                            const pct = total > 0 ? Math.round((remaining / total) * 100) : 0;
                            const icon = getIconForType(b.name);
                            // Derive CSS class name dynamically or use a generic one
                            const cssType = b.name.toLowerCase().includes("sick") ? "sick" : 
                                            b.name.toLowerCase().includes("casual") ? "casual" : 
                                            b.name.toLowerCase().includes("comp") ? "comp" : "annual";

                            return (
                                <div key={b.leaveTypeId} className="leave-balance-card">
                                    <div className="leave-balance-card-top">
                                        <div className={`leave-balance-icon ${cssType}`}>{icon}</div>
                                        <span className={`badge ${pct > 50 ? "badge-success" : pct > 25 ? "badge-warning" : "badge-danger"}`}>
                                            {pct}%
                                        </span>
                                    </div>
                                    <div>
                                        <div className="leave-balance-remaining">{remaining}</div>
                                        <div className="leave-balance-type">{b.name}</div>
                                    </div>
                                    <div className="leave-balance-bar-container">
                                        <div
                                            className={`leave-balance-bar ${cssType}`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                    <div className="leave-balance-footer">
                                        <span>{remaining} remaining</span>
                                        <span>of {total}</span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* History */}
            {activeTab === "history" && (
                <div className="animate-slideUp">
                    {history.length === 0 ? (
                        <div className="approval-empty">
                            <span className="approval-empty-icon">🗓️</span>
                            <div className="approval-empty-text">No leave history yet</div>
                            <div className="approval-empty-sub">Apply for your first leave using the button above</div>
                        </div>
                    ) : (
                        history.map(item => (
                            <div key={item.id} className="leave-history-item">
                                <div className={`leave-history-color-bar ${item.status}`} />
                                <div className="leave-history-info">
                                    <div className="leave-history-title">
                                        {getIconForType(item.type)} {item.type.charAt(0).toUpperCase() + item.type.slice(1)} (History)
                                        <span style={{ marginLeft: 8, fontWeight: "normal", color: "var(--text-secondary)" }}>
                                            · {item.days} day{item.days > 1 ? "s" : ""}
                                        </span>
                                    </div>
                                    <div className="leave-history-meta">
                                        {new Date(item.startDate).toLocaleDateString("en-US", { day: "numeric", month: "short" })} —{" "}
                                        {new Date(item.endDate).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}
                                    </div>
                                    {item.reason && (
                                        <div className="leave-history-meta" style={{ marginTop: 4 }}>
                                            {item.reason}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
                                    <span className={`badge badge-${item.status === "approved" ? "success" : item.status === "pending" ? "warning" : item.status === "rejected" ? "danger" : "secondary"}`} style={{ opacity: item.status === "cancelled" ? 0.6 : 1 }}>
                                        {item.status}
                                    </span>
                                    {(item.status === "pending" || item.status === "approved") && 
                                     new Date(item.endDate).getTime() + (24 * 60 * 60 * 1000) > new Date().getTime() && (
                                        <button 
                                            className="btn btn-secondary" 
                                            style={{ padding: "4px 8px", fontSize: "12px" }}
                                            onClick={() => handleCancel(item.id)}
                                            disabled={isCancelling === item.id}
                                        >
                                            {isCancelling === item.id ? "Canceling..." : "Cancel"}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
