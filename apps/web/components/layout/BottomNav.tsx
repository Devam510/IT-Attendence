"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
    { href: "/dashboard", icon: "🏠", label: "Home" },
    { href: "/attendance", icon: "📊", label: "Stats" },
    { href: "/attendance", icon: "📍", label: "Check In", center: true },
    { href: "/leaves", icon: "📝", label: "Leaves" },
    { href: "/profile", icon: "👤", label: "Profile" },
];

export default function BottomNav() {
    const pathname = usePathname();

    return (
        <nav className="bottomnav" role="navigation" aria-label="Mobile navigation">
            {ITEMS.map((item, i) => (
                <Link
                    key={i}
                    href={item.href}
                    className={`bottomnav-item ${item.center ? "" : pathname === item.href ? "active" : ""
                        }`}
                >
                    {item.center ? (
                        <span className="bottomnav-center">{item.icon}</span>
                    ) : (
                        <>
                            <span className="bottomnav-icon">{item.icon}</span>
                            <span>{item.label}</span>
                        </>
                    )}
                </Link>
            ))}
        </nav>
    );
}
