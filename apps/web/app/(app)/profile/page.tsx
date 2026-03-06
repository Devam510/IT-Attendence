"use client";

import { useState, useEffect } from "react";
import { apiGet, apiPost } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import "@/styles/admin.css";

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

const ROLE_COLORS: Record<string, string> = {
    EMP: "linear-gradient(135deg,#1A56DB,#3F83F8)",
    MGR: "linear-gradient(135deg,#0E9F6E,#31C48D)",
    HRA: "linear-gradient(135deg,#7E3AF2,#A78BFA)",
    SADM: "linear-gradient(135deg,#E02424,#F98080)",
    SEC: "linear-gradient(135deg,#FF8A4C,#FCA172)",
};

/* ─── SVG Icon Components ──────────────────────────────── */
function Icon({ d, size = 16, color = "currentColor" }: { d: string; size?: number; color?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d={d} />
        </svg>
    );
}

const ICONS = {
    mail: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm0 0l8 9 8-9",
    phone: "M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.7A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 8.91a16 16 0 006.18 6.18l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z",
    building: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2zM9 22V12h6v10",
    user: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z",
    calendar: "M3 4h18v18H3zM16 2v4M8 2v4M3 10h18",
    mapPin: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0zM12 10a1 1 0 110-2 1 1 0 010 2z",
    key: "M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4",
    shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
    monitor: "M4 4h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2zM8 20h8M12 16v4",
    globe: "M12 2a10 10 0 100 20A10 10 0 0012 2zM2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20",
    eye: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 9a3 3 0 100 6 3 3 0 000-6z",
    eyeOff: "M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22",
    sun: "M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 17a5 5 0 100-10 5 5 0 000 10z",
    moon: "M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z",
    check: "M20 6L9 17l-5-5",
    x: "M18 6L6 18M6 6l12 12",
    chevronRight: "M9 18l6-6-6-6",
    lock: "M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4",
};

/* ─── IconBadge ───────────────────────────────────────── */
function IconBadge({ iconPath, bg }: { iconPath: string; bg: string }) {
    return (
        <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 34, height: 34, borderRadius: 10, background: bg, flexShrink: 0,
        }}>
            <Icon d={iconPath} size={15} color="white" />
        </span>
    );
}

