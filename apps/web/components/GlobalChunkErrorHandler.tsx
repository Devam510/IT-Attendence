"use client";

import { useEffect } from "react";

/**
 * GlobalChunkErrorHandler
 *
 * Next.js bundles JS into content-hashed chunks (e.g. 9ac134f1364a88f3.js).
 * When a new deployment is pushed to Vercel, old chunk hashes are gone from
 * the CDN. Any user with the OLD app open will get:
 *   "Failed to load chunk /_next/static/chunks/<hash>.js"
 *
 * This component listens for unhandled promise rejections that are
 * ChunkLoadErrors and reloads the page automatically so the user gets
 * the new version without confusion.
 *
 * Mounted once at the root layout — zero render output.
 */
export function GlobalChunkErrorHandler() {
    useEffect(() => {
        function handleUnhandledRejection(event: PromiseRejectionEvent) {
            const reason = event.reason;
            const isChunkError =
                reason?.name === "ChunkLoadError" ||
                (typeof reason?.message === "string" &&
                    reason.message.toLowerCase().includes("failed to load chunk"));

            if (!isChunkError) return;

            // Prevent the browser console from logging this as an unhandled error
            event.preventDefault();

            // Guard: only reload once — avoid infinite reload loops if the
            // new deployment is also broken. Use sessionStorage as a flag.
            const RELOAD_KEY = "nexus_chunk_reload_attempted";
            const alreadyRetried = sessionStorage.getItem(RELOAD_KEY);
            if (alreadyRetried) {
                // Already reloaded once — don't loop. Just log for debugging.
                console.warn("[Nexus] ChunkLoadError persists after reload — likely a broken deployment.");
                return;
            }

            sessionStorage.setItem(RELOAD_KEY, "1");
            // Small delay so any in-flight renders can settle
            setTimeout(() => window.location.reload(), 300);
        }

        window.addEventListener("unhandledrejection", handleUnhandledRejection);
        return () => window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    }, []);

    return null;
}
