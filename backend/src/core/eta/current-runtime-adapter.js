'use strict';

const dateCore = require('./date');
const { calculateOfficialEntry } = require('./official-entry');
const routeProjection = require('./route-projection');

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

function civilToIso(value) {
  return value ? dateCore.toIsoDate(value) : null;
}

function normalizeOfficialEntry(value) {
  return {
    status: value.status,
    officialDate: civilToIso(value.officialDate),
    nextInterval: value.nextInterval
      ? {
          openTime: value.nextInterval.openTime,
          closeTime: value.nextInterval.closeTime
        }
      : null
  };
}

function normalizeValidation(value) {
  return {
    status: value.status,
    cutoffDate: civilToIso(value.cutoffDate)
  };
}

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function runCurrentEtaScenario(scenario) {
  const dropoffDate = dateCore.parseIsoDateOnly(scenario.dropoffDate);
  const today = dateCore.parseIsoDateOnly(scenario.today ?? scenario.dropoffDate);
  const officialEntry = calculateOfficialEntry({
    isPin: Boolean(scenario.origin.is_pin),
    dropoffDate,
    dropoffTime: scenario.dropoffTime,
    schedules: mapSchedules(scenario.origin),
    today
  });
  const rules = mapRules(scenario.destination);
  const schedules = mapSchedules(scenario.destination);
  const routeValidation = officialEntry.officialDate && scenario.desiredDate
    ? routeProjection.validateDesiredDate(
        Boolean(scenario.destination.is_pin),
        rules,
        officialEntry.officialDate,
        dateCore.parseIsoDateOnly(scenario.desiredDate)
      )
    : null;
  const projectedRoutes = officialEntry.officialDate
    ? routeProjection.projectRoutes(
        Boolean(scenario.destination.is_pin),
        rules,
        schedules,
        officialEntry.officialDate,
        scenario.limit ?? 3
      )
    : [];

  return deepFreeze({
    officialEntry: normalizeOfficialEntry(officialEntry),
    routeValidation: routeValidation ? normalizeValidation(routeValidation) : null,
    projectedRoutes: projectedRoutes.map((route) => ({
      date: civilToIso(route.date),
      intervals: route.intervals.map((interval) => ({
        openTime: interval.openTime,
        closeTime: interval.closeTime
      }))
    }))
  });
}

module.exports = { runCurrentEtaScenario };
