"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api-client";

export default function Navbar() {
    const { theme, toggleTheme } = useTheme();
    const { user, logout } = useAuth();
    const pathname = usePathname();
    const [showDropdown, setShowDropdown] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    // Fetch unread notification count — poll every 30s
    const fetchUnreadCount = useCallback(async () => {
        try {
            const res = await api<{ unreadCount: number }>("/api/notifications?unread=true&limit=1");
            if (res.data?.unreadCount !== undefined) {
                setUnreadCount(res.data.unreadCount);
            }
        } catch {
            // silent — don't disrupt the navbar on error
        }
    }, []);

    useEffect(() => {
        if (!user) return; // only fetch once authenticated
        fetchUnreadCount();
        const interval = setInterval(fetchUnreadCount, 30_000);
        return () => clearInterval(interval);
    }, [user, fetchUnreadCount]);

    const initials = user?.fullName
        ?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()
        || "VT";

    const badgeLabel = unreadCount > 9 ? "9+" : String(unreadCount);

    // suppress unused warning — pathname used for future active-link highlighting
    void pathname;

    return (
        <nav className="navbar" role="navigation" aria-label="Top navigation">
            <div className="navbar-left">
                <Link href="/dashboard" className="navbar-logo">
                    <Image
                        src="/logo-black.webp"
                        alt="Vibe Tech Labs"
                        width={130}
                        height={36}
                        style={{ objectFit: "contain" }}
                        priority
                    />
                </Link>
            </div>

            <div className="navbar-right">
                {/* Dark/Light Toggle */}
                <button
                    className="navbar-icon-btn"
                    onClick={toggleTheme}
                    aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
                    title={`${theme === "light" ? "Dark" : "Light"} mode`}
                >
                    {theme === "light" ? "🌙" : "☀️"}
                </button>

                {/* Notifications — dynamic unread badge */}
                <Link
                    href="/notifications"
                    className="navbar-icon-btn"
                    aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
                    onClick={() => setUnreadCount(0)} // optimistic clear on click
                >
                    🔔
                    {unreadCount > 0 && (
                        <span className="navbar-badge">{badgeLabel}</span>
                    )}
                </Link>

                {/* Avatar + Dropdown */}
                <div style={{ position: "relative" }} ref={dropdownRef}>
                    <div
                        className="navbar-avatar"
                        onClick={() => setShowDropdown(!showDropdown)}
                        role="button"
                        aria-label="User menu"
                        aria-expanded={showDropdown}
                        tabIndex={0}
                        onKeyDown={(e) => e.key === "Enter" && setShowDropdown(!showDropdown)}
                    >
                        {initials}
                    </div>

                    {showDropdown && (
                        <div className="avatar-dropdown">
                            <div style={{ padding: "var(--space-3) var(--space-4)", borderBottom: "1px solid var(--border-primary)", marginBottom: "var(--space-2)" }}>
                                <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>
                                    {user?.fullName || "Vibe Tech User"}
                                </div>
                                <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
                                    {user?.email || "user@nexus.dev"}
                                </div>
                            </div>
                            <Link href="/profile" className="avatar-dropdown-item" onClick={() => setShowDropdown(false)}>
                                👤 Profile
                            </Link>
                            <Link href="/admin/health" className="avatar-dropdown-item" onClick={() => setShowDropdown(false)}>
                                ⚙️ Settings
                            </Link>
                            <div className="avatar-dropdown-divider" />
                            <button className="avatar-dropdown-item danger" onClick={logout}>
                                🚪 Sign Out
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </nav>
    );
}
