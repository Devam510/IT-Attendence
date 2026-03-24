"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
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

/* ── Push notification helpers ─────────────────────── */

/** Register service worker and subscribe browser to Web Push. */
async function registerPush(): Promise<void> {
    try {
        if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return;

        // Request permission *before* ANY network requests, or Chrome drops the user gesture token!
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        // Get VAPID public key from server
        const keyRes = await api<{key: string}>("/api/push/vapid-public-key");
        if (keyRes.error || !keyRes.data?.key) return;
        const key = keyRes.data.key;

        // Register the service worker
        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        // Subscribe to push
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(key).buffer as ArrayBuffer,
        });

        // Save subscription to server
        const subJson = subscription.toJSON();
        await api("/api/push/subscribe", {
            method: "POST",
            body: JSON.stringify({
                endpoint: subJson.endpoint,
                keys: subJson.keys,
            }),
        });
    } catch (err) {
        console.warn("Push registration failed (non-critical):", err);
    }
}

/** Convert base64url VAPID key to Uint8Array for the browser API. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

/** Unsubscribe from push (call on logout). */
async function unregisterPush(): Promise<void> {
    try {
        if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
        const registration = await navigator.serviceWorker.getRegistration("/sw.js");
        if (!registration) return;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) return;
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await api("/api/push/unsubscribe", {
            method: "DELETE",
            body: JSON.stringify({ endpoint }),
        });
    } catch (err) {
        console.warn("Push unregister failed (non-critical):", err);
    }
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

                // Background validation to ensure token isn't revoked server-side
                // Only logout on explicit 401 — ignore 500/network errors to avoid false logouts
                const res = await apiGet<{ user: User }>("/api/auth/session");
                if (res.data?.user) {
                    setUser(res.data.user);
                } else if (res.code === "UNAUTHORIZED" && res.error) {
                    // Confirmed server-side rejection — log out
                    setAccessToken(null);
                    localStorage.removeItem("nexus-refresh-token");
                    setUser(null);
                    if (window.location.pathname !== "/login") {
                        window.location.href = "/login";
                    }
                }
                // Any other error (network, 500, timeout) = silently keep user logged in
            } catch (err) {
                console.error("Auth initialization failed:", err);
                setIsLoading(false);
            }
        }

        initAuth();

        // Proactively refresh the token every 12 minutes (since it expires in 15m)
        const interval = setInterval(async () => {
            if (getAccessToken()) {
                await refreshToken();
            }
        }, 12 * 60 * 1000);

        // Also refresh when the user comes back to a tab that was sleeping
        // (the interval may have been paused by the browser when in background)
        const handleVisibilityChange = async () => {
            if (document.visibilityState === "visible" && getAccessToken()) {
                const payload = decodeJwtPayload(getAccessToken()!);
                const now = Math.floor(Date.now() / 1000);
                // If token expires within 2 minutes, refresh it now
                if (payload?.exp && payload.exp - now < 120) {
                    await refreshToken();
                }
            }
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            clearInterval(interval);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, []);

    const login = useCallback(async (identifier: string, password: string) => {
        // Request notification permission synchronously on click to avoid browser gesture timeout
        if (typeof window !== "undefined" && "Notification" in window) {
            if (Notification.permission === "default") {
                Notification.requestPermission().catch(console.warn);
            }
        }

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
            // Register for Web Push notifications after login
            registerPush();
            return { success: true };
        }

        return { success: false, error: "Unexpected response" };
    }, []);

    const verifyMfa = useCallback(async (code: string) => {
        // Request notification permission synchronously on click
        if (typeof window !== "undefined" && "Notification" in window) {
            if (Notification.permission === "default") {
                Notification.requestPermission().catch(console.warn);
            }
        }

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
            // Register for Web Push notifications after MFA
            registerPush();
            return { success: true };
        }

        return { success: false, error: "Verification failed" };
    }, []);

    const logout = useCallback(() => {
        setAccessToken(null);
        localStorage.removeItem("nexus-refresh-token");
        sessionStorage.removeItem("nexus-mfa-token");
        unregisterPush(); // Remove push subscription on logout
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
