"use client";

import { useState, FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import "@/styles/components.css";

export default function LoginPage() {
    const router = useRouter();
    const { login } = useAuth();
    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const { theme } = useTheme();

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError("");
        setLoading(true);

        const result = await login(identifier, password);

        if (result.mfaRequired) {
            router.push("/mfa");
        } else if (result.success) {
            router.push("/dashboard");
        } else {
            setError(result.error || "Invalid credentials");
            setLoading(false);
        }
    }

    return (
        <div className="login-container">
            {/* Left — Brand Panel */}
            <div className="login-brand">
                <Image
                    src={theme === "dark" ? "/logo-white-2.png" : "/logo-black.webp"}
                    alt="Vibe Tech Labs"
                    width={200}
                    height={60}
                    style={{ objectFit: "contain", marginBottom: "1rem" }}
                    priority
                />
                <div className="login-brand-tagline">
                    A Digital Idea To Grow You Up!
                </div>
            </div>

            {/* Right — Form Panel */}
            <div className="login-form-section">
                <div className="login-card animate-fadeIn">
                    <h1 className="login-title">Sign In to your Account</h1>
                    <p className="login-subtitle">
                        Enter your credentials to access your dashboard
                    </p>

                    <form onSubmit={handleSubmit}>
                        {error && (
                            <div
                                style={{
                                    padding: "var(--space-3) var(--space-4)",
                                    background: "var(--color-danger-light)",
                                    color: "var(--color-danger)",
                                    borderRadius: "var(--radius-md)",
                                    fontSize: "var(--text-sm)",
                                    marginBottom: "var(--space-5)",
                                }}
                                className="animate-shake"
                            >
                                {error}
                            </div>
                        )}

                        <div className="input-group" style={{ marginBottom: "var(--space-5)" }}>
                            <label className="input-label" htmlFor="identifier">
                                Employee ID or Email
                            </label>
                            <input
                                id="identifier"
                                type="text"
                                className="input"
                                placeholder="e.g. VTL001 or name@company.com"
                                value={identifier}
                                onChange={(e) => setIdentifier(e.target.value)}
                                required
                                autoComplete="username"
                                autoFocus
                            />
                        </div>

                        <div className="input-group" style={{ marginBottom: "var(--space-5)" }}>
                            <label className="input-label" htmlFor="password">
                                Password
                            </label>
                            <div className="input-wrapper">
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    className="input"
                                    placeholder="Enter your password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    autoComplete="current-password"
                                />
                                <span
                                    className="input-icon"
                                    onClick={() => setShowPassword(!showPassword)}
                                    role="button"
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                    tabIndex={0}
                                    onKeyDown={(e) => e.key === "Enter" && setShowPassword(!showPassword)}
                                >
                                    {showPassword ? "🙈" : "👁️"}
                                </span>
                            </div>
                        </div>

                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: "var(--space-6)",
                                fontSize: "var(--text-sm)",
                            }}
                        >
                            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer" }}>
                                <input type="checkbox" />
                                Remember me
                            </label>
                            <a href="#" style={{ color: "var(--color-primary)", fontSize: "var(--text-sm)" }}>
                                Forgot password?
                            </a>
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary btn-full btn-lg"
                            disabled={loading || !identifier || !password}
                        >
                            {loading ? (
                                <>
                                    <span className="spinner" />
                                    Signing in...
                                </>
                            ) : (
                                "Sign In"
                            )}
                        </button>
                    </form>

                    <div className="login-footer">
                        Vibe Tech Labs v1.0 · Secured with 256-bit encryption
                    </div>
                </div>
            </div>
        </div>
    );
}
