// Vibe Tech Labs — API Error Handler & Response Helpers

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import type { ApiResponse } from "@nexus/shared";
import pino from "pino";

// ─── Logger ─────────────────────────────────────────────

export const logger = pino({
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    transport:
        process.env.NODE_ENV === "development"
            ? { target: "pino-pretty", options: { colorize: true } }
            : undefined,
});

// ─── Response Helpers ───────────────────────────────────

export function success<T>(data: T, status: number = 200): NextResponse {
    return NextResponse.json({ success: true, data } satisfies ApiResponse<T>, { status });
}

export function paginated<T>(data: T, meta: { page: number; limit: number; total: number }): NextResponse {
    return NextResponse.json({ success: true, data, meta } satisfies ApiResponse<T>);
}

export function error(
    code: string,
    message: string,
    status: number = 400,
    details?: unknown
): NextResponse {
    return NextResponse.json(
        { success: false, error: { code, message, details } } satisfies ApiResponse,
        { status }
    );
}

// ─── Error Wrapper ──────────────────────────────────────

type AsyncHandler = (req: NextRequest, ctx?: unknown) => Promise<NextResponse>;

export function withErrorHandler(handler: AsyncHandler): AsyncHandler {
    return async (req, ctx) => {
        try {
            return await handler(req, ctx);
        } catch (err) {
            if (err instanceof ZodError) {
                logger.warn({ zodErrors: err.errors }, "Validation error");
                return error("VALIDATION_ERROR", "Invalid request data", 422, err.errors);
            }

            logger.error({ err }, "Unhandled API error");
            return error("INTERNAL_ERROR", "An unexpected error occurred", 500);
        }
    };
}
