"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import Webcam from "react-webcam";
import { Camera, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { apiPost } from "@/lib/api-client";

interface FaceEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  onEnrollmentSuccess?: () => void;
}

export function FaceEnrollmentModal({
  isOpen,
  onClose,
  userId,
  userName,
  onEnrollmentSuccess,
}: FaceEnrollmentModalProps) {
  const webcamRef = useRef<Webcam>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const captureFrame = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setCapturedImage(imageSrc);
      setError(null);
    } else {
      setError("Failed to capture image. Please ensure camera permissions are granted.");
    }
  }, [webcamRef]);

  const retakeImage = () => {
    setCapturedImage(null);
    setError(null);
  };

  const submitEnrollment = async () => {
    if (!capturedImage) return;

    setIsCapturing(true);
    setError(null);

    try {
      const response = await apiPost("/api/face/enroll", {
        userId,
        image: capturedImage,
      });

      if (response.error) throw new Error(response.error);

      setIsSuccess(true);
      if (onEnrollmentSuccess) {
        setTimeout(onEnrollmentSuccess, 1500);
      }
    } catch (err: any) {
      setError(err.message || "Failed to enroll face. Please try again.");
    } finally {
      setIsCapturing(false);
    }
  };

  // Reset state on modal close
  const handleClose = () => {
    setCapturedImage(null);
    setError(null);
    setIsSuccess(false);
    setIsCapturing(false);
    setIsCameraReady(false);
    onClose();
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div style={{
        position: "fixed", inset: 0, zIndex: 999999, // Super high z-index to block sidebar/navbar
        background: "rgba(0,0,0,0.65)", backdropFilter: "blur(8px)", // Stronger blur
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20
    }}>
      <div className="animate-slideUp" style={{
          background: "var(--bg-primary)", borderRadius: 16, padding: "32px",
          maxWidth: 600, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.4)"
      }}>
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--font-bold)", margin: 0, color: "var(--text-primary)" }}>
            Register Face: {userName}
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", marginTop: 8 }}>
            Position the employee's face clearly within the frame. Ensure good lighting.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px 0", position: "relative" }}>
          {isSuccess ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 0", color: "#16a34a" }}>
              <CheckCircle size={64} style={{ marginBottom: 16 }} />
              <p style={{ fontSize: "18px", fontWeight: 500 }}>Face Registered Successfully!</p>
            </div>
          ) : (
            <div style={{ width: "100%" }}>
              <div style={{ position: "relative", width: "100%", height: "360px", backgroundColor: "black", borderRadius: 12, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {capturedImage ? (
                  <img src={capturedImage} alt="Captured" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <>
                    {!isCameraReady && (
                      <div style={{ position: "absolute", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
                        <RefreshCw size={24} className="animate-spin" style={{ marginBottom: 8 }} />
                        <span style={{ fontSize: "14px" }}>Starting camera...</span>
                      </div>
                    )}
                    <Webcam
                      audio={false}
                      ref={webcamRef}
                      screenshotFormat="image/jpeg"
                      videoConstraints={{
                        facingMode: "user"
                      }}
                      mirrored={true}
                      onUserMedia={() => setIsCameraReady(true)}
                      onUserMediaError={(err: any) => {
                        setIsCameraReady(false);
                        console.error("Camera Error:", err);
                        let detailedError = "";
                        if (typeof err === 'string') {
                          detailedError = err;
                        } else if (err instanceof Error || (err && err.name && err.message)) {
                          detailedError = `${err.name}: ${err.message}`;
                        } else {
                          detailedError = "Unknown camera error. Please ensure permissions are granted and no other app is using the camera.";
                        }
                        setError(`Camera Error: ${detailedError}`);
                      }}
                      style={{ 
                        width: "100%", 
                        height: "100%", 
                        objectFit: "cover", 
                        opacity: isCameraReady ? 1 : 0,
                        transition: "opacity 0.3s ease" 
                      }}
                    />
                  </>
                )}
                
                {/* Targeting Overlay */}
                {(!capturedImage && isCameraReady) && (
                  <div style={{ position: "absolute", inset: 0, border: "2px solid rgba(139, 92, 246, 0.5)", margin: 16, borderRadius: 12, pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 160, height: 200, border: "2px dashed rgba(255,255,255,0.7)", borderRadius: "100%" }}></div>
                  </div>
                )}
              </div>

              {error && (
                <div style={{ marginTop: 16, padding: 12, background: "#fee2e2", color: "#991b1b", borderRadius: 8, fontSize: "var(--text-sm)", display: "flex", alignItems: "center", gap: 8 }}>
                  <AlertCircle size={16} />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 24 }}>
          {!isSuccess && (
            <>
              {capturedImage ? (
                <>
                  <button onClick={retakeImage} disabled={isCapturing} style={{ flex: 1, padding: "12px 0", borderRadius: 8, border: "1px solid #d1d5db", background: "white", color: "#374151", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <RefreshCw size={16} /> Retake
                  </button>
                  <button onClick={submitEnrollment} disabled={isCapturing} style={{ flex: 1, padding: "12px 0", borderRadius: 8, border: "none", background: "var(--color-primary)", color: "white", fontWeight: 600, cursor: isCapturing ? "not-allowed" : "pointer", opacity: isCapturing ? 0.7 : 1 }}>
                    {isCapturing ? "Enrolling..." : "Submit Photo"}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={handleClose} disabled={isCapturing} style={{ flex: 1, padding: "12px 0", borderRadius: 8, border: "1px solid #d1d5db", background: "white", color: "#374151", fontWeight: 600, cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button onClick={captureFrame} disabled={!isCameraReady} style={{ flex: 1, padding: "12px 0", borderRadius: 8, border: "none", background: "var(--color-primary)", color: "white", fontWeight: 600, cursor: isCameraReady ? "pointer" : "not-allowed", opacity: isCameraReady ? 1 : 0.5, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <Camera size={16} /> Capture Face
                  </button>
                </>
              )}
            </>
          )}
          {isSuccess && (
            <button onClick={handleClose} style={{ width: "100%", padding: "12px 0", borderRadius: 8, border: "none", background: "var(--color-primary)", color: "white", fontWeight: 600, cursor: "pointer" }}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
