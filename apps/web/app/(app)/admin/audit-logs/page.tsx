"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGet } from "@/lib/api-client";
import "@/styles/admin.css";

type ActionFilter = "all" | "auth" | "leave" | "attendance" | "settings" | "security";

interface AuditLog {
    id: string;
    timestamp: string;
    userName: string;
    userEmail: string;
    action: string;
    resource: string;
    ipAddress: string;
    status: "success" | "failed";
    details?: string;
}

interface AuditResponse {
    logs: AuditLog[];
    total: number;
    page: number;
    pageSize: number;
}

const PAGE_SIZE = 15;
const ACTION_FILTERS: ActionFilter[] = ["all", "auth", "leave", "attendance", "settings", "security"];

const avatarColors = ["#1A56DB", "#0E9F6E", "#E02424", "#FF8A4C", "#6366F1", "#D97706"];

export default function AdminAuditLogsPage() {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        const params = new URLSearchParams({
            page: String(page),
            pageSize: String(PAGE_SIZE),
            ...(search && { search }),
            ...(actionFilter !== "all" && { action: actionFilter }),
            ...(startDate && { startDate }),
            ...(endDate && { endDate }),
        });
        const res = await apiGet<AuditResponse>(`/api/audit-logs?${params}`);
        if (res.data) {
            setLogs(res.data.logs || []);
            setTotal(res.data.total || 0);
        }
        setLoading(false);
    }, [page, search, actionFilter, startDate, endDate]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => { setPage(1); }, [search, actionFilter, startDate, endDate]);

    function exportCSV() {
        const header = "Timestamp,User,Action,Resource,IP Address,Status";
        const rows = logs.map(l =>
            [l.timestamp, l.userEmail, l.action, l.resource, l.ipAddress, l.status].join(",")
        );
        const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = "audit-logs.csv"; a.click();
        URL.revokeObjectURL(url);
    }

    const totalPages = Math.ceil(total / PAGE_SIZE);

    return (
        <div>
            {/* Header */}
            <div className="leave-header animate-fadeIn">
                <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)" }}>
                    Audit Logs
                </h1>
                <button className="btn btn-primary btn-sm" onClick={exportCSV}>
                    📥 Export CSV
                </button>
            </div>

            {/* Search + Date filters */}
            <div className="audit-search-row">
                <div className="input-group" style={{ flex: 1, minWidth: 220, marginBottom: 0 }}>
                    <input
                        type="text"
                        className="input audit-search-input"
                        placeholder="🔍 Search by user or action..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                    <input
                        type="date"
                        className="input"
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        title="Start date"
                    />
                </div>
                <div className="input-group" style={{ marginBottom: 0 }}>
                    <input
                        type="date"
                        className="input"
                        value={endDate}
                        onChange={e => setEndDate(e.target.value)}
                        title="End date"
                    />
                </div>
            </div>

            {/* Action filters */}
            <div className="approval-filters" style={{ marginBottom: "var(--space-5)" }}>
                {ACTION_FILTERS.map(f => (
                    <button
                        key={f}
                        className={`filter-chip ${actionFilter === f ? "active" : ""}`}
                        onClick={() => setActionFilter(f)}
                    >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                ))}
            </div>

            {/* Table */}
            <div className="audit-table-wrapper animate-slideUp">
                {loading ? (
                    <div style={{ padding: "var(--space-8)", textAlign: "center", color: "var(--text-secondary)" }}>
                        <span className="spinner" style={{ display: "inline-block", marginRight: 8 }} />
                        Loading audit logs...
                    </div>
                ) : logs.length === 0 ? (
                    <div className="approval-empty">
                        <span className="approval-empty-icon">📋</span>
                        <div className="approval-empty-text">No logs found</div>
                        <div className="approval-empty-sub">Try adjusting your filters</div>
                    </div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table className="audit-table">
                            <thead>
                                <tr>
                                    <th>Timestamp</th>
                                    <th>User</th>
                                    <th>Action</th>
                                    <th>Resource</th>
                                    <th>IP Address</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.map((log, idx) => (
                                    <tr key={log.id}>
                                        <td style={{ whiteSpace: "nowrap", color: "var(--text-secondary)", fontSize: "var(--text-xs)" }}>
                                            {new Date(log.timestamp).toLocaleString("en-US", {
                                                month: "short", day: "numeric",
                                                hour: "2-digit", minute: "2-digit"
                                            })}
                                        </td>
                                        <td>
                                            <div className="audit-user">
                                                <div
                                                    className="audit-avatar"
                                                    style={{ background: avatarColors[idx % avatarColors.length] }}
                                                >
                                                    {log.userName.split(" ").map(n => n[0]).join("").slice(0, 2)}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: "var(--font-medium)" }}>{log.userName}</div>
                                                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>{log.userEmail}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ fontWeight: "var(--font-medium)" }}>{log.action}</td>
                                        <td style={{ color: "var(--text-secondary)" }}>{log.resource}</td>
                                        <td style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
                                            {log.ipAddress}
                                        </td>
                                        <td>
                                            <span className={`badge ${log.status === "success" ? "badge-success" : "badge-danger"}`}>
                                                {log.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Pagination */}
                {!loading && total > PAGE_SIZE && (
                    <div className="audit-pagination">
                        <span>
                            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
                        </span>
                        <div className="audit-page-btns">
                            <button className="audit-page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                                ‹
                            </button>
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                                return (
                                    <button
                                        key={p}
                                        className={`audit-page-btn ${page === p ? "active" : ""}`}
                                        onClick={() => setPage(p)}
                                    >
                                        {p}
                                    </button>
                                );
                            })}
                            <button className="audit-page-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                                ›
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
