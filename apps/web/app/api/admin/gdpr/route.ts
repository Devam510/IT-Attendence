// Vibe Tech Labs — POST /api/admin/gdpr/erase
// Execute GDPR right-to-erasure for a user

import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/auth";
import { executeGdprErasure, exportUserData } from "@/lib/gdpr";
import { logAuditEvent } from "@/lib/audit";
import { success, error } from "@/lib/errors";
import type { JwtPayload } from "@vibetech/shared";

async function handleGdprErase(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const { auth } = context;

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch {
        return error("INVALID_JSON", "Request body must be valid JSON", 400);
    }

    const userId = body["userId"] as string;
    if (!userId || typeof userId !== "string") {
        return error("MISSING_USER_ID", "userId is required", 400);
    }

    const retainAuditTrail = body["retainAuditTrail"] !== false; // Default: true

    // Execute erasure
    const result = await executeGdprErasure(userId, retainAuditTrail);

    // Audit this critical action
    await logAuditEvent({
        actorId: auth.sub,
        actorRole: auth.role,
        action: "gdpr.erasure",
        resourceType: "user",
        resourceId: userId,
        riskScore: 0,
        metadata: {
            itemsErased: result.itemsErased,
            retainAuditTrail,
        },
    });

    return success(result);
}

// GET — Export user data (GDPR Article 20)
async function handleGdprExport(
    req: NextRequest,
    context: { auth: JwtPayload }
): Promise<NextResponse> {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
        return error("MISSING_USER_ID", "userId query parameter required", 400);
    }

    const data = await exportUserData(userId);

    // Audit
    await logAuditEvent({
        actorId: context.auth.sub,
        actorRole: context.auth.role,
        action: "gdpr.export",
        resourceType: "user",
        resourceId: userId,
    });

    return success(data);
}

export const POST = withRole("SADM")(handleGdprErase);
export const GET = withRole("SADM")(handleGdprExport);
