# T06 Modelos y DTOs de ubicaciones

## Objetivo

Reemplazar `unknown`/`any` en la lectura pública de ubicaciones por contratos
TypeScript y un mapper de frontera que trate HTTP como entrada no confiable. Los
nombres legacy (`id_destino`, `nombre_destino`, `horarios_operativos`) se conservan
hasta T13/T44; este paquete no cambia el backend ni Partner.

## Supuestos

- `GET /api/locations` continúa devolviendo un array sin envelope.
- `id` e `id_destino` pueden ser `string | number` durante la transición.
- Coordenadas pueden llegar como número o string numérico desde PostgreSQL.
- La dirección wire usa `direccion_referencia`; el mapper puede aceptar también
  `direccion` como alias de lectura ya consumido por el frontend, sin emitirlo al
  backend.
- Campos desconocidos se ignoran; registros sin identidad/nombre utilizable se
  descartan de forma determinista en la frontera.

## Estructura y comandos

- `frontend/src/app/core/models/location.models.ts`: DTO wire-compatible y modelo
  de lectura público `DeliveryPoint` (evita colisión con el tipo DOM `Location`).
- `frontend/src/app/core/models/location.mapper.ts`: guards y mapper puro.
- `frontend/src/app/core/models/location.mapper.spec.ts`: casos adversos.
- `frontend/src/app/core/services/ubicaciones.service.ts`: integración HTTP.
- Pruebas: `cd frontend; npm test -- --watch=false`
- Build: `cd frontend; npm run build`
- Auditoría: `cd frontend; npm audit --omit=dev`

## Paquetes ejecutables

### T06a Contratos TypeScript wire-compatible

- **Archivos (1):** `frontend/src/app/core/models/location.models.ts`
- **Criterios de aceptación:**
  1. Definir DTOs explícitos para ubicación, horario, regla y punto sin `any`.
  2. Representar ausencias como opcionales/null solo donde la respuesta vigente
     realmente las permite, conservando nombres legacy.
  3. No exportar tipos de escritura ni tipos de Partner.
- **Verificación:** `cd frontend; npx tsc --noEmit -p tsconfig.app.json`

### T06b Mapper de frontera

- **Dependencia:** T06a.
- **Archivos (2):**
  - `frontend/src/app/core/models/location.mapper.ts`
  - `frontend/src/app/core/models/location.mapper.spec.ts`
- **Criterios de aceptación:**
  1. Convertir `unknown` a modelos nuevos sin mutar/retener aliases del payload.
  2. Validar coordenadas finitas/rangos, arrays de horarios/reglas y strings,
     descartando registros inválidos sin lanzar por un elemento defectuoso.
  3. Probar null, tipos hostiles, getters, arrays mezclados y objetos congelados.
- **Verificación:** `cd frontend; npm test -- --watch=false --include='src/app/core/models/location.mapper.spec.ts'`

### T06c Integración del servicio público

- **Dependencia:** T06b.
- **Archivos (2):**
  - `frontend/src/app/core/services/ubicaciones.service.ts`
  - `frontend/src/app/core/services/ubicaciones.service.spec.ts`
- **Criterios de aceptación:**
  1. `getLocations()` solicita `unknown` y mapea a `Observable<DeliveryPoint[]>`.
  2. URL, cantidad de requests y comportamiento de error HTTP se preservan.
  3. Métodos de escritura quedan sin rediseñar y Partner no se modifica.
- **Verificación:** `cd frontend; npm test -- --watch=false --include='src/app/core/services/ubicaciones.service.spec.ts'; npm run build; npm audit --omit=dev`

## Límites

- **Siempre:** validar HTTP en la frontera y mantener modelos inmutables por tipo.
- **Requiere aprobación:** renombrar campos, resolver IDs, cambiar envelopes o
  respuestas backend.
- **Nunca:** tocar Partner, SQL, ETA, dependencias o producción.

## Éxito y aprobación

T06 termina cuando la lectura pública no expone `any`/`unknown`, los payloads
hostiles están cubiertos y el build permanece verde. ¿Se aprueba descartar
individualmente registros inválidos y conservar los nombres wire legacy?

## Estado

T06a aceptado por Codex: contrato wire y modelo público compilados con TypeScript
estricto, sin cambios de runtime ni dependencias.
