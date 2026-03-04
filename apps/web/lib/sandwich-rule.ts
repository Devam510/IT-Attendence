// NEXUS — Sandwich Rule Checker
// Detects "sandwich" leaves (leave around weekends/holidays)
// Example: Friday leave + Monday leave = 4 days total (Fri + Sat + Sun + Mon)

export interface SandwichCheckResult {
    isSandwich: boolean;
    totalDays: number;        // Actual days including weekends
    workingDays: number;      // Only working days (what user applied for)
    sandwichDays: number;     // Extra weekend/holiday days caught in between
    message: string;
}

/**
 * Checks if a leave range "sandwiches" weekends, turning them into leave days.
 * This is common in Indian labor law — if you take Friday and Monday off,
 * Saturday and Sunday also count as leave.
 */
export function checkSandwichRule(
    startDate: Date,
    endDate: Date,
    holidays: Date[] = []
): SandwichCheckResult {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);

    const diffMs = end.getTime() - start.getTime();
    const totalCalendarDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;

    if (totalCalendarDays <= 0) {
        return { isSandwich: false, totalDays: 0, workingDays: 0, sandwichDays: 0, message: "Invalid date range" };
    }

    // Count working days and weekends
    let workingDays = 0;
    let weekendDays = 0;
    const holidaySet = new Set(holidays.map((h) => {
        const d = new Date(h);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    }));

    const cursor = new Date(start);
    for (let i = 0; i < totalCalendarDays; i++) {
        const dow = cursor.getDay();
        const isHoliday = holidaySet.has(cursor.getTime());
        if (dow === 0 || dow === 6 || isHoliday) {
            weekendDays++;
        } else {
            workingDays++;
        }
        cursor.setDate(cursor.getDate() + 1);
    }

    // Sandwich detected if weekends/holidays are "enclosed" by leave days
    const isSandwich = weekendDays > 0 && workingDays >= 2 && totalCalendarDays > workingDays;

    // Check if weekends are truly "sandwiched" (have working days on both sides)
    let hasBefore = false;
    let hasAfter = false;
    const beforeCursor = new Date(start);
    for (let i = 0; i < totalCalendarDays; i++) {
        const dow = beforeCursor.getDay();
        const isHoliday = holidaySet.has(beforeCursor.getTime());
        if (dow !== 0 && dow !== 6 && !isHoliday) {
            hasBefore = true;
            break;
        }
        beforeCursor.setDate(beforeCursor.getDate() + 1);
    }

    const afterCursor = new Date(end);
    for (let i = 0; i < totalCalendarDays; i++) {
        const dow = afterCursor.getDay();
        const isHoliday = holidaySet.has(afterCursor.getTime());
        if (dow !== 0 && dow !== 6 && !isHoliday) {
            hasAfter = true;
            break;
        }
        afterCursor.setDate(afterCursor.getDate() - 1);
    }

    const trueSandwich = isSandwich && hasBefore && hasAfter;

    return {
        isSandwich: trueSandwich,
        totalDays: totalCalendarDays,
        workingDays,
        sandwichDays: trueSandwich ? weekendDays : 0,
        message: trueSandwich
            ? `Sandwich leave detected: ${workingDays} working days + ${weekendDays} weekend/holiday days = ${totalCalendarDays} total`
            : `No sandwich: ${workingDays} working days`,
    };
}
