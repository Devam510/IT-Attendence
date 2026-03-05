// Vibe Tech Labs Shared — Zod Validation Schemas
// Used across web API routes for request/response validation

import { z } from "zod";

// ─── Auth Schemas ───────────────────────────────────────

export const DeviceRegisterSchema = z.object({
    deviceFingerprint: z.string().min(10).max(512),
    platform: z.enum(["IOS", "ANDROID"]),
    osVersion: z.string().max(20).optional(),
    model: z.string().max(100).optional(),
    isJailbroken: z.boolean().default(false),
    mdmEnrolled: z.boolean().default(false),
});

export const TokenRefreshSchema = z.object({
    refreshToken: z.string().min(1),
});

// ─── Attendance Schemas ─────────────────────────────────

export const CheckInSchema = z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    altitude: z.number().optional(),
    accuracy: z.number().min(0).max(1000),
    speed: z.number().min(0).optional(),
    biometricVerified: z.boolean(),
    deviceId: z.string().uuid(),
    qrToken: z.string().optional(),
    wifiBssid: z.string().optional(),
    timestamp: z.string().datetime().optional(),
});

export const CheckOutSchema = z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(1000),
    deviceId: z.string().uuid(),
});

export const RegularizeSchema = z.object({
    date: z.string().date(),
    reason: z.string().min(5).max(500),
    checkInAt: z.string().datetime().optional(),
    checkOutAt: z.string().datetime().optional(),
});

export const AttendanceHistoryQuery = z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/),
});

// ─── Leave Schemas ──────────────────────────────────────

export const LeaveApplySchema = z.object({
    leaveTypeId: z.string().uuid(),
    startDate: z.string().date(),
    endDate: z.string().date(),
    halfDay: z.enum(["NONE", "FIRST_HALF", "SECOND_HALF"]).default("NONE"),
    reason: z.string().max(500).optional(),
});

export const LeaveCancelSchema = z.object({
    reason: z.string().max(500).optional(),
});

// ─── Approval Schemas ───────────────────────────────────

export const ApprovalRespondSchema = z.object({
    action: z.enum(["approve", "reject"]),
    comment: z.string().max(500).optional(),
});

export const ApprovalDelegateSchema = z.object({
    delegateToUserId: z.string().uuid(),
    reason: z.string().max(500).optional(),
});

export const ApprovalBulkSchema = z.object({
    ids: z.array(z.string().uuid()).min(1).max(50),
    action: z.enum(["approve", "reject"]),
    comment: z.string().max(500).optional(),
});

// ─── Notification Schemas ───────────────────────────────

export const NotificationReadSchema = z.object({
    ids: z.array(z.string().uuid()).min(1).max(100),
});

// ─── Common Types ───────────────────────────────────────

export type DeviceRegisterInput = z.infer<typeof DeviceRegisterSchema>;
export type CheckInInput = z.infer<typeof CheckInSchema>;
export type CheckOutInput = z.infer<typeof CheckOutSchema>;
export type LeaveApplyInput = z.infer<typeof LeaveApplySchema>;
export type ApprovalRespondInput = z.infer<typeof ApprovalRespondSchema>;
export type ApprovalBulkInput = z.infer<typeof ApprovalBulkSchema>;

// ─── API Response Envelope ──────────────────────────────

export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
    meta?: {
        page?: number;
        limit?: number;
        total?: number;
    };
}

// ─── JWT Payload ────────────────────────────────────────

export interface JwtPayload {
    sub: string; // userId
    role: string;
    entityId: string;
    deviceId?: string;
    iat: number;
    exp: number;
}
