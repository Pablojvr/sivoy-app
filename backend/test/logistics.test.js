const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calcularIngresoOficial,
  validarFechaDeseada,
  proyectarProximasRutas
} = require('../services/logistics');

function point({ schedules, rules = [] }) {
  return {
    tipo: 'agencia',
    horarios_operativos: schedules,
    reglas_entrega: rules
  };
}

test('accepts a package at the exact closing time', () => {
  const origin = point({
    schedules: [{ dia_semana: 'Lunes', hora_apertura: '09:00', hora_cierre: '16:00' }]
  });

  const result = calcularIngresoOficial(origin, '2026-09-07', '16:00');

  assert.equal(result.date.toISOString().slice(0, 10), '2026-09-07');
});

test('moves official entry to the next operating day after closing', () => {
  const origin = point({
    schedules: [
      { dia_semana: 'Lunes', hora_apertura: '09:00', hora_cierre: '16:00' },
      { dia_semana: 'Martes', hora_apertura: '09:00', hora_cierre: '16:00' }
    ]
  });

  const result = calcularIngresoOficial(origin, '2026-09-07', '16:01');

  assert.equal(result.date.toISOString().slice(0, 10), '2026-09-08');
});

test('accepts a package during the second interval of a split schedule', () => {
  const origin = point({
    schedules: [
      { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '12:00' },
      { dia_semana: 'Lunes', hora_apertura: '13:00', hora_cierre: '16:00' }
    ]
  });

  const result = calcularIngresoOficial(origin, '2026-09-07', '14:00');

  assert.equal(result.date.toISOString().slice(0, 10), '2026-09-07');
});

test('keeps the same official day while waiting for the second interval', () => {
  const origin = point({
    schedules: [
      { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '12:00' },
      { dia_semana: 'Lunes', hora_apertura: '13:00', hora_cierre: '16:00' }
    ]
  });

  const result = calcularIngresoOficial(origin, '2026-09-07', '12:30');

  assert.equal(result.date.toISOString().slice(0, 10), '2026-09-07');
  assert.match(result.msg, /01:00 PM a 04:00 PM/);
});

test('applies a destination rule with previous-day cutoff', () => {
  const destination = point({
    schedules: [{ dia_semana: 'Martes', hora_apertura: '09:00', hora_cierre: '16:00' }],
    rules: [{ dia_entrega: 'Martes', dia_corte_maximo: 'Día anterior' }]
  });

  assert.equal(validarFechaDeseada(destination, new Date('2026-09-07T00:00:00'), '2026-09-08').esPosible, true);
  assert.equal(validarFechaDeseada(destination, new Date('2026-09-08T00:00:00'), '2026-09-08').esPosible, false);
});

test('projects the next promised weekday when this week cutoff already passed', () => {
  const destination = point({
    schedules: [{ dia_semana: 'Lunes', hora_apertura: '09:00', hora_cierre: '16:00' }],
    rules: [{ dia_entrega: 'Lunes', dia_corte_maximo: 'Día anterior' }]
  });

  const options = proyectarProximasRutas(destination, new Date('2026-09-07T00:00:00'), 1);

  assert.equal(options[0].fecha_llegada_iso, '2026-09-14');
});

test('reports every public service interval for the promised destination day', () => {
  const destination = point({
    schedules: [
      { dia_semana: 'Martes', hora_apertura: '08:00', hora_cierre: '12:00' },
      { dia_semana: 'Martes', hora_apertura: '13:00', hora_cierre: '16:00' }
    ],
    rules: [{ dia_entrega: 'Martes', dia_corte_maximo: 'Día anterior' }]
  });

  const options = proyectarProximasRutas(destination, new Date('2026-09-07T00:00:00'), 1);

  assert.equal(options[0].horario_recoleccion, '8:00 AM a 12:00 PM / 1:00 PM a 4:00 PM');
});
