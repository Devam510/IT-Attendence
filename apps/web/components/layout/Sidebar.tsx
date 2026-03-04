"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

const NAV_ITEMS = [
    { href: "/dashboard", icon: "📊", label: "Dashboard" },
    { href: "/attendance", icon: "⏱️", label: "Attendance" },
    { href: "/leaves", icon: "🗓️", label: "Leaves" },
    { href: "/approvals", icon: "✅", label: "Approvals" },
    { href: "/notifications", icon: "🔔", label: "Notifications" },
];

const ADMIN_ITEMS = [
    { href: "/admin/audit-logs", icon: "📋", label: "Audit Logs" },
    { href: "/admin/health", icon: "🏥", label: "System Health" },
    { href: "/security", icon: "🛡️", label: "Security" },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { user } = useAuth();

    const isAdmin = user?.role === "SADM" || user?.role === "HRA" || user?.role === "SEC";

    return (
        <aside className="sidebar" role="navigation" aria-label="Main navigation">
            <div className="sidebar-header">
                <Link href="/dashboard" className="sidebar-logo">
                    <span className="sidebar-logo-icon">N</span>
                    NEXUS
                </Link>
            </div>

            <nav className="sidebar-nav">
                <div className="sidebar-section">Main</div>
                {NAV_ITEMS.map(item => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`sidebar-link ${pathname === item.href || pathname.startsWith(item.href + "/") ? "active" : ""}`}
                    >
                        <span className="sidebar-link-icon">{item.icon}</span>
                        {item.label}
                    </Link>
                ))}

                <Link
                    href="/profile"
                    className={`sidebar-link ${pathname === "/profile" ? "active" : ""}`}
                >
                    <span className="sidebar-link-icon">👤</span>
                    Profile
                </Link>

                {isAdmin && (
                    <>
                        <div className="sidebar-section">Admin</div>
                        {ADMIN_ITEMS.map(item => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`sidebar-link ${pathname === item.href ? "active" : ""}`}
                            >
                                <span className="sidebar-link-icon">{item.icon}</span>
                                {item.label}
                            </Link>
                        ))}
                    </>
                )}
            </nav>
        </aside>
    );
}
