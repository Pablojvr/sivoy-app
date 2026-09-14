const IDX_TO_DIA = {0: "Domingo", 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado"};
const IDX_TO_MES = {0: "Enero", 1: "Febrero", 2: "Marzo", 3: "Abril", 4: "Mayo", 5: "Junio", 6: "Julio", 7: "Agosto", 8: "Septiembre", 9: "Octubre", 10: "Noviembre", 11: "Diciembre"};
const dateCore = require('../src/core/eta/date');

function canUseDateCore(date) {
    const year = date.getFullYear();
    return !Number.isNaN(date.getTime()) && year >= 1900 && year <= 2100;
}

function dateToCivil(date) {
    if (Number.isNaN(date.getTime())) {
        date.toISOString();
    }
    return {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate()
    };
}

function civilToDate(civilDate) {
    return new Date(civilDate.year, civilDate.month - 1, civilDate.day);
}

// Helper to add days
function addDays(date, days) {
    if (!canUseDateCore(date) || !staysWithinDateCore(date, days)) {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }
    const civil = dateToCivil(date);
    return civilToDate(dateCore.addDays(civil, days));
}

// Helper to get string name of day
function getDiaFromDate(date) {
    if (!canUseDateCore(date)) {
        return IDX_TO_DIA[date.getDay()];
    }
    const civil = dateToCivil(date);
    return IDX_TO_DIA[dateCore.weekday(civil)];
}

function formatTime12(timeStr) {
    if (!timeStr) return '';
    let [h, m] = timeStr.split(":");
    h = parseInt(h, 10);
    let ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h < 10 ? '0'+h : h}:${m} ${ampm}`;
}

function formatFriendlyDate(date) {
    if (!canUseDateCore(date)) {
        return `${getDiaFromDate(date)}, ${date.getDate()} de ${IDX_TO_MES[date.getMonth()]}`;
    }
    const civil = dateToCivil(date);
    const dayName = IDX_TO_DIA[dateCore.weekday(civil)];
    const day = civil.day;
    const month = IDX_TO_MES[civil.month - 1];
    return `${dayName}, ${day} de ${month}`;
}

function getDayIndexFromString(diaStr) {
    const normalize = (s) => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
    const d = normalize(diaStr);
    const m = { "domingo": 0, "lunes": 1, "martes": 2, "miercoles": 3, "jueves": 4, "viernes": 5, "sabado": 6 };
    return m[d] !== undefined ? m[d] : -1;
}

function findDestino(data, nombre) {
    if (!nombre) return null;
    if (nombre.startsWith('📍 Pin')) {
        return { is_pin: true, nombre_destino: 'Ubicación Personalizada' };
    }
    const nLower = nombre.toLowerCase();
    for (const d of data) {
        if (!d || typeof d !== 'object') continue;
        if ((d.nombre_destino && d.nombre_destino.toLowerCase() === nLower) ||
            (d.id_destino && d.id_destino.toLowerCase() === nLower)) {
            return d;
        }
    }
    return null;
}

const { OFFICIAL_ENTRY_STATUS, calculateOfficialEntry } = require('../src/core/eta/official-entry');
const routeProjection = require('../src/core/eta/route-projection');

// TODO: Removal of this legacy fallback depends on boundary date validation (T08); do not drop it just because of T09e.
function calcularIngresoOficialLegacy(origen, currentDate, horaDropoff, today) {
    if (origen.is_pin) {
        return {
            date: currentDate,
            msg: `Recolección programada en tu ubicación el ${formatFriendlyDate(currentDate)}`
        };
    }

    let diaStr = getDiaFromDate(currentDate);
    const normalize = (s) => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
    const horariosHoy = (origen.horarios_operativos || [])
        .filter(h => normalize(h.dia_semana) === normalize(diaStr))
        .sort((a, b) => a.hora_apertura.localeCompare(b.hora_apertura));
    const horarioActivo = horariosHoy.find(h =>
        horaDropoff >= h.hora_apertura && horaDropoff <= h.hora_cierre
    );
    const proximoHorario = horariosHoy.find(h => horaDropoff < h.hora_apertura);

    if (horarioActivo) {
        let isToday = currentDate.toDateString() === today.toDateString();
        return {
            date: currentDate,
            msg: isToday ? `Abierto el día de hoy, ${formatFriendlyDate(currentDate)}` : `A tiempo el ${formatFriendlyDate(currentDate)}`
        };
    }

    if (proximoHorario) {
        let tipoOrigen = origen.tipo?.toLowerCase() === 'agencia' ? 'La agencia abre' : 'El personal llega';
        return {
            date: currentDate,
            msg: `${tipoOrigen} en el horario de ${formatTime12(proximoHorario.hora_apertura)} a ${formatTime12(proximoHorario.hora_cierre)}`
        };
    }

    let tipoOrigenCerrado = origen.tipo?.toLowerCase() === 'agencia' ? 'la agencia ya cerró este día' : 'las personas ya se retiraron del punto fijo';

    for (let i = 0; i < 7; i++) {
        currentDate = addDays(currentDate, 1);
        let diaEvalStr = getDiaFromDate(currentDate);
        if (origen.horarios_operativos?.some(h => normalize(h.dia_semana) === normalize(diaEvalStr))) {
            return {
                date: currentDate,
                msg: `${tipoOrigenCerrado}, se calculó tu entrega para el día siguiente operativo (${formatFriendlyDate(currentDate)}).`
            };
        }
    }
    return { date: null, msg: "Error: El origen no tiene días operativos" };
}

function calcularIngresoOficial(origen, fechaDropoffStr, horaDropoff) {
    let currentDate = new Date(fechaDropoffStr + "T00:00:00");
    const today = new Date();

    if (!canUseOfficialEntryCore(currentDate, today)) {
        return calcularIngresoOficialLegacy(origen, currentDate, horaDropoff, today);
    }

    const dropoffDate = dateToCivil(currentDate);
    const civilToday = dateToCivil(today);

    const schedules = [];
    if (origen.horarios_operativos) {
        for (const h of origen.horarios_operativos) {
            const w = getDayIndexFromString(h.dia_semana);
            if (w !== -1) {
                schedules.push({
                    weekday: w,
                    openTime: h.hora_apertura,
                    closeTime: h.hora_cierre
                });
            }
        }
    }

    const result = calculateOfficialEntry({
        isPin: !!origen.is_pin,
        dropoffDate,
        dropoffTime: horaDropoff,
        schedules,
        today: civilToday
    });

    switch (result.status) {
        case OFFICIAL_ENTRY_STATUS.PIN:
            return {
                date: civilToDate(result.officialDate),
                msg: `Recolección programada en tu ubicación el ${formatFriendlyDate(civilToDate(result.officialDate))}`
            };
        case OFFICIAL_ENTRY_STATUS.ACTIVE_TODAY:
            return {
                date: civilToDate(result.officialDate),
                msg: `Abierto el día de hoy, ${formatFriendlyDate(civilToDate(result.officialDate))}`
            };
        case OFFICIAL_ENTRY_STATUS.ACTIVE_FUTURE:
            return {
                date: civilToDate(result.officialDate),
                msg: `A tiempo el ${formatFriendlyDate(civilToDate(result.officialDate))}`
            };
        case OFFICIAL_ENTRY_STATUS.BEFORE_NEXT_INTERVAL: {
            let tipoOrigen = origen.tipo?.toLowerCase() === 'agencia' ? 'La agencia abre' : 'El personal llega';
            return {
                date: civilToDate(result.officialDate),
                msg: `${tipoOrigen} en el horario de ${formatTime12(result.nextInterval.openTime)} a ${formatTime12(result.nextInterval.closeTime)}`
            };
        }
        case OFFICIAL_ENTRY_STATUS.CLOSED_UNTIL_NEXT_DAY: {
            let tipoOrigenCerrado = origen.tipo?.toLowerCase() === 'agencia' ? 'la agencia ya cerró este día' : 'las personas ya se retiraron del punto fijo';
            return {
                date: civilToDate(result.officialDate),
                msg: `${tipoOrigenCerrado}, se calculó tu entrega para el día siguiente operativo (${formatFriendlyDate(civilToDate(result.officialDate))}).`
            };
        }
        case OFFICIAL_ENTRY_STATUS.NO_OPERATING_DAYS:
            return { date: null, msg: "Error: El origen no tiene días operativos" };
        default:
            throw new Error(`Unknown official entry status: ${result.status}`);
    }
}

function getCorteDate(fechaDeseada, reglaCorteStr) {
    const normalize = (s) => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
    const reglaLower = normalize(reglaCorteStr);
    if (reglaLower === 'dia anterior') {
        return addDays(fechaDeseada, -1);
    } else if (reglaLower === 'mismo dia') {
        return fechaDeseada;
    } else {
        const targetWeekday = getDayIndexFromString(reglaLower);
        if (targetWeekday === -1) return addDays(fechaDeseada, -1);

        let corteDate = addDays(fechaDeseada, -1);
        while ((canUseDateCore(corteDate) ? dateCore.weekday(dateToCivil(corteDate)) : corteDate.getDay()) !== targetWeekday) {
            corteDate = addDays(corteDate, -1);
        }
        return corteDate;
    }
}

function isLocalMidnight(date) {
    return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0;
}

function staysWithinDateCore(date, dayOffset) {
    const edgeDate = new Date(date);
    edgeDate.setDate(edgeDate.getDate() + dayOffset);
    return canUseDateCore(edgeDate);
}

// T08 will make these boundary guarantees part of the public input contract. Until then, keep
// every legacy path behind this small policy boundary instead of spreading cutover conditions
// through the adapter.
function canUseOfficialEntryCore(currentDate, today) {
    return canUseDateCore(currentDate) && canUseDateCore(today);
}

function canUseRouteValidationCore(officialEntryDate, desiredDate) {
    return canUseDateCore(officialEntryDate) &&
        isLocalMidnight(officialEntryDate) &&
        canUseDateCore(desiredDate) &&
        staysWithinDateCore(desiredDate, -7);
}

function canUseRouteProjectionCore(officialEntryDate) {
    return canUseDateCore(officialEntryDate) &&
        isLocalMidnight(officialEntryDate) &&
        staysWithinDateCore(officialEntryDate, 60);
}

function mapDestinoToRules(destino) {
    const normalize = (value) => value
        ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
        : '';

    return (destino.reglas_entrega || []).map(r => {
        const diaEntrega = normalize(r.dia_entrega);
        let cutoffType = routeProjection.CUTOFF_TYPE.PREVIOUS_DAY;
        let cutoffWeekday = null;

        const reglaLower = r.dia_corte_maximo ? r.dia_corte_maximo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
        if (reglaLower === 'mismo dia') {
            cutoffType = routeProjection.CUTOFF_TYPE.SAME_DAY;
        } else if (reglaLower !== 'dia anterior') {
            const dayIdx = getDayIndexFromString(reglaLower);
            if (dayIdx !== -1) {
                cutoffType = routeProjection.CUTOFF_TYPE.WEEKDAY;
                cutoffWeekday = dayIdx;
            }
        }

        return {
            deliveryWeekday: diaEntrega === 'diario' ? null : getDayIndexFromString(diaEntrega),
            cutoffType,
            cutoffWeekday
        };
    });
}

function mapDestinoToSchedules(destino) {
    return (destino.horarios_operativos || []).map(h => {
        return {
            weekday: getDayIndexFromString(h.dia_semana),
            openTime: h.hora_apertura,
            closeTime: h.hora_cierre
        };
    }).filter(s => s.weekday !== -1);
}

function validarFechaDeseadaLegacy(destino, ingresoOficialDate, fechaDeseadaStr) {
    const fechaDeseada = new Date(fechaDeseadaStr + "T00:00:00");

    if (destino.is_pin) {
        return { esPosible: true, msg: "Entrega a domicilio confirmada." };
    }

    const normalize = (s) => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
    const diaDeseadoStr = normalize(getDiaFromDate(fechaDeseada));
    const reglas = destino.reglas_entrega || [];

    let reglaAplicable = null;
    for (const r of reglas) {
        const entregaStr = normalize(r.dia_entrega);
        if (entregaStr === 'diario' || entregaStr === diaDeseadoStr) {
            reglaAplicable = r;
            break;
        }
    }

    if (!reglaAplicable) {
        return {
            esPosible: false,
            msg: `El destino no recibe entregas los días ${diaDeseadoStr}.`
        };
    }

    const corteDate = getCorteDate(fechaDeseada, reglaAplicable.dia_corte_maximo);
    const corteDateStr = formatFriendlyDate(corteDate);

    const ingresoIso = canUseDateCore(ingresoOficialDate)
        ? dateCore.toIsoDate(dateToCivil(ingresoOficialDate))
        : ingresoOficialDate.toISOString().split('T')[0];
    const corteIso = canUseDateCore(corteDate)
        ? dateCore.toIsoDate(dateToCivil(corteDate))
        : corteDate.toISOString().split('T')[0];

    if (ingresoOficialDate.getTime() <= corteDate.getTime()) {
        return {
            esPosible: true,
            msg: `Aprobado. Ingreso (${ingresoIso}) es <= Corte (${corteIso}).`,
            corteDateStr: corteDateStr
        };
    } else {
        return {
            esPosible: false,
            msg: `Rechazado. El ingreso es (${ingresoIso}) pero la ruta cortaba el (${corteIso}).`,
            corteDateStr: corteDateStr
        };
    }
}

function validarFechaDeseada(destino, ingresoOficialDate, fechaDeseadaStr) {
    const fechaDeseada = new Date(fechaDeseadaStr + "T00:00:00");
    if (!canUseRouteValidationCore(ingresoOficialDate, fechaDeseada)) {
        return validarFechaDeseadaLegacy(destino, ingresoOficialDate, fechaDeseadaStr);
    }

    const rules = mapDestinoToRules(destino);
    const result = routeProjection.validateDesiredDate(
        !!destino.is_pin,
        rules,
        dateToCivil(ingresoOficialDate),
        dateToCivil(fechaDeseada)
    );

    const diaDeseadoStr = getDiaFromDate(fechaDeseada)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

    if (result.status === routeProjection.ROUTE_RULE_STATUS.PIN) {
        return { esPosible: true, msg: "Entrega a domicilio confirmada." };
    }

    if (result.status === routeProjection.ROUTE_RULE_STATUS.NO_DELIVERY) {
        return {
            esPosible: false,
            msg: `El destino no recibe entregas los días ${diaDeseadoStr}.`
        };
    }

    const corteDate = civilToDate(result.cutoffDate);
    const corteDateStr = formatFriendlyDate(corteDate);
    const ingresoIso = dateCore.toIsoDate(dateToCivil(ingresoOficialDate));
    const corteIso = dateCore.toIsoDate(result.cutoffDate);

    if (result.status === routeProjection.ROUTE_RULE_STATUS.APPROVED) {
        return {
            esPosible: true,
            msg: `Aprobado. Ingreso (${ingresoIso}) es <= Corte (${corteIso}).`,
            corteDateStr: corteDateStr
        };
    }

    if (result.status === routeProjection.ROUTE_RULE_STATUS.REJECTED_CUTOFF) {
        return {
            esPosible: false,
            msg: `Rechazado. El ingreso es (${ingresoIso}) pero la ruta cortaba el (${corteIso}).`,
            corteDateStr: corteDateStr
        };
    }

    throw new Error(`Unknown route rule status: ${result.status}`);
}

function formatProjectedTime(timeStr) {
    if (typeof timeStr === 'number') {
        const h = Math.floor(timeStr / 60);
        const m = timeStr % 60;
        const ampm = h >= 12 ? 'PM' : 'AM';
        return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${ampm}`;
    }
    const parts = String(timeStr).split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function formatProjectedIntervals(intervals, openKey, closeKey) {
    return intervals
        .map(i => `${formatProjectedTime(i[openKey])} a ${formatProjectedTime(i[closeKey])}`)
        .join(' / ');
}

