"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      router.replace(isAuthenticated ? "/dashboard" : "/login");
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--bg-secondary)",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "2rem", fontWeight: 700, color: "var(--color-primary)", marginBottom: "var(--space-4)" }}>
          VTL
        </div>
        <div className="spinner" style={{ margin: "0 auto", width: 24, height: 24, border: "3px solid var(--border-primary)", borderTopColor: "var(--color-primary)", borderRadius: "50%" }} />
      </div>
    </div>
  );
}
