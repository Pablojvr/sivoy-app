# T43 — Paridad de Snapshot ETA

## Resumen ejecutivo

Este documento establece el contrato, arquitectura y estrategia de validación para garantizar **100% de paridad** entre el comportamiento actual de proyección/cálculo logístico y la evolución modular del motor ETA en SiVoy.

El proceso se estructura en tres fases estrictamente incrementales e independientes:
- **T43a**: Comparador estructural puro inmutable y pruebas de caracterización RED (este contrato y suite de pruebas).
- **T43b**: Referencia legacy de test con procedencia SHA fija, adaptadores normalizadores a snapshot canónico y matriz offline ("golden dataset") sin alterar respuestas a clientes.
- **T43c1**: Referencia legacy de runtime independiente (`backend/src/core/eta/legacy-shadow-reference.js`) y matriz de procedencia/paridad offline (26 escenarios) comparando el fixture legacy frente a la referencia de runtime, con límite estricto de 3 archivos, rollback aislado y sin integración en flujos de producción.
- **T43c2**: Runner/cola en background, feature flag estricto (`ETA_SHADOW_PARITY === 'true'`), apagado por defecto, y observabilidad/métricas de divergencias posterior, sin bloquear ni alterar la respuesta al usuario; el costo de CPU se valida en staging.

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
- **Fase T43c1 (Referencia Runtime Independiente y Paridad Estricta)**:
  - Módulo de referencia legacy para runtime: `backend/src/core/eta/legacy-shadow-reference.js`.
  - Transcripción productiva congelada desde SHA `87684cbbca2f9e959d9c78f7fc3cc02c8e7895a4`.
  - Contrato público: exporta `runLegacyEtaScenario(scenario)` y devuelve el mismo `CanonicalEtaSnapshot` generado por `runLegacyEtaScenario(fixtureEngine, scenario)` del soporte de test.
  - Aislamiento estricto de dependencias:
    - **Prohibido importar fixtures de test en producción**: no puede importar ningún archivo bajo `backend/test/*`.
    - **Prohibido importar módulos actuales de producción**: no puede importar `official-entry`, `route-projection` ni ningún otro módulo modularizado actual.
    - **Operación pura**: no debe registrar logs (`console.*` ni loggers) ni mutar objetos de entrada.
  - Matriz de procedencia/paridad: verificación offline contra los 26 escenarios del golden dataset comparando el snapshot del fixture legacy esperado frente al snapshot de runtime (`compareEtaSnapshots(expectedSnapshot, runtimeSnapshot)`).
  - Frontera de integración: **la referencia runtime no se integra todavía en T43c1** a ningún endpoint, servicio ni flujo de cotización/reserva activo. Queda aislada y validada exclusivamente en pruebas.
  - Límite estricto de archivos: máximo 3 archivos para T43c1 (`tasks/specs/T43-eta-parity.md`, `backend/test/eta-parity-matrix.test.js`, `backend/src/core/eta/legacy-shadow-reference.js`).
  - Estrategia de rollback: reversión atómica del commit de T43c1 o eliminación física del archivo desacoplado `backend/src/core/eta/legacy-shadow-reference.js` sin impacto colateral.
- **Fase T43c2 (Runner Asíncrono, Feature Flag Estricto y Observabilidad Posterior)**:
  - Mecanismo runner/cola en background para ejecutar la referencia legacy en modo shadow de manera asíncrona y no bloqueante.
  - Feature flag estricto: activación condicionada estrictamente a `process.env.ETA_SHADOW_PARITY === 'true'`. Cualquier otro valor (`'false'`, `undefined`, cadenas vacías u otros) mantiene el shadow-run completamente apagado por defecto.
  - Métricas e instrumentación de observabilidad para divergencias sin bloquear ni alterar la respuesta al usuario, sanitizando diferencias y omitiendo payloads sensibles. El impacto global de CPU, cola y latencia se mide en staging antes de cualquier activación productiva.

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

---

## 5. Estrategia Incremental y Despliegue

```
+-------------------------------------------------------------+
| T43a: Comparador puro + pruebas RED                         |
| - eta-parity-comparator.js                                  |
| - eta-parity-comparator.test.js                             |
| - tasks/specs/T43-eta-parity.md                             |
| (Sin efectos colaterales, rollback: borrado de archivos)    |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| T43b: Matriz offline de paridad (Golden tests)              |
| - Referencia legacy fijada en 87684cbbca2f...                |
| - Adaptador de salida pública a canonical snapshot          |
| - Suite comparativa ejecutada en America/El_Salvador        |
| - 100% de paridad requerida antes de cualquier migración    |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| T43c1: Referencia runtime independiente + matriz offline    |
| - legacy-shadow-reference.js (congelado en SHA 87684cbb...) |
| - Contrato runLegacyEtaScenario(scenario) -> CanonicalEta  |
| - Prohibido importar test/ en runtime o módulos nuevos      |
| - Matriz de 26 escenarios validando fixture vs runtime      |
| - Máximo 3 archivos, sin integración a rutas de producción  |
| - Rollback: reversión de commit o borrado de módulo         |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| T43c2: Shadow-run runtime controlado y observabilidad       |
| - Flag estricto ETA_SHADOW_PARITY === 'true' (default off)  |
| - Runner asíncrono/cola en background                       |
| - Métricas y telemetría de divergencias sin fuga de payload |
| - No bloquea ni altera respuestas; costo medido en staging  |
+-------------------------------------------------------------+
```

### 5.1 Principio de Paridad del 100%
No se admitirán márgenes de tolerancia ("fuzziness") ni heurísticas relajadas en la comparación offline de T43b ni T43c1. En caso de que el nuevo motor corrija un bug conocido del motor legacy, dicha discrepancia debe documentarse formalmente como una excepción aprobada en este documento antes de considerarse válida.

### 5.2 Rollback por Slice
- Cada etapa (T43a, T43b, T43c1, T43c2) cuenta con aislamiento completo.
- T43a y T43b no tocan flujos de producción ni respuestas HTTP; el rollback consiste en revertir el commit correspondiente.
- T43c1 añade la referencia runtime sin integrarla al flujo de producción ni a endpoints HTTP; el rollback consiste en eliminar `backend/src/core/eta/legacy-shadow-reference.js` o revertir el commit del slice.
- T43c2 puede deshabilitarse inmediatamente asegurando que `ETA_SHADOW_PARITY !== 'true'` (la variable de entorno debe ser exactamente igual a `'true'` para activar el runner; cualquier otro valor o su ausencia lo mantiene apagado por defecto) sin necesidad de redespliegue de emergencia.
