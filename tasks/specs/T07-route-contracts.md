# T07 Contratos de búsqueda de rutas

## Objetivo

Hacer explícito y ejecutable el contrato observable de los tres endpoints legacy
de rutas antes de añadir validación o extraer casos de uso. T07 documenta lo que
existe; T44 diseñará el contrato objetivo versionado y sus envelopes.

## Superficie incluida

- `POST /api/get-upcoming-routes`
- `POST /api/search-routes-by-municipality`
- `POST /api/search-flights`

Se caracterizan variantes scalar/array, defaults de fecha/hora, 400, 404, 500,
`success: false`, orden y nombres de campos. No se modifica comportamiento.

## Fuente de verdad y comandos

- `docs/contracts/routes-legacy-v1.md`: matriz humana de requests/responses.
- `backend/test/fixtures/routes-contract-v1.json`: ejemplos JSON sin secretos.
- `backend/test/rutas-contract.test.js`: contrato HTTP con Express y servicios
  inyectados/mocked de forma restaurable.
- Focalizada: `cd backend; node --test test/rutas-contract.test.js`
- Completa: `cd backend; node --test`
- Sintaxis/JSON: `cd backend; node -e "JSON.parse(require('node:fs').readFileSync('test/fixtures/routes-contract-v1.json','utf8'))"; node -c test/rutas-contract.test.js`

## Paquetes ejecutables

### T07a Matriz y fixtures legacy

- **Archivos (2):**
  - `docs/contracts/routes-legacy-v1.md`
  - `backend/test/fixtures/routes-contract-v1.json`
- **Criterios de aceptación:**
  1. Registrar campos requeridos/opcionales, variantes y status HTTP observados.
  2. Distinguir contrato documentado, peculiaridad legacy y objetivo diferido.
  3. Fixtures válidos, mínimos, deterministas y sin datos/credenciales reales.
- **Verificación:** `cd backend; node -e "JSON.parse(require('node:fs').readFileSync('test/fixtures/routes-contract-v1.json','utf8')); console.log('ok')"`

### T07b Pruebas de contrato HTTP

- **Dependencia:** T07a.
- **Archivos (1):** `backend/test/rutas-contract.test.js`
- **Criterios de aceptación:**
  1. Probar status, content-type y cuerpo exacto de éxito/error para los tres
     endpoints y variantes documentadas.
  2. Ejecutar el ciclo real de Express sobre un puerto efímero local, sin red
     externa, DB ni reloj global.
  3. Restaurar dobles después de cada prueba y evitar `require.cache` mutable
     compartido entre pruebas concurrentes.
- **Verificación:** `cd backend; node --test test/rutas-contract.test.js; node --test`

### T07c Tipos de consumo frontend

- **Dependencia:** T07a.
- **Archivos (2):**
  - `frontend/src/app/core/models/route-contracts.ts`
  - `frontend/src/app/core/models/route-contracts.spec.ts`
- **Criterios de aceptación:**
  1. Modelar requests/responses legacy como uniones discriminables sin `any`.
  2. Mantener separadas las variantes scalar/collection y resultados de negocio.
  3. Verificar fixtures representativos y exhaustividad de variantes.
- **Verificación:** `cd frontend; npm test -- --watch=false --include='src/app/core/models/route-contracts.spec.ts'; npm run build`

## Límites

- **Siempre:** tratar toda salida HTTP observable como contrato transitorio.
- **Requiere aprobación:** corregir peculiaridades, renombrar campos, versionar,
  añadir paginación o cambiar status/envelopes.
- **Nunca:** tocar Partner, ETA, SQL, controladores/servicios productivos,
  dependencias o despliegues en T07.

## Éxito y aprobación

T07 termina cuando la matriz, fixtures, pruebas HTTP y tipos frontend coinciden.
¿Se aprueba congelar las peculiaridades legacy hasta que T44 publique un contrato
versionado con estrategia de migración?
