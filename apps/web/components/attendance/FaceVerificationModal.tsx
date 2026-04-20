"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Webcam from "react-webcam";
import { apiPost } from "@/lib/api-client";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (verificationToken: string) => void;
    mode?: "checkin" | "checkout"; // controls UI labels
}

type Phase = "loading_models" | "scanning" | "verifying" | "success" | "error" | "security_alert";

function loadFaceApi() {
    return import("@vladmandic/face-api");
}

export function FaceVerificationModal({ isOpen, onClose, onSuccess, mode = "checkin" }: Props) {
    const webcamRef = useRef<Webcam>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const hasVerifiedRef = useRef(false);

    const [phase, setPhase] = useState<Phase>("loading_models");
    const [statusMsg, setStatusMsg] = useState("Loading AI…");
    const [errorMsg, setErrorMsg] = useState("");
    const [errorCode, setErrorCode] = useState("");
    const [isCameraReady, setIsCameraReady] = useState(false);
    const [alertCountdown, setAlertCountdown] = useState(10);

    const cleanup = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    const handleClose = useCallback(() => {
        cleanup();
        hasVerifiedRef.current = false;
        setPhase("loading_models");
        setStatusMsg("Loading AI…");
        setErrorMsg("");
        setErrorCode("");
        setIsCameraReady(false);
        setAlertCountdown(10);
        onClose();
    }, [cleanup, onClose]);

    const startVerification = useCallback(async () => {
        setPhase("loading_models");
        setStatusMsg("Loading AI models…");

        try {
            const faceapi = await loadFaceApi();
            const MODEL_URL = "/models";
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
            ]);

            setPhase("scanning");
            setStatusMsg("Look at the camera…");

            // Collect multiple frames and average the descriptors for stability
            const FRAMES_NEEDED = 5;
            const descriptorFrames: Float32Array[] = [];

            intervalRef.current = setInterval(async () => {
                if (hasVerifiedRef.current) return;
                const video = webcamRef.current?.video;
                if (!video || video.readyState !== 4) return;

                const detection = await faceapi.detectSingleFace(
                    video,
                    new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
                ).withFaceLandmarks().withFaceDescriptor();

                if (!detection || detection.detection.score < 0.5) {
                    setStatusMsg("Looking for your face…");
                    return;
                }

                descriptorFrames.push(detection.descriptor);
                const collected = descriptorFrames.length;
                setStatusMsg(`Hold still… (${collected}/${FRAMES_NEEDED})`);

                if (collected < FRAMES_NEEDED) return;

                // Got enough frames — average them for a stable descriptor
                hasVerifiedRef.current = true;
                cleanup();
                setPhase("verifying");
                setStatusMsg("Verifying identity…");

                // Average all collected descriptors element-wise
                const avgDescriptor = new Float32Array(128);
                for (const frame of descriptorFrames) {
                    for (let i = 0; i < 128; i++) {
                        avgDescriptor[i] = (avgDescriptor[i] ?? 0) + (frame[i] ?? 0);
                    }
                }
                for (let i = 0; i < 128; i++) {
                    avgDescriptor[i] = (avgDescriptor[i] ?? 0) / FRAMES_NEEDED;
                }

                const descriptor = Array.from(avgDescriptor);
                const res = await apiPost<{ verificationToken: string }>("/api/face/verify", { descriptor });

                if (res.data?.verificationToken) {
                    setPhase("success");
                    setStatusMsg("Identity confirmed ✅");
                    setTimeout(() => onSuccess(res.data!.verificationToken), 800);
                } else {
                    // Face did not match or profile missing — show Security Alert with real error
                    setErrorCode(res.code || "VERIFICATION_FAILED");
                    setErrorMsg(res.error || "Face verification failed.");
                    setPhase("security_alert");
                    setAlertCountdown(10);
                }
            }, 250);

        } catch (e: any) {
            // Detect Next.js ChunkLoadError — happens when a new deployment is live
            // and the browser tries to load an old asset hash that no longer exists.
            // Retrying startVerification will fail again (same missing chunk).
            // The ONLY fix is a full page reload to fetch the new chunk manifest.
            const isChunkError =
                e?.name === "ChunkLoadError" ||
                (typeof e?.message === "string" && e.message.toLowerCase().includes("failed to load chunk"));

            setPhase("error");
            if (isChunkError) {
                setErrorMsg("__CHUNK_ERROR__");
            } else {
                setErrorMsg(e.message || "Failed to start face verification.");
            }
        }

    }, [cleanup, onSuccess]);

    // Countdown auto-close for the security alert
    useEffect(() => {
        if (phase !== "security_alert") return;
        if (alertCountdown <= 0) { handleClose(); return; }
        const t = setTimeout(() => setAlertCountdown(n => n - 1), 1000);
        return () => clearTimeout(t);
    }, [phase, alertCountdown, handleClose]);

    useEffect(() => {
        if (isCameraReady && phase === "loading_models") {
            startVerification();
        }
    }, [isCameraReady, phase, startVerification]);

    useEffect(() => {
        if (!isOpen) cleanup();
    }, [isOpen, cleanup]);

    if (!isOpen) return null;

    // ── Security Alert Phase ─────────────────────────────────────────────
    if (phase === "security_alert") {
        return (
            <div style={{
                position: "fixed", inset: 0, zIndex: 999999,
                background: "rgba(0,0,0,0.92)", backdropFilter: "blur(12px)",
                display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
                animation: "fadeIn 0.2s ease",
            }}>
                <div style={{
                    background: "linear-gradient(135deg, #1a0000, #2d0000)",
                    border: "2px solid #ef4444",
                    borderRadius: 24,
                    padding: "40px 36px",
                    maxWidth: 460,
                    width: "100%",
                    textAlign: "center",
                    color: "white",
                    boxShadow: "0 0 60px rgba(239,68,68,0.4), 0 30px 80px rgba(0,0,0,0.8)",
                    animation: "slideUp 0.3s ease",
                }}>
                    {/* Warning icon with pulse */}
                    <div style={{
                        width: 80, height: 80, borderRadius: "50%",
                        background: "rgba(239,68,68,0.15)",
                        border: "2px solid #ef4444",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        margin: "0 auto 20px",
                        fontSize: 36,
                        animation: "alert-pulse 1s ease-in-out infinite",
                    }}>
                        🚨
                    </div>

                    <h2 style={{ fontSize: 22, fontWeight: 800, color: "#ef4444", marginBottom: 8, letterSpacing: 0.5 }}>
                        Unauthorized Access Attempt
                    </h2>
                    <p style={{ color: "#fca5a5", fontSize: 14, marginBottom: 6, lineHeight: 1.6 }}>
                        {errorCode === "NO_FACE_REGISTERED"
                            ? <><strong>No face profile found.</strong> Please ask HR to enroll your face first.</>  
                            : errorCode === "INVALID_DATA"
                            ? <><strong>Face profile is corrupted.</strong> Please ask HR to re-enroll your face.</>
                            : <>The face scanned does <strong>not match</strong> the registered face profile for this account.</>
                        }
                    </p>
                    <p style={{ color: "#94a3b8", fontSize: 11, marginBottom: 6, lineHeight: 1.6, fontFamily: "monospace", background: "rgba(255,255,255,0.05)", padding: "4px 8px", borderRadius: 4 }}>
                        Error: {errorCode || "VERIFICATION_FAILED"}
                    </p>
                    <p style={{ color: "#94a3b8", fontSize: 12, marginBottom: 28, lineHeight: 1.6 }}>
                        This attempt has been logged and reported to your HR administrator.
                    </p>

                    {/* Log details box */}
                    <div style={{
                        background: "rgba(239,68,68,0.08)",
                        border: "1px solid rgba(239,68,68,0.2)",
                        borderRadius: 12, padding: "12px 16px",
                        marginBottom: 28, textAlign: "left",
                    }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ color: "#94a3b8", fontSize: 12 }}>Time</span>
                            <span style={{ color: "#fca5a5", fontSize: 12, fontWeight: 600 }}>
                                {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                            </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ color: "#94a3b8", fontSize: 12 }}>Status</span>
                            <span style={{ color: "#ef4444", fontSize: 12, fontWeight: 700 }}>❌ FACE MISMATCH</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ color: "#94a3b8", fontSize: 12 }}>Action</span>
                            <span style={{ color: "#fca5a5", fontSize: 12 }}>
                                {mode === "checkout" ? "Check-out Blocked" : "Check-in Blocked"}
                            </span>
                        </div>
                    </div>

                    {/* Auto-close countdown bar */}
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 8 }}>
                            Auto-closing in <strong style={{ color: "#ef4444" }}>{alertCountdown}s</strong>
                        </div>
                        <div style={{ background: "#1e293b", borderRadius: 8, height: 4, overflow: "hidden" }}>
                            <div style={{
                                height: "100%",
                                background: "#ef4444",
                                width: `${(alertCountdown / 10) * 100}%`,
                                transition: "width 1s linear",
                                borderRadius: 8,
                            }} />
                        </div>
                    </div>

                    <div style={{ display: "flex", gap: 12 }}>
                        <button
                            onClick={handleClose}
                            style={{
                                flex: 1, padding: "12px 0", borderRadius: 10,
                                border: "1px solid rgba(239,68,68,0.4)",
                                background: "transparent", color: "#fca5a5",
                                fontWeight: 600, cursor: "pointer", fontSize: 14,
                            }}
                        >
                            Dismiss
                        </button>
                        <button
                            onClick={() => {
                                hasVerifiedRef.current = false;
                                setPhase("loading_models");
                                setStatusMsg("Loading AI…");
                                setErrorMsg("");
                                setErrorCode("");
                                setIsCameraReady(false);
                                setAlertCountdown(10);
                            }}
                            style={{
                                flex: 1, padding: "12px 0", borderRadius: 10,
                                border: "1px solid rgba(239,68,68,0.4)",
                                background: "rgba(239,68,68,0.15)",
                                color: "#fca5a5",
                                fontWeight: 600, cursor: "pointer", fontSize: 14,
                            }}
                        >
                            Try Again
                        </button>
                    </div>
                </div>

                <style>{`
                    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                    @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                    @keyframes alert-pulse {
                        0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
                        50% { box-shadow: 0 0 0 12px rgba(239,68,68,0); }
                    }
                `}</style>
            </div>
        );
    }

    // ── Normal scanning/verifying UI ─────────────────────────────────────
    const scannerColor =
        phase === "success" ? "#22c55e" :
        phase === "error" ? "#ef4444" :
        "#3b82f6";

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 99999,
            background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
            <div style={{
                background: "#0f172a", borderRadius: 24, padding: "36px 32px",
                maxWidth: 400, width: "100%", boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
                textAlign: "center", color: "white",
            }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
                    {mode === "checkout" ? "Face Check-Out" : "Face Check-In"}
                </h2>
                <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 28 }}>
                    {mode === "checkout"
                        ? "Scan your face to confirm it's really you checking out"
                        : "Look at the camera to verify your identity"}
                </p>

                {/* Camera with animated ring */}
                <div style={{ position: "relative", width: 260, height: 260, margin: "0 auto 24px" }}>
                    {/* Animated scanning ring */}
                    <div style={{
                        position: "absolute", inset: 0,
                        borderRadius: "50%",
                        border: `4px solid ${scannerColor}`,
                        zIndex: 2,
                        boxShadow: phase === "scanning" ? `0 0 24px ${scannerColor}55` : "none",
                        animation: phase === "scanning" ? "pulse-ring 1.5s ease-in-out infinite" : "none",
                        transition: "border-color 0.3s ease, box-shadow 0.3s ease",
                    }} />

                    {/* Circular webcam — centered */}
                    <div style={{
                        position: "absolute",
                        top: "50%", left: "50%",
                        transform: "translate(-50%, -50%)",
                        width: 240, height: 240,
                        borderRadius: "50%",
                        overflow: "hidden",
                        background: "#0f172a",
                        zIndex: 1,
                    }}>
                        {(phase === "loading_models" || phase === "scanning" || phase === "verifying") && (
                            <Webcam
                                ref={webcamRef}
                                audio={false}
                                mirrored={true}
                                videoConstraints={{ facingMode: "user" }}
                                onUserMedia={() => setIsCameraReady(true)}
                                onUserMediaError={() => {
                                    setPhase("error");
                                    setErrorMsg("Camera access denied. Please allow camera permissions.");
                                }}
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                        )}
                        {phase === "success" && (
                            <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #064e3b, #166534)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 72 }}>
                                ✅
                            </div>
                        )}
                        {phase === "error" && (
                            <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #7f1d1d, #991b1b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 72 }}>
                                ❌
                            </div>
                        )}
                    </div>

                    {/* Loading spinner overlay */}
                    {phase === "loading_models" && (
                        <div style={{
                            position: "absolute", inset: 0, borderRadius: "50%",
                            background: "rgba(15,23,42,0.7)", zIndex: 3,
                            display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8
                        }}>
                            <div style={{ width: 28, height: 28, border: "3px solid #334155", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                            <span style={{ color: "#94a3b8", fontSize: 11 }}>Loading AI…</span>
                        </div>
                    )}
                </div>

                {/* Status */}
                <p style={{ fontSize: 14, color: phase === "error" ? "#f87171" : phase === "success" ? "#4ade80" : "#94a3b8", marginBottom: 24, minHeight: 20 }}>
                    {phase === "error"
                        ? (errorMsg === "__CHUNK_ERROR__"
                            ? "New version deployed — your app is outdated. Refresh to continue."
                            : errorMsg)
                        : statusMsg}
                </p>

                {/* Buttons */}
                <div style={{ display: "flex", gap: 12 }}>
                    <button onClick={handleClose} style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "1px solid #334155", background: "transparent", color: "#94a3b8", fontWeight: 600, cursor: "pointer", fontSize: 14 }}>
                        Cancel
                    </button>
                    {phase === "error" && (
                        errorMsg === "__CHUNK_ERROR__" ? (
                            <button
                                onClick={() => window.location.reload()}
                                style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", background: "#3b82f6", color: "white", fontWeight: 700, cursor: "pointer", fontSize: 14 }}
                            >
                                🔄 Refresh Page
                            </button>
                        ) : (
                            <button
                                onClick={() => {
                                    hasVerifiedRef.current = false;
                                    setPhase("loading_models");
                                    setStatusMsg("Loading AI…");
                                    setErrorMsg("");
                                    setIsCameraReady(false);
                                }}
                                style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", background: "#3b82f6", color: "white", fontWeight: 600, cursor: "pointer", fontSize: 14 }}
                            >
                                Retry
                            </button>
                        )
                    )}
                </div>
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes pulse-ring {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.04); opacity: 0.75; }
                }
            `}</style>
        </div>
    );
}
