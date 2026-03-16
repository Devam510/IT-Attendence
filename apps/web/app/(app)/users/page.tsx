"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api-client";
import { useAuth } from "@/context/AuthContext";
import { User, Shield, CheckCircle, Camera } from "lucide-react";
import { FaceEnrollmentModal } from "@/components/admin/FaceEnrollmentModal";

interface Department {
    id: string;
    name: string;
}

interface UserData {
    id: string;
    fullName: string;
    email: string;
    phone?: string | null;
    employeeId: string;
    role: string;
    status: string;
    dateOfJoining: string;
    plainPassword?: string;
    faceProfile?: { id: string } | null;
    department?: Department | null;
    manager?: { fullName: string } | null;
}

export default function UsersPage() {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState<UserData[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [managers, setManagers] = useState<{ id: string; fullName: string; role: string }[]>([]);
    const [mounted, setMounted] = useState(false);
    
    // Modal State
    const [showModal, setShowModal] = useState(false);
    
    // Face Registration State
    const [faceUserId, setFaceUserId] = useState<string | null>(null);
    const [faceUserName, setFaceUserName] = useState<string>("");
    const [editingUser, setEditingUser] = useState<UserData | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Delete Modal State
    const [userToDelete, setUserToDelete] = useState<UserData | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Form State
    const [formData, setFormData] = useState({
        fullName: "",
        email: "",
        phone: "",
        employeeId: "",
        role: "EMP",
        departmentId: "",
        managerId: "",
        password: "",
        dateOfJoining: new Date().toISOString().split("T")[0]
    });

    // Eye toggle for passwords
    const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

    const togglePassword = (id: string) => {
        setVisiblePasswords(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const fetchUsersAndStaticData = async () => {
        setLoading(true);
        const [usersRes, deptRes, mgrsRes] = await Promise.all([
            apiGet<UserData[]>("/api/users"),
            apiGet<Department[]>("/api/departments"),
            apiGet<{ managers: any[] }>("/api/users/managers")
        ]);
        if (usersRes.data) {
            setUsers(usersRes.data);
        }
        if (deptRes.data) {
            setDepartments(deptRes.data);
        }
        if (mgrsRes.data?.managers) {
            setManagers(mgrsRes.data.managers);
        }
        setLoading(false);
    };

    useEffect(() => {
        setMounted(true);
        fetchUsersAndStaticData();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            const { password, ...rest } = formData;
            const payload = editingUser ? { ...rest, id: editingUser.id, ...(password ? { password } : {}) } : formData;

            const res = editingUser 
                ? await apiPatch<UserData>("/api/users", payload) 
                : await apiPost<UserData>("/api/users", payload);
            
            if (res.data) {
                setShowModal(false);
                setEditingUser(null);
                setFormData({
                    fullName: "", email: "", phone: "", employeeId: "", role: "EMP", departmentId: "", managerId: "", password: "", dateOfJoining: new Date().toISOString().split("T")[0]
                });
                await fetchUsersAndStaticData(); // Refresh list
            } else {
                setError(res.error || `Failed to ${editingUser ? "update" : "create"} user`);
            }
        } catch (err) {
            setError("An unexpected error occurred");
        }
        setIsSubmitting(false);
    };

    const handleEditClick = (user: UserData) => {
        setEditingUser(user);
        const mgr = managers.find(m => m.fullName === user.manager?.fullName);
        setFormData({
            fullName: user.fullName || "",
            email: user.email || "",
            phone: user.phone || "",
            employeeId: user.employeeId || "",
            role: user.role || "EMP",
            departmentId: user.department?.id || "",
            managerId: mgr ? mgr.id : "",
            password: "", 
            dateOfJoining: user.dateOfJoining ? new Date(user.dateOfJoining).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]
        });
        setShowModal(true);
    };


    const handleDelete = async () => {
        if (!userToDelete) return;
        setIsDeleting(true);
        setError(null);

        const res = await apiDelete(`/api/users?id=${userToDelete.id}`);
        if (res.data || (res as any).success) { // Handle both cases for success formatting
            setUserToDelete(null);
            await fetchUsersAndStaticData();
        } else {
            setError(res.error || "Failed to delete user");
        }
        setIsDeleting(false);
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
                    onClick={() => {
                        setEditingUser(null);
                        setFormData({
                            fullName: "", email: "", phone: "", employeeId: "", role: "EMP", departmentId: "", managerId: "", password: "", dateOfJoining: new Date().toISOString().split("T")[0]
                        });
                        setShowModal(true);
                    }}
                >
                    + Add Employee
                </button>
            </div>

            {/* Search Input */}
            <div style={{ marginBottom: "var(--space-4)" }}>
                <input
                    type="text"
                    placeholder="Search by name, email, or ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                        width: "100%",
                        maxWidth: "400px",
                        padding: "10px 16px",
                        borderRadius: "8px",
                        border: "1px solid var(--border-light)",
                        background: "var(--bg-card)",
                        fontSize: "var(--text-sm)",
                    }}
                />
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
                            <th style={{ padding: "16px 20px" }}>Reports To</th>
                            <th style={{ padding: "16px 20px" }}>Joined</th>
                            <th style={{ padding: "16px 20px" }}>Password</th>
                            <th style={{ padding: "16px 20px", textAlign: "right" }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users
                            .filter(u => 
                                !searchQuery || 
                                u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                u.email.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                u.employeeId.toLowerCase().includes(searchQuery.toLowerCase())
                            )
                            .map(u => (
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
                                <td style={{ padding: "16px 20px", color: "var(--text-secondary)", fontWeight: 500 }}>
                                    {u.manager ? u.manager.fullName : <span style={{ color: "var(--text-tertiary)" }}>Unassigned</span>}
                                </td>
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
                                <td style={{ padding: "16px 20px", textAlign: "right", minWidth: 200 }}>
                                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                                        {u.faceProfile ? (
                                            <span 
                                                style={{ padding: "8px 12px", background: "#dcfce7", color: "#16a34a", fontSize: "13px", fontWeight: 600, borderRadius: "6px", display: "flex", alignItems: "center", gap: 4 }}
                                                title="Face biometric registered"
                                            >
                                                <CheckCircle size={14} /> Enrolled
                                            </span>
                                        ) : (
                                            <button 
                                                onClick={() => {
                                                    setFaceUserId(u.id);
                                                    setFaceUserName(u.fullName);
                                                }}
                                                style={{ background: "var(--color-primary-light)", border: "none", color: "var(--color-primary)", cursor: "pointer", fontSize: "14px", fontWeight: 600, padding: "8px 12px", borderRadius: "6px", display: "flex", alignItems: "center", gap: 4 }}
                                                title="Register Face biometric"
                                            >
                                                <User size={14} /> Add Face
                                            </button>
                                        )}
                                        <button 
                                            onClick={() => handleEditClick(u)}
                                            style={{ background: "none", border: "none", color: "var(--color-primary)", cursor: "pointer", fontSize: "14px", fontWeight: 600, padding: "8px", borderRadius: "6px" }}
                                        >
                                            Edit
                                        </button>
                                        {!(currentUser?.role === "HRA" && u.role === "SADM") && (
                                            <button
                                                onClick={() => setUserToDelete(u)}
                                                style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "14px", fontWeight: 600, padding: "8px", borderRadius: "6px" }}
                                                title="Delete User"
                                                disabled={u.id === currentUser?.id} // Prevent self-deletion
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </div>
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
            {showModal && mounted && createPortal(
                <div style={{
                    position: "fixed", inset: 0, zIndex: 99999,
                    background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
                    display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
                }}>
                    <div className="animate-slideUp" style={{
                        background: "var(--bg-primary)", borderRadius: 16, padding: "32px",
                        maxWidth: 600, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
                        maxHeight: "90vh", overflowY: "auto"
                    }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                            <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--font-bold)", margin: 0 }}>{editingUser ? "Edit Employee" : "Add New Employee"}</h2>
                            <button onClick={() => setShowModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 24, padding: "0 8px", color: "var(--text-tertiary)" }}>×</button>
                        </div>
                        
                        {error && <div style={{ padding: 12, background: "#fee2e2", color: "#991b1b", borderRadius: 8, marginBottom: 20, fontSize: "var(--text-sm)" }}>{error}</div>}

                        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                            
                            <div style={{ display: "flex", gap: 16 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Full Name</label>
                                    <input required type="text" className="input" value={formData.fullName} onChange={e => setFormData({...formData, fullName: e.target.value})} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #d1d5db", backgroundColor: "#f9fafb", color: "#111827" }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Employee ID</label>
                                    <input required type="text" className="input" value={formData.employeeId} onChange={e => setFormData({...formData, employeeId: e.target.value})} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #d1d5db", backgroundColor: "#f9fafb", color: "#111827" }} />
                                </div>
                            </div>

                            <div style={{ display: "flex", gap: 16 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Email Address</label>
                                    <input required type="email" className="input" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #d1d5db", backgroundColor: "#f9fafb", color: "#111827" }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Phone Number</label>
                                    <input required type="tel" className="input" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #d1d5db", backgroundColor: "#f9fafb", color: "#111827" }} />
                                </div>
                            </div>

                            <div style={{ display: "flex", gap: 16 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Role</label>
                                    <select required className="input" value={formData.role} onChange={e => {
                                        const newRole = e.target.value;
                                        setFormData(f => ({
                                            ...f,
                                            role: newRole,
                                            // Clear dept + manager when switching to SADM — they don't need them
                                            ...(newRole === "SADM" ? { departmentId: "", managerId: "" } : {}),
                                        }));
                                    }} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #d1d5db", backgroundColor: "#f9fafb", color: "#111827" }}>
                                        <option value="EMP">Employee</option>
                                        <option value="MGR">Manager</option>
                                        <option value="HRA">HR Admin</option>
                                        <option value="SADM">Super Admin</option>
                                    </select>
                                </div>
                                {formData.role !== "SADM" && (
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Department</label>
                                    <select className="input" value={formData.departmentId} onChange={e => setFormData({...formData, departmentId: e.target.value})} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #d1d5db", backgroundColor: "#f9fafb", color: "#111827" }}>
                                        <option value="">Unassigned</option>
                                        {departments.map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>
                                )}
                            </div>

                            <div style={{ display: "flex", gap: 16 }}>
                                {formData.role !== "SADM" && (
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Reports To (Manager / Superior)</label>
                                    <select className="input" value={formData.managerId} onChange={e => setFormData({...formData, managerId: e.target.value})} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #d1d5db", backgroundColor: "#f9fafb", color: "#111827", cursor: "pointer" }}>
                                        <option value="">Select Superior</option>
                                        {managers
                                            .filter(m => formData.role === "HRA" ? m.role === "SADM" : true)
                                            .map(m => (
                                                <option key={m.id} value={m.id}>{m.fullName} — {m.role}</option>
                                            ))
                                        }
                                    </select>
                                </div>
                                )}
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: "block", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>Date of Joining</label>
                                    <input required type="date" className="input" value={formData.dateOfJoining} onChange={e => setFormData({...formData, dateOfJoining: e.target.value})} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #d1d5db", backgroundColor: "#f9fafb", color: "#111827" }} />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                                    Initial Password
                                    <button type="button" onClick={generatePassword} style={{ background: "none", border: "none", color: "var(--color-primary)", fontSize: "var(--text-xs)", cursor: "pointer", fontWeight: 600 }}>Generate</button>
                                </label>
                                <input required={!editingUser} type="text" className="input" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} placeholder={editingUser ? "Leave blank to keep password" : "Set password for user"} style={{ width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #d1d5db", backgroundColor: "#f9fafb", color: "#111827" }} />
                            </div>

                            {editingUser && (
                                <div style={{ marginTop: 8, padding: "16px", background: "var(--bg-secondary)", borderRadius: 8, border: "1px solid var(--border-light)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div style={{ flex: 1, paddingRight: 16 }}>
                                        <h4 style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text-primary)", margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                                            Face Biometric
                                            {editingUser.faceProfile && <CheckCircle size={14} color="#16a34a" />}
                                        </h4>
                                        <p style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginTop: 4, margin: 0, lineHeight: 1.4 }}>
                                            {editingUser.faceProfile ? "Face data is successfully registered for this employee." : "No face data found for this employee."}
                                        </p>
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            // Make sure modal states don't conflict, wait for one to render
                                            setFaceUserId(editingUser.id);
                                            setFaceUserName(editingUser.fullName);
                                        }}
                                        style={{ whiteSpace: "nowrap", background: editingUser.faceProfile ? "white" : "var(--color-primary)", border: editingUser.faceProfile ? "1px solid #d1d5db" : "none", color: editingUser.faceProfile ? "#374151" : "white", cursor: "pointer", fontSize: "13px", fontWeight: 600, padding: "8px 16px", borderRadius: "6px", display: "flex", alignItems: "center", gap: 6 }}
                                    >
                                        <Camera size={14} /> {editingUser.faceProfile ? "Update Face" : "Register Face"}
                                    </button>
                                </div>
                            )}

                            <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                                <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: "12px 0", borderRadius: 8, border: "1px solid #d1d5db", background: "white", color: "#374151", fontWeight: 600, cursor: "pointer" }}>
                                    Cancel
                                </button>
                                <button type="submit" disabled={isSubmitting} style={{ flex: 1, padding: "12px 0", borderRadius: 8, border: "none", background: "var(--color-primary)", color: "white", fontWeight: 600, cursor: isSubmitting ? "not-allowed" : "pointer", opacity: isSubmitting ? 0.7 : 1 }}>
                                    {isSubmitting ? (editingUser ? "Saving..." : "Creating...") : (editingUser ? "Save Changes" : "Add Employee")}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>, 
                document.body
            )}

            {/* Delete Confirmation Modal */}
            {userToDelete && mounted && createPortal(
                <div style={{
                    position: "fixed", inset: 0, zIndex: 99999,
                    background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
                    display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
                }}>
                    <div className="animate-slideUp" style={{
                        background: "var(--bg-primary)", borderRadius: 16, padding: "32px",
                        maxWidth: 400, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.4)"
                    }}>
                        <h2 style={{ fontSize: "var(--text-xl)", fontWeight: "var(--font-bold)", margin: 0, color: "#991b1b", marginBottom: 12 }}>Remove Employee</h2>
                        <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.5, marginBottom: 24 }}>
                            Are you sure you want to remove <strong>{userToDelete.fullName}</strong>? This will revoke their access to the system. This action cannot be undone.
                        </p>
                        
                        {error && <div style={{ padding: 12, background: "#fee2e2", color: "#991b1b", borderRadius: 8, marginBottom: 20, fontSize: "var(--text-sm)" }}>{error}</div>}

                        <div style={{ display: "flex", gap: 12 }}>
                            <button type="button" onClick={() => { setUserToDelete(null); setError(null); }} disabled={isDeleting} style={{ flex: 1, padding: "12px 0", borderRadius: 8, border: "1px solid #d1d5db", background: "white", color: "#374151", fontWeight: 600, cursor: "pointer" }}>
                                Cancel
                            </button>
                            <button type="button" onClick={handleDelete} disabled={isDeleting} style={{ flex: 1, padding: "12px 0", borderRadius: 8, border: "none", background: "#ef4444", color: "white", fontWeight: 600, cursor: isDeleting ? "not-allowed" : "pointer", opacity: isDeleting ? 0.7 : 1 }}>
                                {isDeleting ? "Removing..." : "Remove"}
                            </button>
                        </div>
                    </div>
                </div>, 
                document.body
            )}

            {faceUserId && mounted && createPortal(
                <FaceEnrollmentModal
                    isOpen={!!faceUserId}
                    onClose={() => { setFaceUserId(null); fetchUsersAndStaticData(); }}
                    userId={faceUserId}
                    userName={faceUserName}
                    onEnrollmentSuccess={() => {
                        setFaceUserId(null);
                        fetchUsersAndStaticData();
                    }}
                />,
                document.body
            )}
        </div>
    );
}
