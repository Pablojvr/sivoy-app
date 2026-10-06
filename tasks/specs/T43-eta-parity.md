# T43 — Paridad de Snapshot ETA

## Resumen ejecutivo

Este documento establece el contrato, arquitectura y estrategia de validación para garantizar **100% de paridad** entre el comportamiento actual de proyección/cálculo logístico y la evolución modular del motor ETA en SiVoy.

El proceso se estructura en fases estrictamente incrementales e independientes:
- **T43a**: Comparador estructural puro inmutable y pruebas de caracterización RED (completado y auditado).
- **T43b**: Referencia legacy de test con procedencia SHA fija, adaptadores normalizadores a snapshot canónico y matriz offline ("golden dataset") de 26 escenarios sin alterar respuestas a clientes (completado y auditado).
- **T43c1**: Referencia legacy de runtime independiente (`backend/src/core/eta/legacy-shadow-reference.js`) y matriz de procedencia/paridad offline (26 escenarios) comparando el fixture legacy frente a la referencia de runtime, con límite estricto de 3 archivos, rollback aislado y sin integración en flujos de producción (completado y auditado; T43 sigue abierto).
- **T43c2**: Shadow-run runtime controlado y observabilidad, descompuesto en seis sub-slices atómicos (máx. 3 archivos y rollback atómico cada uno):
  - **T43c2a**: Adaptador runtime puro del motor actual (`calculateOfficialEntry`, `validateDesiredDate`, `projectRoutes`) hacia `CanonicalEtaSnapshot` + matriz offline de 26 escenarios contra el adaptador de test. Sin rutas, cola ni observabilidad. Salida profundamente inmutable y desacoplada; runtime no importa `backend/test/*`. Depende de T43c1 (completado y auditado).
  - **T43c2b**: Runner con dependencias inyectadas y cola FIFO acotada en background, disabled by default con flag exacto `process.env.ETA_SHADOW_PARITY === 'true'`, ejecución diferida con política `drop-on-full` ante saturación (reconociendo que `setImmediate` no elimina contención de CPU en Node.js de hilo único), aislamiento total de excepciones y pruebas unitarias. Sin integración HTTP. Depende de T43c2a.
  - **T43c2d1**: Telemetría pura de shadow-run con factory y singleton `defaultEtaShadowTelemetry` (`resetMetrics` para pruebas), contadores agregados y labels de cardinalidad fija bajo allowlist cerrada; snapshot de métricas profundamente inmutable (`Object.freeze`) y desconectado del estado interno; sin timestamps ni `lastEvaluatedAt`; pruebas que serializan salida confirman ausencia total de `expected`/`actual`, payloads de entrada, IDs de puntos, nombres, fechas, horarios, reglas, stack y errores raw; match no emite logs ni métricas de divergencia. Depende de T43c2b.
  - **T43c2c**: Integración del puerto shadow en los casos de uso / composition root sin `await` y sin cambiar status/body/headers HTTP. Copias defensivas de entrada al runner (nunca referencias mutables del request ni entidades de dominio). Inyección de runner y telemetría en `createRutasService` para tests; runtime singleton usa `defaultEtaShadowTelemetry` sin reexportarlo desde `rutas.service.js`. Falla de runner/telemetría nunca afecta la respuesta HTTP. Validación ejecuta también `node --test test/rutas-contract.test.js` sin modificar ese cuarto archivo. Depende de T43c2b y T43c2d1.
  - **T43c2d2**: Exposición y composición de métricas shadow en observabilidad con contrato de `/api/metrics` preservado (autenticado por Bearer token, 404 y `no-store`) y sin nuevos endpoints públicos. Compositor genérico de providers en `observability-routes.js` sin acoplamiento a ETA; `server.js` importa directamente `defaultEtaShadowTelemetry` (sin pasar por `rutas.service.js`); compatibilidad aditiva exacta de raíz con clave reservada fija `etaShadowParity` (ausente si `process.env.ETA_SHADOW_PARITY !== 'true'`, presente con contadores en cero si está activo sin trabajos evaluados); detección de colisiones con error genérico; fail-open a HTTP-only ante fallos de snapshot shadow sin filtrar error ni afectar rutas de negocio; sin datos sensibles. Depende de T43c2c.
  - **T43c2e**: Staging real: verificar `America/El_Salvador`, CPU, profundidad/descartes de cola, latencia p95/p99 y paridad estricta (0% divergencia). Procedimiento de rollback operativo cambiando/removiendo la variable con reinicio/redeploy controlado de la plataforma sin requerir revertir código. Activación productiva solo tras validación satisfactoria. Depende de todos los slices anteriores (`T43c2a` a `T43c2d2`).

## 1. Alcance y Fronteras

### En alcance
- **Fase T43a**:
  - Especificación formal del contrato canónico de snapshot ETA.
  - Especificación del comparador puro `compareEtaSnapshots(expected, actual)`.
  - Pruebas unitarias de caracterización exhaustivas en `backend/test/eta-parity-comparator.test.js`.
  - Límite estricto de archivos: máximo 3 archivos para T43a (spec, implementación del comparador, suite de test).
- **Fase T43b**:
  - Referencia legacy congelada desde `backend/services/logistics.js` en el commit
    `87684cbbca2f9e959d9c78f7fc3cc02c8e7895a4`, anterior a la extracción del
    núcleo ETA puro y posterior a la caracterización de horarios. La
    transcripción conserva la forma pública enumerable y añade únicamente
    metadatos no enumerables en cada rama ejecutada para observar su semántica
    sin reconstruirla en el adaptador.
  - Adaptador de prueba que ejecuta ambos motores con la misma entrada y
    normaliza sus resultados a la estructura canónica. El adaptador conserva
    estados semánticos de ingreso (`PIN`, `ACTIVE_TODAY`, `ACTIVE_FUTURE`, `BEFORE_NEXT_INTERVAL`,
    `CLOSED_UNTIL_NEXT_DAY`, `NO_OPERATING_DAYS`), el siguiente intervalo,
    estados de validación (`APPROVED`, `REJECTED_CUTOFF`, `NO_DELIVERY`, `PIN`)
    y la fecha de corte ISO. La clasificación se deriva de datos estructurados
    y reglas congeladas, nunca del copy localizado.
  - Matriz offline de casos representativos: agencias, puntos fijos, pins,
    horarios partidos, cortes, límites de mes y año bisiesto. Los festivos no
    formaban parte del contrato legacy y quedan fuera de T43b hasta el cutover
    del calendario operativo.
  - Verificación de paridad estricta al 100%; cualquier divergencia legítima debe ser documentada explícitamente en el spec y nunca silenciada.
