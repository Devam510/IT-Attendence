"use client";

import { useState, useEffect } from "react";
import { apiGet, apiPost } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import "@/styles/admin.css";

// Helper: safely convert any value to a string for rendering
function str(val: unknown): string {
    if (val === null || val === undefined) return "–";
    if (typeof val === "string") return val;
    if (typeof val === "number" || typeof val === "boolean") return String(val);
    if (typeof val === "object") {
        if ("name" in (val as Record<string, unknown>)) return String((val as Record<string, unknown>).name);
        return JSON.stringify(val);
    }
    return String(val);
}

const ROLE_LABELS: Record<string, string> = {
    EMP: "Employee",
    MGR: "Manager",
    HRA: "HR Admin",
    SADM: "Super Admin",
    SEC: "Security",
};

/* ─── Change Password Modal ───────────────────────────── */

interface ChangePasswordModalProps {
    onClose: () => void;
}

function ChangePasswordModal({ onClose }: ChangePasswordModalProps) {
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showCurrent, setShowCurrent] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");

        if (newPassword.length < 8) {
            setError("New password must be at least 8 characters.");
            return;
        }
        if (newPassword !== confirmPassword) {
            setError("New passwords do not match.");
            return;
        }
        if (currentPassword === newPassword) {
            setError("New password must be different from current password.");
            return;
        }

        setLoading(true);
        const res = await apiPost<{ message: string }>("/api/auth/change-password", {
            currentPassword,
            newPassword,
        });
        setLoading(false);

        if (res.error) {
            const msg =
                res.code === "AUTH_FAILED"
                    ? "Current password is incorrect."
                    : res.code === "WEAK_PASSWORD"
                        ? "Password must be at least 8 characters."
                        : res.code === "SAME_PASSWORD"
                            ? "New password must be different from current password."
                            : res.error || "Failed to change password. Please try again.";
            setError(msg);
        } else {
            setSuccess(true);
            setTimeout(onClose, 1800);
        }
    }

    // Password strength
    function strength(pw: string): { pct: number; color: string; label: string } {
        if (!pw) return { pct: 0, color: "var(--color-danger)", label: "" };
        let score = 0;
        if (pw.length >= 8) score++;
        if (pw.length >= 12) score++;
        if (/[A-Z]/.test(pw)) score++;
        if (/[0-9]/.test(pw)) score++;
        if (/[^A-Za-z0-9]/.test(pw)) score++;
        if (score <= 1) return { pct: 20, color: "var(--color-danger)", label: "Weak" };
        if (score === 2) return { pct: 40, color: "#FF8A4C", label: "Fair" };
        if (score === 3) return { pct: 65, color: "#D97706", label: "Good" };
        return { pct: 100, color: "var(--color-success)", label: "Strong" };
    }

    const str = strength(newPassword);

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.5)",
                backdropFilter: "blur(4px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
                padding: "var(--space-4)",
            }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div
                style={{
                    background: "var(--bg-primary)",
                    borderRadius: "var(--radius-xl)",
                    padding: "var(--space-7) var(--space-6)",
                    width: "100%",
                    maxWidth: "420px",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
                    border: "1px solid var(--border-primary)",
                    animation: "fadeIn 0.2s ease",
                }}
            >
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-6)" }}>
                    <div>
                        <div style={{ fontSize: "var(--text-lg)", fontWeight: "var(--font-bold)" }}>🔑 Change Password</div>
                        <div style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: "var(--space-1)" }}>
                            Enter your current password to set a new one
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: "none",
                            border: "none",
                            fontSize: "1.25rem",
                            cursor: "pointer",
                            color: "var(--text-tertiary)",
                            lineHeight: 1,
                            padding: "4px",
                        }}
                        aria-label="Close"
                    >
                        ✕
                    </button>
                </div>

                {success ? (
                    <div style={{
                        textAlign: "center",
                        padding: "var(--space-6)",
                        color: "var(--color-success)",
                        fontSize: "var(--text-sm)",
                        fontWeight: "var(--font-semibold)",
                    }}>
                        <div style={{ fontSize: "2.5rem", marginBottom: "var(--space-3)" }}>✅</div>
                        Password changed successfully!
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        {error && (
                            <div style={{
                                padding: "var(--space-3) var(--space-4)",
                                background: "var(--color-danger-light)",
                                color: "var(--color-danger)",
                                borderRadius: "var(--radius-md)",
                                fontSize: "var(--text-sm)",
                                marginBottom: "var(--space-5)",
                            }} className="animate-shake">
                                {error}
                            </div>
                        )}

                        {/* Current Password */}
                        <div className="input-group" style={{ marginBottom: "var(--space-4)" }}>
                            <label className="input-label" htmlFor="cp-current">Current Password</label>
                            <div className="input-wrapper">
                                <input
                                    id="cp-current"
                                    type={showCurrent ? "text" : "password"}
                                    className="input"
                                    placeholder="Enter your current password"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    required
                                    autoComplete="current-password"
                                    autoFocus
                                />
                                <span
                                    className="input-icon"
                                    onClick={() => setShowCurrent(!showCurrent)}
                                    role="button"
                                    aria-label={showCurrent ? "Hide" : "Show"}
                                    tabIndex={0}
                                    onKeyDown={(e) => e.key === "Enter" && setShowCurrent(!showCurrent)}
                                >
                                    {showCurrent ? "🙈" : "👁️"}
                                </span>
                            </div>
                        </div>

                        {/* New Password */}
                        <div className="input-group" style={{ marginBottom: "var(--space-2)" }}>
                            <label className="input-label" htmlFor="cp-new">New Password</label>
                            <div className="input-wrapper">
                                <input
                                    id="cp-new"
                                    type={showNew ? "text" : "password"}
                                    className="input"
                                    placeholder="At least 8 characters"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    required
                                    autoComplete="new-password"
                                />
                                <span
                                    className="input-icon"
                                    onClick={() => setShowNew(!showNew)}
                                    role="button"
                                    aria-label={showNew ? "Hide" : "Show"}
                                    tabIndex={0}
                                    onKeyDown={(e) => e.key === "Enter" && setShowNew(!showNew)}
                                >
                                    {showNew ? "🙈" : "👁️"}
                                </span>
                            </div>
                        </div>

                        {/* Strength bar */}
                        {newPassword.length > 0 && (
                            <div style={{ marginBottom: "var(--space-4)" }}>
                                <div style={{
                                    height: 4,
                                    borderRadius: 2,
                                    background: "var(--border-primary)",
                                    overflow: "hidden",
                                }}>
                                    <div style={{
                                        height: "100%",
                                        width: `${str.pct}%`,
                                        background: str.color,
                                        transition: "width 0.3s ease, background 0.3s ease",
                                    }} />
                                </div>
                                <div style={{ fontSize: "11px", color: str.color, marginTop: 4, textAlign: "right" }}>
                                    {str.label}
                                </div>
                            </div>
                        )}

                        {/* Confirm Password */}
                        <div className="input-group" style={{ marginBottom: "var(--space-6)" }}>
                            <label className="input-label" htmlFor="cp-confirm">Confirm New Password</label>
                            <div className="input-wrapper">
                                <input
                                    id="cp-confirm"
                                    type={showConfirm ? "text" : "password"}
                                    className="input"
                                    placeholder="Repeat new password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    autoComplete="new-password"
                                    style={{
                                        borderColor: confirmPassword && confirmPassword !== newPassword
                                            ? "var(--color-danger)"
                                            : undefined,
                                    }}
                                />
                                <span
                                    className="input-icon"
                                    onClick={() => setShowConfirm(!showConfirm)}
                                    role="button"
                                    aria-label={showConfirm ? "Hide" : "Show"}
                                    tabIndex={0}
                                    onKeyDown={(e) => e.key === "Enter" && setShowConfirm(!showConfirm)}
                                >
                                    {showConfirm ? "🙈" : "👁️"}
                                </span>
                            </div>
                            {confirmPassword && confirmPassword !== newPassword && (
                                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-danger)", marginTop: "var(--space-1)" }}>
                                    Passwords do not match
                                </div>
                            )}
                        </div>

                        <div style={{ display: "flex", gap: "var(--space-3)" }}>
                            <button
                                type="button"
                                className="btn btn-ghost btn-full"
                                onClick={onClose}
                                disabled={loading}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="btn btn-primary btn-full"
                                disabled={loading || !currentPassword || !newPassword || !confirmPassword}
                            >
                                {loading ? <><span className="spinner" /> Saving...</> : "Change Password"}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

/* ─── Profile Page ────────────────────────────────────── */

export default function ProfilePage() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
    const [loading, setLoading] = useState(true);
    const [darkMode, setDarkMode] = useState(false);
    const [showChangePassword, setShowChangePassword] = useState(false);

    useEffect(() => {
        setDarkMode(document.documentElement.getAttribute("data-theme") === "dark");

        async function load() {
            try {
                const res = await apiGet<{ profile: Record<string, unknown> }>("/api/profile");
                if (res.data?.profile) setProfile(res.data.profile);
            } catch {
                // Profile API failed — use fallback from auth context
            }
            setLoading(false);
        }
        load();
    }, []);

    const data = {
        fullName: str(profile?.fullName || user?.fullName || "NEXUS User"),
        email: str(profile?.email || user?.email || ""),
        phone: str(profile?.phone || "Not set"),
        department: str(profile?.department || "–"),
        role: str(profile?.role || user?.role || "EMP"),
        employeeId: str(profile?.employeeId || "–"),
        manager: str(profile?.manager || "–"),
        joinDate: str(profile?.joinDate || "–"),
        workLocation: str(profile?.workLocation || "–"),
        mfaEnabled: Boolean(profile?.mfaEnabled),
        activeSessions: Number(profile?.activeSessions || 1),
    };

    const initials = data.fullName.split(" ").map(n => n[0] || "").join("").slice(0, 2).toUpperCase() || "U";

    function toggleTheme() {
        const next = darkMode ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("nexus-theme", next);
        setDarkMode(!darkMode);
    }

    if (loading) {
        return (
            <div>
                <div className="skeleton" style={{ height: 200, borderRadius: 16, marginBottom: 16 }} />
                <div className="skeleton" style={{ height: 250, borderRadius: 12, marginBottom: 12 }} />
                <div className="skeleton" style={{ height: 200, borderRadius: 12 }} />
            </div>
        );
    }

    const joinDateDisplay = data.joinDate !== "–"
        ? (() => { try { return new Date(data.joinDate).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }); } catch { return data.joinDate; } })()
        : "–";

    return (
        <div>
            {showChangePassword && (
                <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
            )}

            {/* Avatar section */}
            <div className="profile-avatar-section animate-fadeIn">
                <div className="profile-avatar">{initials}</div>
                <div className="profile-name">{data.fullName}</div>
                <span className="profile-role">{ROLE_LABELS[data.role] || data.role}</span>
                <div className="profile-dept">{data.department} · {data.employeeId}</div>
            </div>

            {/* Info section */}
            <div className="profile-section-card animate-slideUp">
                <div className="profile-section-title">Information</div>
                {[
                    { icon: "📧", label: "Email", value: data.email },
                    { icon: "📱", label: "Phone", value: data.phone },
                    { icon: "🏢", label: "Department", value: data.department },
                    { icon: "👤", label: "Manager", value: data.manager },
                    { icon: "📅", label: "Join Date", value: joinDateDisplay },
                    { icon: "📍", label: "Work Location", value: data.workLocation },
                ].map(row => (
                    <div key={row.label} className="profile-row">
                        <div className="profile-row-left">
                            <span className="profile-row-icon">{row.icon}</span>
                            <span className="profile-row-label">{row.label}</span>
                        </div>
                        <span className="profile-row-value">{row.value}</span>
                    </div>
                ))}
            </div>

            {/* Appearance section */}
            <div className="profile-section-card animate-slideUp">
                <div className="profile-section-title">Appearance</div>
                <div className="profile-row">
                    <div className="profile-row-left">
                        <span className="profile-row-icon">{darkMode ? "🌙" : "☀️"}</span>
                        <span className="profile-row-label">Dark Mode</span>
                    </div>
                    <div
                        className={`toggle-track ${darkMode ? "on" : ""}`}
                        onClick={toggleTheme}
                        role="switch"
                        aria-checked={darkMode}
                        aria-label="Toggle dark mode"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && toggleTheme()}
                    >
                        <div className="toggle-thumb" />
                    </div>
                </div>
            </div>

            {/* Security section */}
            <div className="profile-section-card animate-slideUp">
                <div className="profile-section-title">Account Security</div>

                {/* Change Password — clickable */}
                <div
                    className="profile-row"
                    style={{ cursor: "pointer" }}
                    onClick={() => setShowChangePassword(true)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setShowChangePassword(true)}
                    aria-label="Change password"
                >
                    <div className="profile-row-left">
                        <span className="profile-row-icon">🔑</span>
                        <span className="profile-row-label">Change Password</span>
                    </div>
                    <span style={{ color: "var(--text-tertiary)", fontSize: "var(--text-sm)" }}>›</span>
                </div>

                <div className="profile-row">
                    <div className="profile-row-left">
                        <span className="profile-row-icon">🛡️</span>
                        <span className="profile-row-label">Two-Factor Auth</span>
                    </div>
                    <span className={`badge ${data.mfaEnabled ? "badge-success" : "badge-warning"}`}>
                        {data.mfaEnabled ? "Active" : "Disabled"}
                    </span>
                </div>
                <div className="profile-row">
                    <div className="profile-row-left">
                        <span className="profile-row-icon">📱</span>
                        <span className="profile-row-label">Active Sessions</span>
                    </div>
                    <span className="profile-row-value">{data.activeSessions} device{data.activeSessions !== 1 ? "s" : ""}</span>
                </div>
                <div className="profile-row" style={{ cursor: "pointer" }}>
                    <div className="profile-row-left">
                        <span className="profile-row-icon">🌐</span>
                        <span className="profile-row-label">Language</span>
                    </div>
                    <span className="profile-row-value">English</span>
                </div>
            </div>
        </div>
    );
}
