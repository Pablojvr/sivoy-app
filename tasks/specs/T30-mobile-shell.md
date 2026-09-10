# T30: Reducir MobileAppComponent al shell

## 1. Baseline Cuantitativo y Criterios de Éxito

**Baseline actual (commit `323b869`):**
- Líneas físicas: 2322 (`(Get-Content frontend/src/app/mobile-app.component.ts).Count`).
- Métodos públicos y handlers: ~88.
- Campos de estado y dependencias en la clase: ~53.

**Criterios de Reducción (Éxito Final):**
- `MobileAppComponent` deja de poseer acceso a datos, geolocalización y búsqueda del flujo público; conserva temporalmente el wiring empresarial fuera de alcance.
- Las llamadas a `HttpClient` y el polling nativo son delegadas a la capa de servicios (`UbicacionesService` y otros existentes).
- La lógica de búsqueda duplicada en el shell se retira a favor de `ShipmentSearchFacade` y sus dominios adjuntos.
- Reducción verificable a un máximo de 1900 líneas físicas, sin impacto funcional en la UI pública.
- Las responsabilidades del panel de `AdminComponent`, `PartnerComponent` y dominios empresariales quedan temporalmente fuera del alcance de esta refactorización.

## 2. Inventario de Responsabilidades

El shell actualmente abarca los siguientes dominios superpuestos:

1. **Acceso a Datos (Locations/Polling):** Ejecuta llamadas directas vía `HttpClient` (`/api/locations`) y mantiene un loop de polling de estado (`updateAgencyStatuses`). Esto choca conceptualmente con el rol de orquestador visual y duplica lo que ya provee `UbicacionesService`.
2. **Gestión de Geolocalización (Session/User):** Interactúa directamente con la API del navegador (`navigator.geolocation`) y realiza peticiones REST (reverse geocoding) hacia Nominatim para resolver municipios.
3. **Lógica de Búsqueda de Rutas (Legacy Search):** Mantiene estado masivo de búsqueda (`origen`, `destino`, `flightResults`, `timeSlots`) y rutinas complejas para calcular resultados. Esta lógica compite contra y duplica el stack existente de `ShipmentSearchFacade`, `shipment-route.adapter` y `shipment-route.filters`.

## 3. Riesgos Detectados (Estado Duplicado)

- El shell, al ser padre de múltiples vistas, actualmente inyecta el estado vía `@Input()`. A medida que eliminemos su rol como "fuente de la verdad", existirá un riesgo transicional donde el shell podría pasar datos desincronizados a los hijos o intentar conciliar flujos obsoletos frente al `ShipmentSearchFacade`. Todo consumidor de búsqueda legado en el shell debe redirigirse al Facade o eliminarse si es código inalcanzable (dead consumer).

*(Nota: Las funciones asociadas a la gestión CRUD de empresas y ubicaciones, delegadas a `AdminComponent`, así como todo lo referido a `PartnerComponent`, quedan formalmente excluidas de esta iniciativa y no se modificarán).*

## 4. Plan de Extracción Incremental (Slices)

### T30a: Cobertura de Caracterización (Slice S)
- **Objetivo:** Aislar el comportamiento actual del shell en tests antes de mover las implementaciones, verificando su rol como orquestador de componentes hijos (home) sin evaluar la implementación interna de los servicios de Angular que consuma.
- **Archivos (Máximo 5):**
  - `frontend/src/app/mobile-app.component.spec.ts`
- **Criterios de Aceptación:**
  1. Se añaden tests que validen la carga del estado inicial (`locations`).
  2. Se verifica que el mapeo de la selección del usuario respeta los contratos de UI esperados (origen/destino).
  3. No se afecta ninguna implementación real.
- **Verificación:** `npm run test:ci && npm run build && git diff --check`
- **Dependencias:** Ninguna.
- **Rollback:** revertir el commit atómico del slice después de preservar cualquier cambio local ajeno.

### T30b: Delegación a `UbicacionesService` (Slice S)
- **Objetivo:** Eliminar el uso de `HttpClient` en el shell para las lecturas de ubicaciones.
- **Archivos (Máximo 5):**
  - `frontend/src/app/mobile-app.component.ts`
  - `frontend/src/app/core/services/ubicaciones.service.ts` (tipar o ampliar sólo el contrato de lectura necesario)
  - `frontend/src/app/core/services/ubicaciones.service.spec.ts` (nuevo o ampliado)
- **Criterios de Aceptación:**
  1. El shell inyecta `UbicacionesService` y consume su endpoint en lugar de inyectar `HttpClient` directamente para `/api/locations`.
  2. La lógica de polling de agencias (`updateAgencyStatuses`) invoca la actualización a través de este servicio de acceso a datos en lugar de llamadas manuales REST.
- **Verificación:** `npm run test:ci && npm run build && git diff --check`
- **Dependencias:** T30a.
- **Rollback:** revertir el commit atómico del slice después de preservar cualquier cambio local ajeno.

### T30c: Extraer `UserGeolocationService` (Slice S)
- **Objetivo:** Encapsular el acceso a APIs de geolocalización (`navigator`) y Nominatim, quitando implementaciones crudas del shell.
- **Archivos (Máximo 5):**
  - `frontend/src/app/core/services/user-geolocation.service.ts` (Nuevo)
  - `frontend/src/app/core/services/user-geolocation.service.spec.ts` (Nuevo)
  - `frontend/src/app/mobile-app.component.ts`
- **Criterios de Aceptación:**
  1. `UserGeolocationService` provee un método asíncrono puro para obtener coordenadas y resolver el municipio.
  2. El shell suscribe o solicita este servicio y se quita el uso explícito de `navigator.geolocation`.
- **Verificación:** `npm run test:ci && npm run build && git diff --check`
- **Dependencias:** T30a.
- **Rollback:** revertir el commit atómico del slice después de preservar cualquier cambio local ajeno.

### T30d: Migrar Estado de Búsqueda Legado a `ShipmentSearchFacade` (Slice M)
- **Objetivo:** Eliminar el motor de búsqueda paralelo existente en `MobileAppComponent` y utilizar en su lugar el ecosistema existente de Shipment (Facade, adapters, filters).
- **Archivos (Máximo 5):**
  - `frontend/src/app/mobile-app.component.ts`
  - `frontend/src/app/features/home/shipment-search.facade.ts` (como dependencia importada)
- **Criterios de Aceptación:**
  1. Cada campo y método legado tiene búsqueda de consumidores y prueba de caracterización antes de eliminarse.
  2. Todo consumidor público vivo delega al `ShipmentSearchFacade`; código empresarial queda intacto y documentado.
  3. Destino → origen → resultados → compartir conserva estado y navegación en pruebas y runtime móvil.
- **Verificación:** `npm run test:ci && npm run build && git diff --check`
- **Dependencias:** T30a.
- **Rollback:** revertir el commit atómico del slice después de preservar cualquier cambio local ajeno.
