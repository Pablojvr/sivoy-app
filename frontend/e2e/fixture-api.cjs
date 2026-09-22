const http = require('node:http');

const allowedOrigins = ['http://localhost:4303', 'http://127.0.0.1:4303'];
const MAX_BODY_SIZE = 64 * 1024;

const weekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
const schedules = () =>
  weekdays.map((dia_semana) => ({
    dia_semana,
    hora_apertura: '08:00',
    hora_cierre: '17:00',
  }));

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
      if (req.method !== 'GET') return sendError(res, 405, 'Method Not Allowed');
      return sendJson(res, 200, [
        {
          id: 'L1',
          empresa: 'Empresa de prueba',
          nombre_destino: 'Agencia Centro',
          ubicacion: {
            municipio: 'San Salvador',
            departamento: 'San Salvador',
            lat: 13.69,
            lng: -89.19,
          },
          horarios_operativos: schedules(),
          reglas_entrega: [],
        },
        {
          id: 'L2',
          empresa: 'Empresa de prueba',
          nombre_destino: 'Agencia Norte',
          ubicacion: {
            municipio: 'Santa Tecla',
            departamento: 'La Libertad',
            lat: 13.67,
            lng: -89.28,
          },
          horarios_operativos: schedules(),
          reglas_entrega: [],
        },
      ]);
    }

    if (pathname === '/api/empresas') {
      if (req.method !== 'GET') return sendError(res, 405, 'Method Not Allowed');
      return sendJson(res, 200, {
        success: true,
        empresas: [{ id: 'FIXTURE_EMP', nombre: 'Empresa de prueba' }],
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
        body.origen.includes('Agencia Norte') &&
        Array.isArray(body.destino) &&
        body.destino.includes('Agencia Centro')
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

const startServer = (port = 3000) => {
  return new Promise((resolve, reject) => {
    const s = http.createServer(handleRequest);
    const onError = (err) => {
      if (server === s) {
        server = null;
      }
      reject(err);
    };
    s.once('error', onError);
    s.listen(port, 'localhost', () => {
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
  startServer(3000)
    .then(() => {
      console.log('Fixture server listening on http://localhost:3000');
    })
    .catch((err) => {
      console.error('Failed to start fixture server:', err);
      process.exit(1);
    });
}

module.exports = { startServer, stopServer };
