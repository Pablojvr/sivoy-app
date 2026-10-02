# T43 — Paridad de Snapshot ETA

## Resumen ejecutivo

Este documento establece el contrato, arquitectura y estrategia de validación para garantizar **100% de paridad** entre el comportamiento actual de proyección/cálculo logístico y la evolución modular del motor ETA en SiVoy.

El proceso se estructura en tres fases estrictamente incrementales e independientes:
- **T43a**: Comparador estructural puro inmutable y pruebas de caracterización RED (este contrato y suite de pruebas).
- **T43b**: Referencia legacy de test con procedencia SHA fija, adaptadores normalizadores a snapshot canónico y matriz offline ("golden dataset") sin alterar respuestas a clientes.
- **T43c**: Shadow-run en runtime apagado por defecto mediante switch configurable, ejecutable únicamente tras validación completa en staging y sin umbrales de tolerancia permisivos.

## 1. Alcance y Fronteras

### En alcance
- **Fase T43a**:
  - Especificación formal del contrato canónico de snapshot ETA.
  - Especificación del comparador puro `compareEtaSnapshots(expected, actual)`.
  - Pruebas unitarias de caracterización exhaustivas en `backend/test/eta-parity-comparator.test.js`.
  - Límite estricto de archivos: máximo 3 archivos para T43a (spec, implementación del comparador, suite de test).
- **Fase T43b**:
  - Snapshot de referencia legacy congelado en un commit/SHA verificable.
  - Adaptadores que normalizan las salidas de los servicios actuales a la estructura canónica.
  - Matriz offline de casos de prueba representativos (agencias, puntos fijos, pins, horarios partidos, festivos, cortes).
  - Verificación de paridad estricta al 100%; cualquier divergencia legítima debe ser documentada explícitamente en el spec y nunca silenciada.
- **Fase T43c**:
  - Comparación en modo shadow-run en staging/producción con feature flag desactivado por defecto (`ETA_SHADOW_PARITY=false`).
  - Métricas u observabilidad de divergencias sin impacto en latencia ni en la respuesta al usuario.

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
  status: string;            // Identificador canónico de estado (ej: 'open', 'next_interval', 'next_day')
  officialDate: string | null; // Fecha canónica 'YYYY-MM-DD' o null si no aplica
  nextInterval: EtaInterval | null; // Siguiente intervalo relevante o null
}

export interface RouteValidationSnapshot {
  status: string;            // Identificador de viabilidad (ej: 'possible', 'cutoff_passed', 'no_service')
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

## 4. Estrategia Incremental y Despliegue

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
| - Adaptador de normalización a canonical snapshot           |
| - Suite de comparación contra snapshot legacy de prueba     |
| - 100% de paridad requerida antes de cualquier migración    |
+------------------------------+------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| T43c: Shadow-run runtime controlado                         |
| - Switch feature flag (ETA_SHADOW_PARITY=false por defecto) |
| - Comparación en memoria asíncrona / no bloqueante          |
| - Cero impacto en SLA de respuesta al cliente               |
+-------------------------------------------------------------+
```

### 4.1 Principio de Paridad del 100%
No se admitirán márgenes de tolerancia ("fuzziness") ni heurísticas relajadas en la comparación offline de T43b. En caso de que el nuevo motor corrija un bug conocido del motor legacy, dicha discrepancia debe documentarse formalmente como una excepción aprobada en este documento antes de considerarse válida.

### 4.2 Rollback por Slice
- Cada etapa (T43a, T43b, T43c) cuenta con aislamiento completo.
- T43a y T43b no tocan flujos de producción ni respuestas HTTP; el rollback consiste en revertir el commit correspondiente.
- T43c puede deshabilitarse inmediatamente apagando la variable de entorno o feature flag sin necesidad de redespliegue de emergencia.
