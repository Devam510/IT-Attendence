"use client";

import React, { useRef, useState, useCallback } from "react";
import Webcam from "react-webcam";
import { Camera, CheckCircle, AlertCircle, RefreshCw, ScanFace } from "lucide-react";
import { apiPost } from "@/lib/api-client";

interface FaceVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerificationSuccess: (token: string) => void;
}

export function FaceVerificationModal({
  isOpen,
  onClose,
  onVerificationSuccess,
}: FaceVerificationModalProps) {
  const webcamRef = useRef<Webcam>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const captureFrame = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setCapturedImage(imageSrc);
      setError(null);
      // Auto-submit on capture for a smoother experience
      submitVerification(imageSrc);
    } else {
      setError("Failed to access camera. Please check permissions.");
    }
  }, [webcamRef]);

  const retakeImage = () => {
    setCapturedImage(null);
    setError(null);
  };

  const submitVerification = async (image: string) => {
    setIsVerifying(true);
    setError(null);

    try {
      const response = await apiPost<any>("/api/face/verify", {
        image,
      });

      if (response.error || !response.data?.verificationToken) {
        throw new Error(response.error || "Face verification failed. Please try again.");
      }

      setIsSuccess(true);
      
      // Delay closing so they see the success marker
      setTimeout(() => {
        onVerificationSuccess(response.data.verificationToken);
      }, 1500);

    } catch (err: any) {
      setError(err.message || "Face not recognized. Please try again.");
      setCapturedImage(null); // Auto-retake on failure
    } finally {
      setIsVerifying(false);
    }
  };

  const handleClose = () => {
    if (isVerifying) return;
    setCapturedImage(null);
    setError(null);
    setIsSuccess(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div style={{
        position: "fixed", inset: 0, zIndex: 99999,
        background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20
    }}>
      <div className="animate-slideUp" style={{
          background: "var(--bg-primary)", borderRadius: 20, padding: "32px",
          maxWidth: 480, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.4)"
      }}>
        <div style={{ marginBottom: 20, textAlign: "center" }}>
          <div style={{ display: "inline-flex", padding: 16, background: "var(--color-primary-light)", color: "var(--color-primary)", borderRadius: "50%", marginBottom: 16 }}>
            <ScanFace size={32} />
          </div>
          <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--font-bold)", margin: 0, color: "var(--text-primary)" }}>
            Face Verification
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", marginTop: 8 }}>
            Please position your face in the frame to securely check in.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px 0", position: "relative" }}>
          {isSuccess ? (
            <div className="animate-fadeIn" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyItems: "center", padding: "32px 0", color: "#16a34a" }}>
              <CheckCircle size={64} style={{ marginBottom: 16 }} />
              <p style={{ fontSize: "18px", fontWeight: 600 }}>Identity Verified!</p>
              <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: 8 }}>Proceeding to check-in...</p>
            </div>
          ) : (
            <div style={{ width: "100%" }}>
              <div style={{ 
                position: "relative", width: "100%", aspectRatio: "3/4", 
                backgroundColor: "black", borderRadius: 16, overflow: "hidden", 
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "4px solid var(--surface-secondary)"
              }}>
                {capturedImage ? (
                  <img src={capturedImage} alt="Captured" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <Webcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    videoConstraints={{
                      width: 480,
                      height: 640,
                      facingMode: "user",
                    }}
                    style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} // Mirror effect
                  />
                )}
                
                {/* Visual Scanning Animation Overlay */}
                {!capturedImage && (
                  <div style={{ position: "absolute", inset: 0, pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ 
                      width: "60%", height: "60%", 
                      border: "2px solid rgba(255,255,255,0.2)", 
                      borderRadius: "50%",
                      boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)" // Darken surroundings
                    }}></div>
                    {isVerifying && (
                      <div className="animate-pulse" style={{ position: "absolute", width: "100%", height: "4px", background: "var(--color-primary)", top: "50%", boxShadow: "0 0 20px var(--color-primary-light)" }} />
                    )}
                  </div>
                )}
              </div>

              {error && (
                <div className="animate-slideUp" style={{ marginTop: 16, padding: 12, background: "#fee2e2", color: "#991b1b", borderRadius: 8, fontSize: "var(--text-sm)", display: "flex", alignItems: "center", gap: 8 }}>
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
                  <button onClick={retakeImage} disabled={isVerifying} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1px solid #d1d5db", background: "white", color: "#374151", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <RefreshCw size={18} /> Retry
                  </button>
                  <button disabled style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "none", background: "var(--color-primary)", color: "white", fontWeight: 600, opacity: 0.7, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    Verifying...
                  </button>
                </>
              ) : (
                <>
                  <button onClick={handleClose} disabled={isVerifying} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "1px solid #d1d5db", background: "white", color: "#374151", fontWeight: 600, cursor: "pointer" }}>
                    Cancel Check-in
                  </button>
                  <button onClick={captureFrame} disabled={isVerifying} style={{ flex: 1, padding: "14px 0", borderRadius: 12, border: "none", background: "var(--color-primary)", color: "white", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 14px rgba(99,102,241,0.4)" }}>
                    <Camera size={18} /> Verify Identity
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
