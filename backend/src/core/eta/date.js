'use strict';

function isInteger(value) {
    return typeof value === 'number' && Number.isInteger(value);
}

function daysInMonth(year, month) {
    const daysInMonths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month === 2 && isLeapYear(year)) {
        return 29;
    }
    return daysInMonths[month - 1];
}

function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function assertValidCivilDate(civilDate) {
    if (!civilDate || typeof civilDate !== 'object') {
        throw new TypeError('civilDate must be an object');
    }
    const { year, month, day } = civilDate;
    if (!isInteger(year) || !isInteger(month) || !isInteger(day)) {
        throw new TypeError('year, month, and day must be integers');
    }
    
    if (year < 1900 || year > 2100) {
        throw new RangeError('year must be between 1900 and 2100');
    }
    
    if (month < 1 || month > 12) {
        throw new RangeError('month must be between 1 and 12');
    }
    
    const maxDay = daysInMonth(year, month);
    if (day < 1 || day > maxDay) {
        throw new RangeError('day must be valid for the given month and year');
    }
}

function toUtcMs(year, month, day) {
    const d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCFullYear(year); 
    return d.getTime();
}

function fromUtcMs(ms) {
    const d = new Date(ms);
    return Object.freeze({
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate()
    });
}

function parseIsoDateOnly(value) {
    if (typeof value !== 'string') {
        throw new TypeError('value must be a string');
    }
    
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
        throw new TypeError('value must be in YYYY-MM-DD format');
    }
    
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const day = parseInt(match[3], 10);
    
    const civilDate = Object.freeze({ year, month, day });
    assertValidCivilDate(civilDate);
    
    return civilDate;
}

function addDays(civilDate, days) {
    assertValidCivilDate(civilDate);
    if (!isInteger(days)) {
        throw new TypeError('days must be an integer');
    }
    
    const ms = toUtcMs(civilDate.year, civilDate.month, civilDate.day);
    const newMs = ms + days * 86400000;
    
    const result = fromUtcMs(newMs);
    assertValidCivilDate(result);
    return result;
}

function weekday(civilDate) {
    assertValidCivilDate(civilDate);
    const ms = toUtcMs(civilDate.year, civilDate.month, civilDate.day);
    const d = new Date(ms);
    return d.getUTCDay();
}

function compare(a, b) {
    assertValidCivilDate(a);
    assertValidCivilDate(b);
    
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    return a.day - b.day;
}

function toIsoDate(civilDate) {
    assertValidCivilDate(civilDate);
    const y = String(civilDate.year).padStart(4, '0');
    const m = String(civilDate.month).padStart(2, '0');
    const d = String(civilDate.day).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

module.exports = {
    parseIsoDateOnly,
    addDays,
    weekday,
    compare,
    toIsoDate
};
