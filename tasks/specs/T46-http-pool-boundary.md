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

- Requiere spec y pruebas propios después de T46a. Exponer un cierre idempotente
  de pool; esperar `server.close()` antes de `pool.end()`; no registrar handlers
  globales cuando `server.js` se importa en pruebas. Evitar logs con secretos.
- Verificar unidades con pool/servidor inyectados y un smoke con SIGTERM.

## T46c Frontera pública/operativa

- Aplazado hasta decidir cómo autorizar la escritura del panel sin login. No
  se deshabilitan rutas de administración ni se alteran CORS, tamaños o límites
  de tasa globales en T46a/b. Una política de lectura pública y operación
  protegida tendrá contrato y despliegue propios.

## Fuentes

- [Pool de node-postgres](https://node-postgres.com/apis/pool): `max` 10 e
  `idleTimeoutMillis` 10000 son defaults; `connectionTimeoutMillis` 0 espera
  sin límite.
- [Client de node-postgres](https://node-postgres.com/apis/client): los
  timeouts de consulta y transacción existen, pero requieren medir T14 antes
  de fijar umbrales que podrían cortar cálculos ETA legítimos.
