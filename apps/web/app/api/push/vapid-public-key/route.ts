// Vibe Tech Labs — GET /api/push/vapid-public-key
// Returns the VAPID public key needed by the browser to subscribe to push.

import { NextResponse } from "next/server";

export async function GET() {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY;
    if (!key) {
        return NextResponse.json({ error: "Push not configured" }, { status: 503 });
    }
    return NextResponse.json({ key });
}
