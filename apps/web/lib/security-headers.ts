// Vibe Tech Labs — Security Headers Middleware
// CORS, CSP, HSTS, and security headers for Next.js

import { NextRequest, NextResponse } from "next/server";

// ─── Security Headers ───────────────────────────────────

const SECURITY_HEADERS: Record<string, string> = {
    // HSTS — enforce HTTPS for 1 year, include subdomains, preload
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",

    // Prevent MIME sniffing
    "X-Content-Type-Options": "nosniff",

    // Prevent clickjacking
    "X-Frame-Options": "DENY",

    // XSS protection (legacy browsers)
    "X-XSS-Protection": "1; mode=block",

    // Referrer policy — send origin only on cross-origin
    "Referrer-Policy": "strict-origin-when-cross-origin",

    // Permissions policy — disable unnecessary browser features
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(self), payment=(), usb=()",

    // Content Security Policy
    "Content-Security-Policy": [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' https://fonts.gstatic.com",
        "connect-src 'self' https:",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ].join("; "),

    // Prevent DNS prefetch leaks
    "X-DNS-Prefetch-Control": "off",

    // Certificate Transparency
    "Expect-CT": "max-age=86400, enforce",
};

// ─── CORS Configuration ─────────────────────────────────

const ALLOWED_ORIGINS: Set<string> = new Set([
    "http://localhost:3000",
    "http://localhost:3001",
    process.env["NEXT_PUBLIC_APP_URL"] || "",
    process.env["CORS_ORIGIN"] || "",
].filter(Boolean));

const ALLOWED_METHODS = "GET, POST, PUT, PATCH, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Authorization, X-Request-ID, X-Device-ID";
const EXPOSED_HEADERS = "X-Request-ID, X-RateLimit-Remaining";
const MAX_AGE = "86400"; // 24 hours preflight cache

function getCorsHeaders(origin: string | null): Record<string, string> {
    const headers: Record<string, string> = {};

    if (origin && ALLOWED_ORIGINS.has(origin)) {
        headers["Access-Control-Allow-Origin"] = origin;
        headers["Access-Control-Allow-Methods"] = ALLOWED_METHODS;
        headers["Access-Control-Allow-Headers"] = ALLOWED_HEADERS;
        headers["Access-Control-Expose-Headers"] = EXPOSED_HEADERS;
        headers["Access-Control-Max-Age"] = MAX_AGE;
        headers["Access-Control-Allow-Credentials"] = "true";
        headers["Vary"] = "Origin";
    }

    return headers;
}

// ─── Apply Security Headers ─────────────────────────────

export function applySecurityHeaders(
    request: NextRequest,
    response: NextResponse
): NextResponse {
    // Security headers
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
        response.headers.set(key, value);
    }

    // CORS headers
    const origin = request.headers.get("Origin");
    const corsHeaders = getCorsHeaders(origin);
    for (const [key, value] of Object.entries(corsHeaders)) {
        response.headers.set(key, value);
    }

    // Request ID for tracing
    const requestId = request.headers.get("X-Request-ID") || crypto.randomUUID();
    response.headers.set("X-Request-ID", requestId);

    return response;
}

// ─── CORS Preflight Handler ─────────────────────────────

export function handleCorsPreFlight(request: NextRequest): NextResponse | null {
    if (request.method !== "OPTIONS") return null;

    const origin = request.headers.get("Origin");
    const corsHeaders = getCorsHeaders(origin);

    if (Object.keys(corsHeaders).length === 0) {
        return new NextResponse(null, { status: 403 });
    }

    return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// ─── Rate Limit Headers ─────────────────────────────────

export function addRateLimitHeaders(
    response: NextResponse,
    remaining: number,
    limit: number,
    resetAt: Date
): NextResponse {
    response.headers.set("X-RateLimit-Limit", limit.toString());
    response.headers.set("X-RateLimit-Remaining", Math.max(0, remaining).toString());
    response.headers.set("X-RateLimit-Reset", Math.ceil(resetAt.getTime() / 1000).toString());
    return response;
}
