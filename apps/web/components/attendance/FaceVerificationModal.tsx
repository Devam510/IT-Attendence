"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Webcam from "react-webcam";
import { apiPost } from "@/lib/api-client";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (verificationToken: string) => void;
}

type Phase = "loading_models" | "scanning" | "verifying" | "success" | "error";

function loadFaceApi() {
    return import("@vladmandic/face-api");
}

export function FaceVerificationModal({ isOpen, onClose, onSuccess }: Props) {
    const webcamRef = useRef<Webcam>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const hasVerifiedRef = useRef(false);

    const [phase, setPhase] = useState<Phase>("loading_models");
    const [statusMsg, setStatusMsg] = useState("Loading AI…");
    const [errorMsg, setErrorMsg] = useState("");
    const [isCameraReady, setIsCameraReady] = useState(false);

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
        setIsCameraReady(false);
        onClose();
    }, [cleanup, onClose]);

    const startVerification = useCallback(async () => {
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
            setStatusMsg("Look at the camera…");

            // Continuous scan — verify on first good frame
            intervalRef.current = setInterval(async () => {
                if (hasVerifiedRef.current) return;
                const video = webcamRef.current?.video;
                if (!video || video.readyState !== 4) return;

                const detection = await faceapi.detectSingleFace(
                    video,
                    new faceapi.SsdMobilenetv1Options({ minConfidence: 0.85 })
                ).withFaceLandmarks().withFaceDescriptor();

                if (!detection) {
                    setStatusMsg("Looking for your face…");
                    return;
                }

                if (detection.detection.score < 0.85) return;

                // Face found — send to backend
                hasVerifiedRef.current = true;
                cleanup();
                setPhase("verifying");
                setStatusMsg("Verifying identity…");

                const descriptor = Array.from(detection.descriptor);
                const res = await apiPost<{ verificationToken: string }>("/api/face/verify", { descriptor });

                if (res.data?.verificationToken) {
                    setPhase("success");
                    setStatusMsg("Identity confirmed ✅");
                    setTimeout(() => onSuccess(res.data!.verificationToken), 800);
                } else {
                    setPhase("error");
                    setErrorMsg(res.error || "Face did not match. Please try again or contact HR.");
                }
            }, 250);

        } catch (e: any) {
            setPhase("error");
            setErrorMsg(e.message || "Failed to start face verification.");
        }
    }, [cleanup, onSuccess]);

    useEffect(() => {
        if (isCameraReady && phase === "loading_models") {
            startVerification();
        }
    }, [isCameraReady, phase, startVerification]);

    useEffect(() => {
        if (!isOpen) cleanup();
    }, [isOpen, cleanup]);

    if (!isOpen) return null;

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
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Face Check-In</h2>
                <p style={{ color: "#94a3b8", fontSize: 13, marginBottom: 28 }}>
                    Look at the camera to verify your identity
                </p>

                {/* Camera with animated ring */}
                <div style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
                    {/* Animated scanning ring */}
                    <div style={{
                        position: "absolute",
                        width: 240, height: 240,
                        borderRadius: "50%",
                        border: `4px solid ${scannerColor}`,
                        zIndex: 2,
                        boxShadow: phase === "scanning" ? `0 0 24px ${scannerColor}55` : "none",
                        animation: phase === "scanning" ? "pulse-ring 1.5s ease-in-out infinite" : "none",
                        transition: "border-color 0.3s ease, box-shadow 0.3s ease",
                    }} />

                    <div style={{
                        width: 220, height: 220,
                        borderRadius: "50%",
                        overflow: "hidden",
                        background: "#0f172a",
                        position: "relative",
                        zIndex: 1,
                    }}>
                        {(phase === "loading_models" || phase === "scanning" || phase === "verifying") && (
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
                </div>

                {/* Status */}
                <p style={{ fontSize: 14, color: phase === "error" ? "#f87171" : phase === "success" ? "#4ade80" : "#94a3b8", marginBottom: 24, minHeight: 20 }}>
                    {phase === "error" ? errorMsg : statusMsg}
                </p>

                {/* Buttons */}
                <div style={{ display: "flex", gap: 12 }}>
                    <button
                        onClick={handleClose}
                        style={{ flex: 1, padding: "12px 0", borderRadius: 10, border: "1px solid #334155", background: "transparent", color: "#94a3b8", fontWeight: 600, cursor: "pointer", fontSize: 14 }}
                    >
                        Cancel
                    </button>
                    {phase === "error" && (
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
                    )}
                </div>
            </div>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes pulse-ring {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.05); opacity: 0.75; }
                }
            `}</style>
        </div>
    );
}
