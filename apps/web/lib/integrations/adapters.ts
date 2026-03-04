// NEXUS — Integration Framework
// Pluggable adapters for external HR systems

// ─── Base Integration Interface ─────────────────────────

export interface IntegrationAdapter<TConfig = Record<string, string>> {
    name: string;
    type: "HRIS" | "PAYROLL" | "ACCESS_CONTROL" | "MDM" | "IDENTITY";
    status: "ACTIVE" | "INACTIVE" | "ERROR";
    config: TConfig;

    testConnection(): Promise<{ connected: boolean; message: string }>;
    syncUsers?(): Promise<SyncResult>;
    pushAttendance?(records: AttendanceSync[]): Promise<SyncResult>;
}

export interface SyncResult {
    success: boolean;
    created: number;
    updated: number;
    failed: number;
    errors: string[];
    syncedAt: string;
}

export interface AttendanceSync {
    employeeId: string;
    date: string;
    checkIn: string;
    checkOut: string | null;
    totalHours: number;
    status: string;
}

// ─── Workday Adapter ────────────────────────────────────

export class WorkdayAdapter implements IntegrationAdapter {
    name = "Workday";
    type = "HRIS" as const;
    status = "INACTIVE" as const;
    config: { tenantUrl: string; clientId: string; clientSecret: string };

    constructor(config: { tenantUrl: string; clientId: string; clientSecret: string }) {
        this.config = config;
    }

    async testConnection(): Promise<{ connected: boolean; message: string }> {
        try {
            // In production: test Workday REST API connectivity
            const isConfigured = !!(this.config.tenantUrl && this.config.clientId);
            return {
                connected: isConfigured,
                message: isConfigured ? "Workday connection configured" : "Missing configuration",
            };
        } catch (err) {
            return { connected: false, message: `Connection failed: ${err}` };
        }
    }

    async syncUsers(): Promise<SyncResult> {
        // In production: call Workday Human_Resources SOAP/REST API
        return {
            success: true,
            created: 0,
            updated: 0,
            failed: 0,
            errors: [],
            syncedAt: new Date().toISOString(),
        };
    }
}

// ─── ADP Adapter ────────────────────────────────────────

export class AdpAdapter implements IntegrationAdapter {
    name = "ADP";
    type = "PAYROLL" as const;
    status = "INACTIVE" as const;
    config: { apiUrl: string; clientId: string; clientSecret: string; certPath: string };

    constructor(config: { apiUrl: string; clientId: string; clientSecret: string; certPath: string }) {
        this.config = config;
    }

    async testConnection(): Promise<{ connected: boolean; message: string }> {
        const isConfigured = !!(this.config.apiUrl && this.config.clientId);
        return {
            connected: isConfigured,
            message: isConfigured ? "ADP Workforce Now configured" : "Missing ADP configuration",
        };
    }

    async pushAttendance(records: AttendanceSync[]): Promise<SyncResult> {
        // In production: push to ADP Time & Attendance API
        return {
            success: true,
            created: records.length,
            updated: 0,
            failed: 0,
            errors: [],
            syncedAt: new Date().toISOString(),
        };
    }
}

// ─── HID Global Adapter (Access Control) ────────────────

export class HidGlobalAdapter implements IntegrationAdapter {
    name = "HID Global";
    type = "ACCESS_CONTROL" as const;
    status = "INACTIVE" as const;
    config: { serverUrl: string; apiKey: string };

    constructor(config: { serverUrl: string; apiKey: string }) {
        this.config = config;
    }

    async testConnection(): Promise<{ connected: boolean; message: string }> {
        const isConfigured = !!(this.config.serverUrl && this.config.apiKey);
        return {
            connected: isConfigured,
            message: isConfigured ? "HID Global PACS configured" : "Missing HID configuration",
        };
    }
}

// ─── Microsoft Intune Adapter (MDM) ─────────────────────

export class IntuneAdapter implements IntegrationAdapter {
    name = "Microsoft Intune";
    type = "MDM" as const;
    status = "INACTIVE" as const;
    config: { tenantId: string; clientId: string; clientSecret: string };

    constructor(config: { tenantId: string; clientId: string; clientSecret: string }) {
        this.config = config;
    }

    async testConnection(): Promise<{ connected: boolean; message: string }> {
        const isConfigured = !!(this.config.tenantId && this.config.clientId);
        return {
            connected: isConfigured,
            message: isConfigured ? "Intune Graph API configured" : "Missing Intune configuration",
        };
    }
}

// ─── Integration Registry ───────────────────────────────

export type AdapterFactory = () => IntegrationAdapter;

const REGISTRY: Record<string, AdapterFactory> = {};

export function registerAdapter(name: string, factory: AdapterFactory): void {
    REGISTRY[name] = factory;
}

export function getAdapter(name: string): IntegrationAdapter | null {
    const factory = REGISTRY[name];
    return factory ? factory() : null;
}

export function listRegisteredAdapters(): string[] {
    return Object.keys(REGISTRY);
}