- **Fase T43c1 (Referencia Runtime Independiente y Paridad Estricta — COMPLETADA Y AUDITADA)**:
  - Módulo de referencia legacy para runtime: `backend/src/core/eta/legacy-shadow-reference.js`.
  - Transcripción productiva congelada desde SHA `87684cbbca2f9e959d9c78f7fc3cc02c8e7895a4`.
  - Contrato público: exporta `runLegacyEtaScenario(scenario)` y devuelve el mismo `CanonicalEtaSnapshot` generado por `runLegacyEtaScenario(fixtureEngine, scenario)` del soporte de test.
  - Aislamiento estricto de dependencias verificado:
    - **Prohibido importar fixtures de test en producción**: no importa ningún archivo bajo `backend/test/*`.
    - **Prohibido importar módulos actuales de producción**: no importa `official-entry`, `route-projection` ni ningún otro módulo modularizado actual.
    - **Operación pura**: no registra logs (`console.*` ni loggers) ni muta objetos de entrada.
  - Matriz de procedencia/paridad: verificación offline contra los 26 escenarios del golden dataset comparando el snapshot del fixture legacy esperado frente al snapshot de runtime (`compareEtaSnapshots(expectedSnapshot, runtimeSnapshot)`).
  - Frontera de integración: referencia runtime aislada y validada exclusivamente en pruebas, sin integración todavía a endpoints ni servicios en T43c1.
  - Evidencia auditada de cierre:
    - Commit: `2731f05856eb0669831e421b8576deebeeeea624`.
    - CI GitHub Actions: [run 37070686298](https://github.com/Pablojvr/sivoy-app/actions/runs/37070686298) completo success (Backend CI y Frontend CI success).
    - Pruebas: suite focalizada 59/59, suite backend 421/421 verdes.
    - Revisión adversarial: Antigravity APPROVE (0 Critical, 0 Required).
    - T43 permanece abierto para la ejecución de T43c2.
- **Fase T43c2 (Shadow-Run Runtime Controlado y Observabilidad)**:
  - Descompuesta en seis sub-slices atómicos (máx. 3 archivos y rollback atómico cada uno):
  - **T43c2a**: Adaptador runtime puro del motor actual (`calculateOfficialEntry`, `validateDesiredDate`, `projectRoutes`) hacia `CanonicalEtaSnapshot` + matriz offline de 26 escenarios contra el adaptador de test. Sin rutas, cola ni observabilidad. Salida profundamente inmutable y desacoplada; a diferencia de la referencia legacy, el adaptador actual puede importar los módulos ETA actuales (`official-entry.js`, `route-projection.js`), pero tiene prohibido importar `backend/test/*`. Depende de T43c1 (completado y auditado).
  - **T43c2b**: Runner con dependencias inyectadas y cola FIFO acotada en background, disabled by default condicionado estrictamente a `process.env.ETA_SHADOW_PARITY === 'true'` (cualquier otro valor o su ausencia lo mantiene apagado), ejecución diferida sin fallback inline (`setImmediate` no elimina contención de CPU en Node.js de hilo único, por lo que la cola acotada y descarte `drop-on-full` son obligatorios), aislamiento total de excepciones y pruebas unitarias. Sin integración HTTP. Depende de T43c2a.
  - **T43c2d1**: Telemetría pura de shadow-run con factory y singleton `defaultEtaShadowTelemetry` (`resetMetrics` para pruebas), contadores y labels de cardinalidad fija bajo allowlist cerrada. Snapshot de métricas profundamente inmutable (`Object.freeze`) y desconectado del estado interno. Pruebas que serializan salida confirman ausencia total de `expected`/`actual`, payloads de entrada, IDs de puntos, nombres, fechas, horarios, reglas, stack y errores raw; match no emite logs ni métricas de divergencia; sin timestamps ni `lastEvaluatedAt`. Depende de T43c2b.
  - **T43c2c**: Integración del puerto shadow en los casos de uso / composition root sin `await` y sin alterar status code, body ni headers HTTP. El runner recibe copias defensivas aisladas, nunca referencias mutables del request ni entidades de dominio. Inyección de runner y telemetría en `createRutasService` para pruebas; el singleton productivo consume `defaultEtaShadowTelemetry` sin reexportarlo desde `rutas.service.js` para que `server.js` lo consuma. Falla del runner/telemetría nunca afecta la respuesta HTTP. La contención de CPU, profundidad de cola y latencia se miden en staging. Validación ejecuta también `node --test test/rutas-contract.test.js` sin modificar ese cuarto archivo. Depende de T43c2b y T43c2d1.
  - **T43c2d2**: Exposición y composición de métricas shadow en observabilidad existente (`observability-routes.js`, `server.js`, `observability-routes.test.js` exactamente), preservando estrictamente el contrato autenticado de `/api/metrics` (Bearer token, 404 y `no-store`) y sin introducir nuevos endpoints públicos. Compositor genérico de providers en `observability-routes.js` sin acoplamiento a ETA; `server.js` importa directamente `defaultEtaShadowTelemetry` (sin pasar por `rutas.service.js`); compatibilidad aditiva de raíz con clave reservada fija `etaShadowParity` (ausente si `ETA_SHADOW_PARITY !== 'true'`, con contadores en cero si activo sin trabajos evaluados), sin colisión silenciosa (error genérico ante colisión), fail-open a HTTP-only si falla el snapshot shadow sin filtrar errores ni afectar rutas de negocio; sin datos sensibles. Depende de T43c2c.
  - **T43c2e**: Staging real: verificación en zona horaria `America/El_Salvador`, midiendo uso de CPU, profundidad y descartes de cola, latencia p95/p99 y paridad estricta (0% divergencia). Verificación de rollback operativo cambiando/removiendo la variable con reinicio/redeploy controlado de la plataforma sin requerir revertir código. Activación productiva solo tras validación satisfactoria. Depende de todos los slices anteriores (`T43c2a` a `T43c2d2`).

### Fuera de alcance
- Respuestas de API y rutas HTTP (se mantienen idénticas para los clientes).
- Base de datos, SQL, migraciones y esquemas relacionales.
- Integración con Partner, autenticación y credenciales.
- Acceso a red exterior o dependencias de terceros no existentes en el core.
- Copy localizado y mensajes en lenguaje natural (las cadenas localizadas no se comparan en el snapshot porque este ya contiene los valores semánticos normalizados).

---

## 2. Contrato de Snapshot Canónico (T43a)

El snapshot canónico representa el estado logístico puro de una cotización o cálculo ETA sin decoración de interfaz ni cadenas de texto regionalizadas.

### 2.1 Estructura del Snapshot

```typescript
export interface EtaInterval {
  openTime: string;  // Formato militar de 24 horas 'HH:mm' (ej: '08:00', '16:30')
  closeTime: string; // Formato militar de 24 horas 'HH:mm' (ej: '12:00', '20:00')
}

export interface ProjectedRoute {
  date: string;              // Fecha calendario ISO 'YYYY-MM-DD'
  intervals: EtaInterval[];  // Intervalos de servicio disponibles, orden cronológico estricto
}

export interface OfficialEntrySnapshot {
  status: string;            // Estado canónico (ej: 'ACTIVE_TODAY', 'BEFORE_NEXT_INTERVAL')
  officialDate: string | null; // Fecha canónica 'YYYY-MM-DD' o null si no aplica
  nextInterval: EtaInterval | null; // Siguiente intervalo relevante o null
}

export interface RouteValidationSnapshot {
  status: string;            // Viabilidad (ej: 'APPROVED', 'REJECTED_CUTOFF', 'NO_DELIVERY')
  cutoffDate: string | null; // Fecha límite calculada 'YYYY-MM-DD' o null
}

export interface CanonicalEtaSnapshot {
  officialEntry: OfficialEntrySnapshot;
  routeValidation: RouteValidationSnapshot | null;
  projectedRoutes: ProjectedRoute[];
}
```

---

## 3. Especificación del Comparador (`eta-parity-comparator.js`)

- **Ubicación del futuro módulo**: `backend/src/core/eta/eta-parity-comparator.js`
- **Firma exportada**:
  ```javascript
  function compareEtaSnapshots(expected, actual): ComparisonResult
  ```

### 3.1 Estructura del Resultado

```typescript
export type DifferenceKind = 'changed' | 'missing' | 'unexpected';

export interface Difference {
  path: string;            // Ruta en notación punto/índice (ej: 'officialEntry.status', 'projectedRoutes[0].intervals[1].openTime')
  kind: DifferenceKind;    // Tipo de divergencia
  expected?: unknown;      // Valor esperado (presente en 'changed' y 'missing')
  actual?: unknown;        // Valor obtenido (presente en 'changed' y 'unexpected')
}

export interface ComparisonResult {
  matches: boolean;
  differences: readonly Difference[];
}
```

### 3.2 Reglas Operativas del Comparador

1. **Determinismo y sensibilidad al orden**:
   - `projectedRoutes` y `intervals` se comparan elemento por elemento por índice posicional. Si el orden de dos rutas o intervalos se altera, se reporta como divergencia (`changed` o desalineación de elementos).
2. **Clasificación estricta de `kind`**:
   - `changed`: La propiedad o elemento existe en ambos snapshots, pero sus valores difieren. Debe poblar `expected` y `actual`.
   - `missing`: La propiedad o elemento existe en `expected`, pero está ausente en `actual`. Debe poblar `expected`.
   - `unexpected`: La propiedad o elemento está presente en `actual`, pero no existe en `expected`. Debe poblar `actual`.
3. **Orden canónico y estable de `differences`**:
   - Las diferencias deben devolverse ordenadas de forma estable y determinista según `path` (orden lexicográfico estándar).
4. **Inmutabilidad profunda**:
   - El objeto retornado, el array `differences` y cada objeto individual `Difference` dentro del array deben ser profundamente inmutables (`Object.freeze`).
   - Los valores asignados a `expected` y `actual` dentro de cada `Difference` no deben retener referencias mutables a las estructuras de entrada (se aíslan/copian de forma defensiva).
5. **No mutación de entradas**:
   - La función jamás modifica los objetos `expected` ni `actual` recibidos como argumento.
6. **Validación de tipos y sanitización**:
   - Si `expected` o `actual` son `null`, `undefined`, tipos primitivos, arrays o contienen referencias circulares, funciones o `BigInt`, debe lanzarse un `TypeError`.
   - El mensaje del error debe ser genérico (por ejemplo: `"Invalid canonical ETA snapshot: expected a plain serializable object"`) para prevenir la filtración de datos de payload o información sensible en los mensajes de excepción.
7. **Coincidencia exacta**:
   - Cuando los objetos son idénticos estructuralmente, se retorna estrictamente `{ matches: true, differences: [] }`.
   - El comparador no sustituye la validación del esquema canónico: T43b es responsable de producir snapshots con todos los campos requeridos antes de compararlos.

---

## 4. Especificación de la Referencia Legacy de Runtime (`legacy-shadow-reference.js` — T43c1)

- **Ubicación del futuro módulo**: `backend/src/core/eta/legacy-shadow-reference.js`
- **Firma exportada**:
  ```javascript
  function runLegacyEtaScenario(scenario): CanonicalEtaSnapshot
  ```
- **Origen y procedencia**:
  - Transcripción productiva congelada a partir del commit `87684cbbca2f9e959d9c78f7fc3cc02c8e7895a4` de `backend/services/logistics.js` (estado previo a la modularización ETA y posterior a la caracterización de horarios).
- **Contrato de salida**:
  - Retorna exactamente el mismo `CanonicalEtaSnapshot` generado por `runLegacyEtaScenario(fixtureEngine, scenario)` del soporte de test (`backend/test/support/eta-parity-snapshot.js`).
- **Restricciones de arquitectura y seguridad**:
  - **Aislamiento de producción**: Prohibido terminantemente importar archivos desde `backend/test/*` (ningún fixture de prueba debe entrar al runtime de producción).
  - **Desacoplamiento de módulos actuales**: Prohibido importar módulos del motor modularizado (`official-entry.js`, `route-projection.js`, etc.).
  - **Inmutabilidad y pureza**: No debe registrar logs (`console.log`, `console.warn`, `console.error` o loggers externos) ni mutar los objetos de entrada (`scenario`, `origin`, `destination`, etc.).
  - **Sin integración en T43c1**: La referencia de runtime no se integra todavía a rutas, controladores ni servicios de producción en esta fase.
- **Límite de cambios y rollback**:
  - Máximo 3 archivos para el slice T43c1 (`tasks/specs/T43-eta-parity.md`, `backend/test/eta-parity-matrix.test.js`, `backend/src/core/eta/legacy-shadow-reference.js`).
  - Rollback: reversión atómica del commit de T43c1 o eliminación de `backend/src/core/eta/legacy-shadow-reference.js` sin efectos colaterales en el sistema.

### 4.1 Evidencia de Cierre Auditado de T43c1
- **Commit atómico**: `2731f05856eb0669831e421b8576deebeeeea624`
- **Integración continua**: GitHub Actions [run 37070686298](https://github.com/Pablojvr/sivoy-app/actions/runs/37070686298) completado con status `success` en todos sus jobs (Backend CI: success, Frontend CI: success).
- **Pruebas automatizadas**:
  - Pruebas focalizadas de paridad: 59/59 pasadas (`backend/test/eta-parity-matrix.test.js`).
  - Suite completa de backend: 421/421 pasadas.
- **Auditoría adversarial**: Revisión adversarial independiente por Antigravity dictaminada como `APPROVE` con 0 hallazgos Critical y 0 hallazgos Required.
- **Estado del paquete T43**: T43c1 queda oficialmente cerrado y auditado. El paquete T43 permanece abierto para acometer la fase T43c2 descompuesta en sus slices atómicos.

---

## 5. Estrategia Incremental y Despliegue

```
+-------------------------------------------------------------+
| T43a: Comparador puro + pruebas RED (COMPLETADO)            |
| - eta-parity-comparator.js                                  |
| - eta-parity-comparator.test.js                             |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| T43b: Matriz offline de paridad golden (COMPLETADO)         |
| - Referencia legacy en commit 87684cbb...                   |
| - 26 escenarios offline, paridad 100% en America/El_Salvador|
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| T43c1: Referencia runtime independiente (COMPLETADO)        |
| - legacy-shadow-reference.js desacoplado de test y modular  |
| - 26 escenarios offline validados contra fixture            |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| T43c2a: Adaptador runtime puro del motor actual             |
| - current-runtime-adapter.js -> CanonicalEtaSnapshot        |
| - Matriz offline de 26 escenarios vs adaptador de test      |
| - Exactamente 3 archivos, sin rutas, cola ni observabilidad |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| T43c2b: Runner y cola FIFO acotada en background            |
| - Inyección de dependencias, ETA_SHADOW_PARITY === 'true'   |
| - Cola acotada, política drop-on-full, ejecución diferida   |
| - Aislamiento total de excepciones, sin integración HTTP    |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| T43c2d1: Telemetría pura con allowlist de métricas          |
| - Cardinalidad fija y snapshot desconectado                 |
| - Ausencia de datos sensibles                               |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| T43c2c: Integración del puerto shadow en composition root   |
| - Sin await y respuestas HTTP 100% idénticas                |
| - Copias defensivas aisladas                                |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| T43c2d2: Exposición en /api/metrics con token               |
| - Contrato de raíz preservado y sin endpoint público        |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| T43c2e: Verificación en staging real y activación controlada|
| - Validación en America/El_Salvador (100% paridad)          |
| - Medición de CPU, cola/drops, latencia p95/p99             |
| - Rollback operativo cambiando/removiendo variable          |
| - Activación productiva condicionada a aprobación           |
+-------------------------------------------------------------+
```

### 5.1 Descomposición Detallada de T43c2 (Slices Atómicos)

Cada slice tiene un límite estricto de máximo 3 archivos modificados, hasta 3 criterios de aceptación y una ruta de rollback atómica:

1. **T43c2a — Adaptador runtime puro del motor actual**:
   - **Propósito**: Adaptar la salida de las funciones del core actual (`calculateOfficialEntry`, `validateDesiredDate`, `projectRoutes`) a `CanonicalEtaSnapshot` en runtime puro.
   - **Alcance**: Adaptador puro y suite comparativa offline de 26 escenarios contra el adaptador de test. Sin endpoints HTTP, sin cola y sin observabilidad.
   - **Archivos previstos (exactamente 3)**:
     - `backend/src/core/eta/current-runtime-adapter.js`
     - `backend/test/eta-parity-matrix.test.js`
     - `tasks/specs/T43-eta-parity.md`
   - **Archivos prohibidos**: Rutas HTTP, controladores, runner, observabilidad, dependencias externas.
   - **Regla de importación**: A diferencia de la referencia legacy, el adaptador actual **puede** importar los módulos ETA actuales (`official-entry.js`, `route-projection.js`), pero tiene **prohibido terminantemente** importar `backend/test/*`. Salida profundamente inmutable (`Object.freeze`) y desacoplada.
   - **Criterios de aceptación**:
     1. Adapta las salidas de las funciones del core actual (`calculateOfficialEntry`, `validateDesiredDate`, `projectRoutes`) produciendo `CanonicalEtaSnapshot` idéntico al adaptador de prueba sobre los 26 escenarios del golden dataset.
     2. Función pura, determinista y de salida profundamente inmutable (`Object.freeze`) y desacoplada, sin mutar entradas ni emitir logs.
     3. Módulo runtime sin dependencias de `backend/test/*`, sin rutas HTTP, sin colas y sin observabilidad.
   - **Rollback**: Eliminación de `current-runtime-adapter.js` y reversión atómica del commit del slice.
   - **Comandos de verificación**:
     - `cd backend && npm test -- test/eta-parity-matrix.test.js`
     - `cd backend && npm test`
   - **Estado actual**: COMPLETADO Y AUDITADO. La fase RED falló por `MODULE_NOT_FOUND` antes de crear el adaptador. La implementación mínima compone los módulos ETA actuales sin duplicar sus reglas; 88/88 pruebas focalizadas y 450/450 pruebas backend están verdes. La prueba de mutación que retiró temporalmente `deepFreeze` falló en el control de inmutabilidad y el código fue restaurado antes de repetir la suite verde. Revisión adversarial Antigravity: `APPROVE`, 0 Critical y 0 Required.

2. **T43c2b — Runner y cola FIFO acotada en background**:
   - **Propósito**: Proveer el runner asíncrono con dependencias inyectadas para ejecutar la referencia legacy en modo shadow de manera segura.
   - **Alcance**: Runner con dependencias inyectadas y cola FIFO acotada, desactivado por defecto mediante verificación estricta de entorno: `process.env.ETA_SHADOW_PARITY === 'true'`. Cualquier otro valor o ausencia resulta en no-op inmediato.
   - **Archivos previstos (exactamente 3)**:
     - `backend/src/application/rutas/eta-shadow-runner.js`
     - `backend/test/eta-shadow-runner.test.js`
     - `tasks/specs/T43-eta-parity.md`
   - **Archivos prohibidos**: Controladores HTTP, routers de Express, esquemas de BD.
   - **Regla de importación**: Prohibido importar `backend/test/*` desde runtime.
   - **Contrato fijado en pruebas**:
     - **Exportaciones CommonJS**: Función factory `createEtaShadowRunner(options)` y constantes congeladas `SHADOW_RUNNER_STATUS`, `SHADOW_RUNNER_EVENT`, `SHADOW_RUNNER_STAGE`.
     - **Opciones de la factory**: `env = process.env`, `maxQueueSize = 100`, `defer = setImmediate`, `clone = structuredClone`, `runLegacy`, `runCurrent`, `compare`, `onEvent = () => {}`. No existe override `enabled`; la activación se resuelve una única vez al construir mediante `env?.ETA_SHADOW_PARITY === 'true'`. Dependencias funcionales (`runLegacy`, `runCurrent`, `compare`, y si se proveen `defer`, `clone`, `onEvent`) y `maxQueueSize` (entero positivo mayor a cero) se validan estrictamente al construir lanzando `TypeError` o `RangeError`.
     - **API pública congelada**: Objeto inmutable (`Object.isFrozen`) exponiendo únicamente `enqueue(scenario)` y `getQueueDepth()`. Profundidad refleja trabajos pendientes sin exponer referencias ni arrays internos.
     - **Retorno de `enqueue`**: Retorna únicamente valores de `SHADOW_RUNNER_STATUS`: `DISABLED`, `ENQUEUED`, `DROPPED` o `REJECTED`.
     - **Eventos emitidos vía `onEvent`**: Objetos exactos, congelados y estrictamente sanitizados: `{ type: 'ENQUEUED' }`, `{ type: 'DROPPED', reason: 'QUEUE_FULL' }`, `{ type: 'MATCH' }`, `{ type: 'MISMATCH' }`, `{ type: 'ERROR', stage: 'RUNNER' | 'LEGACY' | 'CURRENT' | 'COMPARE' }`. Prohibidos terminantemente: `payload`, `scenario`, `expected`, `actual`, `differences`, `paths`, `diffCount`, fechas/timestamps, IDs, objetos `Error`, `message` o `stack`.
     - **Comportamiento Disabled**: No clona, no encola, no difiere con `defer`, no invoca motores (`runLegacy`, `runCurrent`, `compare`) ni emite eventos; cualquier valor salvo la cadena exacta `'true'` (ej. `'1'`, `'TRUE'`, `'false'`, `undefined`) resulta en `DISABLED` y profundidad 0.
     - **Comportamiento Enabled**: Copia defensiva inmediata con `clone`; no retiene el objeto `scenario` recibido. Si la cola pendiente alcanzó `maxQueueSize`, ejecuta drop-tail antes de clonar (`DROPPED` + evento `QUEUE_FULL`, `clone` no se invoca). Si `clone` lanza, retorna `REJECTED` y emite `{ type: 'ERROR', stage: 'RUNNER' }` sin propagar excepción al llamador.
     - **Procesamiento diferido y un solo drain programado**: `enqueue` jamás calcula inline. Orden FIFO estricto, un trabajo por tick de `defer`; tras finalizar un tick programa el siguiente si restan trabajos pendientes. Si `defer` lanza síncronamente al programar el drain, se absorbe sin escapar, se libera el trabajo encolado, se retorna `REJECTED` y se emite `ERROR/RUNNER`.
     - **Aislamiento de excepciones por trabajo**: Tolera retorno síncrono o `Promise` de `runLegacy`, `runCurrent` y `compare`; errores síncronos o asíncronos en cualquier etapa se capturan, emiten únicamente el evento de `ERROR` correspondiente (`LEGACY`, `CURRENT`, `COMPARE`) y la cola continúa procesando trabajos posteriores. `compare.matches === true` emite `MATCH`; `false` emite `MISMATCH` sin diferencias. `onEvent` puede fallar o lanzar y se absorbe por completo.
   - **Criterios de aceptación**:
     1. Desactivado por defecto: activación condicionada estrictamente a `process.env.ETA_SHADOW_PARITY === 'true'`; cualquier otro valor o ausencia opera como no-op inmediato con dependencias inyectadas.
     2. Ejecución diferida en background con cola FIFO acotada y descarte `drop-on-full` ante saturación (reconociendo que `setImmediate` difiere el trabajo pero no elimina la contención de CPU en Node.js de hilo único).
     3. Aislamiento total de excepciones (captura absoluta de errores síncronos y asíncronos sin afectar al llamador ni al proceso) y pruebas unitarias aisladas sin integración HTTP.
   - **Rollback**: Operativamente, cambiar o remover `ETA_SHADOW_PARITY` y aplicar el reinicio/redeploy controlado que requiera la plataforma (sin requerir revertir código), o reversión atómica del commit.
   - **Comandos de verificación**:
     - `cd backend && npm test -- test/eta-shadow-runner.test.js`
     - `cd backend && npm test`
   - **Estado actual**: COMPLETADO Y AUDITADO. La fase RED falló por `MODULE_NOT_FOUND` antes de crear el runner. La implementación mantiene el flag desactivado por defecto, cola FIFO acotada, un trabajo por tick, descarte antes de clonar, aislamiento de errores y eventos sanitizados. Están verdes 25/25 pruebas focalizadas y 475/475 pruebas backend. Una mutación temporal del flag exacto fue detectada por dos pruebas y se restauró antes de repetir la suite verde. Revisión adversarial Antigravity con Gemini 3.8 Flash High: `APPROVE`, 0 Critical y 0 Required.

3. **T43c2d1 — Telemetría pura del shadow-run con contadores y cardinalidad fija**:
   - **Propósito**: Implementar módulo de telemetría puro con exportación de factory y singleton `defaultEtaShadowTelemetry`, contadores agregados y labels de cardinalidad fija bajo allowlist cerrada para métricas de paridad, sin timestamps.
   - **Alcance**: Exportación de factory y singleton `defaultEtaShadowTelemetry` con método `resetMetrics` para pruebas. Contadores agregados con labels de cardinalidad estrictamente fija. Snapshot retornado profundamente inmutable (`Object.freeze`) y desconectado del estado interno. Sin timestamps ni `lastEvaluatedAt`.
   - **Archivos previstos (exactamente 3)**:
     - `backend/src/core/eta/eta-shadow-telemetry.js`
     - `backend/test/eta-shadow-telemetry.test.js`
     - `tasks/specs/T43-eta-parity.md`
   - **Archivos prohibidos**: Loggers externos no autorizados, endpoints de usuario, dependencias no autorizadas.
   - **Regla de importación**: Prohibido importar `backend/test/*`.
   - **Contrato fijado en pruebas**:
     - **Exportaciones CommonJS**: Factory `createEtaShadowTelemetry()` y singleton aislado `defaultEtaShadowTelemetry`.
     - **API de instancia congelada**: Expone únicamente `recordEvent(event)`, `getSnapshot()` y `resetMetrics()`; no existe alias `onEvent` ni estado mutable público.
     - **Snapshot exacto de cardinalidad fija**: `{ enqueued, dropped: { QUEUE_FULL }, match, mismatch, errors: { RUNNER, LEGACY, CURRENT, COMPARE }, invalidEvents }`, con todos los contadores inicializados en cero, sin claves derivadas de entrada.
     - **Allowlist de eventos**: Acepta únicamente `ENQUEUED`, `DROPPED/QUEUE_FULL`, `MATCH`, `MISMATCH` y `ERROR` con etapa `RUNNER|LEGACY|CURRENT|COMPARE`. Cada evento válido incrementa exclusivamente su contador; un evento inválido incrementa `invalidEvents` exactamente una vez.
     - **Entrada hostil fail-safe**: Nulos, primitivos, arrays, tipos/labels desconocidos, getters que lanzan y proxies revocados nunca propagan excepciones. Las propiedades adicionales se ignoran y no se retienen.
     - **Privacidad e inmutabilidad**: Cada snapshot es una nueva copia profundamente congelada y desconectada. El módulo no conserva eventos, payloads, diferencias, identificadores, fechas, horarios, reglas, errores o stacks; tampoco usa timestamps, logs, I/O ni dependencias externas.
     - **Dirección de dependencias**: El módulo core no importa el runner de aplicación, tests, HTTP, base de datos ni observabilidad concreta; las allowlists son locales y cerradas.
   - **Criterios de aceptación**:
     1. Exporta factory pura y singleton `defaultEtaShadowTelemetry` con contadores agregados y labels de cardinalidad estrictamente fija bajo allowlist cerrada, función `resetMetrics` para pruebas aisladas y sin ningún tipo de timestamp ni `lastEvaluatedAt`.
     2. Pruebas que serializan la salida confirman la ausencia total de `expected`/`actual`, payloads de entrada, IDs de puntos, nombres, fechas civiles, horarios, reglas, trazas de stack y errores raw; coincidencia (`match: true`) no emite logs ni métricas de divergencia.
     3. El snapshot de métricas retornado es profundamente inmutable (`Object.freeze`) y desconectado del estado interno.
   - **Rollback**: Reversión atómica del commit del slice o retiro del módulo puro de telemetría.
   - **Comandos de verificación**:
     - `cd backend && npm test -- test/eta-shadow-telemetry.test.js`
     - `cd backend && npm test`
   - **Estado actual**: COMPLETADO Y AUDITADO. La fase RED fue reproducida con `MODULE_NOT_FOUND` antes de cargar el módulo. La suite focalizada está verde 29/29 y la suite backend 504/504. Una mutación temporal que desvió `MATCH` hacia `mismatch` produjo seis fallos y fue restaurada antes de repetir GREEN. Revisión adversarial Antigravity con Gemini 3.8 Flash High: `APPROVE`, 0 Critical y 0 Required.

4. **T43c2c — Integración del puerto shadow en composition root / casos de uso**:
   - **Propósito**: Conectar el puerto shadow y telemetría en los casos de uso / composition root sin afectar el flujo transaccional.
   - **Alcance**: Despacho sin `await` al runner asíncrono. Garantía absoluta de cero impacto en el wire format: status code, body JSON y headers HTTP se emiten 100% idénticos con o sin shadow run. En `rutas.service.js`, runner y telemetría se inyectan en `createRutasService` para tests; el singleton productivo de runtime consume `defaultEtaShadowTelemetry` sin reexportarlo desde `rutas.service.js` para que `server.js` lo consuma. La falla del runner o telemetría nunca afecta la respuesta HTTP.
   - **Archivos previstos (exactamente 3)**:
     - `backend/src/application/rutas/route-use-cases.js`
     - `backend/src/domains/rutas/rutas.service.js`
     - `backend/test/route-use-cases.test.js`
   - **Archivos prohibidos**: Rutas/controladores de Express (mantener desacoplamiento), esquemas de base de datos, frontend.
   - **Regla de importación**: Prohibido importar `backend/test/*`.
   - **Criterios de aceptación**:
     1. Invocación al puerto shadow completamente desacoplada (sin `await`), enviando copias defensivas aisladas de los datos requeridos y nunca referencias mutables del request ni entidades de dominio; cualquier fallo del runner o telemetría nunca afecta la respuesta HTTP.
     2. Preservación estricta de respuestas HTTP: status code, body JSON y headers permanecen 100% idénticos con o sin shadow run activo (la contención de CPU, profundidad de cola y latencia se miden en staging).
     3. Pruebas unitarias de casos de uso y suite de contrato HTTP (`test/rutas-contract.test.js`) verdes sin alterar el comportamiento de producción; runner y telemetría inyectables en `createRutasService` para pruebas, mientras el singleton productivo consume `defaultEtaShadowTelemetry` sin reexportarlo.
   - **Rollback**: Retiro de la invocación en el composition root o cambio/remoción de `ETA_SHADOW_PARITY` con reinicio/redeploy controlado.
   - **Comandos de verificación**:
     - `cd backend && node --test test/route-use-cases.test.js`
     - `cd backend && node --test test/rutas-contract.test.js`
     - `cd backend && npm test`
     *(Nota: `test/rutas-contract.test.js` se ejecuta en la validación sin modificar ese cuarto archivo).*

5. **T43c2d2 — Composición y exposición de métricas shadow en observabilidad**:
   - **Propósito**: Componer y exponer las métricas shadow en la infraestructura de observabilidad existente conservando el contrato de `/api/metrics` y sin nuevo endpoint público.
   - **Alcance**: Integración en observabilidad protegida por Bearer token. `observability-routes.js` conserva `registerObservabilityRoutes` y agrega un compositor genérico de providers, sin importar nada de ETA. `server.js` importa directamente el singleton default seguro desde `eta-shadow-telemetry.js`, no desde `rutas.service.js`, evitando circularidad y acoplamiento de dominio. El provider único sigue devolviendo exactamente el snapshot actual; el provider compuesto mantiene todas las claves HTTP existentes en la raíz y añade solo la clave reservada fija `etaShadowParity`. Esta clave está ausente cuando `ETA_SHADOW_PARITY` no es exactamente `'true'`; presente con contadores en cero cuando está activo pero aún no ha procesado trabajos. No crea namespace `http` ni `eta_shadow`, no cambia las claves HTTP existentes y no crea endpoints. La colisión con `etaShadowParity` se detecta deterministamente con error genérico (no sobreescribir silenciosamente). Si el provider shadow falla al tomar snapshot, el compositor conserva el snapshot HTTP y omite la clave shadow sin filtrar el error sensible; esto afecta exclusivamente la observabilidad, nunca las rutas de negocio.
   - **Archivos previstos (exactamente 3)**:
     - `backend/src/core/observability/observability-routes.js`
     - `backend/server.js`
     - `backend/test/observability-routes.test.js`
     *(Nota: No se incluye spec como archivo del slice d2 porque el contrato queda fijado en la iteración documental previa).*
   - **Archivos prohibidos**: Nuevos endpoints públicos, rutas no autenticadas, routers adicionales, módulos de dominio o ETA importados en `observability-routes.js`.
   - **Regla de importación**: Prohibido importar `backend/test/*`. `observability-routes.js` no importa módulos de ETA. `server.js` importa `defaultEtaShadowTelemetry` directamente de `backend/src/core/eta/eta-shadow-telemetry.js` sin pasar por `rutas.service.js`.
   - **Criterios de aceptación**:
     1. Compatibilidad aditiva exacta de raíz + flag estricto: conserva todas las claves HTTP existentes en la raíz de `/api/metrics`, omitiendo `etaShadowParity` cuando `process.env.ETA_SHADOW_PARITY !== 'true'` y exponiéndola como objeto de contadores fijos (en cero inicial) cuando sea exactamente `'true'`, sin namespaces `http` ni `eta_shadow`.
     2. Seguridad actual de metrics intacta: preserva autenticación obligatoria por token Bearer, respuesta 404 ante token ausente/inválido en router aislado, cabeceras `Cache-Control: no-store` y cero endpoints nuevos.
     3. Compositor genéricamente probado: compositor genérico en `observability-routes.js` probado con contadores fijos, detección determinista de colisiones con error genérico, fail-open a HTTP-only ante fallos del provider shadow (manteniendo métricas HTTP sin filtrar errores ni afectar rutas de negocio) y ausencia absoluta de datos sensibles (sin timestamps ni `lastEvaluatedAt`, sin fechas, `expected`/`actual`, payloads, IDs, nombres, horarios, reglas, stack ni errores raw).
   - **Rollback**: Reversión atómica del commit del slice o cambio/remoción de `ETA_SHADOW_PARITY` con reinicio/redeploy controlado.
   - **Comandos de verificación**:
     - `cd backend && npm test -- test/observability-routes.test.js`
     - `cd backend && npm test`

6. **T43c2e — Verificación en staging real y activación controlada**:
   - **Propósito**: Auditoría integral en entorno staging real antes de cualquier habilitación en producción.
   - **Alcance**: Despliegue en staging bajo zona horaria `America/El_Salvador`.
   - **Archivos previstos (máximo 3)**:
     - `docs/STAGING_ETA_PARITY.md`
     - `tasks/plan.md`
     - `tasks/specs/T43-eta-parity.md`
   - **Criterios de aceptación**:
     1. Validación en zona horaria oficial `America/El_Salvador` con 100% de paridad estricta (0% de divergencia respecto a la referencia legacy).
     2. Medición objetiva en staging de porcentaje de CPU, profundidad de cola FIFO y descartes (`drops`), y latencia p95 y p99 en endpoints de rutas.
     3. Validación del procedimiento operativo de rollback: cambio o remoción de `ETA_SHADOW_PARITY` y aplicación del reinicio/redeploy controlado de la plataforma sin requerir revertir código, confirmando el cese de encolamiento y estabilidad del servicio antes de considerar activación productiva.
   - **Rollback**: Cambiar o remover `ETA_SHADOW_PARITY` en el entorno staging y aplicar el reinicio/redeploy controlado.
   - **Comandos de verificación**:
     - Inspección de métricas agregadas y health check en staging.
     - Validación de logs estructurados y verificación de latencia p95/p99.

### 5.2 Matriz de Dependencias entre Slices
- Secuencia obligatoria: `T43c2a` -> `T43c2b` -> `T43c2d1` -> `T43c2c` -> `T43c2d2` -> `T43c2e`.
- `T43c2a` depende estrictamente de `T43c1`.
- `T43c2b` depende de `T43c2a`.
- `T43c2d1` depende de `T43c2b`.
- `T43c2c` depende de `T43c2b` y `T43c2d1`.
- `T43c2d2` depende de `T43c2c`.
- `T43c2e` exige la integración completa de todos los slices anteriores (`T43c2a` a `T43c2d2`).

### 5.3 Principio de Paridad del 100%
No se admitirán márgenes de tolerancia ("fuzziness") ni heurísticas relajadas en la comparación offline de T43b, T43c1, T43c2a ni en la verificación en staging de T43c2e. En caso de que el nuevo motor corrija un bug conocido del motor legacy, dicha discrepancia debe documentarse formalmente como una excepción aprobada en este documento antes de considerarse válida.

### 5.4 Rollback por Slice
- Cada etapa y slice (T43a, T43b, T43c1, T43c2a, T43c2b, T43c2d1, T43c2c, T43c2d2, T43c2e) cuenta con aislamiento completo y reversión independiente.
- **T43a, T43b, T43c1, T43c2a**: No tocan flujos de producción ni respuestas HTTP; el rollback consiste en revertir el commit correspondiente o eliminar los archivos introducidos.
- **T43c2b, T43c2d1, T43c2c, T43c2d2**: Operativamente, el rollback consiste en cambiar o remover la variable de entorno `ETA_SHADOW_PARITY` y aplicar el reinicio/redeploy controlado que requiera la plataforma; no requiere revertir código. En pruebas in-process puede verificarse el flag dinámico solo si el diseño final lo soporta, pero no se declara como promesa operativa del sistema.
- **T43c2e**: En staging, el procedimiento de rollback se valida cambiando o removiendo la variable de entorno y aplicando el reinicio/redeploy controlado correspondiente de la plataforma, confirmando el cese de la ejecución shadow y la estabilidad del servicio.

### 5.5 Reglas Obligatorias de Rendimiento, Seguridad y Aislamiento en Runtime
1. **Impacto en producción y staging**: No prometer "impacto cero". El shadow-run no bloquea ni altera las respuestas al usuario, pero el consumo de CPU, profundidad de cola y latencia p95/p99 deben medirse y validarse en staging antes de cualquier consideración productiva.
2. **Contención del Event Loop**: En Node.js (monohilo para JavaScript), `setImmediate` no elimina la contención de CPU producida por el cálculo del ETA. Por ello, la cola FIFO acotada y la política de descarte inmediato (`drop-on-full`) son mandatorias para evitar la saturación del proceso ante picos de tráfico.
3. **Prohibición de importar testing en runtime**: Ningún módulo de runtime (`backend/src/**`) puede importar archivos o utilidades desde `backend/test/**`.
4. **Reglas de importación del dominio ETA**: El adaptador actual (`T43c2a`) puede importar los módulos del motor actual (`official-entry.js`, `route-projection.js`), mientras que la referencia legacy (`legacy-shadow-reference.js`) permanece totalmente desacoplada sin importar módulos del motor actual.
5. **Observabilidad segura**: Telemetría basada estrictamente en allowlist cerrada y contadores agregados de cardinalidad fija, sin timestamps ni `lastEvaluatedAt`, con pruebas que serializan la salida para confirmar la ausencia total de datos sensibles: `expected`/`actual`, payloads de entrada, identificadores de puntos, nombres, fechas civiles, horarios, reglas, trazas de stack o errores raw.
