'use strict';

// Frozen, semantically faithful test transcription of backend/services/logistics.js
// at 87684cbbca2f9e959d9c78f7fc3cc02c8e7895a4. Non-enumerable branch metadata
// is the only instrumentation; keep this fixture independent from src/core/eta.
const LEGACY_REFERENCE_COMMIT = '87684cbbca2f9e959d9c78f7fc3cc02c8e7895a4';
const LEGACY_PARITY_META = Symbol('legacyEtaParityMeta');

const IDX_TO_DIA = {0: 'Domingo', 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado'};
const IDX_TO_MES = {0: 'Enero', 1: 'Febrero', 2: 'Marzo', 3: 'Abril', 4: 'Mayo', 5: 'Junio', 6: 'Julio', 7: 'Agosto', 8: 'Septiembre', 9: 'Octubre', 10: 'Noviembre', 11: 'Diciembre'};

function withParityMeta(publicResult, metadata) {
  Object.defineProperty(publicResult, LEGACY_PARITY_META, {
    configurable: false,
    enumerable: false,
    writable: false,
    value: Object.freeze({ ...metadata })
  });
  return publicResult;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getDiaFromDate(date) {
  return IDX_TO_DIA[date.getDay()];
}

function formatTime12(timeStr) {
  if (!timeStr) return '';
  let [hours, minutes] = timeStr.split(':');
  hours = parseInt(hours, 10);
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours < 10 ? `0${hours}` : hours}:${minutes} ${period}`;
}

function formatFriendlyDate(date) {
  const dayName = getDiaFromDate(date);
  const day = date.getDate();
  const month = IDX_TO_MES[date.getMonth()];
  return `${dayName}, ${day} de ${month}`;
}

function getDayIndexFromString(dayValue) {
  const normalize = (value) => value
    ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    : '';
  const day = normalize(dayValue);
  const indexes = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
  return indexes[day] !== undefined ? indexes[day] : -1;
}

function calcularIngresoOficial(origin, dropoffDateValue, dropoffTime, today = new Date()) {
  let currentDate = new Date(`${dropoffDateValue}T00:00:00`);

  if (origin.is_pin) {
    return withParityMeta({
      date: currentDate,
      msg: `Recolección programada en tu ubicación el ${formatFriendlyDate(currentDate)}`
    }, { status: 'PIN', nextInterval: null });
  }

  const dayName = getDiaFromDate(currentDate);
  const normalize = (value) => value
    ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    : '';
  const schedulesToday = (origin.horarios_operativos || [])
    .filter((schedule) => normalize(schedule.dia_semana) === normalize(dayName))
    .sort((left, right) => left.hora_apertura.localeCompare(right.hora_apertura));
  const activeSchedule = schedulesToday.find((schedule) =>
    dropoffTime >= schedule.hora_apertura && dropoffTime <= schedule.hora_cierre
  );
  const nextSchedule = schedulesToday.find((schedule) => dropoffTime < schedule.hora_apertura);

  if (activeSchedule) {
    const isToday = currentDate.toDateString() === today.toDateString();
    return withParityMeta({
      date: currentDate,
      msg: isToday
        ? `Abierto el día de hoy, ${formatFriendlyDate(currentDate)}`
        : `A tiempo el ${formatFriendlyDate(currentDate)}`
    }, {
      status: isToday ? 'ACTIVE_TODAY' : 'ACTIVE_FUTURE',
      nextInterval: null
    });
  }

  if (nextSchedule) {
    const originType = origin.tipo?.toLowerCase() === 'agencia' ? 'La agencia abre' : 'El personal llega';
    return withParityMeta({
      date: currentDate,
      msg: `${originType} en el horario de ${formatTime12(nextSchedule.hora_apertura)} a ${formatTime12(nextSchedule.hora_cierre)}`
    }, {
      status: 'BEFORE_NEXT_INTERVAL',
      nextInterval: Object.freeze({
        openTime: nextSchedule.hora_apertura,
        closeTime: nextSchedule.hora_cierre
      })
    });
  }

  const closedCopy = origin.tipo?.toLowerCase() === 'agencia'
    ? 'la agencia ya cerró este día'
    : 'las personas ya se retiraron del punto fijo';

  for (let offset = 0; offset < 7; offset += 1) {
    currentDate = addDays(currentDate, 1);
    const evaluatedDay = getDiaFromDate(currentDate);
    if (origin.horarios_operativos?.some((schedule) =>
      normalize(schedule.dia_semana) === normalize(evaluatedDay)
    )) {
      return withParityMeta({
        date: currentDate,
        msg: `${closedCopy}, se calculó tu entrega para el día siguiente operativo (${formatFriendlyDate(currentDate)}).`
      }, { status: 'CLOSED_UNTIL_NEXT_DAY', nextInterval: null });
    }
  }
  return withParityMeta(
    { date: null, msg: 'Error: El origen no tiene días operativos' },
    { status: 'NO_OPERATING_DAYS', nextInterval: null }
  );
}

function getCutoffDate(desiredDate, cutoffValue) {
  const normalize = (value) => value
    ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    : '';
  const normalizedCutoff = normalize(cutoffValue);
  if (normalizedCutoff === 'dia anterior') return addDays(desiredDate, -1);
  if (normalizedCutoff === 'mismo dia') return desiredDate;

  const targetWeekday = getDayIndexFromString(normalizedCutoff);
  if (targetWeekday === -1) return addDays(desiredDate, -1);

  let cutoffDate = addDays(desiredDate, -1);
  while (cutoffDate.getDay() !== targetWeekday) cutoffDate = addDays(cutoffDate, -1);
  return cutoffDate;
}

function validarFechaDeseada(destination, officialEntryDate, desiredDateValue) {
  const desiredDate = new Date(`${desiredDateValue}T00:00:00`);
  if (destination.is_pin) {
    return withParityMeta(
      { esPosible: true, msg: 'Entrega a domicilio confirmada.' },
      { status: 'PIN', cutoffDate: null }
    );
  }

  const normalize = (value) => value
    ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    : '';
  const desiredDay = normalize(getDiaFromDate(desiredDate));
  const rule = (destination.reglas_entrega || []).find((candidate) => {
    const deliveryDay = normalize(candidate.dia_entrega);
    return deliveryDay === 'diario' || deliveryDay === desiredDay;
  });

  if (!rule) {
    return withParityMeta({
      esPosible: false,
      msg: `El destino no recibe entregas los días ${desiredDay}.`
    }, { status: 'NO_DELIVERY', cutoffDate: null });
  }

  const cutoffDate = getCutoffDate(desiredDate, rule.dia_corte_maximo);
  const cutoffDateCopy = formatFriendlyDate(cutoffDate);
  const officialIso = officialEntryDate.toISOString().split('T')[0];
  const cutoffIso = cutoffDate.toISOString().split('T')[0];
  if (officialEntryDate.getTime() <= cutoffDate.getTime()) {
    return withParityMeta({
      esPosible: true,
      msg: `Aprobado. Ingreso (${officialIso}) es <= Corte (${cutoffIso}).`,
      corteDateStr: cutoffDateCopy
    }, { status: 'APPROVED', cutoffDate: new Date(cutoffDate.getTime()) });
  }
  return withParityMeta({
    esPosible: false,
    msg: `Rechazado. El ingreso es (${officialIso}) pero la ruta cortaba el (${cutoffIso}).`,
    corteDateStr: cutoffDateCopy
  }, { status: 'REJECTED_CUTOFF', cutoffDate: new Date(cutoffDate.getTime()) });
}

function formatProjectedTime(timeValue) {
  if (typeof timeValue === 'number') {
    const hours = Math.floor(timeValue / 60);
    const minutes = timeValue % 60;
    const period = hours >= 12 ? 'PM' : 'AM';
    return `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} ${period}`;
  }
  const parts = String(timeValue).split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const period = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function proyectarProximasRutas(destination, officialEntryDate, limit = 3) {
  const options = [];
  let evaluationDate = new Date(officialEntryDate.getTime());
  let evaluatedDays = 0;

  while (options.length < limit && evaluatedDays < 60) {
    const evaluationIso = evaluationDate.toISOString().split('T')[0];
    const validation = validarFechaDeseada(destination, officialEntryDate, evaluationIso);
    if (validation.esPosible) {
      const evaluatedDay = getDiaFromDate(evaluationDate);
      const normalize = (value) => value
        ? value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        : '';
      const schedules = (destination.horarios_operativos || [])
        .filter((schedule) => normalize(schedule.dia_semana) === normalize(evaluatedDay))
        .sort((left, right) => left.hora_apertura.localeCompare(right.hora_apertura));

      if (schedules.length === 0 || schedules.some((schedule) =>
        !schedule.hora_apertura || !schedule.hora_cierre
      )) {
        evaluationDate = addDays(evaluationDate, 1);
        evaluatedDays += 1;
        continue;
      }

      options.push({
        fecha_llegada: formatFriendlyDate(evaluationDate),
        fecha_llegada_iso: evaluationIso,
        horario_recoleccion: schedules
          .map((schedule) =>
            `${formatProjectedTime(schedule.hora_apertura)} a ${formatProjectedTime(schedule.hora_cierre)}`
          )
          .join(' / ')
      });
    }
    evaluationDate = addDays(evaluationDate, 1);
    evaluatedDays += 1;
  }
  return options;
}

module.exports = {
  LEGACY_PARITY_META,
  LEGACY_REFERENCE_COMMIT,
  calcularIngresoOficial,
  validarFechaDeseada,
  proyectarProximasRutas
};
