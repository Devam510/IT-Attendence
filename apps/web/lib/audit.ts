// NEXUS — Audit Event Logger
// Immutable event log with SHA-256 hash chain integrity

import { prisma } from "@nexus/db";
import { publishAuditEvent, type NexusEvent } from "./queue";
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
    const eventJson = JSON.stringify(input);
    const previousHash = await getLastHash();
    const hashChain = computeHashChain(eventJson, previousHash);
    lastHash = hashChain;

    const event: NexusEvent = {
        type: `audit.${input.action}`,
        actorId: input.actorId,
        actorRole: input.actorRole,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        data: { ...input, hashChain },
        timestamp: new Date().toISOString(),
    };

    await publishAuditEvent(event);
}

// ─── Direct Write (for audit consumer) ──────────────────

export async function writeAuditEvent(input: AuditInput & { hashChain: string }): Promise<void> {
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
            hashChain: input.hashChain,
            metadata: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
        },
    });
}
