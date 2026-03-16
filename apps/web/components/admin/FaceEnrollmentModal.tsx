"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Webcam from "react-webcam";
import { apiPost } from "@/lib/api-client";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
    userName: string;
    onEnrollmentSuccess?: () => void;
}

type Phase = "idle" | "loading_models" | "scanning" | "processing" | "success" | "error";

function loadFaceApi() {
    return import("@vladmandic/face-api");
}

export function FaceEnrollmentModal({ isOpen, onClose, userId, userName, onEnrollmentSuccess }: Props) {
    const webcamRef = useRef<Webcam>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const descriptorsRef = useRef<Float32Array[]>([]);

    const [phase, setPhase] = useState<Phase>("idle");
    const [progress, setProgress] = useState(0);
    const [statusMsg, setStatusMsg] = useState("Initializing…");
    const [errorMsg, setErrorMsg] = useState("");
    const [isCameraReady, setIsCameraReady] = useState(false);

    const TOTAL_FRAMES = 10;

    // ── Cleanup ──────────────────────────────────────────────
    const cleanup = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    const handleClose = useCallback(() => {
        cleanup();
        setPhase("idle");
        setProgress(0);
        setStatusMsg("Initializing…");
        setErrorMsg("");
        setIsCameraReady(false);
        descriptorsRef.current = [];
        onClose();
    }, [cleanup, onClose]);

    // ── Load Models ──────────────────────────────────────────
    const startScanning = useCallback(async () => {
        setPhase("loading_models");
        setStatusMsg("Loading AI models…");

        try {
            const faceapi = await loadFaceApi();
            const MODEL_URL = "/models";
            await Promise.all([
                faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
            ]);

            setPhase("scanning");
            setStatusMsg("Position your face inside the circle…");
            descriptorsRef.current = [];

            // ── Scan Loop (runs every 300ms) ─────────────────
            intervalRef.current = setInterval(async () => {
                const video = webcamRef.current?.video;
                if (!video || video.readyState !== 4) return;

                const detection = await faceapi.detectSingleFace(
                    video,
                    new faceapi.SsdMobilenetv1Options({ minConfidence: 0.80 })
                ).withFaceLandmarks().withFaceDescriptor();

                if (!detection) {
                    setStatusMsg("No face detected — keep your face in the frame…");
                    return;
                }

                const score = detection.detection.score;
                if (score < 0.85) {
                    setStatusMsg(`Low confidence (${Math.round(score * 100)}%) — hold still…`);
                    return;
                }

                descriptorsRef.current.push(detection.descriptor);
                const count = descriptorsRef.current.length;
                const pct = Math.round((count / TOTAL_FRAMES) * 100);
                setProgress(pct);

                const hints = [
                    "Look straight at the camera…",
                    "Look slightly left…",
                    "Look slightly right…",
                    "Tilt head slightly up…",
                    "Tilt head slightly down…",
                    "Smile naturally…",
                    "Keep neutral expression…",
                    "Move a little closer…",
                    "Hold still — almost done…",
                    "Perfect! Finalizing…",
                ];
                setStatusMsg(hints[Math.min(count - 1, hints.length - 1)] ?? "Capturing…");

                if (count >= TOTAL_FRAMES) {
                    cleanup();
                    setPhase("processing");
                    setStatusMsg("Building your face profile…");

                    // Average all descriptors
                    const averaged = averageDescriptors(descriptorsRef.current);

                    const res = await apiPost<{ profileId: string }>("/api/face/enroll", {
                        userId,
                        descriptor: Array.from(averaged),
                    });

                    if (res.data) {
                        setPhase("success");
                        setStatusMsg("Face registered successfully!");
                        onEnrollmentSuccess?.();
                    } else {
                        setPhase("error");
                        setErrorMsg(res.error || "Failed to save face profile.");
                    }
                }
            }, 300);

        } catch (e: any) {
            setPhase("error");
            setErrorMsg(e.message || "Could not load AI models.");
        }
    }, [userId, cleanup, onEnrollmentSuccess]);

    // Start scanning once camera is ready
    useEffect(() => {
        if (isCameraReady && phase === "idle") {
            startScanning();
        }
    }, [isCameraReady, phase, startScanning]);

    useEffect(() => {
        if (!isOpen) cleanup();
    }, [isOpen, cleanup]);

    if (!isOpen) return null;

    // ── Progress ring math ────────────────────────────────────
    const radius = 110;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    const ringColor =
        progress < 40 ? "#ef4444" :
        progress < 75 ? "#f59e0b" :
        "#22c55e";

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 999999,
            background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
            <div style={{
                background: "#0f172a", borderRadius: 24, padding: "36px 32px",
                maxWidth: 440, width: "100%", boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
                textAlign: "center", color: "white",
            }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
                    {phase === "success" ? "✅ Face Registered!" : "Register Face"}
                </h2>
                <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 28 }}>
                    {userName}
                </p>

                {/* Camera + SVG Ring overlay */}
                <div style={{ position: "relative", width: 260, height: 260, marginBottom: 32, marginLeft: "auto", marginRight: "auto", flexShrink: 0 }}>
                    {/* SVG progress ring — fills the entire 260x260 container */}
                    <svg width={260} height={260} style={{ position: "absolute", top: 0, left: 0, zIndex: 2, transform: "rotate(-90deg)" }}>
                        {/* track */}
                        <circle cx={130} cy={130} r={radius} fill="none" stroke="#1e293b" strokeWidth={8} />
                        {/* progress */}
                        <circle
                            cx={130} cy={130} r={radius}
                            fill="none"
                            stroke={ringColor}
                            strokeWidth={8}
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={strokeDashoffset}
                            style={{ transition: "stroke-dashoffset 0.3s ease, stroke 0.3s ease" }}
                        />
                    </svg>

                    {/* Circular webcam — centered inside the 260x260 container */}
                    <div style={{
                        position: "absolute",
                        top: "50%", left: "50%",
                        transform: "translate(-50%, -50%)",
                        width: 224, height: 224,
                        borderRadius: "50%",
                        overflow: "hidden",
                        background: "#0f172a",
                        zIndex: 1,
                    }}>
                        {phase !== "success" && phase !== "error" && (
                            <Webcam
                                ref={webcamRef}
                                audio={false}
                                mirrored={true}
                                onUserMedia={() => setIsCameraReady(true)}
                                onUserMediaError={() => {
                                    setPhase("error");
                                    setErrorMsg("Camera access denied. Please allow camera permissions.");
                                }}
                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                        )}
                        {phase === "success" && (
                            <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #064e3b, #166534)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64 }}>
                                ✅
                            </div>
                        )}
                        {phase === "error" && (
                            <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg, #7f1d1d, #991b1b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 64 }}>
                                ❌
                            </div>
                        )}
                    </div>

                    {/* Percentage badge — centered at the bottom of the ring */}
                    {phase === "scanning" && (
                        <div style={{
                            position: "absolute", bottom: -8, left: "50%", transform: "translateX(-50%)",
                            background: "#0f172a", border: `2px solid ${ringColor}`,
                            borderRadius: 20, padding: "4px 12px",
                            fontSize: 13, fontWeight: 700, color: ringColor, zIndex: 3,
                            whiteSpace: "nowrap",
                        }}>
                            {progress}%
                        </div>
                    )}
                </div>

                {/* Status text */}
                {phase === "loading_models" && (
                    <div style={{ color: "#94a3b8", fontSize: 14, marginBottom: 24 }}>
                        <div className="spinner" style={{ width: 20, height: 20, border: "2px solid #334155", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 10px" }} />
                        Loading AI models…
                    </div>
                )}

                {phase === "scanning" && (
                    <>
                        <p style={{ color: "#e2e8f0", fontSize: 14, marginBottom: 8, minHeight: 20 }}>{statusMsg}</p>
                        <div style={{ background: "#1e293b", borderRadius: 8, height: 6, overflow: "hidden", marginBottom: 24 }}>
                            <div style={{ width: `${progress}%`, height: "100%", background: `linear-gradient(90deg, #3b82f6, ${ringColor})`, transition: "width 0.3s ease, background 0.3s ease" }} />
                        </div>
                    </>
                )}

                {phase === "processing" && (
                    <p style={{ color: "#94a3b8", fontSize: 14, marginBottom: 24 }}>Saving your secure face profile…</p>
                )}

                {phase === "success" && (
                    <p style={{ color: "#4ade80", fontSize: 15, fontWeight: 600, marginBottom: 24 }}>Face profile created successfully!</p>
                )}

                {phase === "error" && (
                    <p style={{ color: "#f87171", fontSize: 14, marginBottom: 24 }}>{errorMsg}</p>
                )}

                {/* Buttons */}
                <div style={{ display: "flex", gap: 12 }}>
                    <button
                        onClick={handleClose}
                        style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "1px solid #334155", background: "transparent", color: "#94a3b8", fontWeight: 600, cursor: "pointer", fontSize: 14 }}
                    >
                        {phase === "success" ? "Close" : "Cancel"}
                    </button>
                    {phase === "error" && (
                        <button
                            onClick={() => { setPhase("idle"); setProgress(0); descriptorsRef.current = []; setIsCameraReady(false); }}
                            style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "none", background: "#3b82f6", color: "white", fontWeight: 600, cursor: "pointer", fontSize: 14 }}
                        >
                            Try Again
                        </button>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}

// ── Utility: Average multiple face descriptors ─────────────────────────
function averageDescriptors(descriptors: Float32Array[]): Float32Array {
    const first = descriptors[0];
    if (!first) return new Float32Array(128);
    const len = first.length;
    const avg = new Float32Array(len);
    for (let i = 0; i < len; i++) {
        avg[i] = descriptors.reduce((sum, d) => sum + (d[i] ?? 0), 0) / descriptors.length;
    }
    return avg;
}
