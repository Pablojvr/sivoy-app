const { getDB } = require('../../config/database');

async function getAllLocations() {
    const db = await getDB();
    const agencias = await db.query('SELECT * FROM agencias ORDER BY nombre_destino');
    const horarios = await db.query('SELECT * FROM horarios_operativos');
    const reglas = await db.query('SELECT * FROM reglas_entrega');

    // Grouping
    const horariosMap = {};
    for (const h of horarios.rows) {
        if (!horariosMap[h.agencia_id]) horariosMap[h.agencia_id] = [];
        horariosMap[h.agencia_id].push({ dia_semana: h.dia_semana, hora_apertura: h.hora_apertura, hora_cierre: h.hora_cierre });
    }

    const reglasMap = {};
    for (const r of reglas.rows) {
        if (!reglasMap[r.agencia_id]) reglasMap[r.agencia_id] = [];
        reglasMap[r.agencia_id].push({ dia_entrega: r.dia_entrega, dia_corte_maximo: r.dia_corte_maximo });
    }

    return agencias.rows.map(a => ({
        id: a.id,
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
        horarios_operativos: horariosMap[a.id] || [],
        reglas_entrega: reglasMap[a.id] || []
    }));
}

async function getLocationByName(nombre) {
    if (!nombre) return null;
    if (nombre.startsWith('📍 Pin')) {
        return { is_pin: true, nombre_destino: 'Ubicación Personalizada' };
    }

    const db = await getDB();
    const result = await db.query(`SELECT * FROM agencias WHERE LOWER(nombre_destino) = $1 OR id::text = $2`, [nombre.toString().toLowerCase(), nombre.toString()]);
    if (result.rows.length === 0) return null;
    const a = result.rows[0];

    const horarios = await db.query('SELECT dia_semana, hora_apertura, hora_cierre FROM horarios_operativos WHERE agencia_id = $1', [a.id]);
    const reglas = await db.query('SELECT dia_entrega, dia_corte_maximo FROM reglas_entrega WHERE agencia_id = $1', [a.id]);

    return {
        id: a.id,
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
        horarios_operativos: horarios.rows,
        reglas_entrega: reglas.rows
    };
}

async function updateLocation(locId, updateFields, params, horarios) {
    const db = await getDB();
    
    if (updateFields.length > 0) {
        // Rewrite updateFields parameters from ? to $1, $2, etc.
        // Assuming updateFields is like ['nombre_destino = ?', 'tipo = ?']
        let newUpdateFields = [];
        for (let i = 0; i < updateFields.length; i++) {
            newUpdateFields.push(updateFields[i].replace('?', '$' + (i + 1)));
        }
        params.push(locId);
        const query = `UPDATE agencias SET ${newUpdateFields.join(', ')} WHERE id = $${params.length}`;
        await db.query(query, params);
    }
    
    if (horarios) {
        await db.query(`DELETE FROM horarios_operativos WHERE agencia_id = $1`, [locId]);
        for (const h of horarios) {
            await db.query(`INSERT INTO horarios_operativos (agencia_id, dia_semana, hora_apertura, hora_cierre) VALUES ($1, $2, $3, $4)`, [locId, h.dia_semana, h.hora_apertura, h.hora_cierre]);
        }
    }
    
    return await getLocationByName(locId);
}

async function getEmpresaNameById(empresa_id) {
    const db = await getDB();
    const result = await db.query(`SELECT nombre FROM empresas WHERE id = $1`, [empresa_id]);
    return result.rows.length > 0 ? result.rows[0].nombre : null;
}

async function createAgencia(id_destino, payload) {
    const db = await getDB();
    const { nombre_destino, tipo, empresa_id, empresaNombre, departamento, municipio, direccion_referencia, maps_url, lat, lng, imagen_referencia, horariosArr } = payload;
    
    await db.query(
        `INSERT INTO agencias (id_destino, nombre_destino, tipo, empresa_id, empresa, departamento, municipio, direccion_referencia, maps_url, lat, lng, imagen_referencia) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [id_destino, nombre_destino, tipo, empresa_id, empresaNombre, departamento, municipio, direccion_referencia, maps_url || null, lat || null, lng || null, imagen_referencia]
    );

    if (horariosArr && horariosArr.length > 0) {
        for (const h of horariosArr) {
            const t_accion = h.tipo_accion || 'ambos';
            await db.query(`INSERT INTO horarios_operativos (agencia_id, dia_semana, hora_apertura, hora_cierre, tipo_accion) VALUES ($1, $2, $3, $4, $5)`, [id_destino, h.dia_semana, h.hora_apertura, h.hora_cierre, t_accion]);
        }
    }
}

module.exports = {
    getAllLocations,
    getLocationByName,
    updateLocation,
    getEmpresaNameById,
    createAgencia
};
