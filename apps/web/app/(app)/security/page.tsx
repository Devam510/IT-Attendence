"use client";

import { useState, useEffect } from "react";
import { apiGet, apiPost } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import "@/styles/security.css";

interface SecurityEvent {
    id: string;
    time: string;
    eventType: string;
    userName: string;
    userEmail: string;
    location: string;
    device: string;
    severity: "critical" | "high" | "medium" | "low";
    ipAddress: string;
}

interface Anomaly {
    id: string;
    title: string;
    meta: string;
    severity: "critical" | "high" | "medium" | "low";
    time: string;
}

interface SecurityMetrics {
    riskScore: number;
    activeThreats: number;
    trustedDevices: number;
    failedLoginsToday: number;
}

interface SecurityData {
    metrics: SecurityMetrics;
    events: SecurityEvent[];
    anomalies: Anomaly[];
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

const avatarColors = ["#1A56DB", "#E02424", "#FF8A4C", "#6366F1", "#0E9F6E", "#D97706"];

function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "Just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

function RiskArc({ score }: { score: number }) {
    const circumference = 125.6; // 2 * PI * 20 (radius 20 in 50x50 viewbox)
    const color = score > 70 ? "#E02424" : score > 40 ? "#FF8A4C" : "#0E9F6E";
    const offset = circumference * (1 - score / 100);
    return (
        <svg className="risk-arc" viewBox="0 0 50 50">
            <circle className="risk-arc-bg" cx="25" cy="25" r="20" />
            <circle
                className="risk-arc-fill"
                cx="25" cy="25" r="20"
                stroke={color}
                strokeDasharray={circumference}
                strokeDashoffset={offset}
            />
        </svg>
    );
}

export default function SecurityPage() {
    const { user } = useAuth();
    const [data, setData] = useState<SecurityData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    async function load(silent = false) {
        if (!silent) setLoading(true);
        else setRefreshing(true);
        const res = await apiGet<SecurityData>("/api/audit-logs?view=security&limit=20");
        if (res.data) {
            setData(res.data);
            setError(null);
        } else if (res.code === "FORBIDDEN") {
            setError("Access denied. This page is restricted to HR and Admin roles.");
        } else {
            // Other API error — show empty state, don't crash
            setError(null);
        }
        setLoading(false);
        setRefreshing(false);
    }

    useEffect(() => {
        load();
        const interval = setInterval(() => load(true), 60000);
        return () => clearInterval(interval);
    }, []);

    async function blockUser(userEmail: string) {
        setActionLoading(`block-${userEmail}`);
        await apiPost("/api/admin/gdpr", { action: "block", email: userEmail });
        setActionLoading(null);
    }

    const metrics = data?.metrics || {
        riskScore: 0,
        activeThreats: 0,
        trustedDevices: 0,
        failedLoginsToday: 0,
    };
    const events = [...(data?.events || [])].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
    const anomalies = data?.anomalies || [];

    if (loading) {
        return (
            <div>
                <div className="skeleton skeleton-title" style={{ marginBottom: 24 }} />
                <div className="security-grid">
                    {[1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 110, borderRadius: 12 }} />)}
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div style={{ textAlign: "center", padding: "80px 20px" }}>
                <div style={{ fontSize: "3rem", marginBottom: 16 }}>🔒</div>
                <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--font-bold)", marginBottom: 8 }}>Access Restricted</h2>
                <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>{error}</p>
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="leave-header animate-fadeIn">
                <div>
                    <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)" }}>
                        🛡️ Security Dashboard
                    </h1>
                    <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", marginTop: "var(--space-1)" }}>
                        Real-time threat monitoring and access control
                    </p>
                </div>
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => load(true)}
                    disabled={refreshing}
                >
                    {refreshing ? <span className="spinner" /> : "🔄"} Refresh
                </button>
            </div>

            {/* Metric Cards */}
            <div className="security-grid animate-slideUp">
                {/* Risk Score */}
                <div className="security-metric-card risk">
                    <span className="security-metric-icon">⚠️</span>
                    <div className="risk-arc-wrapper">
                        <RiskArc score={metrics.riskScore} />
                        <div>
                            <div className={`security-metric-value risk`}>{metrics.riskScore}<span style={{ fontSize: "var(--text-base)", fontWeight: "normal" }}>/100</span></div>
                        </div>
                    </div>
                    <div className="security-metric-label">Risk Score</div>
                    <div className="security-metric-sub">{metrics.riskScore < 40 ? "Low risk" : metrics.riskScore < 70 ? "Moderate risk" : "High risk"}</div>
                </div>

                {/* Active Threats */}
                <div className="security-metric-card threat">
                    <span className="security-metric-icon">🚨</span>
                    <div className={`security-metric-value threat`}>{metrics.activeThreats}</div>
                    <div className="security-metric-label">Active Threats</div>
                    <div className="security-metric-sub">Require attention</div>
                </div>

                {/* Trusted Devices */}
                <div className="security-metric-card trusted">
                    <span className="security-metric-icon">✅</span>
                    <div className={`security-metric-value trusted`}>{metrics.trustedDevices}</div>
                    <div className="security-metric-label">Trusted Devices</div>
                    <div className="security-metric-sub">Verified endpoints</div>
                </div>

                {/* Failed Logins */}
                <div className="security-metric-card failed">
                    <span className="security-metric-icon">🔒</span>
                    <div className={`security-metric-value failed`}>{metrics.failedLoginsToday}</div>
                    <div className="security-metric-label">Failed Logins</div>
                    <div className="security-metric-sub">Today</div>
                </div>
            </div>

            {/* Main Layout: Events Table + Anomaly Panel */}
            <div className="security-layout animate-slideUp">
                {/* Events Table */}
                <div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
                        <h2 style={{ fontSize: "var(--text-base)", fontWeight: "var(--font-semibold)" }}>
                            Recent Security Events
                        </h2>
                    </div>
                    <div className="security-events-table">
                        {events.length === 0 ? (
                            <div className="approval-empty">
                                <span className="approval-empty-icon">✅</span>
                                <div className="approval-empty-text">No security events</div>
                                <div className="approval-empty-sub">All systems operating normally</div>
                            </div>
                        ) : (
                            <div style={{ overflowX: "auto" }}>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Time</th>
                                            <th>Event</th>
                                            <th>User</th>
                                            <th>Location</th>
                                            <th>Device</th>
                                            <th>Severity</th>
                                            <th>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {events.map((ev, idx) => (
                                            <tr key={ev.id}>
                                                <td style={{ whiteSpace: "nowrap", fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
                                                    {timeAgo(ev.time)}
                                                </td>
                                                <td style={{ fontWeight: "var(--font-medium)", whiteSpace: "nowrap" }}>
                                                    {ev.eventType}
                                                </td>
                                                <td>
                                                    <div className="audit-user">
                                                        <div className="audit-avatar" style={{ background: avatarColors[idx % avatarColors.length] }}>
                                                            {ev.userName.split(" ").map(n => n[0]).join("").slice(0, 2)}
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: "var(--font-medium)", fontSize: "var(--text-xs)" }}>{ev.userName}</div>
                                                            <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>{ev.ipAddress}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>{ev.location}</td>
                                                <td style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{ev.device}</td>
                                                <td>
                                                    <span className={`badge severity-${ev.severity}`} style={{ fontSize: "10px" }}>
                                                        {ev.severity.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td>
                                                    {(ev.severity === "critical" || ev.severity === "high") && (
                                                        <button
                                                            className="btn btn-sm"
                                                            style={{ fontSize: "10px", padding: "2px 8px", background: "var(--color-danger-light)", color: "var(--color-danger)", borderColor: "var(--color-danger)" }}
                                                            onClick={() => blockUser(ev.userEmail)}
                                                            disabled={actionLoading === `block-${ev.userEmail}`}
                                                        >
                                                            Block
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Geo Map placeholder */}
                    <div className="geo-map-card">
                        <div style={{ fontWeight: "var(--font-semibold)", fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
                            🌍 Geographic Access Map
                        </div>
                        <div className="geo-map-placeholder">
                            <span style={{ fontSize: "2rem" }}>🗺️</span>
                            <span>Real-time geographic access visualization</span>
                            <span style={{ fontSize: "var(--text-xs)" }}>Activity detected in {[...new Set(events.map(e => e.location).filter(Boolean))].length || 0} locations</span>
                        </div>
                    </div>
                </div>

                {/* Anomaly Panel */}
                <div>
                    <div className="anomaly-panel">
                        <div className="anomaly-panel-header">
                            🔍 Anomaly Detection
                            {anomalies.filter(a => a.severity === "critical").length > 0 && (
                                <span className="badge badge-danger" style={{ marginLeft: "auto" }}>
                                    {anomalies.filter(a => a.severity === "critical").length} Critical
                                </span>
                            )}
                        </div>
                        {anomalies.length === 0 ? (
                            <div style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--text-tertiary)", fontSize: "var(--text-sm)" }}>
                                ✅ No anomalies detected
                            </div>
                        ) : (
                            anomalies
                                .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
                                .map(anomaly => (
                                    <div key={anomaly.id} className="anomaly-item">
                                        <div className={`anomaly-severity-bar ${anomaly.severity}`} />
                                        <div className="anomaly-item-body">
                                            <div className="anomaly-item-title">{anomaly.title}</div>
                                            <div className="anomaly-item-meta">{anomaly.meta}</div>
                                            <div className="anomaly-item-time">{timeAgo(anomaly.time)}</div>
                                        </div>
                                    </div>
                                ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