/* ─── Change Password Modal ───────────────────────────── */
function ChangePasswordModal({ onClose }: { onClose: () => void }) {
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
        if (newPassword.length < 8) { setError("New password must be at least 8 characters."); return; }
        if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
        if (currentPassword === newPassword) { setError("New password must be different from current password."); return; }
        setLoading(true);
        const res = await apiPost<{ message: string }>("/api/auth/change-password", { currentPassword, newPassword });
        setLoading(false);
        if (res.error) {
            setError(res.code === "AUTH_FAILED" ? "Current password is incorrect."
                : res.code === "WEAK_PASSWORD" ? "Password must be at least 8 characters."
                    : res.code === "SAME_PASSWORD" ? "New password must differ from current."
                        : res.error || "Failed to change password.");
        } else {
            setSuccess(true);
            setTimeout(onClose, 1800);
        }
    }

    function strength(pw: string) {
        if (!pw) return { pct: 0, color: "#E5E7EB", label: "" };
        let s = 0;
        if (pw.length >= 8) s++;
        if (pw.length >= 12) s++;
        if (/[A-Z]/.test(pw)) s++;
        if (/[0-9]/.test(pw)) s++;
        if (/[^A-Za-z0-9]/.test(pw)) s++;
        if (s <= 1) return { pct: 20, color: "#E02424", label: "Weak" };
        if (s === 2) return { pct: 40, color: "#FF8A4C", label: "Fair" };
        if (s === 3) return { pct: 65, color: "#D97706", label: "Good" };
        return { pct: 100, color: "#0E9F6E", label: "Strong" };
    }

    const pwStrength = strength(newPassword);
    const passwordsMatch = confirmPassword.length > 0 && confirmPassword === newPassword;
    const passwordsMismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;

    return (
        <div
            style={{
                position: "fixed", inset: 0, zIndex: "var(--z-modal-backdrop)" as any,
                background: "rgba(10,20,40,0.6)", backdropFilter: "blur(8px)",
                display: "flex", alignItems: "center", justifyContent: "center", padding: "var(--space-4)",
            }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div style={{
                background: "var(--bg-primary)", borderRadius: "var(--radius-2xl)",
                width: "100%", maxWidth: 460, boxShadow: "0 24px 80px rgba(0,0,0,0.25)",
                border: "1px solid var(--border-primary)", overflow: "hidden",
                animation: "fadeIn 0.18s ease",
            }}>
                {/* Modal header gradient banner */}
                <div style={{
                    background: "linear-gradient(135deg,#1A56DB 0%,#7E3AF2 100%)",
                    padding: "var(--space-6) var(--space-6) var(--space-8)",
                    position: "relative",
                }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                                <span style={{
                                    width: 38, height: 38, borderRadius: 12,
                                    background: "rgba(255,255,255,0.15)", backdropFilter: "blur(4px)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                }}>
                                    <Icon d={ICONS.lock} size={18} color="white" />
                                </span>
                                <span style={{ fontSize: "var(--text-lg)", fontWeight: "var(--font-bold)", color: "white" }}>
                                    Change Password
                                </span>
                            </div>
                            <p style={{ fontSize: "var(--text-sm)", color: "rgba(255,255,255,0.75)", margin: 0 }}>
                                Keep your account safe with a strong password
                            </p>
                        </div>
                        <button onClick={onClose} style={{
                            background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 8,
                            width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer", color: "white", backdropFilter: "blur(4px)",
                        }}>
                            <Icon d={ICONS.x} size={16} color="white" />
                        </button>
                    </div>
                </div>

                <div style={{ padding: "var(--space-6)", marginTop: -16 }}>
                    {/* Card pull-up effect */}
                    {success ? (
                        <div style={{ textAlign: "center", padding: "var(--space-8) 0" }}>
                            <div style={{
                                width: 64, height: 64, borderRadius: "50%",
                                background: "var(--color-secondary-light)", margin: "0 auto var(--space-4)",
                                display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                                <Icon d={ICONS.check} size={28} color="var(--color-secondary)" />
                            </div>
                            <div style={{ fontWeight: "var(--font-semibold)", fontSize: "var(--text-base)", color: "var(--text-primary)" }}>
                                Password Updated!
                            </div>
                            <p style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginTop: 4 }}>
                                Your password has been changed successfully.
                            </p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                            {error && (
                                <div style={{
                                    padding: "var(--space-3) var(--space-4)",
                                    background: "var(--color-danger-light)", color: "var(--color-danger)",
                                    borderRadius: "var(--radius-md)", fontSize: "var(--text-sm)",
                                    display: "flex", alignItems: "center", gap: 8,
                                    border: "1px solid rgba(224,36,36,0.2)",
                                }}>
                                    <Icon d={ICONS.x} size={14} color="var(--color-danger)" />
                                    {error}
                                </div>
                            )}

                            {/* Current password */}
                            <div>
                                <label style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)", color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
                                    Current Password
                                </label>
                                <div className="input-wrapper">
                                    <input
                                        id="cp-current"
                                        type={showCurrent ? "text" : "password"}
                                        className="input"
                                        placeholder="Enter your current password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        required autoComplete="current-password" autoFocus
                                    />
                                    <span className="input-icon" onClick={() => setShowCurrent(!showCurrent)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setShowCurrent(!showCurrent)}>
                                        <Icon d={showCurrent ? ICONS.eyeOff : ICONS.eye} size={16} color="var(--text-tertiary)" />
                                    </span>
                                </div>
                            </div>

                            {/* New password */}
                            <div>
                                <label style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)", color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
                                    New Password
                                </label>
                                <div className="input-wrapper">
                                    <input
                                        id="cp-new"
                                        type={showNew ? "text" : "password"}
                                        className="input"
                                        placeholder="At least 8 characters"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        required autoComplete="new-password"
                                    />
                                    <span className="input-icon" onClick={() => setShowNew(!showNew)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setShowNew(!showNew)}>
                                        <Icon d={showNew ? ICONS.eyeOff : ICONS.eye} size={16} color="var(--text-tertiary)" />
                                    </span>
                                </div>
                                {/* Strength bar */}
                                {newPassword.length > 0 && (
                                    <div style={{ marginTop: 8 }}>
                                        <div style={{ display: "flex", gap: 4 }}>
                                            {[20, 40, 65, 100].map((threshold) => (
                                                <div key={threshold} style={{
                                                    flex: 1, height: 4, borderRadius: 2,
                                                    background: pwStrength.pct >= threshold ? pwStrength.color : "var(--bg-tertiary)",
                                                    transition: "background 0.3s ease",
                                                }} />
                                            ))}
                                        </div>
                                        <div style={{ fontSize: 11, color: pwStrength.color, marginTop: 4, fontWeight: "var(--font-semibold)" }}>
                                            {pwStrength.label}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Confirm password */}
                            <div>
                                <label style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)", color: "var(--text-primary)", display: "block", marginBottom: 6 }}>
                                    Confirm Password
                                </label>
                                <div className="input-wrapper">
                                    <input
                                        id="cp-confirm"
                                        type={showConfirm ? "text" : "password"}
                                        className="input"
                                        placeholder="Repeat new password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required autoComplete="new-password"
                                        style={{
                                            borderColor: passwordsMismatch ? "var(--color-danger)"
                                                : passwordsMatch ? "var(--color-secondary)" : undefined,
                                        }}
                                    />
                                    <span className="input-icon" onClick={() => setShowConfirm(!showConfirm)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setShowConfirm(!showConfirm)}>
                                        {passwordsMatch
                                            ? <Icon d={ICONS.check} size={16} color="var(--color-secondary)" />
                                            : <Icon d={showConfirm ? ICONS.eyeOff : ICONS.eye} size={16} color="var(--text-tertiary)" />
                                        }
                                    </span>
                                </div>
                                {passwordsMismatch && (
                                    <div style={{ fontSize: "var(--text-xs)", color: "var(--color-danger)", marginTop: 4 }}>
                                        Passwords do not match
                                    </div>
                                )}
                            </div>

                            {/* Actions */}
                            <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
                                <button type="button" className="btn btn-ghost btn-full" onClick={onClose} disabled={loading}>
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary btn-full"
                                    disabled={loading || !currentPassword || !newPassword || !confirmPassword || passwordsMismatch}
                                >
                                    {loading ? <><span className="spinner" /> Saving...</> : "Update Password"}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
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
        apiGet<{ profile: Record<string, unknown> }>("/api/profile").then(res => {
            if (res.data?.profile) setProfile(res.data.profile);
            setLoading(false);
        }).catch(() => setLoading(false));
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

    const initials = data.fullName.split(" ").map((n: string) => n[0] || "").join("").slice(0, 2).toUpperCase() || "U";
    const avatarGradient = ROLE_COLORS[data.role] || ROLE_COLORS.EMP;

    function toggleTheme() {
        const next = darkMode ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("nexus-theme", next);
        setDarkMode(!darkMode);
    }

    const joinDateDisplay = data.joinDate !== "–"
        ? (() => { try { return new Date(data.joinDate).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }); } catch { return data.joinDate; } })()
        : "–";

    if (loading) {
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                <div className="skeleton" style={{ height: 240, borderRadius: 20 }} />
                <div className="skeleton" style={{ height: 260, borderRadius: 16 }} />
                <div className="skeleton" style={{ height: 100, borderRadius: 16 }} />
                <div className="skeleton" style={{ height: 180, borderRadius: 16 }} />
            </div>
        );
    }

    /* Row helper */
    function InfoRow({ iconPath, iconBg, label, value, onClick, chevron, rightSlot }: {
        iconPath: string; iconBg: string; label: string; value?: string;
        onClick?: () => void; chevron?: boolean; rightSlot?: React.ReactNode;
    }) {
        return (
            <div
                style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "var(--space-4) var(--space-5)", gap: "var(--space-4)",
                    borderBottom: "1px solid var(--border-primary)", cursor: onClick ? "pointer" : "default",
                    transition: "background var(--transition-fast)",
                }}
                className={onClick ? "profile-row" : ""}
                onClick={onClick}
                role={onClick ? "button" : undefined}
                tabIndex={onClick ? 0 : undefined}
                onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flex: 1, minWidth: 0 }}>
                    <IconBadge iconPath={iconPath} bg={iconBg} />
                    <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)", color: "var(--text-primary)" }}>
                        {label}
                    </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                    {rightSlot || (value && (
                        <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>{value}</span>
                    ))}
                    {chevron && <Icon d={ICONS.chevronRight} size={16} color="var(--text-tertiary)" />}
                </div>
            </div>
        );
    }

    function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
        return (
            <div style={{
                background: "var(--bg-primary)", border: "1px solid var(--border-primary)",
                borderRadius: "var(--radius-xl)", overflow: "hidden", marginBottom: "var(--space-4)",
                boxShadow: "var(--shadow-xs)",
            }}>
                <div style={{
                    fontSize: "var(--text-xs)", fontWeight: "var(--font-semibold)",
                    textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-tertiary)",
                    padding: "var(--space-3) var(--space-5)", background: "var(--bg-secondary)",
                    borderBottom: "1px solid var(--border-primary)",
                }}>
                    {title}
                </div>
                <div style={{ "& > :last-child": { borderBottom: "none" } } as any}>
                    {children}
                </div>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
            {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}

            {/* ── Hero Avatar Card ─────────────────────────── */}
            <div style={{
                borderRadius: "var(--radius-2xl)", overflow: "hidden",
                marginBottom: "var(--space-4)", boxShadow: "var(--shadow-sm)",
                border: "1px solid var(--border-primary)",
            }}>
                {/* Gradient banner */}
                <div style={{ background: avatarGradient, height: 90, position: "relative" }}>
                    {/* Subtle dot pattern */}
                    <div style={{
                        position: "absolute", inset: 0,
                        backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)",
                        backgroundSize: "18px 18px",
                    }} />
                </div>

                {/* Avatar + info */}
                <div style={{
                    background: "var(--bg-primary)", padding: "0 var(--space-6) var(--space-6)",
                    marginTop: -40, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
                }}>
                    <div style={{
                        width: 80, height: 80, borderRadius: "50%",
                        background: avatarGradient, color: "white",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)",
                        border: "4px solid var(--bg-primary)",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                        marginBottom: "var(--space-3)",
                    }}>
                        {initials}
                    </div>
                    <div style={{ fontSize: "var(--text-xl)", fontWeight: "var(--font-bold)", color: "var(--text-primary)" }}>
                        {data.fullName}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginTop: "var(--space-2)", flexWrap: "wrap", justifyContent: "center" }}>
                        <span style={{
                            padding: "3px 10px", borderRadius: "var(--radius-full)",
                            background: avatarGradient, color: "white",
                            fontSize: "var(--text-xs)", fontWeight: "var(--font-semibold)",
                        }}>
                            {ROLE_LABELS[data.role] || data.role}
                        </span>
                        <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                            {data.department}
                        </span>
                        <span style={{ color: "var(--border-secondary)", fontSize: "var(--text-xs)" }}>·</span>
                        <span style={{ fontSize: "var(--text-sm)", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>
                            {data.employeeId}
                        </span>
                    </div>
                </div>
            </div>

            {/* ── Information ─────────────────────────────── */}
            <SectionCard title="Information">
                <InfoRow iconPath={ICONS.mail} iconBg="linear-gradient(135deg,#1A56DB,#3F83F8)" label="Email" value={data.email} />
                <InfoRow iconPath={ICONS.phone} iconBg="linear-gradient(135deg,#0E9F6E,#31C48D)" label="Phone" value={data.phone} />
                <InfoRow iconPath={ICONS.building} iconBg="linear-gradient(135deg,#7E3AF2,#A78BFA)" label="Department" value={data.department} />
                <InfoRow iconPath={ICONS.user} iconBg="linear-gradient(135deg,#FF8A4C,#FCA172)" label="Manager" value={data.manager} />
                <InfoRow iconPath={ICONS.calendar} iconBg="linear-gradient(135deg,#E02424,#F98080)" label="Join Date" value={joinDateDisplay} />
                <div style={{ borderBottom: "none" }}>
                    <InfoRow iconPath={ICONS.mapPin} iconBg="linear-gradient(135deg,#0891B2,#22D3EE)" label="Work Location" value={data.workLocation} />
                </div>
            </SectionCard>

            {/* ── Appearance ───────────────────────────────── */}
            <SectionCard title="Appearance">
                <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "var(--space-4) var(--space-5)",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                        <IconBadge iconPath={darkMode ? ICONS.moon : ICONS.sun} iconBg={darkMode ? "linear-gradient(135deg,#1e1b4b,#4338ca)" : "linear-gradient(135deg,#F59E0B,#FBBF24)"} />
                        <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)" }}>
                            {darkMode ? "Dark Mode" : "Light Mode"}
                        </span>
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
            </SectionCard>

            {/* ── Account Security ─────────────────────────── */}
            <SectionCard title="Account Security">
                <InfoRow
                    iconPath={ICONS.key}
                    iconBg="linear-gradient(135deg,#1A56DB,#3F83F8)"
                    label="Change Password"
                    onClick={() => setShowChangePassword(true)}
                    chevron
                />
                <InfoRow
                    iconPath={ICONS.shield}
                    iconBg={data.mfaEnabled ? "linear-gradient(135deg,#0E9F6E,#31C48D)" : "linear-gradient(135deg,#9CA3AF,#D1D5DB)"}
                    label="Two-Factor Authentication"
                    rightSlot={
                        <span className={`badge ${data.mfaEnabled ? "badge-success" : "badge-warning"}`}>
                            {data.mfaEnabled ? "Active" : "Disabled"}
                        </span>
                    }
                />
                <InfoRow
                    iconPath={ICONS.monitor}
                    iconBg="linear-gradient(135deg,#7E3AF2,#A78BFA)"
                    label="Active Sessions"
                    value={`${data.activeSessions} device${data.activeSessions !== 1 ? "s" : ""}`}
                />
                <div style={{ borderBottom: "none" }}>
                    <InfoRow
                        iconPath={ICONS.globe}
                        iconBg="linear-gradient(135deg,#0891B2,#22D3EE)"
                        label="Language"
                        value="English (US)"
                    />
                </div>
            </SectionCard>
        </div>
    );
}
