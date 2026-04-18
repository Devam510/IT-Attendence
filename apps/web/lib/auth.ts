// Vibe Tech Labs — JWT Auth Middleware
// Extracts and verifies JWT, attaches user context to request

import { NextRequest, NextResponse } from "next/server";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { JwtPayload, ApiResponse } from "@vibetech/shared";

// H2/M2 fix: use SEPARATE secrets for access and refresh tokens.
// An access token cannot be presented as a refresh token because they are
// signed with different keys — not just the `type` claim check.
const ACCESS_SECRET = new TextEncoder().encode(
    process.env.JWT_SECRET || "MISSING_ACCESS_SECRET_SET_IN_ENV"
);

const REFRESH_SECRET = new TextEncoder().encode(
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || "MISSING_REFRESH_SECRET_SET_IN_ENV"
);

// ─── Token Generation ───────────────────────────────────

export async function generateAccessToken(payload: Omit<JwtPayload, "iat" | "exp">): Promise<string> {
    return new SignJWT({ ...payload } as unknown as JWTPayload)
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(payload.sub)
        .setIssuedAt()
        .setExpirationTime(process.env.JWT_ACCESS_EXPIRY || "15m")
        .sign(ACCESS_SECRET);
}

export async function generateRefreshToken(payload: Omit<JwtPayload, "iat" | "exp">): Promise<string> {
    return new SignJWT({ ...payload, type: "refresh" } as unknown as JWTPayload)
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(payload.sub)
        .setIssuedAt()
        .setExpirationTime(process.env.JWT_REFRESH_EXPIRY || "7d")
        .sign(REFRESH_SECRET); // signed with REFRESH_SECRET, not ACCESS_SECRET
}

// ─── Token Verification ────────────────────────────────

export async function verifyToken(token: string): Promise<JwtPayload | null> {
    try {
        const { payload } = await jwtVerify(token, ACCESS_SECRET);
        return payload as unknown as JwtPayload;
    } catch {
        return null;
    }
}

// Separate verifier for refresh tokens (uses REFRESH_SECRET)
export async function verifyRefreshToken(token: string): Promise<JwtPayload | null> {
    try {
        const { payload } = await jwtVerify(token, REFRESH_SECRET);
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

        let parsedParams: Record<string, string> | undefined = undefined;
        if (ctx && typeof ctx === "object" && "params" in ctx) {
            const rawParams = (ctx as any).params;
            parsedParams = rawParams instanceof Promise ? await rawParams : rawParams;
        }

        return handler(req, { auth, params: parsedParams });
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