function proyectarProximasRutasLegacy(destino, ingresoOficialDate, limite = 3) {
    const opciones = [];
    let evalDate = new Date(ingresoOficialDate.getTime());
    let diasIterados = 0;

    // Iteramos al futuro máximo 60 días para seguridad
    while (opciones.length < limite && diasIterados < 60) {
        const evalCivil = canUseDateCore(evalDate) ? dateToCivil(evalDate) : null;
        const evalIso = evalCivil ? dateCore.toIsoDate(evalCivil) : evalDate.toISOString().split('T')[0];
        const result = validarFechaDeseada(destino, ingresoOficialDate, evalIso);
        if (result.esPosible) {
            const diaStr = getDiaFromDate(evalDate);
            const normalize = (s) => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
            const horarios = (destino.horarios_operativos || [])
                .filter(h => normalize(h.dia_semana) === normalize(diaStr))
                .sort((a, b) => a.hora_apertura.localeCompare(b.hora_apertura));

            if (horarios.length === 0 || horarios.some(h => !h.hora_apertura || !h.hora_cierre)) {
                // If there's no operating hours, the location is closed on this day.
                // We should NOT project this day as an arrival option. Move to the next day.
                evalDate = addDays(evalDate, 1);
                diasIterados++;
                continue;
            }

            const horarioStr = formatProjectedIntervals(horarios, 'hora_apertura', 'hora_cierre');

            opciones.push({
                fecha_llegada: formatFriendlyDate(evalDate),
                fecha_llegada_iso: evalIso,
                horario_recoleccion: horarioStr
            });
        }
        evalDate = addDays(evalDate, 1);
        diasIterados++;
    }
    return opciones;
}

function proyectarProximasRutas(destino, ingresoOficialDate, limite = 3) {
    if (!canUseRouteProjectionCore(ingresoOficialDate)) {
        return proyectarProximasRutasLegacy(destino, ingresoOficialDate, limite);
    }

    const rules = mapDestinoToRules(destino);
    const schedules = mapDestinoToSchedules(destino);

    const projected = routeProjection.projectRoutes(
        !!destino.is_pin,
        rules,
        schedules,
        dateToCivil(ingresoOficialDate),
        limite
    );

    return projected.map(opt => {
        const arrivalDate = civilToDate(opt.date);
        const horarioStr = formatProjectedIntervals(opt.intervals, 'openTime', 'closeTime');

        return {
            fecha_llegada: formatFriendlyDate(arrivalDate),
            fecha_llegada_iso: dateCore.toIsoDate(opt.date),
            horario_recoleccion: horarioStr
        };
    });
}

module.exports = {
    findDestino,
    calcularIngresoOficial,
    validarFechaDeseada,
    proyectarProximasRutas
};
