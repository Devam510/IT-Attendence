"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Navbar from "@/components/layout/Navbar";
import Sidebar from "@/components/layout/Sidebar";
import "@/styles/layout.css";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();
    const router = useRouter();
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.replace("/login");
        }
    }, [isAuthenticated, isLoading, router]);

    // Show loading while checking auth
    if (isLoading) {
        return (
            <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "100vh",
                background: "var(--bg-secondary)",
            }}>
                <div
                    className="spinner"
                    style={{
                        width: 32,
                        height: 32,
                        border: "3px solid var(--border-primary)",
                        borderTopColor: "var(--color-primary)",
                        borderRadius: "50%",
                    }}
                />
            </div>
        );
    }

    if (!isAuthenticated) return null;

    return (
        <div className="app-shell">
            <Sidebar 
                isMobileOpen={isMobileSidebarOpen} 
                onMobileClose={() => setIsMobileSidebarOpen(false)} 
            />
            <Navbar onMenuClick={() => setIsMobileSidebarOpen(true)} />
            <div className="app-main">
                <div className="app-content">
                    {children}
                </div>
            </div>
        </div>
    );
}
