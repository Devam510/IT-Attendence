// Vibe Tech Labs — Shift & Overtime Rules Engine
// Jurisdiction-aware overtime calculation with configurable shift definitions

export interface ShiftDefinition {
    startTime: string; // "09:00"
    endTime: string; // "18:00"
    breakMinutes: number;
    timezone: string;
}

export interface OvertimeResult {
    regularHours: number;
    overtimeHours: number;
    totalHours: number;
    breakDeducted: number;
    isHalfDay: boolean;
    isOvertime: boolean;
    overtimeMultiplier: number;
}

// Default shift if none assigned
const DEFAULT_SHIFT: ShiftDefinition = {
    startTime: "09:00",
    endTime: "18:00",
    breakMinutes: 60,
    timezone: "Asia/Kolkata",
};

// ─── Time Parsing ───────────────────────────────────────

function timeToMinutes(time: string): number {
    const parts = time.split(":").map(Number);
    const h = parts[0] ?? 0;
    const m = parts[1] ?? 0;
    return h * 60 + m;
}

function getShiftDurationMinutes(shift: ShiftDefinition): number {
    const start = timeToMinutes(shift.startTime);
    let end = timeToMinutes(shift.endTime);
    if (end <= start) end += 24 * 60; // overnight shift
    return end - start - shift.breakMinutes;
}

// ─── Overtime Calculation ───────────────────────────────

export function calculateOvertime(
    checkInTime: Date,
    checkOutTime: Date,
    shift: ShiftDefinition = DEFAULT_SHIFT,
    country: string = "IN"
): OvertimeResult {
    const workedMs = checkOutTime.getTime() - checkInTime.getTime();
    const workedMinutes = Math.max(0, workedMs / (1000 * 60));

    // Deduct break if worked > 4 hours
    const breakDeducted = workedMinutes > 240 ? shift.breakMinutes : 0;
    const netMinutes = workedMinutes - breakDeducted;

    const totalHours = +(netMinutes / 60).toFixed(2);
    const shiftHours = +(getShiftDurationMinutes(shift) / 60).toFixed(2);

    const regularHours = Math.min(totalHours, shiftHours);
    const overtimeHours = Math.max(0, +(totalHours - shiftHours).toFixed(2));
    const isHalfDay = totalHours > 0 && totalHours < shiftHours / 2;

    // Jurisdiction-aware multiplier
    const overtimeMultiplier = getOvertimeMultiplier(country, overtimeHours);

    return {
        regularHours,
        overtimeHours,
        totalHours,
        breakDeducted,
        isHalfDay,
        isOvertime: overtimeHours > 0,
        overtimeMultiplier,
    };
}

// ─── Jurisdiction Overtime Multipliers ──────────────────

function getOvertimeMultiplier(country: string, overtimeHours: number): number {
    switch (country.toUpperCase()) {
        case "IN": // India — Factories Act: 2x for overtime
            return 2.0;
        case "US": // US — FLSA: 1.5x after 40h/week (simplified per-day here)
            return 1.5;
        case "DE": // Germany — typically 1.25x–1.5x
        case "EU":
            return 1.25;
        case "SG": // Singapore — 1.5x
        case "AE": // UAE — 1.25x normal, 1.5x night
            return 1.5;
        default:
            return overtimeHours > 2 ? 2.0 : 1.5; // Conservative default
    }
}

// ─── Shift Time Check ───────────────────────────────────

export function isWithinShiftWindow(
    checkInTime: Date,
    shift: ShiftDefinition = DEFAULT_SHIFT,
    graceMinutes: number = 15
): { onTime: boolean; minutesLate: number; minutesEarly: number } {
    const checkInMinutes = checkInTime.getHours() * 60 + checkInTime.getMinutes();
    const shiftStart = timeToMinutes(shift.startTime);

    const diff = checkInMinutes - shiftStart;

    return {
        onTime: diff <= graceMinutes,
        minutesLate: Math.max(0, diff - graceMinutes),
        minutesEarly: Math.max(0, -diff), // positive when early
    };
}
