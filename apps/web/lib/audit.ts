// Vibe Tech Labs — Audit Event Logger
// Immutable event log with SHA-256 hash chain integrity
// When Redis/BullMQ unavailable, writes directly to DB

import { prisma } from "@vibetech/db";
import { createHash } from "crypto";

let lastHash: string | null = null;
let hashInitialized = false;

// ─── Hash Chain ─────────────────────────────────────────

async function getLastHash(): Promise<string | null> {
    if (!hashInitialized) {
        try {
            const lastEvent = await prisma.auditEvent.findFirst({
                orderBy: { timestamp: "desc" },
                select: { hashChain: true },
            });
            lastHash = lastEvent?.hashChain ?? null;
        } catch {
            lastHash = null;
        }
        hashInitialized = true;
    }
    return lastHash;
}

function computeHashChain(eventJson: string, previousHash: string | null): string {
    const input = `${previousHash || "GENESIS"}:${eventJson}`;
    return createHash("sha256").update(input).digest("hex");
}

// ─── Log Audit Event ────────────────────────────────────

export interface AuditInput {
    actorId: string;
    actorRole: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    beforeState?: Record<string, unknown>;
    afterState?: Record<string, unknown>;
    ipAddress?: string;
    deviceId?: string;
    geoLocation?: { lat: number; lng: number };
    riskScore?: number;
    metadata?: Record<string, unknown>;
}

export async function logAuditEvent(input: AuditInput): Promise<void> {
    try {
        const eventJson = JSON.stringify(input);
        const previousHash = await getLastHash();
        const hashChain = computeHashChain(eventJson, previousHash);
        lastHash = hashChain;

        // Write directly to DB (no queue dependency)
        await prisma.auditEvent.create({
            data: {
                actorId: input.actorId,
                actorRole: input.actorRole,
                action: input.action,
                resourceType: input.resourceType,
                resourceId: input.resourceId ?? null,
                beforeState: input.beforeState ? JSON.parse(JSON.stringify(input.beforeState)) : undefined,
                afterState: input.afterState ? JSON.parse(JSON.stringify(input.afterState)) : undefined,
                ipAddress: input.ipAddress ?? null,
                deviceId: input.deviceId ?? null,
                geoLocation: input.geoLocation ? JSON.parse(JSON.stringify(input.geoLocation)) : undefined,
                riskScore: input.riskScore ?? null,
                hashChain,
                metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
            },
        });
    } catch (err) {
        // Never let audit logging break the main flow
        console.error("[Audit] Failed to log event:", (err as Error).message);
    }
}
