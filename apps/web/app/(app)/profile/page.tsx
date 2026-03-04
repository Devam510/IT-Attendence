"use client";

import { useState, useEffect } from "react";
import { apiGet } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import "@/styles/admin.css";

// Helper: safely convert any value to a string for rendering
function str(val: unknown): string {
    if (val === null || val === undefined) return "–";
    if (typeof val === "string") return val;
    if (typeof val === "number" || typeof val === "boolean") return String(val);
    if (typeof val === "object") {
        // Handle { name: "..." } objects from the API
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

export default function ProfilePage() {
    const { user } = useAuth();
    const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
    const [loading, setLoading] = useState(true);
    const [darkMode, setDarkMode] = useState(false);

    useEffect(() => {
        // Check current theme
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
                <div className="profile-row" style={{ cursor: "pointer" }}>
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
