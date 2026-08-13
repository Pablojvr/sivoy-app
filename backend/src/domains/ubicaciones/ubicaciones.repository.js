const { getDB } = require('../../config/database');

async function getAllLocations() {
    const db = await getDB();
    const agencias = await db.all('SELECT * FROM agencias ORDER BY nombre_destino');
    const horarios = await db.all('SELECT * FROM horarios_operativos');
    const reglas = await db.all('SELECT * FROM reglas_entrega');

    // Grouping
    const horariosMap = {};
    for (const h of horarios) {
        if (!horariosMap[h.agencia_id]) horariosMap[h.agencia_id] = [];
        horariosMap[h.agencia_id].push({ dia_semana: h.dia_semana, hora_apertura: h.hora_apertura, hora_cierre: h.hora_cierre });
    }

    const reglasMap = {};
    for (const r of reglas) {
        if (!reglasMap[r.agencia_id]) reglasMap[r.agencia_id] = [];
        reglasMap[r.agencia_id].push({ dia_entrega: r.dia_entrega, dia_corte_maximo: r.dia_corte_maximo });
    }

    return agencias.map(a => ({
        id_destino: a.id_destino,
        nombre_destino: a.nombre_destino,
        tipo: a.tipo,
        empresa: a.empresa,
        maps_url: a.maps_url || null,
        ubicacion: {
            departamento: a.departamento,
            municipio: a.municipio,
            direccion_referencia: a.direccion_referencia,
            lat: a.lat,
            lng: a.lng
        },
        imagen_referencia: a.imagen_referencia || null,
        horarios_operativos: horariosMap[a.id_destino] || [],
        reglas_entrega: reglasMap[a.id_destino] || []
    }));
}

async function getLocationByName(nombre) {
    if (!nombre) return null;
    if (nombre.startsWith('📍 Pin')) {
        return { is_pin: true, nombre_destino: 'Ubicación Personalizada' };
    }

    const db = await getDB();
    const a = await db.get(`SELECT * FROM agencias WHERE LOWER(nombre_destino) = ? OR LOWER(id_destino) = ?`, [nombre.toLowerCase(), nombre.toLowerCase()]);
    if (!a) return null;

    const horarios = await db.all('SELECT dia_semana, hora_apertura, hora_cierre FROM horarios_operativos WHERE agencia_id = ?', [a.id_destino]);
    const reglas = await db.all('SELECT dia_entrega, dia_corte_maximo FROM reglas_entrega WHERE agencia_id = ?', [a.id_destino]);

    return {
        id_destino: a.id_destino,
        nombre_destino: a.nombre_destino,
        tipo: a.tipo,
        empresa: a.empresa,
        maps_url: a.maps_url || null,
        ubicacion: {
            departamento: a.departamento,
            municipio: a.municipio,
            direccion_referencia: a.direccion_referencia,
            lat: a.lat,
            lng: a.lng
        },
        imagen_referencia: a.imagen_referencia || null,
        horarios_operativos: horarios,
        reglas_entrega: reglas
    };
}

async function updateLocation(locId, updateFields, params, horarios) {
    const db = await getDB();
    
    if (updateFields.length > 0) {
        params.push(locId);
        const query = `UPDATE agencias SET ${updateFields.join(', ')} WHERE id_destino = ?`;
        await db.run(query, params);
    }
    
    if (horarios) {
        await db.run(`DELETE FROM horarios_operativos WHERE agencia_id = ?`, [locId]);
        const stmtHorarios = await db.prepare(`INSERT INTO horarios_operativos (agencia_id, dia_semana, hora_apertura, hora_cierre) VALUES (?, ?, ?, ?)`);
        for (const h of horarios) {
            await stmtHorarios.run(locId, h.dia_semana, h.hora_apertura, h.hora_cierre);
        }
        await stmtHorarios.finalize();
    }
    
    return await getLocationByName(locId);
}

async function getEmpresaNameById(empresa_id) {
    const db = await getDB();
    const empresaRow = await db.get(`SELECT nombre FROM empresas WHERE id = ?`, [empresa_id]);
    return empresaRow ? empresaRow.nombre : null;
}

async function createAgencia(id_destino, payload) {
    const db = await getDB();
    const { nombre_destino, tipo, empresa_id, empresaNombre, departamento, municipio, direccion_referencia, maps_url, lat, lng, imagen_referencia, horariosArr } = payload;
    
    await db.run(
        `INSERT INTO agencias (id_destino, nombre_destino, tipo, empresa_id, empresa, departamento, municipio, direccion_referencia, maps_url, lat, lng, imagen_referencia) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id_destino, nombre_destino, tipo, empresa_id, empresaNombre, departamento, municipio, direccion_referencia, maps_url || null, lat || null, lng || null, imagen_referencia]
    );

    if (horariosArr && horariosArr.length > 0) {
        const stmtHorarios = await db.prepare(`INSERT INTO horarios_operativos (agencia_id, dia_semana, hora_apertura, hora_cierre, tipo_accion) VALUES (?, ?, ?, ?, ?)`);
        for (const h of horariosArr) {
            const t_accion = h.tipo_accion || 'ambos';
            await stmtHorarios.run(id_destino, h.dia_semana, h.hora_apertura, h.hora_cierre, t_accion);
        }
        await stmtHorarios.finalize();
    }
}

module.exports = {
    getAllLocations,
    getLocationByName,
    updateLocation,
    getEmpresaNameById,
    createAgencia
};
