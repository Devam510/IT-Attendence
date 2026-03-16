"use client";

import { useState, useEffect } from "react";
import { apiGet, apiPost } from "@/lib/api-client";

interface LeaveBalanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string;
    userName: string;
}

interface LeaveBalanceRow {
    leaveTypeId: string;
    name: string;
    code: string;
    opening: number;
    accrued: number;
    used: number;
    pending: number;
    closing: number;
}

export default function LeaveBalanceModal({ isOpen, onClose, userId, userName }: LeaveBalanceModalProps) {
    const [balances, setBalances] = useState<LeaveBalanceRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    useEffect(() => {
        if (!isOpen || !userId) return;
        
        setLoading(true);
        setError(null);
        setSuccessMsg(null);
        
        apiGet<{ user: string; balances: LeaveBalanceRow[]; year: number }>(`/api/users/${userId}/leave-balances`)
            .then(res => {
                if (res.error) {
                    setError(res.error);
                } else if (res.data) {
                    setBalances(res.data.balances);
                }
            })
            .catch(err => setError(String(err)))
            .finally(() => setLoading(false));
    }, [isOpen, userId]);

    if (!isOpen) return null;

    const handleOpeningChange = (leaveTypeId: string, newOpeningStr: string) => {
        const val = parseFloat(newOpeningStr) || 0;
        setBalances(prev => prev.map(b => {
            if (b.leaveTypeId === leaveTypeId) {
                // Instantly preview the new closing balance
                const newClosing = Math.max(0, val + b.accrued - b.used - b.pending);
                return { ...b, opening: val, closing: newClosing };
            }
            return b;
        }));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        setSuccessMsg(null);

        const updates = balances.map(b => ({
            leaveTypeId: b.leaveTypeId,
            newOpening: b.opening
        }));

        const res = await apiPost<{ message: string }>(`/api/users/${userId}/leave-balances`, { updates });
        
        if (res.error) {
            setError(res.error);
        } else {
            setSuccessMsg("Leave balances updated successfully!");
            setTimeout(() => {
                onClose();
            }, 1000);
        }
        setSaving(false);
    };

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 99999,
            background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }}>
            <div className="animate-slideUp" style={{
                background: "var(--bg-primary)", borderRadius: 16, padding: "32px",
                maxWidth: 600, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.4)"
            }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                    <div>
                        <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--font-bold)", margin: 0 }}>
                            Manage Leave Balances
                        </h2>
                        <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", marginTop: 4 }}>
                            {userName} — {new Date().getFullYear()}
                        </p>
                    </div>
                    <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 24, padding: "0 8px", color: "var(--text-tertiary)" }}>×</button>
                </div>

                {error && <div style={{ padding: 12, background: "#fee2e2", color: "#991b1b", borderRadius: 8, marginBottom: 20, fontSize: "var(--text-sm)" }}>{error}</div>}
                {successMsg && <div style={{ padding: 12, background: "#dcfce7", color: "#166534", borderRadius: 8, marginBottom: 20, fontSize: "var(--text-sm)" }}>{successMsg}</div>}

                {loading ? (
                    <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-tertiary)" }}>Loading balances...</div>
                ) : balances.length === 0 ? (
                    <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-tertiary)" }}>No leave types configured for this entity.</div>
                ) : (
                    <form onSubmit={handleSave}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
                            {balances.map(b => (
                                <div key={b.leaveTypeId} style={{ 
                                    padding: 16, border: "1px solid var(--border-light)", borderRadius: 8, 
                                    background: "var(--bg-secondary)", display: "flex", alignItems: "center", gap: 16
                                }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 600, fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>{b.name}</div>
                                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: 4 }}>
                                            Used: <strong>{b.used}</strong> | Pending: <strong>{b.pending}</strong>
                                        </div>
                                    </div>
                                    
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <div style={{ textAlign: "right" }}>
                                            <div style={{ fontSize: "10px", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Starting Balance</div>
                                            <input 
                                                type="number" 
                                                step="0.5" 
                                                min="0"
                                                className="input"
                                                value={b.opening}
                                                onChange={e => handleOpeningChange(b.leaveTypeId, e.target.value)}
                                                style={{ 
                                                    width: 80, padding: "8px", borderRadius: 6, border: "1px solid var(--border-light)", 
                                                    background: "var(--bg-primary)", color: "var(--text-primary)", textAlign: "center", fontWeight: 600
                                                }} 
                                            />
                                        </div>
                                        <div style={{ fontSize: 24, color: "var(--text-tertiary)", padding: "0 4px", marginTop: 14 }}>=</div>
                                        <div style={{ textAlign: "center", minWidth: 60 }}>
                                            <div style={{ fontSize: "10px", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Available</div>
                                            <div style={{ 
                                                fontSize: "18px", fontWeight: "bold", 
                                                color: b.closing > 0 ? "#16a34a" : "var(--text-tertiary)",
                                                marginTop: 8
                                            }}>
                                                {b.closing}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: "flex", gap: 12 }}>
                            <button type="button" onClick={onClose} disabled={saving} style={{ flex: 1, padding: "12px 0", borderRadius: 8, border: "1px solid var(--border-light)", background: "var(--bg-card)", color: "var(--text-primary)", fontWeight: 600, cursor: "pointer" }}>
                                Cancel
                            </button>
                            <button type="submit" disabled={saving} style={{ flex: 1, padding: "12px 0", borderRadius: 8, border: "none", background: "var(--color-primary)", color: "white", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
                                {saving ? "Saving..." : "Save Balances"}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
