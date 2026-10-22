import { CatalogPointAvailability } from '../../core/models/catalog.models';
import { RawSchedule } from './results/schedule-utils';

export type PointResultAvailabilityFilter = 'all' | 'open' | 'closing-soon';
export type PointResultScheduleFilter = 'all' | 'morning' | 'afternoon' | 'extended';

export interface PointResultFilterState {
  readonly availability: PointResultAvailabilityFilter;
  readonly schedule: PointResultScheduleFilter;
}

export interface PointResultFilterCandidate {
  readonly catalogAvailability?: CatalogPointAvailability;
  readonly horarios_operativos?: readonly RawSchedule[];
}

export function projectPointResults<T extends PointResultFilterCandidate>(
  points: readonly T[],
  state: PointResultFilterState
): T[] {
  return points.filter(point => {
    const matchesAvailability = state.availability === 'all'
      || (state.availability === 'open' && point.catalogAvailability?.status === 'OPEN')
      || (state.availability === 'closing-soon' && isClosingSoon(point.catalogAvailability));
    return matchesAvailability && matchesSchedule(point.horarios_operativos, state.schedule);
  });
}

export function matchesSchedule(
  schedules: readonly RawSchedule[] | undefined,
  filter: PointResultScheduleFilter
): boolean {
  if (filter === 'all') return true;
  return schedules?.some(schedule => {
    const opening = parseClockMinutes(schedule.hora_apertura);
    const closing = parseClockMinutes(schedule.hora_cierre);
    if (opening === null || closing === null) return false;

    const normalizedClosing = closing <= opening ? closing + 24 * 60 : closing;
    if (filter === 'morning') return overlapsDailyBand(opening, normalizedClosing, 6 * 60, 12 * 60);
    if (filter === 'afternoon') return overlapsDailyBand(opening, normalizedClosing, 12 * 60, 18 * 60);
    return closing >= 18 * 60 || closing <= opening;
  }) ?? false;
}

export function isClosingSoon(availability?: CatalogPointAvailability): boolean {
  if (availability?.status !== 'OPEN' || !availability.closesAt || !availability.evaluatedAt) {
    return false;
  }

  const evaluatedAt = new Date(availability.evaluatedAt);
  if (Number.isNaN(evaluatedAt.getTime())) return false;

  const currentMinutes = minutesInTimeZone(evaluatedAt, availability.timeZone);
  const closingMinutes = parseClockMinutes(availability.closesAt);
  if (currentMinutes === null || closingMinutes === null) return false;

  const minutesUntilClose = closingMinutes >= currentMinutes
    ? closingMinutes - currentMinutes
    : closingMinutes + 24 * 60 - currentMinutes;
  return minutesUntilClose >= 1 && minutesUntilClose <= 120;
}

function minutesInTimeZone(instant: Date, timeZone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone
    }).formatToParts(instant);
    const hour = Number(parts.find(part => part.type === 'hour')?.value);
    const minute = Number(parts.find(part => part.type === 'minute')?.value);
    return Number.isInteger(hour) && Number.isInteger(minute) ? hour * 60 + minute : null;
  } catch {
    return null;
  }
}

function overlapsDailyBand(
  opening: number,
  normalizedClosing: number,
  bandStart: number,
  bandEnd: number
): boolean {
  return (opening < bandEnd && normalizedClosing > bandStart)
    || (opening < bandEnd + 24 * 60 && normalizedClosing > bandStart + 24 * 60);
}

function parseClockMinutes(value?: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : null;
}
