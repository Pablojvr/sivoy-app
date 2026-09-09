import { RawSchedule, formatScheduleTime, groupConsecutiveSchedules } from './schedule-utils';

describe('schedule-utils', () => {
  describe('formatScheduleTime', () => {
    it('formats 24h to 12h AM/PM properly', () => {
      expect(formatScheduleTime('08:30')).toBe('08:30 AM');
      expect(formatScheduleTime('13:45')).toBe('01:45 PM');
      expect(formatScheduleTime('12:00')).toBe('12:00 PM');
      expect(formatScheduleTime('00:15')).toBe('12:15 AM');
    });

    it('returns empty string for null, undefined, or invalid input', () => {
      expect(formatScheduleTime(null)).toBe('');
      expect(formatScheduleTime(undefined)).toBe('');
      expect(formatScheduleTime('')).toBe('');
      expect(formatScheduleTime('invalid')).toBe('');
    });
  });

  describe('groupConsecutiveSchedules', () => {
    it('groups single day', () => {
      const input: RawSchedule[] = [{ dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' }];
      expect(groupConsecutiveSchedules(input)).toEqual([
        { dias: 'Lunes', apertura: '08:00', cierre: '17:00' }
      ]);
    });

    it('groups two consecutive days with "y"', () => {
      const input: RawSchedule[] = [
        { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' },
        { dia_semana: 'Martes', hora_apertura: '08:00', hora_cierre: '17:00' }
      ];
      expect(groupConsecutiveSchedules(input)).toEqual([
        { dias: 'Lunes y Martes', apertura: '08:00', cierre: '17:00' }
      ]);
    });

    it('groups three or more consecutive days with "a"', () => {
      const input: RawSchedule[] = [
        { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' },
        { dia_semana: 'Martes', hora_apertura: '08:00', hora_cierre: '17:00' },
        { dia_semana: 'Miércoles', hora_apertura: '08:00', hora_cierre: '17:00' }
      ];
      expect(groupConsecutiveSchedules(input)).toEqual([
        { dias: 'Lunes a Miércoles', apertura: '08:00', cierre: '17:00' }
      ]);
    });

    it('joins disjoint ranges with comma', () => {
      const input: RawSchedule[] = [
        { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' },
        { dia_semana: 'Miércoles', hora_apertura: '08:00', hora_cierre: '17:00' },
        { dia_semana: 'Viernes', hora_apertura: '08:00', hora_cierre: '17:00' },
        { dia_semana: 'Sábado', hora_apertura: '08:00', hora_cierre: '17:00' }
      ];
      expect(groupConsecutiveSchedules(input)).toEqual([
        { dias: 'Lunes, Miércoles, Viernes y Sábado', apertura: '08:00', cierre: '17:00' }
      ]);
    });

    it('separates distinct time intervals and sorts by first weekday', () => {
      const input: RawSchedule[] = [
        { dia_semana: 'Sábado', hora_apertura: '09:00', hora_cierre: '12:00' },
        { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' },
        { dia_semana: 'Martes', hora_apertura: '08:00', hora_cierre: '17:00' }
      ];
      expect(groupConsecutiveSchedules(input)).toEqual([
        { dias: 'Lunes y Martes', apertura: '08:00', cierre: '17:00' },
        { dias: 'Sábado', apertura: '09:00', cierre: '12:00' }
      ]);
    });

    it('ignores invalid rows, unknown days, missing times', () => {
      const input: RawSchedule[] = [
        { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' },
        { dia_semana: 'Funday', hora_apertura: '08:00', hora_cierre: '17:00' }, // invalid day
        { dia_semana: 'Martes', hora_apertura: null, hora_cierre: '17:00' }, // missing opening
        { dia_semana: 'Miércoles' }, // missing times
        { dia_semana: 'Jueves', hora_apertura: '08:00', hora_cierre: '17:00' }
      ];
      expect(groupConsecutiveSchedules(input)).toEqual([
        { dias: 'Lunes, Jueves', apertura: '08:00', cierre: '17:00' } // Since they are disjoint
      ]);
    });

    it('returns empty array for null, undefined, or empty', () => {
      expect(groupConsecutiveSchedules(null)).toEqual([]);
      expect(groupConsecutiveSchedules(undefined)).toEqual([]);
      expect(groupConsecutiveSchedules([])).toEqual([]);
    });

    it('handles duplicate weekday rows deterministically without duplicate day labels', () => {
      const input: RawSchedule[] = [
        { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' },
        { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' },
        { dia_semana: 'Martes', hora_apertura: '08:00', hora_cierre: '17:00' }
      ];
      expect(groupConsecutiveSchedules(input)).toEqual([
        { dias: 'Lunes y Martes', apertura: '08:00', cierre: '17:00' }
      ]);
    });

    it('does not mutate input', () => {
      const input: RawSchedule[] = [{ dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' }];
      const inputCopy = JSON.parse(JSON.stringify(input));
      groupConsecutiveSchedules(input);
      expect(input).toEqual(inputCopy);
    });
  });
});
