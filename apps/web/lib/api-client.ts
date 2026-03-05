// Vibe Tech Labs — API Client
// Fetch wrapper with auto-auth, error handling, and token refresh

const BASE_URL = typeof window !== "undefined" ? "" : (process.env.NEXT_PUBLIC_APP_URL || "");

interface ApiResponse<T = unknown> {
    data?: T;
    error?: string;
    code?: string;
}

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
    accessToken = token;
    if (token) {
        localStorage.setItem("nexus-token", token);
    } else {
        localStorage.removeItem("nexus-token");
    }
}

export function getAccessToken(): string | null {
    if (accessToken) return accessToken;
    if (typeof window !== "undefined") {
        accessToken = localStorage.getItem("nexus-token");
    }
    return accessToken;
}

async function refreshToken(): Promise<boolean> {
    const refresh = localStorage.getItem("nexus-refresh-token");
    if (!refresh) return false;

    try {
        const res = await fetch(`${BASE_URL}/api/auth/token/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refreshToken: refresh }),
        });

        if (res.ok) {
            const data = await res.json();
            if (data.data?.accessToken) {
                setAccessToken(data.data.accessToken);
                if (data.data.refreshToken) {
                    localStorage.setItem("nexus-refresh-token", data.data.refreshToken);
                }
                return true;
            }
        }
    } catch {
        // refresh failed
    }
    return false;
}

export async function api<T = unknown>(
    path: string,
    options: RequestInit = {}
): Promise<ApiResponse<T>> {
    const token = getAccessToken();
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string> || {}),
    };

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    try {
        let res = await fetch(`${BASE_URL}${path}`, {
            ...options,
            headers,
        });

        // If 401, try refresh and retry once — but NOT for auth endpoints
        const isAuthEndpoint = path.includes("/api/auth/login") || path.includes("/api/auth/token");
        if (res.status === 401 && token && !isAuthEndpoint) {
            const refreshed = await refreshToken();
            if (refreshed) {
                headers["Authorization"] = `Bearer ${getAccessToken()}`;
                res = await fetch(`${BASE_URL}${path}`, {
                    ...options,
                    headers,
                });
            } else {
                // Clear tokens and redirect to login
                setAccessToken(null);
                localStorage.removeItem("nexus-refresh-token");
                if (typeof window !== "undefined" && !path.includes("/api/auth/")) {
                    window.location.href = "/login";
                }
                return { error: "Session expired", code: "UNAUTHORIZED" };
            }
        }

        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
            // 403 = Forbidden (role-based) — return error to caller, never redirect
            // 401 = handled above with token refresh
            return {
                error: json.error?.message || json.message || `Request failed (${res.status})`,
                code: json.error?.code || (res.status === 403 ? "FORBIDDEN" : res.status === 401 ? "UNAUTHORIZED" : "UNKNOWN"),
            };
        }

        return { data: json.data ?? json };
    } catch (err) {
        return { error: String(err), code: "NETWORK_ERROR" };
    }
}

// Convenience methods
export const apiGet = <T = unknown>(path: string) => api<T>(path, { method: "GET" });
export const apiPost = <T = unknown>(path: string, body?: unknown) =>
    api<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
export const apiPatch = <T = unknown>(path: string, body?: unknown) =>
    api<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined });
