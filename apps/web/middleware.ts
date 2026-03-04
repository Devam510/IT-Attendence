// NEXUS — Next.js Middleware
// Global security headers, CORS, and request context

import { NextRequest, NextResponse } from "next/server";
import { applySecurityHeaders, handleCorsPreFlight } from "./lib/security-headers";

export function middleware(request: NextRequest) {
    // Handle CORS preflight
    const preflightResponse = handleCorsPreFlight(request);
    if (preflightResponse) return preflightResponse;

    // Create response and apply security headers
    const response = NextResponse.next();
    return applySecurityHeaders(request, response);
}

// Apply to all API routes
export const config = {
    matcher: ["/api/:path*"],
};
