/**
 * Business reporting day configuration (Ace Orbits POS).
 * Day runs 11:00 AM → next day 11:00 AM in Asia/Karachi.
 * Change here if the business rule changes — no .env required.
 */
export const REPORTING_CONFIG = {
    dayStartHour: 11,
    timezone: "Asia/Karachi",
};

export const REPORTING_DAY_START_HOUR: number = REPORTING_CONFIG.dayStartHour;
export const REPORTING_TIMEZONE: string = REPORTING_CONFIG.timezone;
