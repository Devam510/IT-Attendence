"use client";

import { useState, useEffect } from "react";
import { apiGet, apiPost } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";


interface Department {
    id: string;
    name: string;
}

interface UserData {
    id: string;
    fullName: string;
    email: string;
    employeeId: string;
    role: string;
    status: string;
    dateOfJoining: string;
    plainPassword?: string;
    department?: Department | null;
}

export default function UsersPage() {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Modal State
    const [showModal, setShowModal] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form State
    const [formData, setFormData] = useState({
        fullName: "",
        email: "",
        employeeId: "",
        role: "EMP",
        password: "",
        dateOfJoining: new Date().toISOString().split("T")[0]
    });

    // Eye toggle for passwords
    const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

    const togglePassword = (id: string) => {
        setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const fetchUsers = async () => {
        setLoading(true);
        const res = await apiGet<UserData[]>("/api/users");
        if (res.data) {
            setUsers(res.data);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        const res = await apiPost<UserData>("/api/users", formData);
        
        if (res.data) {
            setShowModal(false);
            setFormData({
                fullName: "", email: "", employeeId: "", role: "EMP", password: "", dateOfJoining: new Date().toISOString().split("T")[0]
            });
            await fetchUsers(); // Refresh list
        } else {
            setError(res.error || "Failed to create user");
        }
        setIsSubmitting(false);
    };

    const generatePassword = () => {
        const length = 12;
        const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
        let retVal = "";
        for (let i = 0, n = charset.length; i < length; ++i) {
            retVal += charset.charAt(Math.floor(Math.random() * n));
        }
        setFormData(prev => ({ ...prev, password: retVal }));
    };

    if (loading) {
        return (
            <div style={{ padding: "20px" }}>
                <div className="skeleton" style={{ height: "40px", width: "200px", marginBottom: "20px" }}></div>
                <div className="skeleton" style={{ height: "400px", borderRadius: "12px" }}></div>
            </div>
        );
    }

    return (
        <div style={{ padding: "0" }}>
            
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-6)" }}>
                <div>
                    <h1 style={{ fontSize: "var(--text-2xl)", fontWeight: "var(--font-bold)" }}>Users Management</h1>
                    <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", marginTop: "var(--space-1)" }}>
                        Manage {users.length} active employee accounts.
                    </p>
                </div>
                <button 
                    className="btn btn-primary"
                    onClick={() => setShowModal(true)}
                >
                    + Add Employee
                </button>
            </div>

            {/* Users Table */}
            <div style={{ background: "white", borderRadius: "12px", border: "1px solid var(--border-light)", overflow: "hidden", boxShadow: "0 2px 8px rgba(0,0,0,0.03)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                    <thead>
                        <tr style={{ background: "var(--bg-secondary)", borderBottom: "1px solid var(--border-light)", color: "var(--text-secondary)", fontSize: "var(--text-xs)", textTransform: "uppercase" }}>
                            <th style={{ padding: "16px 20px" }}>Employee</th>
                            <th style={{ padding: "16px 20px" }}>Emp ID</th>
                            <th style={{ padding: "16px 20px" }}>Role</th>
                            <th style={{ padding: "16px 20px" }}>Department</th>
                            <th style={{ padding: "16px 20px" }}>Joined</th>
                            <th style={{ padding: "16px 20px" }}>Password</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(u => (
                            <tr key={u.id} style={{ borderBottom: "1px solid var(--border-light)", fontSize: "var(--text-sm)" }}>
                                <td style={{ padding: "16px 20px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--color-primary-light)", color: "var(--color-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: 12 }}>
                                            {u.fullName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{u.fullName}</div>
                                            <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{u.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td style={{ padding: "16px 20px", color: "var(--text-secondary)" }}>{u.employeeId}</td>
                                <td style={{ padding: "16px 20px" }}>
                                    <span style={{ 
                                        padding: "4px 8px", 
                                        borderRadius: "6px", 
                                        fontSize: "11px", 
                                        fontWeight: 600,
                                        background: u.role === "SADM" ? "#fee2e2" : u.role === "HRA" ? "#e0e7ff" : "var(--bg-secondary)",
                                        color: u.role === "SADM" ? "#991b1b" : u.role === "HRA" ? "#3730a3" : "var(--text-secondary)"
                                    }}>
                                        {u.role}
                                    </span>
                                </td>
                                <td style={{ padding: "16px 20px", color: "var(--text-secondary)" }}>{u.department?.name || "Unassigned"}</td>
                                <td style={{ padding: "16px 20px", color: "var(--text-secondary)" }}>{new Date(u.dateOfJoining).toLocaleDateString()}</td>
                                <td style={{ padding: "16px 20px", color: "var(--text-secondary)" }}>
                                    {u.plainPassword ? (
                                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                            <code style={{ background: "var(--bg-secondary)", padding: "4px 8px", borderRadius: "4px", fontSize: "12px", fontFamily: "monospace" }}>
                                                {visiblePasswords[u.id] ? u.plainPassword : "••••••••"}
                                            </code>
                                            <button 
                                                onClick={() => togglePassword(u.id)}
                                                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "14px", color: "var(--text-tertiary)" }}
                                                title={visiblePasswords[u.id] ? "Hide Password" : "Show Password"}
                                            >
                                                {visiblePasswords[u.id] ? "🙈" : "👁️"}
                                            </button>
                                        </div>
                                    ) : (
                                        <span style={{ color: "var(--text-tertiary)" }}>{`<Encrypted>`}</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                        {users.length === 0 && (
                            <tr>
                                <td colSpan={6} style={{ textAlign: "center", padding: "40px", color: "var(--text-tertiary)" }}>No users found</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Add Employee Modal */}
            {showModal && (
                <div style={{
                    position: "fixed", inset: 0, zIndex: 9999,
                    background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
                    display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
                }}>
                    <div className="animate-slideUp" style={{
                        background: "var(--bg-primary)", borderRadius: 16, padding: "32px",
                        maxWidth: 500, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
                        maxHeight: "90vh", overflowY: "auto"
                    }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                            <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--font-bold)", margin: 0 }}>Add New Employee</h2>
                            <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "var(--text-tertiary)" }}>×</button>
                        </div>
                        
                        {error && <div style={{ padding: 12, background: "#fee2e2", color: "#991b1b", borderRadius: 8, marginBottom: 20, fontSize: "var(--text-sm)" }}>{error}</div>}

                        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            
                            <div style={{ display: "flex", gap: 16 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Full Name</label>
                                    <input required type="text" className="input" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid var(--border-light)" }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Employee ID</label>
                                    <input required type="text" className="input" value={formData.employeeId} onChange={e => setFormData({...formData, employeeId: e.target.value})} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid var(--border-light)" }} />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Email Address</label>
                                <input required type="email" className="input" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid var(--border-light)" }} />
                            </div>

                            <div style={{ display: "flex", gap: 16 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Role</label>
                                    <select required className="input" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid var(--border-light)", background: "white" }}>
                                        <option value="EMP">Employee</option>
                                        <option value="MGR">Manager</option>
                                        <option value="HRA">HR Admin</option>
                                        <option value="HRBP">HR Business Partner</option>
                                        <option value="SADM">Super Admin</option>
                                    </select>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Date of Joining</label>
                                    <input required type="date" className="input" value={formData.dateOfJoining} onChange={e => setFormData({...formData, dateOfJoining: e.target.value})} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid var(--border-light)" }} />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                                    Initial Password
                                    <button type="button" onClick={generatePassword} style={{ background: "none", border: "none", color: "var(--color-primary)", fontSize: "var(--text-xs)", cursor: "pointer", fontWeight: 600 }}>Generate</button>
                                </label>
                                <input required type="text" className="input" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder="Set password for user" style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid var(--border-light)" }} />
                            </div>

                            <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                                <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: "12px 0", borderRadius: 8, border: "1px solid var(--border-primary)", background: "transparent", color: "var(--text-primary)", fontWeight: 600, cursor: "pointer" }}>
                                    Cancel
                                </button>
                                <button type="submit" disabled={isSubmitting} style={{ flex: 1, padding: "12px 0", borderRadius: 8, border: "none", background: "var(--color-primary)", color: "white", fontWeight: 600, cursor: isSubmitting ? "not-allowed" : "pointer", opacity: isSubmitting ? 0.7 : 1 }}>
                                    {isSubmitting ? "Creating..." : "Add Employee"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
