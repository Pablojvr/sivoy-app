# T46 Superficie HTTP y ciclo de vida PostgreSQL

## Objetivo y límites

Evitar esperas indefinidas al adquirir conexiones y preparar un cierre ordenado
del pool. Separar este trabajo de la futura frontera entre consultas públicas y
escrituras operativas. El MVP sigue sin login y Partner queda fuera de alcance.

## T46a Configuración acotada del pool

- Archivos (máximo 3): `backend/src/config/database.js`,
  `backend/test/database.test.js`, `tasks/todo.md`.
- Criterios: (1) `max` explícito por defecto 10 e `idleTimeoutMillis` 10000,
  como los valores actuales de `pg`; (2) `connectionTimeoutMillis` por defecto
  5000 para no esperar indefinidamente; (3) los overrides `DB_POOL_MAX` (1–20),
  `DB_CONNECT_TIMEOUT_MS` (100–30000) y `DB_IDLE_TIMEOUT_MS` (1000–60000) solo
  aceptan enteros decimales canónicos, con fallback seguro si son inválidos.
- Verificación: `cd backend; node --test test/database.test.js; npm test; npm
  audit --omit=dev --audit-level=low; git diff --check`.
- Rollback: revertir solo el commit T46a. Sin cambio de esquema, consultas,
  credenciales, TLS ni contratos HTTP.

## T46b Cierre ordenado

### T46b1 Cierre idempotente del runtime de base de datos

- Archivos (máximo 3): `backend/src/config/database.js`,
  `backend/test/database.test.js`, `tasks/todo.md`.
- Criterios: `closeDB()` no crea pool si nunca se usó, espera exactamente una
  llamada a `pool.end()` aun con cierres concurrentes y rechaza nuevas
  adquisiciones después de iniciar el cierre. Si `pool.end()` falla, el error
  se propaga sin imprimir configuración o credenciales.
- Verificación: `cd backend; node --test test/database.test.js; npm test`.
- Rollback: revertir solo T46b1; no cambia arranque ni señales.

### T46b2 Integración con servidor

- Requiere T46b1 y spec de handler propio. Esperar `server.close()` antes de
  `pool.end()`; no registrar handlers globales cuando `server.js` se importa en
  pruebas. Evitar logs con secretos y verificar con servidor/pool inyectados y
  smoke de SIGTERM. Sin cambio del contrato HTTP ni Partner.

## T46c Frontera pública/operativa

- Decisión expresa del usuario: desactivar temporalmente en producción las
  escrituras de empresas y puntos mientras se define un canal privado; el MVP
  no añadirá login por ahora. Antes del cutover se inventariarán métodos/rutas
  y consumidores para preservar la lectura pública y los demás flujos.
- Inventario auditado: bloquear solo `POST /api/empresas`,
  `PUT /api/empresas/:id`, `POST /api/agencias` y
  `PUT /api/locations/:id` cuando `NODE_ENV=production`, antes de parsear
  multipartes o cuerpos grandes. Sus consumidores actuales son el admin de
  `MobileAppComponent`, `AdminComponent` y los servicios `EmpresasService` y
  `UbicacionesService`. Mantener GET de empresas/ubicaciones/plantilla, POST de
  rutas ETA y POST de Maps/Places; no bloquear `OPTIONS` de preflight.
- Contrato propuesto para solicitudes bloqueadas: 403 y cuerpo genérico
  `{ "error": "Operational writes are disabled" }`, sin revelar detalles
  internos. Desarrollar primero pruebas HTTP reales que distingan producción
  de desarrollo y no invoquen Cloudinary ni repositorios si se bloquea.
- No se deshabilitan rutas de administración ni se alteran CORS, tamaños o
  límites de tasa globales en T46a/b. La política tendrá spec, pruebas de
  contrato y rollback propios antes de tocar `server.js` o routers.

## Fuentes

- [Pool de node-postgres](https://node-postgres.com/apis/pool): `max` 10 e
  `idleTimeoutMillis` 10000 son defaults; `connectionTimeoutMillis` 0 espera
  sin límite.
- [Client de node-postgres](https://node-postgres.com/apis/client): los
  timeouts de consulta y transacción existen, pero requieren medir T14 antes
  de fijar umbrales que podrían cortar cálculos ETA legítimos.
