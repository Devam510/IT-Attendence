"use client";

import { useState, useEffect } from "react";
import { apiGet } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import "@/styles/admin.css";

interface ProfileData {
    fullName: string;
    email: string;
    phone?: string;
    department: string;
    role: string;
    employeeId: string;
    manager?: string;
    joinDate: string;
    workLocation?: string;
    mfaEnabled: boolean;
    activeSessions: number;
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
    const { theme, toggleTheme } = useTheme();
    const [profile, setProfile] = useState<ProfileData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            const res = await apiGet<{ profile: ProfileData }>("/api/profile");
            if (res.data?.profile) setProfile(res.data.profile);
            setLoading(false);
        }
        load();
    }, []);

    const data = profile || {
        fullName: user?.fullName || "NEXUS User",
        email: user?.email || "",
        phone: "",
        department: "–",
        role: user?.role || "EMP",
        employeeId: "–",
        manager: "–",
        joinDate: "–",
        workLocation: "–",
        mfaEnabled: false,
        activeSessions: 1,
    };

    const initials = data.fullName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

    if (loading) {
        return (
            <div>
                <div className="skeleton" style={{ height: 200, borderRadius: 16, marginBottom: 16 }} />
                <div className="skeleton" style={{ height: 250, borderRadius: 12, marginBottom: 12 }} />
                <div className="skeleton" style={{ height: 200, borderRadius: 12 }} />
            </div>
        );
    }

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
                    { icon: "📱", label: "Phone", value: data.phone || "Not set" },
                    { icon: "🏢", label: "Department", value: data.department },
                    { icon: "👤", label: "Manager", value: data.manager || "–" },
                    { icon: "📅", label: "Join Date", value: data.joinDate !== "–" ? new Date(data.joinDate).toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" }) : "–" },
                    { icon: "📍", label: "Work Location", value: data.workLocation || "–" },
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
                        <span className="profile-row-icon">{theme === "dark" ? "🌙" : "☀️"}</span>
                        <span className="profile-row-label">Dark Mode</span>
                    </div>
                    <div
                        className={`toggle-track ${theme === "dark" ? "on" : ""}`}
                        onClick={toggleTheme}
                        role="switch"
                        aria-checked={theme === "dark"}
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
