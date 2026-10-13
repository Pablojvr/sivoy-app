const http = require('node:http');

const allowedOrigins = ['http://localhost:4303', 'http://127.0.0.1:4303'];
const MAX_BODY_SIZE = 64 * 1024;

const weekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const standardSchedules = weekdays.map((day) => ({
  day,
  opensAt: '08:00',
  closesAt: '17:00',
}));

const standardSchedulePreview = [
  { daysLabel: 'Lunes a viernes', opensAt: '08:00', closesAt: '17:00' },
];

const fixtureCompany = {
  companyId: '1',
  name: 'Empresa de prueba',
  logoUrl: null,
};

const puntoAgenciaCentro = {
  pointId: 'POINT_AGENCIA_CENTRO',
  company: fixtureCompany,
  name: 'Agencia Centro',
  pointType: 'AGENCIA',
  location: {
    department: 'San Salvador',
    municipality: 'San Salvador',
    address: 'Centro Histórico, San Salvador',
    coordinates: { lat: 13.69, lng: -89.19 },
  },
  media: {
    imageUrl: null,
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=13.69,-89.19',
  },
  availability: {
    status: 'OPEN',
    closesAt: '17:00',
    nextOpeningAt: null,
    evaluatedAt: '2026-10-13T08:00:00-06:00',
    timeZone: 'America/El_Salvador',
  },
  schedulePreview: standardSchedulePreview,
};

const puntoAgenciaNorte = {
  pointId: 'POINT_AGENCIA_NORTE',
  company: fixtureCompany,
  name: 'Agencia Norte',
  pointType: 'AGENCIA',
  location: {
    department: 'La Libertad',
    municipality: 'Santa Tecla',
    address: 'Santa Tecla, La Libertad',
    coordinates: { lat: 13.67, lng: -89.28 },
  },
  media: {
    imageUrl: null,
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=13.67,-89.28',
  },
  availability: {
    status: 'OPEN',
    closesAt: '17:00',
    nextOpeningAt: null,
    evaluatedAt: '2026-10-13T08:00:00-06:00',
    timeZone: 'America/El_Salvador',
  },
  schedulePreview: standardSchedulePreview,
};

const soyapangoPoints = Array.from({ length: 25 }, (_, idx) => {
  const num = String(idx + 1).padStart(2, '0');
  return {
    pointId: `POINT_SOYAPANGO_${num}`,
    company: fixtureCompany,
    name: `Agencia Soyapango ${num}`,
    pointType: 'AGENCIA',
    location: {
      department: 'San Salvador',
      municipality: 'Soyapango',
      address: `Soyapango Centro #${num}, San Salvador`,
      coordinates: { lat: 13.71 + idx * 0.001, lng: -89.14 + idx * 0.001 },
    },
    media: {
      imageUrl: null,
      mapsUrl: null,
    },
    availability: {
      status: 'OPEN',
      closesAt: '17:00',
      nextOpeningAt: null,
      evaluatedAt: '2026-10-13T08:00:00-06:00',
      timeZone: 'America/El_Salvador',
    },
    schedulePreview: standardSchedulePreview,
  };
});

const allCatalogPoints = [puntoAgenciaCentro, puntoAgenciaNorte, ...soyapangoPoints];

const normalizeText = (value) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const matchesQuery = (target, q) => {
  const normTarget = normalizeText(target);
  const normQ = normalizeText(q);
  if (!normQ) return true;
  return normTarget.includes(normQ);
};

const equalsText = (target, expected) => normalizeText(target) === normalizeText(expected);

const parseLimit = (url) => {
  const raw = url.searchParams.get('limit');
  if (raw === null) return { ok: true, value: 20 };
  if (!/^[1-9]\d*$/.test(raw)) return { ok: false };
  const value = Number(raw);
  return Number.isSafeInteger(value) && value <= 50
    ? { ok: true, value }
    : { ok: false };
};

const encodeCursor = (offset) =>
  Buffer.from(JSON.stringify({ offset })).toString('base64url');

const decodeCursor = (cursor) => {
  if (!cursor) return { ok: true, offset: 0 };
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    if (
      typeof parsed.offset === 'number' &&
      parsed.offset >= 0 &&
      Number.isInteger(parsed.offset)
    ) {
      return { ok: true, offset: parsed.offset };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
};

const syntheticOption = (body) => {
  const requestedDate =
    typeof body.dropoff_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.dropoff_date)
      ? body.dropoff_date
      : new Date().toISOString().slice(0, 10);
  const arrival = new Date(`${requestedDate}T00:00:00Z`);
  arrival.setUTCDate(arrival.getUTCDate() + 1);
  return {
    dropoff_date: requestedDate,
    dropoff_msg: 'Fecha de prueba',
    fecha_llegada: arrival.toISOString().slice(0, 10),
    horario_recoleccion: 'Horario de prueba',
  };
};

const handleCORS = (req, res) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
  }
};

const sendJson = (res, statusCode, data) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
};

