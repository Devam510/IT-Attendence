"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api-client";
import "@/styles/leaves.css";

interface LeaveBalance {
    annual: { remaining: number; total: number };
    sick: { remaining: number; total: number };
    casual: { remaining: number; total: number };
    comp: { remaining: number; total: number };
}

interface LeaveRecord {
    id: string;
    type: string;
    startDate: string;
    endDate: string;
    days: number;
    status: "approved" | "pending" | "rejected";
    reason?: string;
}

const TYPE_ICONS: Record<string, string> = {
    annual: "🏖️",
    sick: "🤒",
    casual: "☀️",
    comp: "🔄",
};

export default function LeavesPage() {
    const [balance, setBalance] = useState<LeaveBalance | null>(null);
    const [history, setHistory] = useState<LeaveRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"balance" | "history">("balance");

    useEffect(() => {
        async function load() {
            setLoading(true);
            const [balRes, histRes] = await Promise.all([
                apiGet<any>("/api/leaves/balance"),
                apiGet<any>("/api/leaves/history"),
            ]);

            // Map API balances array to frontend LeaveBalance object
            if (balRes.data) {
                const balArr = balRes.data.balances || balRes.data.balance || [];
                const codeMap: Record<string, string> = { EL: "annual", SL: "sick", CL: "casual", CO: "comp" };
                const nameMap: Record<string, string> = { "Annual Leave": "annual", "Earned Leave": "annual", "Sick Leave": "sick", "Casual Leave": "casual", "Comp Off": "comp" };

                const mapped: Record<string, { remaining: number; total: number }> = {
                    annual: { remaining: 0, total: 0 },
                    sick: { remaining: 0, total: 0 },
                    casual: { remaining: 0, total: 0 },
                    comp: { remaining: 0, total: 0 },
                };

                if (Array.isArray(balArr)) {
                    for (const b of balArr) {
                        const key = codeMap[b.code] || nameMap[b.name] || b.code?.toLowerCase();
                        if (key && mapped[key]) {
                            mapped[key] = {
                                remaining: b.available ?? (b.opening + b.accrued - b.used - b.pending),
                                total: b.entitlement ?? b.opening ?? 0,
                            };
                        }
                    }
                } else if (typeof balArr === "object") {
                    // Already in the right shape
                    Object.assign(mapped, balArr);
                }
                setBalance(mapped as unknown as LeaveBalance);
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
                        status: (r.status || "pending").toLowerCase() as "approved" | "pending" | "rejected",
                        reason: r.reason,
                    })));
                }
            }
            setLoading(false);
        }
        load();
    }, []);

    const balanceCards = balance ? [
        { key: "annual", label: "Annual Leave", icon: TYPE_ICONS.annual, type: "annual" as const, data: balance.annual },
        { key: "sick", label: "Sick Leave", icon: TYPE_ICONS.sick, type: "sick" as const, data: balance.sick },
        { key: "casual", label: "Casual Leave", icon: TYPE_ICONS.casual, type: "casual" as const, data: balance.casual },
        { key: "comp", label: "Comp Off", icon: TYPE_ICONS.comp, type: "comp" as const, data: balance.comp },
    ] : [];

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
                    {balanceCards.map(({ key, label, icon, type, data }) => {
                        const pct = data.total > 0 ? Math.round((data.remaining / data.total) * 100) : 0;
                        return (
                            <div key={key} className="leave-balance-card">
                                <div className="leave-balance-card-top">
                                    <div className={`leave-balance-icon ${type}`}>{icon}</div>
                                    <span className={`badge ${pct > 50 ? "badge-success" : pct > 25 ? "badge-warning" : "badge-danger"}`}>
                                        {pct}%
                                    </span>
                                </div>
                                <div>
                                    <div className="leave-balance-remaining">{data.remaining}</div>
                                    <div className="leave-balance-type">{label}</div>
                                </div>
                                <div className="leave-balance-bar-container">
                                    <div
                                        className={`leave-balance-bar ${type}`}
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                                <div className="leave-balance-footer">
                                    <span>{data.remaining} remaining</span>
                                    <span>of {data.total}</span>
                                </div>
                            </div>
                        );
                    })}
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
                                        {TYPE_ICONS[item.type] || "📋"} {item.type.charAt(0).toUpperCase() + item.type.slice(1)} Leave
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
                                <span className={`badge badge-${item.status === "approved" ? "success" : item.status === "pending" ? "warning" : "danger"}`}>
                                    {item.status}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
