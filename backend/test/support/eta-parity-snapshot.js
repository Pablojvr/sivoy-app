'use strict';

const dateCore = require('../../src/core/eta/date');
const {
  calculateOfficialEntry
} = require('../../src/core/eta/official-entry');
const routeProjection = require('../../src/core/eta/route-projection');

const DAY_INDEX = Object.freeze({
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6
});

function normalizeText(value) {
  return value
    ? String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    : '';
}

function dayIndex(value) {
  const index = DAY_INDEX[normalizeText(value)];
  return index === undefined ? -1 : index;
}

function parseCivilDate(value) {
  return dateCore.parseIsoDateOnly(value);
}

function civilToIso(value) {
  return value ? dateCore.toIsoDate(value) : null;
}

function toLocalIso(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => index === 0 ? String(part).padStart(4, '0') : String(part).padStart(2, '0'))
    .join('-');
}

function parseTwelveHourTime(value) {
  const match = /^(\d{1,2}):(\d{2})\s+(AM|PM)$/.exec(String(value).trim());
  if (!match) throw new TypeError('Invalid projected schedule time');
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
    throw new TypeError('Invalid projected schedule time');
  }
  if (match[3] === 'AM') hours = hours === 12 ? 0 : hours;
  if (match[3] === 'PM') hours = hours === 12 ? 12 : hours + 12;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseProjectedIntervals(value) {
  if (!value) return [];
  return String(value).split(' / ').map((interval) => {
    const parts = interval.split(' a ');
    if (parts.length !== 2) throw new TypeError('Invalid projected schedule interval');
    return {
      openTime: parseTwelveHourTime(parts[0]),
      closeTime: parseTwelveHourTime(parts[1])
    };
  });
}

function mapSchedules(entity) {
  return (entity.horarios_operativos || [])
    .map((schedule) => ({
      weekday: dayIndex(schedule.dia_semana),
      openTime: schedule.hora_apertura,
      closeTime: schedule.hora_cierre
    }))
    .filter((schedule) => schedule.weekday !== -1);
}

function mapRules(destination) {
  return (destination.reglas_entrega || []).map((rule) => {
    const deliveryDay = normalizeText(rule.dia_entrega);
    const cutoff = normalizeText(rule.dia_corte_maximo);
    let cutoffType = routeProjection.CUTOFF_TYPE.PREVIOUS_DAY;
    let cutoffWeekday = null;

    if (cutoff === 'mismo dia') {
      cutoffType = routeProjection.CUTOFF_TYPE.SAME_DAY;
    } else if (cutoff !== 'dia anterior') {
      const index = dayIndex(cutoff);
      if (index !== -1) {
        cutoffType = routeProjection.CUTOFF_TYPE.WEEKDAY;
        cutoffWeekday = index;
      }
    }

    return {
      deliveryWeekday: deliveryDay === 'diario' ? null : dayIndex(deliveryDay),
      cutoffType,
      cutoffWeekday
    };
  });
}

function readLegacyParityMeta(engine, result) {
  const metadata = result?.[engine.LEGACY_PARITY_META];
  if (!metadata || typeof metadata.status !== 'string') {
    throw new Error('Legacy parity metadata is unavailable');
  }
  return metadata;
}

function runLegacyEtaScenario(engine, scenario) {
  const officialEntry = engine.calcularIngresoOficial(
    scenario.origin,
    scenario.dropoffDate,
    scenario.dropoffTime,
    new Date(`${scenario.today ?? scenario.dropoffDate}T00:00:00`)
  );
  const officialMeta = readLegacyParityMeta(engine, officialEntry);
  const validationResult = officialEntry.date && scenario.desiredDate
    ? engine.validarFechaDeseada(
        scenario.destination,
        officialEntry.date,
        scenario.desiredDate
      )
    : null;
  const validationMeta = validationResult
    ? readLegacyParityMeta(engine, validationResult)
    : null;
  const projectedRoutes = officialEntry.date
    ? engine.proyectarProximasRutas(
        scenario.destination,
        officialEntry.date,
        scenario.limit ?? 3
      )
    : [];

  return {
    officialEntry: {
      status: officialMeta.status,
      officialDate: toLocalIso(officialEntry.date),
      nextInterval: officialMeta.nextInterval
        ? {
            openTime: officialMeta.nextInterval.openTime,
            closeTime: officialMeta.nextInterval.closeTime
          }
        : null
    },
    routeValidation: validationMeta
      ? {
          status: validationMeta.status,
          cutoffDate: toLocalIso(validationMeta.cutoffDate)
        }
      : null,
    projectedRoutes: projectedRoutes.map((route) => ({
      date: route.fecha_llegada_iso,
      intervals: parseProjectedIntervals(route.horario_recoleccion)
    }))
  };
}

function normalizeCurrentOfficialEntry(result) {
  return {
    status: result.status,
    officialDate: civilToIso(result.officialDate),
    nextInterval: result.nextInterval
      ? { openTime: result.nextInterval.openTime, closeTime: result.nextInterval.closeTime }
      : null
  };
}

function normalizeCurrentValidation(result) {
  return {
    status: result.status,
    cutoffDate: civilToIso(result.cutoffDate)
  };
}

function runCurrentEtaScenario(scenario) {
  const dropoffDate = parseCivilDate(scenario.dropoffDate);
  const today = parseCivilDate(scenario.today ?? scenario.dropoffDate);
  const officialEntry = calculateOfficialEntry({
    isPin: !!scenario.origin.is_pin,
    dropoffDate,
    dropoffTime: scenario.dropoffTime,
    schedules: mapSchedules(scenario.origin),
    today
  });
  const rules = mapRules(scenario.destination);
  const schedules = mapSchedules(scenario.destination);
  const routeValidation = officialEntry.officialDate && scenario.desiredDate
    ? routeProjection.validateDesiredDate(
        !!scenario.destination.is_pin,
        rules,
        officialEntry.officialDate,
        parseCivilDate(scenario.desiredDate)
      )
    : null;
  const projectedRoutes = officialEntry.officialDate
    ? routeProjection.projectRoutes(
        !!scenario.destination.is_pin,
        rules,
        schedules,
        officialEntry.officialDate,
        scenario.limit ?? 3
      )
    : [];

  return {
    officialEntry: normalizeCurrentOfficialEntry(officialEntry),
    routeValidation: routeValidation ? normalizeCurrentValidation(routeValidation) : null,
    projectedRoutes: projectedRoutes.map((route) => ({
      date: civilToIso(route.date),
      intervals: route.intervals.map((interval) => ({
        openTime: interval.openTime,
        closeTime: interval.closeTime
      }))
    }))
  };
}

module.exports = {
  parseProjectedIntervals,
  runCurrentEtaScenario,
  runLegacyEtaScenario,
  toLocalIso
};