const sendError = (res, statusCode, message) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    ...(statusCode === 413 ? { Connection: 'close' } : {}),
  });
  res.end(JSON.stringify({ error: message }));
};

const getBody = (req) => {
  return new Promise((resolve, reject) => {
    let body = '';
    let bytesRead = 0;
    let limitExceeded = false;

    req.on('data', (chunk) => {
      if (limitExceeded) return;
      bytesRead += chunk.length;
      if (bytesRead > MAX_BODY_SIZE) {
        limitExceeded = true;
        const err = new Error('Payload Too Large');
        err.statusCode = 413;
        req.resume();
        reject(err);
        return;
      }
      body += chunk;
    });

    req.on('end', () => {
      if (limitExceeded) return;
      try {
        const parsed = body ? JSON.parse(body) : {};
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          const err = new Error('Bad Request');
          err.statusCode = 400;
          reject(err);
          return;
        }
        resolve(parsed);
      } catch (e) {
        const err = new Error('Bad Request');
        err.statusCode = 400;
        reject(err);
      }
    });

    req.on('error', (err) => {
      if (limitExceeded) return;
      reject(err);
    });
  });
};

const handleRequest = async (req, res) => {
  handleCORS(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname;

  try {
    if (pathname === '/api/locations') {
      return sendError(res, 404, 'Not Found');
    }

    if (pathname === '/api/catalog/points') {
      if (req.method !== 'GET') return sendError(res, 405, 'Method Not Allowed');

      const parsedLimit = parseLimit(url);
      if (!parsedLimit.ok) return sendError(res, 400, 'Invalid limit');
      const limit = parsedLimit.value;
      const cursorParam = url.searchParams.get('cursor');
      const cursorResult = decodeCursor(cursorParam);
      if (!cursorResult.ok) {
        return sendError(res, 400, 'Invalid cursor');
      }
      const offset = cursorResult.offset;

      const municipality = url.searchParams.get('municipality');
      const department = url.searchParams.get('department');
      const companyId = url.searchParams.get('companyId');
      const pointType = url.searchParams.get('pointType');
      const q = url.searchParams.get('q');
      const matchMode = url.searchParams.get('matchMode');
      if (matchMode && matchMode !== 'CONTAINS') {
        return sendError(res, 400, 'Invalid match mode');
      }

      const filtered = allCatalogPoints.filter((p) => {
        if (municipality && !equalsText(p.location.municipality, municipality)) return false;
        if (department && !equalsText(p.location.department, department)) return false;
        if (companyId && p.company.companyId !== companyId) return false;
        if (pointType && !equalsText(p.pointType, pointType)) return false;
        if (q && !matchesQuery(p.name, q)) return false;
        return true;
      });

      const sliced = filtered.slice(offset, offset + limit);
      const hasMore = offset + limit < filtered.length;
      const nextCursor = hasMore ? encodeCursor(offset + limit) : null;

      return sendJson(res, 200, {
        data: sliced,
        page: {
          limit,
          hasMore,
          nextCursor,
        },
        meta: {
          catalogRevision: 'catalog:fixture',
        },
      });
    }

    if (pathname.startsWith('/api/catalog/points/')) {
      if (req.method !== 'GET') return sendError(res, 405, 'Method Not Allowed');
      const pointId = decodeURIComponent(pathname.slice('/api/catalog/points/'.length));
      const point = allCatalogPoints.find((p) => p.pointId === pointId);
      if (!point) {
        return sendError(res, 404, 'Point not found');
      }
      return sendJson(res, 200, {
        ...point,
        schedules: standardSchedules,
      });
    }

    if (pathname === '/api/catalog/facets') {
      if (req.method !== 'GET') return sendError(res, 405, 'Method Not Allowed');

      const facetDimension = url.searchParams.get('facet');
      const parsedLimit = parseLimit(url);
      if (!parsedLimit.ok) return sendError(res, 400, 'Invalid limit');
      const limit = parsedLimit.value;
      const cursorParam = url.searchParams.get('cursor');
      const cursorResult = decodeCursor(cursorParam);
      if (!cursorResult.ok) {
        return sendError(res, 400, 'Invalid cursor');
      }
      const offset = cursorResult.offset;

      const dimensions = {
        company: (point) => ({
          key: point.company.companyId,
          value: point.company.companyId,
          label: point.company.name,
        }),
        department: (point) => ({
          key: point.location.department,
          value: point.location.department,
          label: point.location.department,
        }),
        municipality: (point) => ({
          key: `${point.location.department}\u001f${point.location.municipality}`,
          value: point.location.municipality,
          label: point.location.municipality,
          context: { department: point.location.department },
        }),
        pointType: (point) => ({
          key: point.pointType,
          value: point.pointType,
          label: point.pointType,
        }),
      };
      const toFacet = dimensions[facetDimension];
      if (!toFacet) return sendError(res, 400, 'Invalid facet parameter');

      const department = url.searchParams.get('department');
      const municipality = url.searchParams.get('municipality');
      const companyId = url.searchParams.get('companyId');
      const pointType = url.searchParams.get('pointType');
      const q = url.searchParams.get('q');
      const groups = new Map();
      for (const point of allCatalogPoints) {
        if (department && !equalsText(point.location.department, department)) continue;
        if (municipality && !equalsText(point.location.municipality, municipality)) continue;
        if (companyId && point.company.companyId !== companyId) continue;
        if (pointType && !equalsText(point.pointType, pointType)) continue;
        const facet = toFacet(point);
        if (q && !matchesQuery(facet.label, q)) continue;
        if (!groups.has(facet.key)) groups.set(facet.key, { ...facet, count: 0 });
        groups.get(facet.key).count += 1;
      }

      const facets = [...groups.values()]
        .map(({ key: _key, ...facet }) => facet)
        .sort((left, right) =>
          normalizeText(left.label).localeCompare(normalizeText(right.label)) ||
          String(left.value).localeCompare(String(right.value)),
        );
      const sliced = facets.slice(offset, offset + limit);
      const hasMore = offset + limit < facets.length;
      return sendJson(res, 200, {
        data: sliced,
        page: {
          limit,
          hasMore,
          nextCursor: hasMore ? encodeCursor(offset + limit) : null,
        },
        meta: { catalogRevision: 'catalog:fixture' },
      });
    }

    if (pathname === '/api/empresas') {
      if (req.method !== 'GET') return sendError(res, 405, 'Method Not Allowed');
      return sendJson(res, 200, {
        success: true,
        empresas: [{ id: '1', nombre: 'Empresa de prueba' }],
      });
    }

    if (pathname === '/api/places/autocomplete') {
      if (req.method !== 'POST') return sendError(res, 405, 'Method Not Allowed');
      await getBody(req);
      return sendJson(res, 200, { success: true, suggestions: [] });
    }

    if (pathname === '/api/get-upcoming-routes') {
      if (req.method !== 'POST') return sendError(res, 405, 'Method Not Allowed');
      const body = await getBody(req);
      if (
        Array.isArray(body.origen) &&
        body.origen.includes('POINT_AGENCIA_NORTE') &&
        Array.isArray(body.destino) &&
        body.destino.includes('POINT_AGENCIA_CENTRO')
      ) {
        return sendJson(res, 200, {
          success: true,
          results: [
            {
              empresa: 'Empresa de prueba',
              origen_nombre: 'Agencia Norte',
              origen_msg: 'Escenario sintético',
              destino_nombre: 'Agencia Centro',
              opciones: [
                {
                  fecha_llegada: syntheticOption(body).fecha_llegada,
                  horario_recoleccion: 'Horario de prueba',
                  fecha_llegada_iso: syntheticOption(body).fecha_llegada,
                },
              ],
              opciones_entrega: [syntheticOption(body)],
            },
          ],
        });
      }
      return sendJson(res, 200, { success: true, results: [] });
    }

    if (pathname === '/api/search-flights') {
      if (req.method !== 'POST') return sendError(res, 405, 'Method Not Allowed');
      const body = await getBody(req);
      if (body.origen_municipio === 'Santa Tecla' && body.destino_municipio === 'San Salvador') {
        return sendJson(res, 200, {
          success: true,
          results: [
            {
              empresa: 'Empresa de prueba',
              origen_nombre: 'Agencia Norte',
              origen_tipo: 'agencia',
              origen_lat: 13.67,
              origen_lng: -89.28,
              destino_nombre_destino: 'Agencia Centro',
              destino_tipo: 'sucursal',
              destino_lat: 13.69,
              destino_lng: -89.19,
              origen_msg: 'Escenario sintético',
              fecha_llegada: 'Mañana',
              horario_recoleccion: 'Tarde',
              opciones_entrega: [syntheticOption(body)],
              distance: 10,
            },
          ],
        });
      }
      return sendJson(res, 200, { success: true, results: [] });
    }

    return sendError(res, 404, 'Not Found');
  } catch (err) {
    if (err.statusCode === 413) {
      return sendError(res, 413, 'Payload Too Large');
    }
    if (err instanceof SyntaxError || err.statusCode === 400) {
      return sendError(res, 400, 'Bad Request');
    }
    return sendError(res, 500, 'Internal Server Error');
  }
};

let server = null;

const startServer = (port = 3001) => {
  return new Promise((resolve, reject) => {
    const s = http.createServer(handleRequest);
    const onError = (err) => {
      if (server === s) {
        server = null;
      }
      reject(err);
    };
    s.once('error', onError);
    s.listen(port, '127.0.0.1', () => {
      s.removeListener('error', onError);
      server = s;
      resolve(server.address().port);
    });
  });
};

const stopServer = () => {
  return new Promise((resolve) => {
    if (server) {
      const current = server;
      server = null;
      current.close(() => resolve());
    } else {
      resolve();
    }
  });
};

if (require.main === module) {
  startServer(3001)
    .then(() => {
      console.log('Fixture server listening on http://127.0.0.1:3001');
    })
    .catch((err) => {
      console.error('Failed to start fixture server:', err);
      process.exit(1);
    });
}

module.exports = { startServer, stopServer };
