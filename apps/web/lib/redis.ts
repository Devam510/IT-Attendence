// Vibe Tech Labs — Redis Client
// Used for: session store, rate limiting, QR nonces, caching
// Gracefully degrades when Redis is unavailable (e.g. Vercel)

import { createClient, type RedisClientType } from "redis";

let redisClient: RedisClientType | null = null;
let redisAvailable = true;

export async function getRedis(): Promise<RedisClientType | null> {
    if (!redisAvailable) return null;

    if (redisClient && redisClient.isOpen) {
        return redisClient;
    }

    try {
        redisClient = createClient({
            url: process.env.REDIS_URL || "redis://localhost:6379",
            // Add socket level timeouts
            socket: {
                connectTimeout: 5000,
                keepAlive: 5000,
            }
        });

        redisClient.on("error", (err) => {
            console.error("[Redis] Connection error:", err.message);
            redisAvailable = false;
        });

        // Enforce a strict connection timeout (2 seconds) to avoid hanging the entire request
        await Promise.race([
            redisClient.connect(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Redis connection timeout")), 2000))
        ]);

        console.log("[Redis] Connected");
        return redisClient;
    } catch (err) {
        console.warn("[Redis] Not available — running without Redis:", err instanceof Error ? err.message : String(err));
        redisAvailable = false;
        if (redisClient) {
            redisClient.disconnect().catch(() => {});
            redisClient = null;
        }
        return null;
    }
}

// ─── Session Helpers ────────────────────────────────────

export async function setSession(
    userId: string,
    deviceId: string,
    data: Record<string, unknown>,
    ttlSeconds: number = 7 * 24 * 60 * 60 // 7 days
): Promise<void> {
    const redis = await getRedis();
    if (!redis) return; // Skip if Redis unavailable
    const key = `session:${userId}:${deviceId}`;
    await redis.set(key, JSON.stringify(data), { EX: ttlSeconds });
}

export async function getSession(
    userId: string,
    deviceId: string
): Promise<Record<string, unknown> | null> {
    const redis = await getRedis();
    if (!redis) return null;
    const key = `session:${userId}:${deviceId}`;
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
}

export async function deleteSession(
    userId: string,
    deviceId: string
): Promise<void> {
    const redis = await getRedis();
    if (!redis) return;
    await redis.del(`session:${userId}:${deviceId}`);
}

// ─── Rate Limiting ──────────────────────────────────────

export async function checkRateLimit(
    key: string,
    maxRequests: number,
    windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const redis = await getRedis();
    if (!redis) {
        // No Redis = no rate limiting, always allow
        return { allowed: true, remaining: maxRequests, resetAt: 0 };
    }

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
    if (!redis) return;
    await redis.set(`qr:nonce:${nonce}`, "1", { EX: ttlSeconds, NX: true });
}

export async function isQrNonceUsed(nonce: string): Promise<boolean> {
    const redis = await getRedis();
    if (!redis) return false;
    const exists = await redis.exists(`qr:nonce:${nonce}`);
    return exists === 1;
}
