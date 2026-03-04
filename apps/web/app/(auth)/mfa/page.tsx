"use client";

import { useState, useRef, KeyboardEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import "@/styles/components.css";

export default function MfaPage() {
    const router = useRouter();
    const { verifyMfa } = useAuth();
    const [digits, setDigits] = useState(["", "", "", "", "", ""]);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Countdown timer
    useEffect(() => {
        if (timeLeft <= 0) return;
        const timer = setInterval(() => setTimeLeft(t => t - 1), 1000);
        return () => clearInterval(timer);
    }, [timeLeft]);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, "0")}`;
    };

    function handleChange(index: number, value: string) {
        if (!/^\d*$/.test(value)) return;
        const newDigits = [...digits];
        newDigits[index] = value.slice(-1);
        setDigits(newDigits);
        setError("");

        // Auto-focus next
        if (value && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }

        // Auto-submit when all 6 digits entered
        if (newDigits.every(d => d) && index === 5) {
            submitCode(newDigits.join(""));
        }
    }

    function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
        if (e.key === "Backspace" && !digits[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    }

    function handlePaste(e: React.ClipboardEvent) {
        e.preventDefault();
        const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
        if (pasted.length === 6) {
            const newDigits = pasted.split("");
            setDigits(newDigits);
            inputRefs.current[5]?.focus();
            submitCode(pasted);
        }
    }

    async function submitCode(code: string) {
        setLoading(true);
        const result = await verifyMfa(code);
        if (result.success) {
            router.push("/dashboard");
        } else {
            setError(result.error || "Invalid code. Please try again.");
            setDigits(["", "", "", "", "", ""]);
            inputRefs.current[0]?.focus();
        }
        setLoading(false);
    }

    return (
        <div className="mfa-container">
            <div className="mfa-card animate-fadeIn">
                <div className="mfa-icon">🛡️</div>
                <h1 className="mfa-title">Two-Factor Authentication</h1>
                <p className="mfa-subtitle">
                    Enter the 6-digit code from your authenticator app
                </p>

                {error && (
                    <div
                        className="animate-shake"
                        style={{
                            padding: "var(--space-3) var(--space-4)",
                            background: "var(--color-danger-light)",
                            color: "var(--color-danger)",
                            borderRadius: "var(--radius-md)",
                            fontSize: "var(--text-sm)",
                            marginBottom: "var(--space-5)",
                        }}
                    >
                        {error}
                    </div>
                )}

                <div className="mfa-inputs" onPaste={handlePaste}>
                    {digits.map((digit, i) => (
                        <input
                            key={i}
                            ref={el => { inputRefs.current[i] = el; }}
                            type="text"
                            inputMode="numeric"
                            maxLength={1}
                            className="mfa-digit"
                            value={digit}
                            onChange={(e) => handleChange(i, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(i, e)}
                            autoFocus={i === 0}
                            aria-label={`Digit ${i + 1}`}
                            disabled={loading}
                        />
                    ))}
                </div>

                <div className="mfa-timer">
                    {timeLeft > 0
                        ? `Code expires in ${formatTime(timeLeft)}`
                        : "Code expired. Request a new code."}
                </div>

                <button
                    className="btn btn-primary btn-full btn-lg"
                    onClick={() => submitCode(digits.join(""))}
                    disabled={loading || digits.some(d => !d)}
                >
                    {loading ? (
                        <>
                            <span className="spinner" />
                            Verifying...
                        </>
                    ) : (
                        "Verify"
                    )}
                </button>

                <div className="mfa-backup">
                    Lost your device?{" "}
                    <a href="#">Use backup code</a>
                </div>
            </div>
        </div>
    );
}
