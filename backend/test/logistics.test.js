const { test } = require('node:test');
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

test('preserves the localized civil day while adapting legacy Date values', () => {
  const origin = point({
    schedules: [{ dia_semana: 'Lunes', hora_apertura: '09:00', hora_cierre: '16:00' }]
  });

  const result = calcularIngresoOficial(origin, '2026-09-07', '10:00');

  assert.match(result.msg, /Lunes, 7 de Septiembre/);
});

test('preserves date-only values in cutoff messages', () => {
  const destination = point({
    schedules: [{ dia_semana: 'Lunes', hora_apertura: '09:00', hora_cierre: '16:00' }],
    rules: [{ dia_entrega: 'Lunes', dia_corte_maximo: 'Día anterior' }]
  });

  const result = validarFechaDeseada(destination, new Date('2026-09-06T00:00:00'), '2026-09-07');

  assert.equal(result.esPosible, true);
  assert.match(result.msg, /Ingreso \(2026-09-06\) es <= Corte \(2026-09-06\)/);
});

test('preserves the legacy result for an invalid dropoff date', () => {
  const origin = point({
    schedules: [{ dia_semana: 'Lunes', hora_apertura: '09:00', hora_cierre: '16:00' }]
  });

  const result = calcularIngresoOficial(origin, 'invalid-date', '16:00');

  assert.deepEqual(result, { date: null, msg: 'Error: El origen no tiene días operativos' });
});

test('preserves RangeError when route projection receives an invalid Date', () => {
  const destination = point({ schedules: [], rules: [] });

  assert.throws(() => proyectarProximasRutas(destination, new Date(NaN), 1), RangeError);
});

test('preserves legacy handling outside the civil-core year range', () => {
  const destination = point({
    schedules: [],
    rules: [{ dia_entrega: 'Diario', dia_corte_maximo: 'Día anterior' }]
  });

  const result = validarFechaDeseada(destination, new Date('2200-01-01T00:00:00'), '2200-01-02');

  assert.equal(result.esPosible, true);
  assert.match(result.msg, /Ingreso \(2200-01-01\) es <= Corte \(2200-01-01\)/);
});

const IDX_TO_DIA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const IDX_TO_MES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function toYYYYMMDD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test('adapter: handles pin dropoff with exact localized message', () => {
  const origin = { is_pin: true };
  const today = new Date();

  const result = calcularIngresoOficial(origin, toYYYYMMDD(today), '12:00');

  assert.equal(result.date.getFullYear(), today.getFullYear());
  assert.equal(result.date.getMonth(), today.getMonth());
  assert.equal(result.date.getDate(), today.getDate());

  const expectedDateStr = `${IDX_TO_DIA[today.getDay()]}, ${today.getDate()} de ${IDX_TO_MES[today.getMonth()]}`;
  const expectedMsg = `Recolección programada en tu ubicación el ${expectedDateStr}`;

  assert.equal(result.msg, expectedMsg);
});

test('adapter: handles open agency with exact localized message', () => {
  const today = new Date();
  const diaSemana = IDX_TO_DIA[today.getDay()];

  const origin = {
    tipo: 'agencia',
    horarios_operativos: [{ dia_semana: diaSemana, hora_apertura: '00:00', hora_cierre: '23:59' }]
  };

  const result = calcularIngresoOficial(origin, toYYYYMMDD(today), '12:00');

  assert.equal(result.date.getFullYear(), today.getFullYear());
  assert.equal(result.date.getMonth(), today.getMonth());
  assert.equal(result.date.getDate(), today.getDate());

  const expectedDateStr = `${diaSemana}, ${today.getDate()} de ${IDX_TO_MES[today.getMonth()]}`;
  assert.equal(result.msg, `Abierto el día de hoy, ${expectedDateStr}`);
});

test('adapter: handles non-agencia wording for before interval and closed', () => {
  const today = new Date();
  const diaSemana = IDX_TO_DIA[today.getDay()];

  const origin = {
    tipo: 'punto_fijo',
    horarios_operativos: [{ dia_semana: diaSemana, hora_apertura: '14:00', hora_cierre: '18:00' }]
  };

  const resultBefore = calcularIngresoOficial(origin, toYYYYMMDD(today), '12:00');

  assert.equal(resultBefore.date.getFullYear(), today.getFullYear());
  assert.equal(resultBefore.date.getMonth(), today.getMonth());
  assert.equal(resultBefore.date.getDate(), today.getDate());
  assert.equal(resultBefore.msg, 'El personal llega en el horario de 02:00 PM a 06:00 PM');

  const resultClosed = calcularIngresoOficial(origin, toYYYYMMDD(today), '19:00');
  assert.match(resultClosed.msg, /^las personas ya se retiraron del punto fijo/);
});

const routeProjectionMod = require('../src/core/eta/route-projection');

