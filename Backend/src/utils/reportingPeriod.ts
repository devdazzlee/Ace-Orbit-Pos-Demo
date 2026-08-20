/**
 * Reporting "day" boundaries for POS stats.
 * Config: src/config/reporting.constants.ts
 *
 * Counters reset at the boundary automatically — no cron or stored aggregates required.
 */

import {
    REPORTING_DAY_START_HOUR,
    REPORTING_TIMEZONE,
} from "../config/reporting.constants";

export { REPORTING_DAY_START_HOUR, REPORTING_TIMEZONE };

export interface ReportingPeriod {
    /** Inclusive start of the reporting period */
    start: Date;
    /** Exclusive end — next period begins here (e.g. next 11:00 AM) */
    end: Date;
}

export interface CreatedAtRangeFilter {
    gte: Date;
    lt: Date;
}

interface LocalDateTime {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
}

function getLocalDateTime(date: Date, timeZone: string): LocalDateTime {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);

    let hour = get("hour");
    if (hour === 24) hour = 0;

    return {
        year: get("year"),
        month: get("month"),
        day: get("day"),
        hour,
        minute: get("minute"),
    };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
    const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });

    const parts = Object.fromEntries(
        dtf
            .formatToParts(date)
            .filter((p) => p.type !== "literal")
            .map((p) => [p.type, p.value]),
    );

    const asUTC = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second),
    );

    return asUTC - date.getTime();
}

/** Wall-clock time in `timeZone` → UTC `Date`. */
export function wallTimeToUtc(
    year: number,
    month: number,
    day: number,
    hour: number,
    minute = 0,
    second = 0,
    timeZone = REPORTING_TIMEZONE,
): Date {
    const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
    const offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
    return new Date(utcGuess - offset);
}

function localDateAtHour(
    year: number,
    month: number,
    day: number,
    hour: number,
    timeZone: string,
): Date {
    return wallTimeToUtc(year, month, day, hour, 0, 0, timeZone);
}

function shiftLocalDate(
    year: number,
    month: number,
    day: number,
    deltaDays: number,
    timeZone: string,
): { year: number; month: number; day: number } {
    const noon = localDateAtHour(year, month, day, 12, timeZone);
    const shifted = new Date(noon.getTime() + deltaDays * 24 * 60 * 60 * 1000);
    const local = getLocalDateTime(shifted, timeZone);
    return { year: local.year, month: local.month, day: local.day };
}

export function getCurrentReportingPeriod(now = new Date()): ReportingPeriod {
    const timeZone = REPORTING_TIMEZONE;
    const startHour = REPORTING_DAY_START_HOUR;
    const local = getLocalDateTime(now, timeZone);

    let { year, month, day } = local;
    if (local.hour < startHour) {
        ({ year, month, day } = shiftLocalDate(year, month, day, -1, timeZone));
    }

    const start = localDateAtHour(year, month, day, startHour, timeZone);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

    return { start, end };
}

/** Reporting period that ended immediately before the current one. */
export function getPreviousReportingPeriod(now = new Date()): ReportingPeriod {
    const current = getCurrentReportingPeriod(now);
    return getCurrentReportingPeriod(new Date(current.start.getTime() - 1));
}

/**
 * Reporting period for a calendar label (YYYY-MM-DD) in the business timezone.
 * E.g. "2026-06-08" → June 8 11:00 AM PKT through June 9 11:00 AM PKT.
 */
export function getReportingPeriodForCalendarDate(dateStr: string): ReportingPeriod {
    const [year, month, day] = dateStr.split("-").map(Number);
    if (!year || !month || !day) {
        return getCurrentReportingPeriod();
    }

    const start = localDateAtHour(year, month, day, REPORTING_DAY_START_HOUR, REPORTING_TIMEZONE);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
}

/** Prisma-friendly `created_at` filter for the current reporting period. */
export function getReportingPeriodCreatedAtFilter(now = new Date()): CreatedAtRangeFilter {
    const { start, end } = getCurrentReportingPeriod(now);
    return { gte: start, lt: end };
}

export function isWithinReportingPeriod(
    date: Date | string,
    period: ReportingPeriod,
): boolean {
    const d = typeof date === "string" ? new Date(date) : date;
    if (Number.isNaN(d.getTime())) return false;
    return d.getTime() >= period.start.getTime() && d.getTime() < period.end.getTime();
}

export function isWithinCurrentReportingPeriod(date: Date | string, now = new Date()): boolean {
    return isWithinReportingPeriod(date, getCurrentReportingPeriod(now));
}

/** Last N reporting periods, oldest first (for charts / comparisons). */
export function getReportingPeriodsForLastNDays(count: number, now = new Date()): ReportingPeriod[] {
    const periods: ReportingPeriod[] = [];
    let ref = now;

    for (let i = 0; i < count; i++) {
        const period = getCurrentReportingPeriod(ref);
        periods.unshift(period);
        ref = new Date(period.start.getTime() - 1);
    }

    return periods;
}

export function formatReportingPeriodStartLabel(
    period: ReportingPeriod,
    timeZone = REPORTING_TIMEZONE,
): string {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(period.start);
}

export function formatReportingHourLabel(hour = REPORTING_DAY_START_HOUR): string {
    const h = hour % 12 === 0 ? 12 : hour % 12;
    const suffix = hour < 12 ? "AM" : "PM";
    return `${h}:00 ${suffix}`;
}

export function getReportingPeriodDescription(): string {
    const hourLabel = formatReportingHourLabel();
    return `${hourLabel} – ${hourLabel} reporting day`;
}

export function formatDateForReportingApi(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

export function isCurrentReportingPeriodCalendarDate(date: Date, now = new Date()): boolean {
    const period = getReportingPeriodForCalendarDate(formatDateForReportingApi(date));
    const current = getCurrentReportingPeriod(now);
    return period.start.getTime() === current.start.getTime();
}

export function getCurrentReportingPeriodDateLabel(now = new Date()): string {
    return formatReportingPeriodStartLabel(getCurrentReportingPeriod(now));
}
