import { describe, expect, it } from 'vitest';

import {
  isClosingSoon,
  projectPointResults,
  type PointResultFilterState
} from './point-results.filters';

const defaults: PointResultFilterState = { availability: 'all', schedule: 'all' };

describe('point result filters', () => {
  it('preserves catalog relevance order by default', () => {
    const points = [point('b'), point('a'), point('c')];

    expect(projectPointResults(points, defaults).map(item => item.id)).toEqual(['b', 'a', 'c']);
  });

  it('filters open points from canonical availability', () => {
    const points = [point('open', availability('OPEN', '12:00')), point('closed', availability('CLOSED', null))];

    expect(projectPointResults(points, { availability: 'open', schedule: 'all' }).map(item => item.id))
      .toEqual(['open']);
  });

  it.each([
    ['morning', [schedule('08:00', '12:00')]],
    ['afternoon', [schedule('13:00', '17:00')]],
    ['extended', [schedule('09:00', '18:00')]]
  ] as const)('filters points that serve the %s schedule band', (filter, schedules) => {
    const points = [
      point('matching', availability('OPEN', '18:00'), schedules),
      point('without-hours', availability('OPEN', '18:00'), [])
    ];

    expect(projectPointResults(points, { availability: 'all', schedule: filter }).map(item => item.id))
      .toEqual(['matching']);
  });

  it('combines availability and schedule without changing catalog order', () => {
    const points = [
      point('closed-morning', availability('CLOSED', null), [schedule('08:00', '12:00')]),
      point('open-afternoon', availability('OPEN', '17:00'), [schedule('13:00', '17:00')]),
      point('open-morning', availability('OPEN', '12:00'), [schedule('08:00', '12:00')])
    ];

    expect(projectPointResults(points, { availability: 'open', schedule: 'morning' }).map(item => item.id))
      .toEqual(['open-morning']);
  });

  it('projects overnight schedules into the following morning without inventing an afternoon overlap', () => {
    const points = [point('overnight', availability('OPEN', '10:00'), [schedule('23:00', '10:00')])];

    expect(projectPointResults(points, { availability: 'all', schedule: 'morning' })).toHaveLength(1);
    expect(projectPointResults(points, { availability: 'all', schedule: 'extended' })).toHaveLength(1);
    expect(projectPointResults(points, { availability: 'all', schedule: 'afternoon' })).toHaveLength(0);
  });

  it.each([
    ['same minute', '10:00', false],
    ['one minute', '10:01', true],
    ['120 minutes', '12:00', true],
    ['121 minutes', '12:01', false]
  ])('uses the closing-soon boundary at %s', (_label, closesAt, expected) => {
    expect(isClosingSoon(availability('OPEN', closesAt))).toBe(expected);
  });

  it('supports a closing time after midnight and rejects incomplete data', () => {
    expect(isClosingSoon({
      ...availability('OPEN', '00:30'),
      evaluatedAt: '2026-10-19T23:30:00-06:00'
    })).toBe(true);
    expect(isClosingSoon({ ...availability('OPEN', '11:00'), evaluatedAt: '' })).toBe(false);
    expect(isClosingSoon(availability('CLOSED', '11:00'))).toBe(false);
  });
});

function point(
  id: string,
  catalogAvailability = availability('OPEN', '16:00'),
  horarios_operativos: readonly ReturnType<typeof schedule>[] = [schedule('08:00', '17:00')]
) {
  return {
    id,
    catalogAvailability,
    horarios_operativos
  };
}

function schedule(hora_apertura: string, hora_cierre: string) {
  return { dia_semana: 'Lunes', hora_apertura, hora_cierre };
}

function availability(status: 'OPEN' | 'CLOSED', closesAt: string | null) {
  return {
    status,
    closesAt,
    nextOpeningAt: null,
    evaluatedAt: '2026-10-19T10:00:00-06:00',
    timeZone: 'America/El_Salvador'
  };
}
