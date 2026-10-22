import { applyClosedDropoffFilter } from './shipment-route.filters';
import { SearchRouteItem, DeliveryOptionModel } from './shipment-search.models';

describe('applyClosedDropoffFilter', () => {
  const baseOption: DeliveryOptionModel = {
    arrivalDate: 'Mañana',
    arrivalDateIso: null,
    collectionSchedule: 'Tarde',
    dropoffDate: '2023-10-10',
    dropoffMessage: 'a 5:00 PM'
  };

  const createItem = (options: DeliveryOptionModel[], selectedIndex = 0): SearchRouteItem => ({
    route: { company: 'E', origin: { name: 'O', type: null, coordinates: null }, destination: { name: 'D', type: null, coordinates: null }, originMessage: '', options },
    presentation: { selectedOptionIndex: selectedIndex, selectedOption: options[selectedIndex] || null, hasClosedAlert: false, isExpanded: false }
  });

  it('keeps all options if none are today', () => {
    const items = [createItem([baseOption])];
    const now = new Date('2023-10-11T12:00:00');
    const result = applyClosedDropoffFilter(items, now);
    expect(result[0].route.options.length).toBe(1);
    expect(result).not.toBe(items);
    expect(result[0]).toBe(items[0]);
  });

  it('keeps option if current time is exactly at the limit minute', () => {
    const items = [createItem([{ ...baseOption, dropoffMessage: 'a 5:30 PM' }])];
    const now = new Date('2023-10-10T17:30:00');
    const result = applyClosedDropoffFilter(items, now);
    expect(result[0].route.options.length).toBe(1);
  });

  it('removes option if current time is past limit minute', () => {
    const items = [createItem([{ ...baseOption, dropoffMessage: 'a 5:30 PM' }])];
    const now = new Date('2023-10-10T17:31:00');
    const result = applyClosedDropoffFilter(items, now);
    expect(result[0].route.options.length).toBe(0);
    expect(result[0].presentation.hasClosedAlert).toBe(true);
    expect(result[0].presentation.selectedOption).toBeNull();
  });

  it('removes option if current hour is strictly past', () => {
    const items = [createItem([{ ...baseOption, dropoffMessage: 'a 5:30 PM' }])];
    const now = new Date('2023-10-10T18:00:00');
    const result = applyClosedDropoffFilter(items, now);
    expect(result[0].route.options.length).toBe(0);
  });

  it('handles 12 AM and 12 PM correctly', () => {
    const items = [
      createItem([{ ...baseOption, dropoffMessage: 'a 12:30 PM' }]),
      createItem([{ ...baseOption, dropoffMessage: 'a 12:30 AM' }])
    ];

    const nowPM = new Date('2023-10-10T12:31:00');
    const resultPM = applyClosedDropoffFilter(items, nowPM);
    expect(resultPM[0].route.options.length).toBe(0);
    expect(resultPM[1].route.options.length).toBe(0);

    const nowAM = new Date('2023-10-10T00:31:00');
    const resultAM = applyClosedDropoffFilter(items, nowAM);
    expect(resultAM[0].route.options.length).toBe(1);
    expect(resultAM[1].route.options.length).toBe(0);
  });

  it('supports real legacy message format closing after 1 PM', () => {
    const items = [createItem([{ ...baseOption, dropoffMessage: 'La agencia abre en el horario de 09:00 AM a 01:00 PM' }])];
    const now = new Date('2023-10-10T13:01:00');
    const result = applyClosedDropoffFilter(items, now);
    expect(result[0].route.options.length).toBe(0);
  });

  it('ignores strings with "hasta las" but missing "a HH" pattern', () => {
    const items = [createItem([{ ...baseOption, dropoffMessage: 'hasta las 5 de la tarde' }])];
    const now = new Date('2023-10-10T18:00:00');
    const result = applyClosedDropoffFilter(items, now);
    expect(result[0].route.options.length).toBe(1);
  });

  it('preserves selection identity when earlier option is removed', () => {
    const opt1 = { ...baseOption, dropoffMessage: 'a 1:00 PM' };
    const opt2 = { ...baseOption, dropoffMessage: 'a 5:00 PM' };
    const items = [createItem([opt1, opt2], 1)];

    const now = new Date('2023-10-10T14:00:00');
    const result = applyClosedDropoffFilter(items, now);

    expect(result[0].route.options.length).toBe(1);
    expect(result[0].presentation.selectedOptionIndex).toBe(0);
    expect(result[0].presentation.selectedOption).toBe(opt2);
  });

  it('falls back to first remaining option if selected option is removed', () => {
    const opt1 = { ...baseOption, dropoffMessage: 'a 1:00 PM' };
    const opt2 = { ...baseOption, dropoffMessage: 'a 5:00 PM' };
    const items = [createItem([opt1, opt2], 0)];

    const now = new Date('2023-10-10T14:00:00');
    const result = applyClosedDropoffFilter(items, now);

    expect(result[0].route.options.length).toBe(1);
    expect(result[0].presentation.selectedOptionIndex).toBe(0);
    expect(result[0].presentation.selectedOption).toBe(opt2);
  });
});