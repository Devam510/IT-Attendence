// NEXUS — JWT Auth Middleware
// Extracts and verifies JWT, attaches user context to request

import { NextRequest, NextResponse } from "next/server";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { JwtPayload, ApiResponse } from "@nexus/shared";

const JWT_SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || "change-me-to-a-64-char-random-string"
);

// ─── Token Generation ───────────────────────────────────

export async function generateAccessToken(payload: Omit<JwtPayload, "iat" | "exp">): Promise<string> {
    return new SignJWT({ ...payload } as unknown as JWTPayload)
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(payload.sub)
        .setIssuedAt()
        .setExpirationTime(process.env.JWT_ACCESS_EXPIRY || "15m")
        .sign(JWT_SECRET);
}

export async function generateRefreshToken(payload: Omit<JwtPayload, "iat" | "exp">): Promise<string> {
    return new SignJWT({ ...payload, type: "refresh" } as unknown as JWTPayload)
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(payload.sub)
        .setIssuedAt()
        .setExpirationTime(process.env.JWT_REFRESH_EXPIRY || "7d")
        .sign(JWT_SECRET);
}

// ─── Token Verification ────────────────────────────────

export async function verifyToken(token: string): Promise<JwtPayload | null> {
    try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        return payload as unknown as JwtPayload;
    } catch {
        return null;
    }
}

// ─── Auth Context Extraction ────────────────────────────

export async function getAuthContext(
    req: NextRequest
): Promise<JwtPayload | null> {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;

    const token = authHeader.slice(7);
    return verifyToken(token);
}

// ─── Middleware Wrapper ─────────────────────────────────

type RouteHandler = (
    req: NextRequest,
    context: { auth: JwtPayload; params?: Record<string, string> }
) => Promise<NextResponse>;

export function withAuth(handler: RouteHandler): (req: NextRequest, ctx?: unknown) => Promise<NextResponse> {
    return async (req: NextRequest, ctx?: unknown) => {
        const auth = await getAuthContext(req);
        if (!auth) {
            return NextResponse.json(
                { success: false, error: { code: "UNAUTHORIZED", message: "Invalid or expired token" } } satisfies ApiResponse,
                { status: 401 }
            );
        }

        const params = ctx && typeof ctx === "object" && "params" in ctx
            ? (ctx as { params: Record<string, string> }).params
            : undefined;

        return handler(req, { auth, params });
    };
}

// ─── Role Guard ─────────────────────────────────────────

export function withRole(...allowedRoles: string[]) {
    return function (handler: RouteHandler): (req: NextRequest, ctx?: unknown) => Promise<NextResponse> {
        return withAuth(async (req, context) => {
            if (!allowedRoles.includes(context.auth.role)) {
                return NextResponse.json(
                    { success: false, error: { code: "FORBIDDEN", message: "Insufficient permissions" } } satisfies ApiResponse,
                    { status: 403 }
                );
            }
            return handler(req, context);
        });
    };
}
