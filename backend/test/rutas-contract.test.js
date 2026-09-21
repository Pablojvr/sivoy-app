const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');

// Importar rutas y servicio original
const rutasService = require('../src/domains/rutas/rutas.service');
const rutasRoutes = require('../src/domains/rutas/rutas.routes');
const { ValidationError } = require('../src/domains/rutas/rutas.validation');

// Cargar fixtures
const fixturesPath = path.join(__dirname, 'fixtures', 'routes-contract-v1.json');
const fixtures = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

// App de prueba con Express (aislada de DB/red global)
function createTestApp() {
    const app = express();
    app.use(express.json());
    // Stub de req.log requerido por el controlador
    app.use((req, res, next) => {
        req.log = { warn: () => {}, error: () => {} };
        next();
    });
    app.use('/api', rutasRoutes);
    return app;
}

// Helper para levantar app en puerto efímero y hacer request
function fetchEphemeral(app, endpoint, body) {
    return new Promise((resolve, reject) => {
        const server = app.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            fetch(`http://127.0.0.1:${port}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })
            .then(async response => {
                const contentType = response.headers.get('content-type');
                const resBody = contentType && contentType.includes('application/json')
                    ? await response.json()
                    : await response.text();
                server.close(() => {
                    resolve({
                        status: response.status,
                        contentType: contentType,
                        body: resBody
                    });
                });
            })
            .catch(err => {
                server.close(() => reject(err));
            });
        });
    });
}

describe('Rutas Contracts API (T07b)', { concurrency: false }, () => {
    // Respaldar exports mutables
    const originalGetUpcomingRoutes = rutasService.getUpcomingRoutes;
    const originalSearchRoutesByMunicipality = rutasService.searchRoutesByMunicipality;
    const originalSearchFlights = rutasService.searchFlights;

    // Restaurar dobles después de cada prueba (evitar cache mutable compartido)
    afterEach(() => {
        rutasService.getUpcomingRoutes = originalGetUpcomingRoutes;
        rutasService.searchRoutesByMunicipality = originalSearchRoutesByMunicipality;
        rutasService.searchFlights = originalSearchFlights;
    });

    const app = createTestApp();

    function assertJsonResponse(response, expectedStatus, expectedBody) {
        assert.strictEqual(response.status, expectedStatus);
        assert.match(response.contentType || '', /application\/json/);
        assert.deepStrictEqual(response.body, expectedBody);
    }

    describe('POST /api/get-upcoming-routes', { concurrency: false }, () => {
        const fixReq = fixtures.get_upcoming_routes.requests;
        const fixRes = fixtures.get_upcoming_routes.responses;
        const endpoint = '/api/get-upcoming-routes';

        test('scalar_success - 200', async () => {
            rutasService.getUpcomingRoutes = async (payload) => {
                assert.deepStrictEqual(payload, fixReq.scalar_success);
                return fixRes.scalar_success_200;
            };
            const response = await fetchEphemeral(app, endpoint, fixReq.scalar_success);
            assertJsonResponse(response, 200, fixRes.scalar_success_200);
        });

        test('array_success - 200', async () => {
            rutasService.getUpcomingRoutes = async (payload) => {
                assert.deepStrictEqual(payload, fixReq.array_success);
                return fixRes.array_success_200;
            };
            const response = await fetchEphemeral(app, endpoint, fixReq.array_success);
            assertJsonResponse(response, 200, fixRes.array_success_200);
        });

        test('array_empty - 200', async () => {
            rutasService.getUpcomingRoutes = async (payload) => {
                assert.deepStrictEqual(payload, fixReq.array_empty);
                return fixRes.array_empty_success_200;
            };
            const response = await fetchEphemeral(app, endpoint, fixReq.array_empty);
            assertJsonResponse(response, 200, fixRes.array_empty_success_200);
        });

        test('scalar_not_found - 200 (success:false)', async () => {
            rutasService.getUpcomingRoutes = async (payload) => {
                assert.deepStrictEqual(payload, fixReq.scalar_not_found);
                return fixRes.scalar_not_found_200_false;
            };
            const response = await fetchEphemeral(app, endpoint, fixReq.scalar_not_found);
            assertJsonResponse(response, 200, fixRes.scalar_not_found_200_false);
        });

        test('missing_fields - 400', async () => {
            rutasService.getUpcomingRoutes = async () => {
                throw new ValidationError("Missing origin or destination");
            };
            const response = await fetchEphemeral(app, endpoint, fixReq.missing_fields);
            assertJsonResponse(response, 400, fixRes.missing_fields_400);
        });

        test('server_error - 500', async () => {
            rutasService.getUpcomingRoutes = async () => {
                throw new Error("Synthetic unexposed DB error");
            };
            const response = await fetchEphemeral(app, endpoint, fixReq.scalar_success);
            assertJsonResponse(response, 500, fixRes.server_error_500);
        });
    });

    describe('POST /api/search-routes-by-municipality', { concurrency: false }, () => {
        const fixReq = fixtures.search_routes_by_municipality.requests;
        const fixRes = fixtures.search_routes_by_municipality.responses;
        const endpoint = '/api/search-routes-by-municipality';

        test('scalar_success - 200', async () => {
            rutasService.searchRoutesByMunicipality = async (payload) => {
                assert.deepStrictEqual(payload, fixReq.scalar_success);
                return fixRes.scalar_success_200;
            };
            const response = await fetchEphemeral(app, endpoint, fixReq.scalar_success);
            assertJsonResponse(response, 200, fixRes.scalar_success_200);
        });

        test('array_success - 200', async () => {
            rutasService.searchRoutesByMunicipality = async (payload) => {
                assert.deepStrictEqual(payload, fixReq.array_success);
                return fixRes.array_success_200;
            };
            const response = await fetchEphemeral(app, endpoint, fixReq.array_success);
            assertJsonResponse(response, 200, fixRes.array_success_200);
        });

        test('array_empty - 200', async () => {
            rutasService.searchRoutesByMunicipality = async (payload) => {
                assert.deepStrictEqual(payload, fixReq.array_empty);
                return fixRes.array_empty_success_200;
            };
            const response = await fetchEphemeral(app, endpoint, fixReq.array_empty);
            assertJsonResponse(response, 200, fixRes.array_empty_success_200);
        });

        test('scalar_no_income - 200 (success:false)', async () => {
            rutasService.searchRoutesByMunicipality = async (payload) => {
                assert.deepStrictEqual(payload, fixReq.scalar_no_income);
                return fixRes.scalar_no_income_200_false;
            };
            const response = await fetchEphemeral(app, endpoint, fixReq.scalar_no_income);
            assertJsonResponse(response, 200, fixRes.scalar_no_income_200_false);
        });

        test('scalar_not_found (via result object) - 404', async () => {
            rutasService.searchRoutesByMunicipality = async (payload) => {
                return { success: false, error: "Origen no encontrado" };
            };
            const response = await fetchEphemeral(app, endpoint, fixReq.scalar_not_found);
            assertJsonResponse(response, 404, fixRes.scalar_not_found_404);
        });

        test('scalar_not_found (via error thrown) - 404', async () => {
            rutasService.searchRoutesByMunicipality = async (payload) => {
                throw new Error("Origen no encontrado");
            };
            const response = await fetchEphemeral(app, endpoint, fixReq.scalar_not_found);
            assertJsonResponse(response, 404, fixRes.scalar_not_found_404);
        });

        test('missing_fields - 400', async () => {
            rutasService.searchRoutesByMunicipality = async () => {
                throw new ValidationError("Missing parameters or destinos is not an array");
            };
            const response = await fetchEphemeral(app, endpoint, fixReq.missing_fields);
            assertJsonResponse(response, 400, fixRes.missing_fields_400);
        });

        test('server_error - 500', async () => {
            rutasService.searchRoutesByMunicipality = async () => {
                throw new Error("SyntaxError: Unexpected token u in JSON at position 0");
            };
            const response = await fetchEphemeral(app, endpoint, fixReq.server_error);
            assertJsonResponse(response, 500, fixRes.server_error_500);
        });
    });

    describe('POST /api/search-flights', { concurrency: false }, () => {
        const fixReq = fixtures.search_flights.requests;
        const fixRes = fixtures.search_flights.responses;
        const endpoint = '/api/search-flights';

        test('success - 200', async () => {
            rutasService.searchFlights = async (payload) => {
                assert.deepStrictEqual(payload, fixReq.success);
                return fixRes.success_200;
            };
            const response = await fetchEphemeral(app, endpoint, fixReq.success);
            assertJsonResponse(response, 200, fixRes.success_200);
        });

        test('empty_success - 200', async () => {
            rutasService.searchFlights = async (payload) => {
                assert.deepStrictEqual(payload, fixReq.empty_success);
                return fixRes.empty_success_200;
            };
            const response = await fetchEphemeral(app, endpoint, fixReq.empty_success);
            assertJsonResponse(response, 200, fixRes.empty_success_200);
        });

        test('missing_fields - 400', async () => {
            rutasService.searchFlights = async () => {
                throw new ValidationError("Missing origin or destination");
            };
            const response = await fetchEphemeral(app, endpoint, fixReq.missing_fields);
            assertJsonResponse(response, 400, fixRes.missing_fields_400);
        });

        test('server_error - 500', async () => {
            rutasService.searchFlights = async () => {
                throw new Error("Synthetic unexposed search flights error");
            };
            const response = await fetchEphemeral(app, endpoint, fixReq.success);
            assertJsonResponse(response, 500, fixRes.server_error_500);
        });
    });
});
