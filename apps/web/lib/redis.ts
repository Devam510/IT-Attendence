// NEXUS — Redis Client
// Used for: session store, rate limiting, QR nonces, caching

import { createClient, type RedisClientType } from "redis";

let redisClient: RedisClientType | null = null;

export async function getRedis(): Promise<RedisClientType> {
    if (redisClient && redisClient.isOpen) {
        return redisClient;
    }

    redisClient = createClient({
        url: process.env.REDIS_URL || "redis://localhost:6379",
    });

    redisClient.on("error", (err) => {
        console.error("[Redis] Connection error:", err);
    });

    redisClient.on("connect", () => {
        console.log("[Redis] Connected");
    });

    await redisClient.connect();
    return redisClient;
}

// ─── Session Helpers ────────────────────────────────────

export async function setSession(
    userId: string,
    deviceId: string,
    data: Record<string, unknown>,
    ttlSeconds: number = 7 * 24 * 60 * 60 // 7 days
): Promise<void> {
    const redis = await getRedis();
    const key = `session:${userId}:${deviceId}`;
    await redis.set(key, JSON.stringify(data), { EX: ttlSeconds });
}

export async function getSession(
    userId: string,
    deviceId: string
): Promise<Record<string, unknown> | null> {
    const redis = await getRedis();
    const key = `session:${userId}:${deviceId}`;
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
}

export async function deleteSession(
    userId: string,
    deviceId: string
): Promise<void> {
    const redis = await getRedis();
    await redis.del(`session:${userId}:${deviceId}`);
}

// ─── Rate Limiting ──────────────────────────────────────

export async function checkRateLimit(
    key: string,
    maxRequests: number,
    windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const redis = await getRedis();
    const now = Math.floor(Date.now() / 1000);
    const windowKey = `rl:${key}:${Math.floor(now / windowSeconds)}`;

    const current = await redis.incr(windowKey);
    if (current === 1) {
        await redis.expire(windowKey, windowSeconds);
    }

    const remaining = Math.max(0, maxRequests - current);
    const resetAt = (Math.floor(now / windowSeconds) + 1) * windowSeconds;

    return {
        allowed: current <= maxRequests,
        remaining,
        resetAt,
    };
}

// ─── QR Nonce (Replay Protection) ───────────────────────

export async function storeQrNonce(nonce: string, ttlSeconds: number = 60): Promise<void> {
    const redis = await getRedis();
    await redis.set(`qr:nonce:${nonce}`, "1", { EX: ttlSeconds, NX: true });
}

export async function isQrNonceUsed(nonce: string): Promise<boolean> {
    const redis = await getRedis();
    const exists = await redis.exists(`qr:nonce:${nonce}`);
    return exists === 1;
}
