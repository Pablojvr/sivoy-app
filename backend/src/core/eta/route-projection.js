'use strict';

const dateCore = require('./date');

const CUTOFF_TYPE = Object.freeze({
    PREVIOUS_DAY: 'PREVIOUS_DAY',
    SAME_DAY: 'SAME_DAY',
    WEEKDAY: 'WEEKDAY'
});

const ROUTE_RULE_STATUS = Object.freeze({
    APPROVED: 'APPROVED',
    REJECTED_CUTOFF: 'REJECTED_CUTOFF',
    NO_DELIVERY: 'NO_DELIVERY',
    PIN: 'PIN'
});

function cloneDate(d) {
    if (!d) return d;
    return Object.freeze({ year: d.year, month: d.month, day: d.day });
}

function cloneInterval(s) {
    if (!s) return s;
    return Object.freeze({ openTime: s.openTime, closeTime: s.closeTime });
}

function getCutoffDate(desiredDate, cutoffType, cutoffWeekday) {
    if (cutoffType === CUTOFF_TYPE.PREVIOUS_DAY) {
        return dateCore.addDays(desiredDate, -1);
    }
    if (cutoffType === CUTOFF_TYPE.SAME_DAY) {
        return cloneDate(desiredDate);
    }
    if (cutoffType === CUTOFF_TYPE.WEEKDAY) {
        if (!Number.isInteger(cutoffWeekday) || cutoffWeekday < 0 || cutoffWeekday > 6) {
            return dateCore.addDays(desiredDate, -1);
        }
        let cutoffDate = dateCore.addDays(desiredDate, -1);
        while (dateCore.weekday(cutoffDate) !== cutoffWeekday) {
            cutoffDate = dateCore.addDays(cutoffDate, -1);
        }
        return cutoffDate;
    }
    return dateCore.addDays(desiredDate, -1);
}

function validateDesiredDate(isPin, deliveryRules, officialEntryDate, desiredDate) {
    if (isPin) {
        return Object.freeze({
            status: ROUTE_RULE_STATUS.PIN
        });
    }

    const desiredWeekday = dateCore.weekday(desiredDate);

    const rule = deliveryRules.find(r => r.deliveryWeekday === null || r.deliveryWeekday === desiredWeekday);

    if (!rule) {
        return Object.freeze({
            status: ROUTE_RULE_STATUS.NO_DELIVERY
        });
    }

    const cutoffDate = getCutoffDate(desiredDate, rule.cutoffType, rule.cutoffWeekday);

    if (dateCore.compare(officialEntryDate, cutoffDate) <= 0) {
        return Object.freeze({
            status: ROUTE_RULE_STATUS.APPROVED,
            cutoffDate: cloneDate(cutoffDate)
        });
    } else {
        return Object.freeze({
            status: ROUTE_RULE_STATUS.REJECTED_CUTOFF,
            cutoffDate: cloneDate(cutoffDate)
        });
    }
}

function projectRoutes(isPin, deliveryRules, schedules, officialEntryDate, limit) {
    const options = [];
    let evalDate = officialEntryDate;
    let daysEvaluated = 0;

    while (options.length < limit && daysEvaluated < 60) {
        const validation = validateDesiredDate(isPin, deliveryRules, officialEntryDate, evalDate);
        if (validation.status === ROUTE_RULE_STATUS.APPROVED || validation.status === ROUTE_RULE_STATUS.PIN) {
            const evalWeekday = dateCore.weekday(evalDate);
            const daySchedules = schedules.filter(s => s.weekday === evalWeekday);

            if (daySchedules.length > 0 && daySchedules.every(s => s.openTime && s.closeTime)) {
                const sortedIntervals = [...daySchedules].sort((a, b) => a.openTime.localeCompare(b.openTime));

                options.push(Object.freeze({
                    date: cloneDate(evalDate),
                    intervals: Object.freeze(sortedIntervals.map(cloneInterval))
                }));
            }
        }

        evalDate = dateCore.addDays(evalDate, 1);
        daysEvaluated++;
    }

    return Object.freeze(options);
}

module.exports = {
    CUTOFF_TYPE,
    ROUTE_RULE_STATUS,
    getCutoffDate,
    validateDesiredDate,
    projectRoutes
};
