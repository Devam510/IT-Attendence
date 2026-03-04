"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setAccessToken, getAccessToken } from "@/lib/api-client";

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
    login: (email: string, password: string) => Promise<{ success: boolean; mfaRequired?: boolean; error?: string }>;
    verifyMfa: (code: string) => Promise<{ success: boolean; error?: string }>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Check session on mount
    useEffect(() => {
        const token = getAccessToken();
        if (token) {
            api<{ user: User }>("/api/auth/session")
                .then(res => {
                    if (res.data?.user) {
                        setUser(res.data.user);
                    } else {
                        setAccessToken(null);
                    }
                })
                .finally(() => setIsLoading(false));
        } else {
            setIsLoading(false);
        }
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        const res = await api<{
            accessToken?: string;
            refreshToken?: string;
            user?: User;
            mfaRequired?: boolean;
            tempToken?: string;
        }>("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
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
