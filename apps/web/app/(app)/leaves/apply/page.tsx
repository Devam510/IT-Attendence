"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/api-client";
import "@/styles/leaves.css";

const LEAVE_TYPES = [
    { value: "annual", label: "Annual Leave", icon: "🏖️" },
    { value: "sick", label: "Sick Leave", icon: "🤒" },
    { value: "casual", label: "Casual Leave", icon: "☀️" },
    { value: "comp", label: "Comp Off", icon: "🔄" },
];

interface TeamOverlap {
    name: string;
    dates: string;
}

interface DayCount {
    days: number;
    workingDays: number;
}

export default function ApplyLeavePage() {
    const router = useRouter();

    const [formData, setFormData] = useState({
        leaveType: "annual",
        startDate: "",
        endDate: "",
        reason: "",
        halfDay: false,
        halfDayPeriod: "am" as "am" | "pm",
    });

    const [dayCount, setDayCount] = useState<DayCount | null>(null);
    const [overlap, setOverlap] = useState<TeamOverlap[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    // Calculate days when dates change
    useEffect(() => {
        if (!formData.startDate || !formData.endDate) {
            setDayCount(null);
            return;
        }
        const start = new Date(formData.startDate);
        const end = new Date(formData.endDate);
        if (end < start) { setDayCount(null); return; }

        // Count working days (Mon–Fri)
        let days = 0;
        const cur = new Date(start);
        while (cur <= end) {
            const d = cur.getDay();
            if (d !== 0 && d !== 6) days++;
            cur.setDate(cur.getDate() + 1);
        }
        setDayCount({ days: Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1, workingDays: formData.halfDay ? 0.5 : days });

        // Check team overlap
        async function checkOverlap() {
            const res = await apiGet<{ overlap: TeamOverlap[] }>(
                `/api/leaves/team-calendar?startDate=${formData.startDate}&endDate=${formData.endDate}`
            );
            if (res.data?.overlap) setOverlap(res.data.overlap);
        }
        checkOverlap();
    }, [formData.startDate, formData.endDate, formData.halfDay]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        setSubmitting(true);

        // First, look up the leaveTypeId from the balance API
        const balRes = await apiGet<any>("/api/leaves/balance");
        const codeMap: Record<string, string[]> = {
            annual: ["EL", "AL"],
            sick: ["SL"],
            casual: ["CL"],
            comp: ["CO"],
        };
        const validCodes = codeMap[formData.leaveType] || [formData.leaveType.toUpperCase()];
        let leaveTypeId = "";

        if (balRes.data?.balances) {
            const match = balRes.data.balances.find((b: any) =>
                validCodes.includes(b.code) || b.name?.toLowerCase().includes(formData.leaveType)
            );
            if (match) leaveTypeId = match.leaveTypeId;
        }

        if (!leaveTypeId) {
            setError("Could not find leave type. Please try again.");
            setSubmitting(false);
            return;
        }

        const res = await apiPost("/api/leaves/apply", {
            leaveTypeId,
            startDate: formData.startDate,
            endDate: formData.endDate,
            reason: formData.reason,
            halfDay: formData.halfDay ? (formData.halfDayPeriod === "am" ? "FIRST_HALF" : "SECOND_HALF") : "NONE",
        });

        if (res.data) {
            setSuccess(true);
            setTimeout(() => router.push("/leaves"), 1500);
        } else {
            setError(res.error || "Failed to submit leave request");
        }
        setSubmitting(false);
    }

    if (success) {
        return (
            <div style={{ textAlign: "center", padding: "var(--space-16)" }}>
                <div style={{ fontSize: "4rem", marginBottom: "var(--space-4)" }}>✅</div>
                <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--font-bold)", marginBottom: "var(--space-2)" }}>
                    Leave Applied!
                </h2>
                <p style={{ color: "var(--text-secondary)" }}>
                    Your request has been submitted and is pending approval.
                </p>
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="leave-header animate-fadeIn">
                <div>
                    <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)" }}>
                        Apply for Leave
                    </h1>
                    <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", marginTop: "var(--space-1)" }}>
                        Fill in the details below to submit your leave request
                    </p>
                </div>
                {dayCount && (
                    <div className="leave-days-pill">
                        📅 {dayCount.workingDays} working day{dayCount.workingDays !== 1 ? "s" : ""}
                    </div>
                )}
            </div>

            <form onSubmit={handleSubmit}>
                <div className="apply-form-card animate-slideUp">

                    {/* Leave Type */}
                    <div className="input-group" style={{ marginBottom: "var(--space-5)" }}>
                        <label className="input-label">Leave Type</label>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "var(--space-3)" }}>
                            {LEAVE_TYPES.map(type => (
                                <label
                                    key={type.value}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "var(--space-3)",
                                        padding: "var(--space-4)",
                                        borderRadius: "var(--radius-md)",
                                        border: `2px solid ${formData.leaveType === type.value ? "var(--color-primary)" : "var(--border-primary)"}`,
                                        background: formData.leaveType === type.value ? "var(--color-primary-light)" : "var(--bg-secondary)",
                                        cursor: "pointer",
                                        transition: "all var(--transition-fast)",
                                    }}
                                >
                                    <input
                                        type="radio"
                                        name="leaveType"
                                        value={type.value}
                                        checked={formData.leaveType === type.value}
                                        onChange={() => setFormData(f => ({ ...f, leaveType: type.value }))}
                                        style={{ display: "none" }}
                                    />
                                    <span style={{ fontSize: "1.4rem" }}>{type.icon}</span>
                                    <span style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)" }}>
                                        {type.label}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Dates */}
                    <div className="apply-form-grid" style={{ marginBottom: "var(--space-5)" }}>
                        <div className="input-group">
                            <label className="input-label" htmlFor="startDate">Start Date</label>
                            <input
                                id="startDate"
                                type="date"
                                className="input"
                                value={formData.startDate}
                                min={new Date().toISOString().split("T")[0]}
                                onChange={e => setFormData(f => ({ ...f, startDate: e.target.value }))}
                                required
                            />
                        </div>
                        <div className="input-group">
                            <label className="input-label" htmlFor="endDate">End Date</label>
                            <input
                                id="endDate"
                                type="date"
                                className="input"
                                value={formData.endDate}
                                min={formData.startDate || new Date().toISOString().split("T")[0]}
                                onChange={e => setFormData(f => ({ ...f, endDate: e.target.value }))}
                                required
                            />
                        </div>
                    </div>

                    {/* Half Day */}
                    <div className="input-group" style={{ marginBottom: "var(--space-5)" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", cursor: "pointer" }}>
                            <input
                                type="checkbox"
                                checked={formData.halfDay}
                                onChange={e => setFormData(f => ({ ...f, halfDay: e.target.checked }))}
                            />
                            <span className="input-label" style={{ marginBottom: 0 }}>Half Day</span>
                        </label>
                        {formData.halfDay && (
                            <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
                                {(["am", "pm"] as const).map(p => (
                                    <label key={p} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                                        <input
                                            type="radio"
                                            name="halfDayPeriod"
                                            value={p}
                                            checked={formData.halfDayPeriod === p}
                                            onChange={() => setFormData(f => ({ ...f, halfDayPeriod: p }))}
                                        />
                                        {p === "am" ? "Morning" : "Afternoon"}
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Reason */}
                    <div className="input-group" style={{ marginBottom: "var(--space-5)" }}>
                        <label className="input-label" htmlFor="reason">Reason</label>
                        <textarea
                            id="reason"
                            className="input"
                            rows={4}
                            placeholder="Please provide the reason for your leave request..."
                            value={formData.reason}
                            onChange={e => setFormData(f => ({ ...f, reason: e.target.value }))}
                            required
                            style={{ resize: "vertical", minHeight: 100 }}
                        />
                    </div>

                    {/* Team Overlap Warning */}
                    {overlap.length > 0 && (
                        <div className="overlap-warning" style={{ marginBottom: "var(--space-5)" }}>
                            <span className="overlap-warning-icon">⚠️</span>
                            <div>
                                <strong>Team Availability:</strong> {overlap.length} teammate{overlap.length > 1 ? "s" : ""} already on leave:
                                {overlap.map(o => (
                                    <div key={o.name} style={{ marginTop: 4, fontSize: "var(--text-xs)" }}>
                                        • {o.name} ({o.dates})
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div
                            className="animate-shake"
                            style={{ padding: "var(--space-3) var(--space-4)", background: "var(--color-danger-light)", color: "var(--color-danger)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-5)", fontSize: "var(--text-sm)" }}
                        >
                            {error}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="apply-form-actions">
                        <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => router.back()}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={submitting || !formData.startDate || !formData.endDate || !formData.reason}
                        >
                            {submitting ? <><span className="spinner" /> Submitting...</> : "Submit Request"}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}
