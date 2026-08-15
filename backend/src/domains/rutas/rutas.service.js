const logistics = require('../../../services/logistics');
const ubicacionesRepo = require('../ubicaciones/ubicaciones.repository');

function getNextDates(startDateStr, days) {
    let dates = [];
    let currentDate = new Date(startDateStr + "T00:00:00");
    for(let i = 0; i < days; i++) {
        dates.push(currentDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
}

async function getUpcomingRoutes(payload) {
    let { origen, destino, dropoff_date, dropoff_time } = payload;
    
    if (!origen || !destino) {
        throw new Error("Missing origin or destination");
    }
    
    if (!dropoff_date || !dropoff_time) {
        const now = new Date();
        dropoff_date = now.toISOString().split('T')[0];
        dropoff_time = now.toTimeString().split(' ')[0].substring(0, 5);
    }
    
    let destinos = Array.isArray(destino) ? destino : [destino];
    let origenes = Array.isArray(origen) ? origen : [origen];
    
    let results = [];
    let singleResult = null;
    
    const dropoffDates = getNextDates(dropoff_date, 7);
    
    for (const oName of origenes) {
        const oObj = await ubicacionesRepo.getLocationByName(oName);
        if (!oObj) continue;
        
        for (const dName of destinos) {
            const dObj = await ubicacionesRepo.getLocationByName(dName);
            if (!dObj) continue;
            
            if (oObj.empresa !== dObj.empresa) continue;
            
            let opciones_entrega = [];
            let firstValidOption = null;
            let firstIngresoMsg = "";
            
            for (let i = 0; i < dropoffDates.length; i++) {
                const iterDate = dropoffDates[i];
                const iterTime = (i === 0) ? dropoff_time : "08:00";
                
                const ingreso = logistics.calcularIngresoOficial(oObj, iterDate, iterTime);
                if (!ingreso.date || ingreso.date.toISOString().split('T')[0] !== iterDate) continue;
                let opciones = logistics.proyectarProximasRutas(dObj, ingreso.date, 1);
                if (opciones.length > 0) {
                    opciones_entrega.push({
                        dropoff_date: iterDate,
                        dropoff_msg: ingreso.msg,
                        fecha_llegada: opciones[0].fecha_llegada,
                        horario_recoleccion: opciones[0].horario_recoleccion
                    });
                    
                    if (!firstValidOption) {
                        firstValidOption = opciones[0];
                        firstIngresoMsg = ingreso.msg;
                    }
                }
            }
            
            if (firstValidOption) {
                const resObj = {
                    empresa: oObj.empresa,
                    origen_nombre: oObj.nombre_destino,
                    origen_msg: firstIngresoMsg,
                    destino_nombre: dObj.nombre_destino,
                    opciones: [firstValidOption], // Backward compatibility
                    opciones_entrega: opciones_entrega
                };
                results.push(resObj);
                if (!singleResult) singleResult = resObj;
            }
        }
    }
    
    if (Array.isArray(origen) || Array.isArray(destino)) {
         return { success: true, results: results };
    }
    
    if (singleResult) {
        return { success: true, ...singleResult };
    } else {
        return { success: false, origen_msg: "No hay rutas disponibles o no operan en esa zona/empresa." };
    }
}

async function searchRoutesByMunicipality(payload) {
    let { origen, destinos, dropoff_date, dropoff_time, arrival_date } = payload;
    
    if (!origen || !destinos || !Array.isArray(destinos)) {
        throw new Error("Missing parameters or destinos is not an array");
    }

    if (!dropoff_date || !dropoff_time) {
        const now = new Date();
        dropoff_date = now.toISOString().split('T')[0];
        dropoff_time = now.toTimeString().split(' ')[0].substring(0, 5);
    }
    
    if (Array.isArray(origen)) {
        const results = [];
        for (const oName of origen) {
            const oObj = await ubicacionesRepo.getLocationByName(oName);
            if (!oObj) continue;
            
            const ingreso = logistics.calcularIngresoOficial(oObj, dropoff_date, dropoff_time);
            if (!ingreso.date || ingreso.date.toISOString().split('T')[0] !== dropoff_date) continue;
            
            for (const dName of destinos) {
                const destinoObj = await ubicacionesRepo.getLocationByName(dName);
                if (!destinoObj) continue;
                if (oObj.empresa !== destinoObj.empresa) continue;
                
                let opciones = logistics.proyectarProximasRutas(destinoObj, ingreso.date, 3);
                if (arrival_date) {
                    const limitTime = new Date(arrival_date + "T23:59:59").getTime();
                    opciones = opciones.filter(o => new Date(o.fecha_llegada_iso + "T00:00:00").getTime() <= limitTime);
                }
                if (opciones.length > 0) {
                    results.push({
                        origen_nombre: oObj.nombre_destino,
                        empresa: oObj.empresa,
                        destino_nombre: destinoObj.nombre_destino,
                        fecha_llegada: opciones[0].fecha_llegada,
                        horario_recoleccion: opciones[0].horario_recoleccion,
                        origen_msg: ingreso.msg,
                        opciones: opciones
                    });
                }
            }
        }
        return { success: true, results: results };
    }

    const origenObj = await ubicacionesRepo.getLocationByName(origen);
    if (!origenObj) throw new Error("Origen no encontrado");
    
    const ingreso = logistics.calcularIngresoOficial(origenObj, dropoff_date, dropoff_time);
    if (!ingreso.date) {
        return { success: false, origen_msg: ingreso.msg, results: [] };
    }
    
    const results = [];
    for (const dName of destinos) {
        const destinoObj = await ubicacionesRepo.getLocationByName(dName);
        if (!destinoObj) continue;
        
        let opciones = logistics.proyectarProximasRutas(destinoObj, ingreso.date, 3);
        if (arrival_date) {
            const limitTime = new Date(arrival_date + "T23:59:59").getTime();
            opciones = opciones.filter(o => new Date(o.fecha_llegada_iso + "T00:00:00").getTime() <= limitTime);
        }
        if (opciones.length > 0) {
            results.push({
                destino_nombre: destinoObj.nombre_destino,
                fecha_llegada: opciones[0].fecha_llegada,
                horario_recoleccion: opciones[0].horario_recoleccion,
                origen_msg: ingreso.msg,
                opciones: opciones
            });
        }
    }
    
    return {
        success: true,
        origen_msg: ingreso.msg,
        origen_nombre: origenObj.nombre_destino,
        results: results
    };
}

async function searchFlights(payload) {
    let { origen_municipio, origen_departamento, destino_municipio, destino_departamento, dropoff_date, dropoff_time } = payload;

    if (!origen_municipio || !destino_municipio) {
        throw new Error("Missing origin or destination");
    }

    if (!dropoff_date || !dropoff_time) {
        const now = new Date();
        dropoff_date = now.toISOString().split('T')[0];
        dropoff_time = now.toTimeString().split(' ')[0].substring(0, 5);
    }

    const allLocations = await ubicacionesRepo.getAllLocations();
    
    const origines = allLocations.filter(l => 
        l.ubicacion && 
        l.ubicacion.municipio === origen_municipio && 
        (!origen_departamento || l.ubicacion.departamento === origen_departamento)
    );
    
    const destinos = allLocations.filter(l => 
        l.ubicacion && 
        l.ubicacion.municipio === destino_municipio && 
        (!destino_departamento || l.ubicacion.departamento === destino_departamento)
    );

    const results = [];
    const dropoffDates = getNextDates(dropoff_date, 7);

    for (const o of origines) {
        if (!o.empresa) continue;
        
        const matchingDestinos = destinos.filter(d => d.empresa === o.empresa);
        if (matchingDestinos.length === 0) continue;
        
        for (const d of matchingDestinos) {
            let opciones_entrega = [];
            let firstValidOption = null;
            let firstIngresoMsg = "";
            
            for (let i = 0; i < dropoffDates.length; i++) {
                const iterDate = dropoffDates[i];
                const iterTime = (i === 0) ? dropoff_time : "08:00";
                
                const ingreso = logistics.calcularIngresoOficial(o, iterDate, iterTime);
                if (!ingreso.date || ingreso.date.toISOString().split('T')[0] !== iterDate) continue;
                let opciones = logistics.proyectarProximasRutas(d, ingreso.date, 1);
                if (opciones.length > 0) {
                    opciones_entrega.push({
                        dropoff_date: iterDate,
                        dropoff_msg: ingreso.msg,
                        fecha_llegada: opciones[0].fecha_llegada,
                        horario_recoleccion: opciones[0].horario_recoleccion
                    });
                    
                    if (!firstValidOption) {
                        firstValidOption = opciones[0];
                        firstIngresoMsg = ingreso.msg;
                    }
                }
            }
            
            if (firstValidOption) {
                results.push({
                    empresa: o.empresa,
                    origen_nombre: o.nombre_destino,
                    origen_tipo: o.tipo,
                    origen_lat: o.ubicacion.lat,
                    origen_lng: o.ubicacion.lng,
                    destino_nombre_destino: d.nombre_destino,
                    destino_tipo: d.tipo,
                    destino_lat: d.ubicacion.lat,
                    destino_lng: d.ubicacion.lng,
                    origen_msg: firstIngresoMsg,
                    fecha_llegada: firstValidOption.fecha_llegada,
                    horario_recoleccion: firstValidOption.horario_recoleccion,
                    opciones_entrega: opciones_entrega,
                    distance: 0
                });
            }
        }
    }

    results.sort((a, b) => a.empresa.localeCompare(b.empresa));
    return { success: true, results: results };
}

module.exports = {
    getUpcomingRoutes,
    searchRoutesByMunicipality,
    searchFlights
};
