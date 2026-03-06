"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api-client";
import {
    ClipboardCheck,
    Plus,
    X,
    ChevronDown,
    Calendar,
    AlertCircle,
    Clock,
    CheckCircle2,
    Loader2,
    Trash2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────

type TaskStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "OVERDUE";
type TaskPriority = "LOW" | "MEDIUM" | "HIGH";

interface Task {
    id: string;
    title: string;
    description?: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueDate?: string;
    completedAt?: string;
    createdAt: string;
    assignedTo: { id: string; fullName: string; designation?: string };
    assignedBy: { id: string; fullName: string };
}

interface Employee {
    id: string;
    fullName: string;
    designation?: string;
    employeeId: string;
}

// ─── Helpers ──────────────────────────────────────────────────

const PRIORITY_STYLES: Record<TaskPriority, React.CSSProperties> = {
    HIGH: { background: "#fee2e2", color: "#b91c1c" },
    MEDIUM: { background: "#fef3c7", color: "#92400e" },
    LOW: { background: "#dcfce7", color: "#166534" },
};

const STATUS_STYLES: Record<TaskStatus, React.CSSProperties> = {
    PENDING: { background: "#e0e7ff", color: "#3730a3" },
    IN_PROGRESS: { background: "#dbeafe", color: "#1d4ed8" },
    COMPLETED: { background: "#dcfce7", color: "#166534" },
    OVERDUE: { background: "#fee2e2", color: "#b91c1c" },
};

const STATUS_ICONS: Record<TaskStatus, React.ReactNode> = {
    PENDING: <Clock size={12} />,
    IN_PROGRESS: <Loader2 size={12} />,
    COMPLETED: <CheckCircle2 size={12} />,
    OVERDUE: <AlertCircle size={12} />,
};

function isOverdue(task: Task): boolean {
    if (!task.dueDate || task.status === "COMPLETED") return false;
    return new Date(task.dueDate) < new Date(new Date().toDateString());
}

function formatDate(dateStr?: string) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Modal (rendered via portal to escape stacking context) ───

interface AssignModalProps {
    employees: Employee[];
    onClose: () => void;
    onAssign: (form: { title: string; description: string; assignedToId: string; priority: TaskPriority; dueDate: string }) => Promise<void>;
    submitting: boolean;
    error: string;
}

function AssignModal({ employees, onClose, onAssign, submitting, error }: AssignModalProps) {
    const [form, setForm] = useState({
        title: "",
        description: "",
        assignedToId: "",
        priority: "MEDIUM" as TaskPriority,
        dueDate: "",
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onAssign(form);
    };

    if (typeof window === "undefined") return null;

    return createPortal(
        <div
            style={{
                position: "fixed", inset: 0,
                background: "rgba(0,0,0,0.6)",
                zIndex: 9999,
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "16px",
                backdropFilter: "blur(2px)",
            }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div style={{
                background: "var(--bg-primary)", borderRadius: "var(--radius-xl)",
                padding: "var(--space-6)", width: "100%", maxWidth: 480,
                boxShadow: "var(--shadow-xl)", border: "1px solid var(--border-primary)",
            }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-5)" }}>
                    <h2 style={{ fontSize: "var(--text-lg)", fontWeight: "var(--font-bold)" }}>Assign New Task</h2>
                    <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 4 }}>
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                    <div>
                        <label style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)", display: "block", marginBottom: "var(--space-2)" }}>Task Title *</label>
                        <input
                            className="input"
                            value={form.title}
                            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                            placeholder="Enter task title"
                            required
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)", display: "block", marginBottom: "var(--space-2)" }}>Description</label>
                        <textarea
                            className="input"
                            value={form.description}
                            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                            placeholder="Optional task details"
                            rows={3}
                            style={{ resize: "vertical", fontFamily: "inherit" }}
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)", display: "block", marginBottom: "var(--space-2)" }}>
                            Assign To * {employees.length > 0 ? `(${employees.length} available)` : ""}
                        </label>
                        <div style={{ position: "relative" }}>
                            <select
                                className="input"
                                value={form.assignedToId}
                                onChange={e => setForm(p => ({ ...p, assignedToId: e.target.value }))}
                                style={{ appearance: "none", paddingRight: "var(--space-9)" }}
                                required
                            >
                                <option value="">Select employee…</option>
                                {employees.map(emp => (
                                    <option key={emp.id} value={emp.id}>
                                        {emp.fullName}{emp.designation ? ` — ${emp.designation}` : ""}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown size={16} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-tertiary)" }} />
                        </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
                        <div>
                            <label style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)", display: "block", marginBottom: "var(--space-2)" }}>Priority</label>
                            <div style={{ position: "relative" }}>
                                <select
                                    className="input"
                                    value={form.priority}
                                    onChange={e => setForm(p => ({ ...p, priority: e.target.value as TaskPriority }))}
                                    style={{ appearance: "none", paddingRight: "var(--space-9)" }}
                                >
                                    <option value="LOW">Low</option>
                                    <option value="MEDIUM">Medium</option>
                                    <option value="HIGH">High</option>
                                </select>
                                <ChevronDown size={16} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "var(--text-tertiary)" }} />
                            </div>
                        </div>
                        <div>
                            <label style={{ fontSize: "var(--text-sm)", fontWeight: "var(--font-medium)", display: "block", marginBottom: "var(--space-2)" }}>Due Date</label>
                            <input
                                className="input"
                                type="date"
                                value={form.dueDate}
                                onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
                                min={new Date().toISOString().split("T")[0]}
                            />
                        </div>
                    </div>

                    {error && (
                        <div style={{ background: "var(--color-danger-light)", color: "var(--color-danger)", padding: "var(--space-3)", borderRadius: "var(--radius-md)", fontSize: "var(--text-sm)", display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
                            <AlertCircle size={14} /> {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={submitting}
                        style={{ width: "100%", justifyContent: "center", display: "flex", alignItems: "center", gap: "var(--space-2)" }}
                    >
                        {submitting ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Assigning…</> : <><Plus size={16} /> Assign Task</>}
                    </button>
                </form>
            </div>
        </div>,
        document.body
    );
}

// ─── Page Component ───────────────────────────────────────────

export default function TasksPage() {
    const { user } = useAuth();
    const [tasks, setTasks] = useState<Task[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeFilter, setActiveFilter] = useState<string>("ALL");
    const [showModal, setShowModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState("");

    const canAssign = ["MGR", "HRA", "HRBP", "SADM"].includes(user?.role ?? "");

    // ─── Fetch tasks ──────────────────────────────────────────

    const fetchTasks = useCallback(async () => {
        try {
            const res = await api<{ tasks: Task[] }>("/api/tasks");
            if (res.data?.tasks) {
                setTasks(res.data.tasks);
            }
        } catch {
            // silent
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchEmployees = useCallback(async () => {
        try {
            const res = await api<{ employees: Employee[] }>("/api/tasks/employees");
            if (res.data?.employees) {
                setEmployees(res.data.employees);
            }
        } catch {
            // silent
        }
    }, []);

    // Fetch tasks + real-time polling
    useEffect(() => {
        fetchTasks();
        const interval = setInterval(fetchTasks, 15_000);
        return () => clearInterval(interval);
    }, [fetchTasks]);

    // Fetch employees once auth loads and role is confirmed
    useEffect(() => {
        if (canAssign) fetchEmployees();
    }, [canAssign, fetchEmployees]);

    // ─── Computed tasks with overdue detection ──────────────

    const enrichedTasks = tasks.map((t) => ({
        ...t,
        status: (isOverdue(t) && t.status === "PENDING" ? "OVERDUE" : t.status) as TaskStatus,
    }));

    // Track if user already has a task IN_PROGRESS (only one active at a time)
    const hasTaskInProgress = enrichedTasks.some(
        (t) => t.assignedTo.id === user?.id && t.status === "IN_PROGRESS"
    );

    const counts = {
        ALL: enrichedTasks.length,
        PENDING: enrichedTasks.filter((t) => t.status === "PENDING").length,
        IN_PROGRESS: enrichedTasks.filter((t) => t.status === "IN_PROGRESS").length,
        COMPLETED: enrichedTasks.filter((t) => t.status === "COMPLETED").length,
        OVERDUE: enrichedTasks.filter((t) => t.status === "OVERDUE").length,
    };

    const filteredTasks =
        activeFilter === "ALL" ? enrichedTasks : enrichedTasks.filter((t) => t.status === activeFilter);

    // ─── Actions ─────────────────────────────────────────────

    const handleMarkComplete = async (taskId: string) => {
        const res = await api(`/api/tasks/${taskId}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "COMPLETED" }),
        });
        if (!res.error) {
            setTasks((prev) =>
                prev.map((t) => (t.id === taskId ? { ...t, status: "COMPLETED" as TaskStatus, completedAt: new Date().toISOString() } : t))
            );
        }
    };

    const handleStartWorking = async (taskId: string) => {
        const res = await api(`/api/tasks/${taskId}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "IN_PROGRESS" }),
        });
        if (!res.error) {
            setTasks((prev) =>
                prev.map((t) => (t.id === taskId ? { ...t, status: "IN_PROGRESS" as TaskStatus } : t))
            );
        }
    };

    const handleDelete = async (taskId: string) => {
        if (!confirm("Delete this task?")) return;
        const res = await api(`/api/tasks/${taskId}`, { method: "DELETE" });
        if (!res.error) {
            setTasks((prev) => prev.filter((t) => t.id !== taskId));
        }
    };

    const handleOpenModal = () => {
        setShowModal(true);
        setFormError("");
        // Always refresh employee list when opening modal
        if (canAssign) fetchEmployees();
    };

    const handleAssignSubmit = async (form: { title: string; description: string; assignedToId: string; priority: TaskPriority; dueDate: string }) => {
        setFormError("");
        if (!form.title.trim()) { setFormError("Title is required"); return; }
        if (!form.assignedToId) { setFormError("Please select an employee"); return; }

        setSubmitting(true);
        try {
            const res = await api<{ task: Task }>("/api/tasks", {
                method: "POST",
                body: JSON.stringify(form),
            });
            if (res.data?.task) {
                setTasks((prev) => [res.data!.task, ...prev]);
                setShowModal(false);
            } else {
                setFormError(res.error ?? "Failed to assign task");
            }
        } catch {
            setFormError("Network error. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    // ─── Filters ──────────────────────────────────────────────

    const FILTERS = [
        { key: "ALL", label: "All" },
        { key: "PENDING", label: "Pending" },
        { key: "IN_PROGRESS", label: "In Progress" },
        { key: "COMPLETED", label: "Completed" },
        { key: "OVERDUE", label: "Overdue" },
    ];

    // ─── Render ───────────────────────────────────────────────

    return (
        <div className="app-content">
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-6)" }}>
                <div>
                    <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)", display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                        <ClipboardCheck size={28} style={{ color: "var(--color-primary)" }} />
                        Tasks
                    </h1>
                    <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", marginTop: "var(--space-1)" }}>
                        {canAssign ? "Assign and track team tasks" : "Your assigned tasks"}
                    </p>
                </div>
                {canAssign && (
                    <button
                        className="btn btn-primary"
                        onClick={handleOpenModal}
                        style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}
                    >
                        <Plus size={16} />
                        Assign Task
                    </button>
                )}
            </div>

            {/* Filter Tabs */}
            <div style={{ display: "flex", gap: "var(--space-2)", marginBottom: "var(--space-6)", flexWrap: "wrap" }}>
                {FILTERS.map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => setActiveFilter(key)}
                        style={{
                            padding: "6px 14px",
                            borderRadius: "var(--radius-full)",
                            border: activeFilter === key ? "none" : "1px solid var(--border-primary)",
                            background: activeFilter === key ? "var(--color-primary)" : "var(--bg-primary)",
                            color: activeFilter === key ? "white" : "var(--text-secondary)",
                            fontWeight: activeFilter === key ? "600" : "500",
                            fontSize: "var(--text-sm)",
                            cursor: "pointer",
                            transition: "all var(--transition-fast)",
                        }}
                    >
                        {label}
                        <span style={{
                            marginLeft: 6,
                            background: activeFilter === key ? "rgba(255,255,255,0.3)" : "var(--bg-tertiary)",
                            color: activeFilter === key ? "white" : "var(--text-secondary)",
                            borderRadius: "var(--radius-full)",
                            padding: "0 7px",
                            fontSize: 11,
                            fontWeight: "700",
                        }}>
                            {counts[key as keyof typeof counts]}
                        </span>
                    </button>
                ))}
            </div>

            {/* Task Table */}
            <div className="card" style={{ overflow: "hidden" }}>
                {loading ? (
                    <div style={{ textAlign: "center", padding: "var(--space-12)", color: "var(--text-secondary)" }}>
                        <Loader2 size={32} style={{ margin: "0 auto var(--space-3)", animation: "spin 1s linear infinite" }} />
                        Loading tasks…
                    </div>
                ) : filteredTasks.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "var(--space-12)", color: "var(--text-secondary)" }}>
                        <ClipboardCheck size={40} style={{ margin: "0 auto var(--space-3)", opacity: 0.4 }} />
                        <p style={{ fontWeight: "500" }}>No tasks yet</p>
                        <p style={{ fontSize: "var(--text-sm)", marginTop: 4 }}>
                            {canAssign ? 'Click "Assign Task" to get started' : "No tasks assigned to you"}
                        </p>
                    </div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ borderBottom: "1px solid var(--border-primary)" }}>
                                    {["Task", "Assigned To", "Assigned By", "Priority", "Due Date", "Status", "Actions"].map((h) => (
                                        <th key={h} style={{
                                            padding: "12px 16px",
                                            textAlign: "left",
                                            fontSize: "11px",
                                            fontWeight: "600",
                                            color: "var(--text-tertiary)",
                                            textTransform: "uppercase",
                                            letterSpacing: "0.05em",
                                            whiteSpace: "nowrap",
                                        }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTasks.map((task) => {
                                    const isMyTask = task.assignedTo.id === user?.id;
                                    const canComplete = isMyTask && task.status !== "COMPLETED";
                                    const canDel = task.assignedBy.id === user?.id || ["SADM", "HRA"].includes(user?.role ?? "");

                                    return (
                                        <tr key={task.id}
                                            style={{ borderBottom: "1px solid var(--border-primary)", transition: "background var(--transition-fast)" }}
                                            onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-secondary)")}
                                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                        >
                                            <td style={{ padding: "14px 16px" }}>
                                                <div style={{ fontWeight: "500", fontSize: "var(--text-sm)" }}>{task.title}</div>
                                                {task.description && (
                                                    <div style={{ color: "var(--text-tertiary)", fontSize: "12px", marginTop: 2 }}>
                                                        {task.description.length > 60 ? task.description.slice(0, 60) + "…" : task.description}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: "14px 16px", fontSize: "var(--text-sm)" }}>
                                                <div style={{ fontWeight: "500" }}>{task.assignedTo.fullName}</div>
                                                {task.assignedTo.designation && (
                                                    <div style={{ color: "var(--text-tertiary)", fontSize: "12px" }}>{task.assignedTo.designation}</div>
                                                )}
                                            </td>
                                            <td style={{ padding: "14px 16px", fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                                                {task.assignedBy.fullName}
                                            </td>
                                            <td style={{ padding: "14px 16px" }}>
                                                <span style={{
                                                    display: "inline-flex", alignItems: "center",
                                                    padding: "3px 10px", borderRadius: "99px",
                                                    fontSize: "12px", fontWeight: "600",
                                                    ...PRIORITY_STYLES[task.priority],
                                                }}>
                                                    {task.priority}
                                                </span>
                                            </td>
                                            <td style={{ padding: "14px 16px", fontSize: "var(--text-sm)", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                                                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                                    <Calendar size={13} />
                                                    {formatDate(task.dueDate)}
                                                </span>
                                            </td>
                                            <td style={{ padding: "14px 16px" }}>
                                                <span style={{
                                                    display: "inline-flex", alignItems: "center", gap: 5,
                                                    padding: "3px 10px", borderRadius: "99px",
                                                    fontSize: "12px", fontWeight: "600",
                                                    ...STATUS_STYLES[task.status],
                                                }}>
                                                    {STATUS_ICONS[task.status]}
                                                    {task.status.replace("_", " ")}
                                                </span>
                                            </td>
                                            <td style={{ padding: "14px 16px" }}>
                                                <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
                                                    {/* Employee: Start Working (PENDING → IN_PROGRESS) */}
                                                    {isMyTask && task.status === "PENDING" && (
                                                        <button
                                                            onClick={() => handleStartWorking(task.id)}
                                                            disabled={hasTaskInProgress}
                                                            title={hasTaskInProgress ? "You already have a task in progress" : "Start working on this task"}
                                                            style={{
                                                                padding: "5px 12px", borderRadius: "var(--radius-md)",
                                                                background: hasTaskInProgress ? "var(--bg-tertiary)" : "#dbeafe",
                                                                color: hasTaskInProgress ? "var(--text-tertiary)" : "#1d4ed8",
                                                                border: "none", fontSize: "12px", fontWeight: "500",
                                                                cursor: hasTaskInProgress ? "not-allowed" : "pointer",
                                                                display: "flex", alignItems: "center", gap: 4,
                                                                opacity: hasTaskInProgress ? 0.6 : 1,
                                                                whiteSpace: "nowrap",
                                                            }}
                                                        >
                                                            <Loader2 size={12} />
                                                            {hasTaskInProgress ? "Another in progress" : "Start Working"}
                                                        </button>
                                                    )}
                                                    {/* Employee: Complete (IN_PROGRESS → COMPLETED) */}
                                                    {canComplete && task.status === "IN_PROGRESS" && (
                                                        <button
                                                            onClick={() => handleMarkComplete(task.id)}
                                                            style={{
                                                                padding: "5px 12px", borderRadius: "var(--radius-md)",
                                                                background: "var(--color-secondary)", color: "white",
                                                                border: "none", fontSize: "12px", fontWeight: "500",
                                                                cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                                                            }}
                                                        >
                                                            <CheckCircle2 size={12} /> Complete
                                                        </button>
                                                    )}
                                                    {/* Manager/HR can also mark complete directly */}
                                                    {!isMyTask && canAssign && task.status !== "COMPLETED" && (
                                                        <button
                                                            onClick={() => handleMarkComplete(task.id)}
                                                            style={{
                                                                padding: "5px 12px", borderRadius: "var(--radius-md)",
                                                                background: "var(--color-secondary)", color: "white",
                                                                border: "none", fontSize: "12px", fontWeight: "500",
                                                                cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                                                            }}
                                                        >
                                                            <CheckCircle2 size={12} /> Complete
                                                        </button>
                                                    )}
                                                    {canDel && (
                                                        <button
                                                            onClick={() => handleDelete(task.id)}
                                                            style={{
                                                                padding: "5px 8px", borderRadius: "var(--radius-md)",
                                                                background: "#fee2e2", color: "#b91c1c",
                                                                border: "none", fontSize: "12px",
                                                                cursor: "pointer", display: "flex", alignItems: "center",
                                                            }}
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Footer count */}
            <div style={{ display: "flex", gap: "var(--space-6)", marginTop: "var(--space-4)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", flexWrap: "wrap" }}>
                {Object.entries(counts).map(([key, val]) => (
                    <span key={key}><strong style={{ color: "var(--text-primary)" }}>{val}</strong> {key === "ALL" ? "Total" : key.replace("_", " ")}</span>
                ))}
            </div>

            {/* Modal rendered via portal — covers everything including sidebar/navbar */}
            {showModal && (
                <AssignModal
                    employees={employees}
                    onClose={() => setShowModal(false)}
                    onAssign={handleAssignSubmit}
                    submitting={submitting}
                    error={formError}
                />
            )}
        </div>
    );
}
