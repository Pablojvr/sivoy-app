'use strict';

class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
        this.code = 'VALIDATION_ERROR';
    }
}

function safeGet(obj, prop) {
    try {
        return obj[prop];
    } catch (e) {
        throw new ValidationError(`Invalid property access for ${prop}`);
    }
}

function isPlainObject(val) {
    if (val === null || typeof val !== 'object') return false;
    try {
        if (Array.isArray(val)) return false;
        const proto = Object.getPrototypeOf(val);
        return proto === null || proto === Object.prototype;
    } catch (e) {
        return false;
    }
}

function isLegacyAbsent(val) {
    return val === undefined || val === '';
}

function validateString(val, fieldName) {
    if (typeof val !== 'string') {
        throw new ValidationError(`Invalid type for ${fieldName}`);
    }
    const trimmed = val.trim();
    if (trimmed.length < 1 || trimmed.length > 160) {
        throw new ValidationError(`Length out of bounds for ${fieldName}`);
    }
    return trimmed;
}

function safeIsArray(val, fieldName) {
    try {
        return Array.isArray(val);
    } catch (e) {
        throw new ValidationError(`Invalid type check for ${fieldName}`);
    }
}

function validateArray(val, fieldName) {
    if (!safeIsArray(val, fieldName)) {
         throw new ValidationError(`Expected array for ${fieldName}`);
    }

    const len = safeGet(val, 'length');
    if (typeof len !== 'number' || len < 1 || len > 100) {
        throw new ValidationError(`Array length out of bounds for ${fieldName}`);
    }

    const arr = [];
    for (let i = 0; i < len; i++) {
        arr.push(validateString(safeGet(val, i), fieldName));
    }
    return arr;
}

function validateStringOrArray(val, fieldName) {
    if (safeIsArray(val, fieldName)) {
        return validateArray(val, fieldName);
    }
    return validateString(val, fieldName);
}

function validateDate(val, fieldName) {
    if (typeof val !== 'string') {
        throw new ValidationError(`Invalid type for ${fieldName}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) {
        throw new ValidationError(`Invalid format for ${fieldName}`);
    }
    const parts = val.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);

    if (y < 1900 || y > 2100) {
        throw new ValidationError(`Year out of bounds for ${fieldName}`);
    }

    const dateObj = new Date(Date.UTC(y, m - 1, d));
    if (dateObj.getUTCFullYear() !== y || dateObj.getUTCMonth() !== (m - 1) || dateObj.getUTCDate() !== d) {
        throw new ValidationError(`Invalid calendar date for ${fieldName}`);
    }
    return val;
}

function validateTime(val, fieldName) {
    if (typeof val !== 'string') {
        throw new ValidationError(`Invalid type for ${fieldName}`);
    }
    const trimmed = val.trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(trimmed)) {
        throw new ValidationError(`Invalid time format for ${fieldName}`);
    }
    return trimmed.substring(0, 5);
}

function applyDropoff(copy, payload) {
    const dDate = safeGet(payload, 'dropoff_date');
    const dTime = safeGet(payload, 'dropoff_time');

    const dDateAbsent = isLegacyAbsent(dDate);
    const dTimeAbsent = isLegacyAbsent(dTime);

    let validDate, validTime;
    if (!dDateAbsent) validDate = validateDate(dDate, 'dropoff_date');
    if (!dTimeAbsent) validTime = validateTime(dTime, 'dropoff_time');

    if (!dDateAbsent && !dTimeAbsent) {
        copy.dropoff_date = validDate;
        copy.dropoff_time = validTime;
    }
    return validDate;
}

function validateUpcomingRoutes(payload) {
    if (!isPlainObject(payload)) throw new ValidationError("Payload must be a plain object");

    const origen = safeGet(payload, 'origen');
    const destino = safeGet(payload, 'destino');
    if (!origen || !destino) throw new ValidationError("Missing origin or destination");

    const copy = {};
    copy.origen = validateStringOrArray(origen, 'origen');
    copy.destino = validateStringOrArray(destino, 'destino');

    applyDropoff(copy, payload);

    return copy;
}

function validateMunicipalityRoutes(payload) {
    if (!isPlainObject(payload)) throw new ValidationError("Payload must be a plain object");

    const origen = safeGet(payload, 'origen');
    const destinos = safeGet(payload, 'destinos');

    let isDestinosArray = false;
    try {
        isDestinosArray = Array.isArray(destinos);
    } catch (e) {
        isDestinosArray = false;
    }

    if (!origen || !destinos || !isDestinosArray) {
        throw new ValidationError("Missing parameters or destinos is not an array");
    }

    const copy = {};
    copy.origen = validateStringOrArray(origen, 'origen');
    copy.destinos = validateArray(destinos, 'destinos');

    const logicalDropoffDate = applyDropoff(copy, payload);

    const aDate = safeGet(payload, 'arrival_date');
    if (!isLegacyAbsent(aDate)) {
        copy.arrival_date = validateDate(aDate, 'arrival_date');
        if (logicalDropoffDate && copy.arrival_date < logicalDropoffDate) {
            throw new ValidationError("arrival_date cannot be before dropoff_date");
        }
    }

    return copy;
}

function validateSearchFlights(payload) {
    if (!isPlainObject(payload)) throw new ValidationError("Payload must be a plain object");

    const origMun = safeGet(payload, 'origen_municipio');
    const destMun = safeGet(payload, 'destino_municipio');
    if (!origMun || !destMun) throw new ValidationError("Missing origin or destination");

    const copy = {};
    copy.origen_municipio = validateString(origMun, 'origen_municipio');
    copy.destino_municipio = validateString(destMun, 'destino_municipio');

    const origDep = safeGet(payload, 'origen_departamento');
    if (!isLegacyAbsent(origDep)) {
        copy.origen_departamento = validateString(origDep, 'origen_departamento');
    }

    const destDep = safeGet(payload, 'destino_departamento');
    if (!isLegacyAbsent(destDep)) {
        copy.destino_departamento = validateString(destDep, 'destino_departamento');
    }

    applyDropoff(copy, payload);

    return copy;
}

module.exports = {
    ValidationError,
    validateUpcomingRoutes,
    validateMunicipalityRoutes,
    validateSearchFlights
};
