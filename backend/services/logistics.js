const IDX_TO_DIA = {0: "Domingo", 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado"};
const IDX_TO_MES = {0: "Enero", 1: "Febrero", 2: "Marzo", 3: "Abril", 4: "Mayo", 5: "Junio", 6: "Julio", 7: "Agosto", 8: "Septiembre", 9: "Octubre", 10: "Noviembre", 11: "Diciembre"};

// Helper to add days
function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

// Helper to get string name of day
function getDiaFromDate(date) {
    return IDX_TO_DIA[date.getDay()];
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
    const dayName = getDiaFromDate(date);
    const day = date.getDate();
    const month = IDX_TO_MES[date.getMonth()];
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

function calcularIngresoOficial(origen, fechaDropoffStr, horaDropoff) {
    let currentDate = new Date(fechaDropoffStr + "T00:00:00");
    
    if (origen.is_pin) {
        return {
            date: currentDate,
            msg: `Recolección programada en tu ubicación el ${formatFriendlyDate(currentDate)}`
        };
    }
    
    let diaStr = getDiaFromDate(currentDate);
    const normalize = (s) => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
    let horarioHoy = origen.horarios_operativos?.find(h => normalize(h.dia_semana) === normalize(diaStr));
    
    if (horarioHoy) {
        if (horaDropoff < horarioHoy.hora_apertura) {
            let tipoOrigen = origen.tipo?.toLowerCase() === 'agencia' ? 'La agencia abre' : 'El personal llega';
            return {
                date: currentDate,
                msg: `${tipoOrigen} en el horario de ${formatTime12(horarioHoy.hora_apertura)} a ${formatTime12(horarioHoy.hora_cierre)}`
            };
        }
        
        if (horaDropoff <= horarioHoy.hora_cierre) {
            let isToday = currentDate.toDateString() === new Date().toDateString();
            return { 
                date: currentDate, 
                msg: isToday ? `Abierto el día de hoy, ${formatFriendlyDate(currentDate)}` : `A tiempo el ${formatFriendlyDate(currentDate)}` 
            };
        }
    }
    
    let tipoOrigenCerrado = origen.tipo?.toLowerCase() === 'agencia' ? 'la agencia ya cerró este día' : 'las personas ya se retiraron del punto fijo';
    
    for (let i = 0; i < 7; i++) {
        currentDate = addDays(currentDate, 1);
        let diaEvalStr = getDiaFromDate(currentDate);
        const normalize = (s) => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
        if (origen.horarios_operativos?.some(h => normalize(h.dia_semana) === normalize(diaEvalStr))) {
            return {
                date: currentDate,
                msg: `${tipoOrigenCerrado}, se calculó tu entrega para el día siguiente operativo (${formatFriendlyDate(currentDate)}).`
            };
        }
    }
    return { date: null, msg: "Error: El origen no tiene días operativos" };
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
        while (corteDate.getDay() !== targetWeekday) {
            corteDate = addDays(corteDate, -1);
        }
        return corteDate;
    }
}

function validarFechaDeseada(destino, ingresoOficialDate, fechaDeseadaStr) {
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
    
    if (ingresoOficialDate.getTime() <= corteDate.getTime()) {
        return {
            esPosible: true,
            msg: `Aprobado. Ingreso (${ingresoOficialDate.toISOString().split('T')[0]}) es <= Corte (${corteDate.toISOString().split('T')[0]}).`,
            corteDateStr: corteDateStr
        };
    } else {
        return {
            esPosible: false,
            msg: `Rechazado. El ingreso es (${ingresoOficialDate.toISOString().split('T')[0]}) pero la ruta cortaba el (${corteDate.toISOString().split('T')[0]}).`,
            corteDateStr: corteDateStr
        };
    }
}

function proyectarProximasRutas(destino, ingresoOficialDate, limite = 3) {
    const opciones = [];
    let evalDate = new Date(ingresoOficialDate.getTime());
    let diasIterados = 0;
    
    // Iteramos al futuro máximo 60 días para seguridad
    while (opciones.length < limite && diasIterados < 60) {
        const result = validarFechaDeseada(destino, ingresoOficialDate, evalDate.toISOString().split('T')[0]);
        if (result.esPosible) {
            const diaStr = getDiaFromDate(evalDate);
            const normalize = (s) => s ? s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() : '';
            let horario = destino.horarios_operativos?.find(h => normalize(h.dia_semana) === normalize(diaStr));
            
            if (!horario || !horario.hora_apertura || !horario.hora_cierre) {
                // If there's no operating hours, the location is closed on this day.
                // We should NOT project this day as an arrival option. Move to the next day.
                evalDate = addDays(evalDate, 1);
                diasIterados++;
                continue;
            }

            const formatTime = (timeStr) => {
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
            };
            const horarioStr = `${formatTime(horario.hora_apertura)} a ${formatTime(horario.hora_cierre)}`;

            opciones.push({
                fecha_llegada: formatFriendlyDate(evalDate),
                fecha_llegada_iso: evalDate.toISOString().split('T')[0],
                horario_recoleccion: horarioStr
            });
        }
        evalDate = addDays(evalDate, 1);
        diasIterados++;
    }
    return opciones;
}

module.exports = {
    findDestino,
    calcularIngresoOficial,
    validarFechaDeseada,
    proyectarProximasRutas
};
