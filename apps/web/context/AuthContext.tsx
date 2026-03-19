"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, apiGet, setAccessToken, getAccessToken, refreshToken } from "@/lib/api-client";

interface User {
    id: string;
    email: string;
    fullName: string;
    role: string;
    employeeId: string;
    entityId: string;
    departmentId: string;
    mfaEnabled: boolean;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (identifier: string, password: string) => Promise<{ success: boolean; mfaRequired?: boolean; error?: string }>;
    verifyMfa: (code: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/* ── helpers ────────────────────────────────────── */

/** Decode JWT payload without verifying signature (public data only). */
function decodeJwtPayload(token: string): Record<string, any> | null {
    try {
        const base64 = token.split(".")[1];
        if (!base64) return null;
        // pad base64url → base64
        const padded = base64.replace(/-/g, "+").replace(/_/g, "/");
        const json = atob(padded);
        return JSON.parse(json);
    } catch {
        return null;
    }
}

/** Map JWT claims → User shape. */
function jwtToUser(payload: Record<string, any>): User | null {
    if (!payload?.sub) return null;
    return {
        id: payload.sub,
        email: payload.email ?? "",
        fullName: payload.fullName ?? "",
        role: payload.role ?? "",
        employeeId: payload.employeeId ?? "",
        entityId: payload.entityId ?? "",
        departmentId: payload.departmentId ?? "",
        mfaEnabled: payload.mfaEnabled ?? false,
    };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // ── Boot: decode token locally for instant load ──────────────
    useEffect(() => {
        async function initAuth() {
            try {
                let token = getAccessToken();
                if (!token) {
                    setIsLoading(false);
                    return;
                }

                let payload = decodeJwtPayload(token);
                let localUser = jwtToUser(payload ?? {});
                const now = Math.floor(Date.now() / 1000);

                // If local token is expired, try to refresh immediately before doing anything
                if (!localUser || (payload?.exp && payload.exp < now)) {
                    const refreshed = await refreshToken();
                    if (refreshed) {
                        token = getAccessToken();
                        payload = decodeJwtPayload(token!);
                        localUser = jwtToUser(payload ?? {});
                    } else {
                        // Refresh failed, token is dead
                        setAccessToken(null);
                        localStorage.removeItem("nexus-refresh-token");
                        setIsLoading(false);
                        return;
                    }
                }

                // Show UI immediately if we have a valid token
                setUser(localUser);
                setIsLoading(false);

                // Background validation to ensure token isn't revoked
                const res = await apiGet<{ user: User }>("/api/auth/session");
                if (res.data?.user) {
                    setUser(res.data.user);
                } else if (res.error === "Unauthorized" || res.code === "UNAUTHORIZED" || res.code === "USER_NOT_FOUND") {
                    // Token was revoked or invalid server-side
                    setAccessToken(null);
                    localStorage.removeItem("nexus-refresh-token");
                    setUser(null);
                    // Only redirect if not already on login page
                    if (window.location.pathname !== "/login") {
                        window.location.href = "/login";
                    }
                }
            } catch (err) {
                console.error("Auth initialization failed:", err);
                setIsLoading(false);
            }
        }

        initAuth();

        // Proactively refresh the token every 12 minutes (since it expires in 15m)
        // This ensures the user stays logged in as long as the tab is open
        const interval = setInterval(async () => {
            if (getAccessToken()) {
                await refreshToken();
            }
        }, 12 * 60 * 1000);

        return () => clearInterval(interval);
    }, []);

    const login = useCallback(async (identifier: string, password: string) => {
        const res = await api<{
            accessToken?: string;
            refreshToken?: string;
            user?: User;
            mfaRequired?: boolean;
            tempToken?: string;
        }>("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ identifier, password }),
        });

        if (res.error) return { success: false, error: res.error };

        if (res.data?.mfaRequired) {
            // Store temp token for MFA flow
            if (res.data.tempToken) {
                sessionStorage.setItem("nexus-mfa-token", res.data.tempToken);
            }
            return { success: true, mfaRequired: true };
        }

        if (res.data?.accessToken) {
            setAccessToken(res.data.accessToken);
            if (res.data.refreshToken) {
                localStorage.setItem("nexus-refresh-token", res.data.refreshToken);
            }
            if (res.data.user) {
                setUser(res.data.user);
            }
            return { success: true };
        }

        return { success: false, error: "Unexpected response" };
    }, []);

    const verifyMfa = useCallback(async (code: string) => {
        const tempToken = sessionStorage.getItem("nexus-mfa-token");
        const res = await api<{
            accessToken: string;
            refreshToken: string;
            user: User;
        }>("/api/auth/mfa/verify", {
            method: "POST",
            headers: tempToken ? { "Authorization": `Bearer ${tempToken}` } : {},
            body: JSON.stringify({ code }),
        });

        if (res.error) return { success: false, error: res.error };

        if (res.data?.accessToken) {
            setAccessToken(res.data.accessToken);
            localStorage.setItem("nexus-refresh-token", res.data.refreshToken);
            setUser(res.data.user);
            sessionStorage.removeItem("nexus-mfa-token");
            return { success: true };
        }

        return { success: false, error: "Verification failed" };
    }, []);

    const logout = useCallback(() => {
        setAccessToken(null);
        localStorage.removeItem("nexus-refresh-token");
        sessionStorage.removeItem("nexus-mfa-token");
        setUser(null);
        window.location.href = "/login";
    }, []);

    return (
        <AuthContext.Provider value={{
            user,
            isAuthenticated: !!user,
            isLoading,
            login,
            verifyMfa,
            logout,
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within AuthProvider");
    return context;
}