test('adapter: same-day noon vs same-day cutoff remains rejected and projection parity', (t) => {
  t.mock.method(routeProjectionMod, 'validateDesiredDate');
  t.mock.method(routeProjectionMod, 'projectRoutes');

  const destino = {
    reglas_entrega: [
      { dia_entrega: 'diario', dia_corte_maximo: 'mismo dia' }
    ],
    horarios_operativos: [
      { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '18:00' }
    ]
  };

  const midnightIngreso = new Date('2026-09-14T00:00:00');
  const resMidnight = validarFechaDeseada(destino, midnightIngreso, '2026-09-14');
  assert.strictEqual(resMidnight.esPosible, true);

  const noonIngreso = new Date('2026-09-14T12:00:00');
  const resNoon = validarFechaDeseada(destino, noonIngreso, '2026-09-14');

  assert.strictEqual(resNoon.esPosible, false);

  const projMidnight = proyectarProximasRutas(destino, midnightIngreso, 1);
  assert.strictEqual(projMidnight.length, 1);

  const projNoon = proyectarProximasRutas(destino, noonIngreso, 1);
  assert.strictEqual(projNoon[0].fecha_llegada_iso, '2026-09-21');
  assert.strictEqual(projMidnight[0].fecha_llegada_iso, '2026-09-14');

  assert.strictEqual(
    routeProjectionMod.validateDesiredDate.mock.callCount(),
    1,
    'expected one core validation call'
  );
  assert.strictEqual(
    routeProjectionMod.projectRoutes.mock.callCount(),
    1,
    'expected one core projection call'
  );
});

test('adapter: preserves legacy normalization and date-core boundary behavior', () => {
  const noMatchDestination = {
    reglas_entrega: [{ dia_entrega: 'Falso', dia_corte_maximo: 'Día anterior' }]
  };
  const noMatch = validarFechaDeseada(
    noMatchDestination,
    new Date('2026-09-14T00:00:00'),
    '2026-09-16'
  );
  assert.deepStrictEqual(noMatch, {
    esPosible: false,
    msg: 'El destino no recibe entregas los días miercoles.'
  });

  const boundaryDestination = {
    reglas_entrega: [{ dia_entrega: 'Diario', dia_corte_maximo: 'Mismo día' }],
    horarios_operativos: [
      { dia_semana: 'Viernes', hora_apertura: '08:00', hora_cierre: '17:00' }
    ]
  };
  const boundaryProjection = proyectarProximasRutas(
    boundaryDestination,
    new Date('2100-12-31T00:00:00'),
    1
  );
  assert.strictEqual(boundaryProjection[0].fecha_llegada_iso, '2100-12-31');
});

test('adapter: validarFechaDeseada on is_pin returns exact legacy success message', () => {
  const destination = { is_pin: true };
  const result = validarFechaDeseada(destination, new Date('2026-09-14T00:00:00'), '2026-09-15');
  assert.deepStrictEqual(result, { esPosible: true, msg: 'Entrega a domicilio confirmada.' });
});

test('adapter: proyectarProximasRutas on pin with Spanish schedule produces legacy option shape; pin without schedule remains empty', () => {
  const pinWithSchedule = {
    is_pin: true,
    horarios_operativos: [{ dia_semana: 'Lunes', hora_apertura: '09:00', hora_cierre: '18:00' }]
  };
  const pinNoSchedule = { is_pin: true };
  const baseDate = new Date('2026-09-14T00:00:00'); // Monday

  const withSchedRes = proyectarProximasRutas(pinWithSchedule, baseDate, 1);
  assert.strictEqual(withSchedRes.length, 1);
  assert.deepStrictEqual(withSchedRes[0], {
    fecha_llegada: 'Lunes, 14 de Septiembre',
    fecha_llegada_iso: '2026-09-14',
    horario_recoleccion: '9:00 AM a 6:00 PM'
  });

  const noSchedRes = proyectarProximasRutas(pinNoSchedule, baseDate, 1);
  assert.strictEqual(noSchedRes.length, 0);
});

test('adapter: unknown cutoff maps to previous-day semantics, unknown delivery day remains no-delivery', () => {
  const destination = {
    reglas_entrega: [{ dia_entrega: 'Lunes', dia_corte_maximo: 'Inventado' }],
    horarios_operativos: [{ dia_semana: 'Lunes', hora_apertura: '09:00', hora_cierre: '18:00' }]
  };

  const valid = validarFechaDeseada(destination, new Date('2026-09-13T00:00:00'), '2026-09-14');
  assert.strictEqual(valid.esPosible, true);

  const invalid = validarFechaDeseada(destination, new Date('2026-09-14T00:00:00'), '2026-09-14');
  assert.strictEqual(invalid.esPosible, false);

  const unknownDelivery = {
    reglas_entrega: [{ dia_entrega: 'DiaFalso', dia_corte_maximo: 'Mismo día' }],
    horarios_operativos: [{ dia_semana: 'Lunes', hora_apertura: '09:00', hora_cierre: '18:00' }]
  };

  const noDelivery = validarFechaDeseada(unknownDelivery, new Date('2026-09-14T00:00:00'), '2026-09-14');
  assert.strictEqual(noDelivery.esPosible, false);
});
