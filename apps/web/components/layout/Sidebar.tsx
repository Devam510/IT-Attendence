"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import {
    LayoutDashboard,
    Clock,
    CalendarDays,
    CheckSquare,
    ClipboardCheck,
    ClipboardList,
    HeartPulse,
    ShieldCheck,
    UsersRound,
} from "lucide-react";

const NAV_ITEMS = [
    { href: "/dashboard", Icon: LayoutDashboard, label: "Dashboard" },
    { href: "/attendance", Icon: Clock, label: "Attendance" },
    { href: "/updates", Icon: ClipboardCheck, label: "Daily Updates" },
    { href: "/leaves", Icon: CalendarDays, label: "Leaves" },
    { href: "/approvals", Icon: CheckSquare, label: "Approvals" },
];

const ADMIN_ITEMS = [
    { href: "/admin/audit-logs", Icon: ClipboardList, label: "Audit Logs" },
    { href: "/admin/health", Icon: HeartPulse, label: "System Health" },
    { href: "/security", Icon: ShieldCheck, label: "Security" },
];

const MANAGER_NAV_ITEMS = [
    { href: "/team-attendance", Icon: UsersRound, label: "Team Attendance" },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { user } = useAuth();
    const { theme } = useTheme();

    const isManager = user?.role === "MGR" || user?.role === "HRA" || user?.role === "HRBP" || user?.role === "SADM";
    // HR is no longer an Admin for viewing Audit Logs, Security, Health
    // strict evaluation to prevent role misidentification
    const isAdmin = Boolean(user && (user.role === "SADM" || user.role === "SEC" || user.role === "ITA"));
    const canManageUsers = user?.role === "SADM" || user?.role === "HRA" || user?.role === "HRBP";
    const isSuperAdmin = user?.role === "SADM";

    // Admins don't have personal attendance — hide that link for them
    const visibleNavItems = isSuperAdmin
        ? NAV_ITEMS.filter(item => item.href !== "/attendance" && item.href !== "/leaves")
        : NAV_ITEMS;

    return (
        <aside className="sidebar" role="navigation" aria-label="Main navigation">
            <div className="sidebar-header">
                <Link href="/dashboard" className="sidebar-logo">
                    <Image
                        src={theme === "dark" ? "/logo-white-2.webp" : "/logo-black.webp"}
                        alt="Vibe Tech Labs"
                        width={140}
                        height={40}
                        className="sidebar-logo-img"
                        style={{ objectFit: "contain" }}
                        priority
                    />
                </Link>
            </div>

            <nav className="sidebar-nav">
                <div className="sidebar-section">Main</div>
                {visibleNavItems.map(({ href, Icon, label }) => (
                    <Link
                        key={href}
                        href={href}
                        className={`sidebar-link ${pathname === href || pathname.startsWith(href + "/") ? "active" : ""}`}
                    >
                        <span className="sidebar-link-icon">
                            <Icon size={18} strokeWidth={1.8} />
                        </span>
                        {label}
                    </Link>
                ))}

                {/* Team Attendance - visible to HR/Manager/Admin */}
                {isManager && MANAGER_NAV_ITEMS.map(({ href, Icon, label }) => (
                    <Link
                        key={href}
                        href={href}
                        className={`sidebar-link ${pathname === href ? "active" : ""}`}
                    >
                        <span className="sidebar-link-icon">
                            <Icon size={18} strokeWidth={1.8} />
                        </span>
                        {label}
                    </Link>
                ))}


                {canManageUsers && !isAdmin && (
                    <>
                        <div className="sidebar-section">Admin</div>
                        <Link
                            href="/users"
                            className={`sidebar-link ${pathname === "/users" ? "active" : ""}`}
                        >
                            <span className="sidebar-link-icon">
                                <UsersRound size={18} strokeWidth={1.8} />
                            </span>
                            Users
                        </Link>
                    </>
                )}

                {isAdmin && (
                    <>
                        <div className="sidebar-section">System Administration</div>
                        {canManageUsers && (
                            <Link
                                href="/users"
                                className={`sidebar-link ${pathname === "/users" ? "active" : ""}`}
                            >
                                <span className="sidebar-link-icon">
                                    <UsersRound size={18} strokeWidth={1.8} />
                                </span>
                                Users
                            </Link>
                        )}
                        {ADMIN_ITEMS.map(({ href, Icon, label }) => (
                            <Link
                                key={href}
                                href={href}
                                className={`sidebar-link ${pathname === href ? "active" : ""}`}
                            >
                                <span className="sidebar-link-icon">
                                    <Icon size={18} strokeWidth={1.8} />
                                </span>
                                {label}
                            </Link>
                        ))}
                    </>
                )}
            </nav>
        </aside>
    );
}
