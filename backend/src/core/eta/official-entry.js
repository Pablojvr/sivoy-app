const dateCore = require('./date');

const OFFICIAL_ENTRY_STATUS = Object.freeze({
    PIN: 'PIN',
    ACTIVE_TODAY: 'ACTIVE_TODAY',
    ACTIVE_FUTURE: 'ACTIVE_FUTURE',
    BEFORE_NEXT_INTERVAL: 'BEFORE_NEXT_INTERVAL',
    CLOSED_UNTIL_NEXT_DAY: 'CLOSED_UNTIL_NEXT_DAY',
    NO_OPERATING_DAYS: 'NO_OPERATING_DAYS'
});

function createResult(status, officialDate, nextInterval) {
    const result = { status };
    if (officialDate !== null) {
        result.officialDate = Object.freeze({ ...officialDate });
    } else {
        result.officialDate = null;
    }
    if (nextInterval) {
        result.nextInterval = Object.freeze({ ...nextInterval });
    }
    return Object.freeze(result);
}

function calculateOfficialEntry({ isPin, dropoffDate, dropoffTime, schedules, today }) {
    if (isPin) {
        return createResult(OFFICIAL_ENTRY_STATUS.PIN, dropoffDate);
    }

    const dropoffWeekday = dateCore.weekday(dropoffDate);

    const schedulesToday = schedules
        .filter(s => s.weekday === dropoffWeekday)
        .sort((a, b) => a.openTime.localeCompare(b.openTime));

    const activeSchedule = schedulesToday.find(s =>
        dropoffTime >= s.openTime && dropoffTime <= s.closeTime
    );

    if (activeSchedule) {
        const isToday = dateCore.compare(dropoffDate, today) === 0;
        return createResult(
            isToday ? OFFICIAL_ENTRY_STATUS.ACTIVE_TODAY : OFFICIAL_ENTRY_STATUS.ACTIVE_FUTURE,
            dropoffDate
        );
    }

    const nextSchedule = schedulesToday.find(s => dropoffTime < s.openTime);

    if (nextSchedule) {
        return createResult(
            OFFICIAL_ENTRY_STATUS.BEFORE_NEXT_INTERVAL,
            dropoffDate,
            {
                openTime: nextSchedule.openTime,
                closeTime: nextSchedule.closeTime
            }
        );
    }

    let nextDate = dropoffDate;
    for (let i = 1; i <= 7; i++) {
        nextDate = dateCore.addDays(nextDate, 1);
        const nextWeekday = dateCore.weekday(nextDate);
        const hasSchedule = schedules.some(s => s.weekday === nextWeekday);
        if (hasSchedule) {
            return createResult(OFFICIAL_ENTRY_STATUS.CLOSED_UNTIL_NEXT_DAY, nextDate);
        }
    }

    return createResult(OFFICIAL_ENTRY_STATUS.NO_OPERATING_DAYS, null);
}

module.exports = {
    OFFICIAL_ENTRY_STATUS,
    calculateOfficialEntry
};
