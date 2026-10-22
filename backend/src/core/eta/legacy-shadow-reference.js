'use strict';

// Frozen runtime reference transcribed from backend/services/logistics.js at
// 87684cbbca2f9e959d9c78f7fc3cc02c8e7895a4. Keep this module independent
// from the active ETA core so a future shadow runner can detect regressions.
const DAY_NAMES = Object.freeze({
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado'
});

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

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toLocalIso(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part, index) => index === 0
      ? String(part).padStart(4, '0')
      : String(part).padStart(2, '0'))
    .join('-');
}

function schedulesForDate(entity, date) {
  const dayName = DAY_NAMES[date.getDay()];
  return (entity.horarios_operativos || [])
    .filter((schedule) => normalizeText(schedule.dia_semana) === normalizeText(dayName))
    .sort((left, right) => left.hora_apertura.localeCompare(right.hora_apertura));
}

function calculateOfficialEntry(origin, dropoffDateValue, dropoffTime, todayValue) {
  let currentDate = new Date(`${dropoffDateValue}T00:00:00`);

  if (origin.is_pin) {
    return { status: 'PIN', date: currentDate, nextInterval: null };
  }

  const schedulesToday = schedulesForDate(origin, currentDate);
  const activeSchedule = schedulesToday.find((schedule) =>
    dropoffTime >= schedule.hora_apertura && dropoffTime <= schedule.hora_cierre
  );
  const nextSchedule = schedulesToday.find((schedule) =>
    dropoffTime < schedule.hora_apertura
  );

  if (activeSchedule) {
    return {
      status: currentDate.toDateString() === todayValue.toDateString()
        ? 'ACTIVE_TODAY'
        : 'ACTIVE_FUTURE',
      date: currentDate,
      nextInterval: null
    };
  }

  if (nextSchedule) {
    return {
      status: 'BEFORE_NEXT_INTERVAL',
      date: currentDate,
      nextInterval: {
        openTime: nextSchedule.hora_apertura,
        closeTime: nextSchedule.hora_cierre
      }
    };
  }

  for (let offset = 0; offset < 7; offset += 1) {
    currentDate = addDays(currentDate, 1);
    if (schedulesForDate(origin, currentDate).length > 0) {
      return {
        status: 'CLOSED_UNTIL_NEXT_DAY',
        date: currentDate,
        nextInterval: null
      };
    }
  }

  return { status: 'NO_OPERATING_DAYS', date: null, nextInterval: null };
}

function getCutoffDate(desiredDate, cutoffValue) {
  const normalizedCutoff = normalizeText(cutoffValue);
  if (normalizedCutoff === 'dia anterior') return addDays(desiredDate, -1);
  if (normalizedCutoff === 'mismo dia') return desiredDate;

  const targetWeekday = dayIndex(normalizedCutoff);
  if (targetWeekday === -1) return addDays(desiredDate, -1);

  let cutoffDate = addDays(desiredDate, -1);
  while (cutoffDate.getDay() !== targetWeekday) {
    cutoffDate = addDays(cutoffDate, -1);
  }
  return cutoffDate;
}

function validateDesiredDate(destination, officialEntryDate, desiredDateValue) {
  const desiredDate = new Date(`${desiredDateValue}T00:00:00`);
  if (destination.is_pin) return { status: 'PIN', cutoffDate: null };

  const desiredDay = normalizeText(DAY_NAMES[desiredDate.getDay()]);
  const rule = (destination.reglas_entrega || []).find((candidate) => {
    const deliveryDay = normalizeText(candidate.dia_entrega);
    return deliveryDay === 'diario' || deliveryDay === desiredDay;
  });

  if (!rule) return { status: 'NO_DELIVERY', cutoffDate: null };

  const cutoffDate = getCutoffDate(desiredDate, rule.dia_corte_maximo);
  return {
    status: officialEntryDate.getTime() <= cutoffDate.getTime()
      ? 'APPROVED'
      : 'REJECTED_CUTOFF',
    cutoffDate
  };
}

function projectRoutes(destination, officialEntryDate, limit) {
  const routes = [];
  let evaluationDate = new Date(officialEntryDate.getTime());
  let evaluatedDays = 0;

  while (routes.length < limit && evaluatedDays < 60) {
    const evaluationIso = evaluationDate.toISOString().split('T')[0];
    const validation = validateDesiredDate(
      destination,
      officialEntryDate,
      evaluationIso
    );

    if (validation.status === 'APPROVED' || validation.status === 'PIN') {
      const schedules = schedulesForDate(destination, evaluationDate);
      if (schedules.length > 0 && schedules.every((schedule) =>
        schedule.hora_apertura && schedule.hora_cierre
      )) {
        routes.push({
          date: evaluationIso,
          intervals: schedules.map((schedule) => ({
            openTime: schedule.hora_apertura,
            closeTime: schedule.hora_cierre
          }))
        });
      }
    }

    evaluationDate = addDays(evaluationDate, 1);
    evaluatedDays += 1;
  }
  return routes;
}

function runLegacyEtaScenario(scenario) {
  const today = new Date(`${scenario.today ?? scenario.dropoffDate}T00:00:00`);
  const officialEntry = calculateOfficialEntry(
    scenario.origin,
    scenario.dropoffDate,
    scenario.dropoffTime,
    today
  );
  const routeValidation = officialEntry.date && scenario.desiredDate
    ? validateDesiredDate(
        scenario.destination,
        officialEntry.date,
        scenario.desiredDate
      )
    : null;
  const projectedRoutes = officialEntry.date
    ? projectRoutes(
        scenario.destination,
        officialEntry.date,
        scenario.limit ?? 3
      )
    : [];

  return {
    officialEntry: {
      status: officialEntry.status,
      officialDate: toLocalIso(officialEntry.date),
      nextInterval: officialEntry.nextInterval
        ? {
            openTime: officialEntry.nextInterval.openTime,
            closeTime: officialEntry.nextInterval.closeTime
          }
        : null
    },
    routeValidation: routeValidation
      ? {
          status: routeValidation.status,
          cutoffDate: toLocalIso(routeValidation.cutoffDate)
        }
      : null,
    projectedRoutes
  };
}

module.exports = { runLegacyEtaScenario };
