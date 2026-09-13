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

### T30a: Cobertura de Caracterización (Slice S) — accepted
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

**Evidencia:** tres pruebas de caracterización cubren carga explícita de ubicaciones/empresas, geolocalización con geocodificación inversa y handoff real de selección origen→destino. La suite completa pasa con 214 pruebas, el build de producción compila y no se permiten solicitudes HTTP inesperadas.

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

**Estado:** aceptado tras auditoría Codex. El acceso GET de ubicaciones se delega al servicio existente mediante un contrato de lectura que preserva IDs alfanuméricos y coordenadas mixtas. El polling y el cálculo local de disponibilidad permanecen en el shell por no ser acceso a datos.

**Evidencia:** 217 pruebas pasan; el build de producción compila; los contratos HTTP verifican GET, preservación de datos y PUT con ID `AG_*`; el shell ya no ejecuta un GET directo a `/api/locations`.

### T30c: Extraer `UserGeolocationService` (Slice S) — accepted
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

**Evidencia:** 225 pruebas pasan; el build de producción y el dev server compilan; ambos flujos GPS preservan sus opciones originales; el shell no referencia `navigator.geolocation` ni construye URLs de Nominatim; una sesión Chrome móvil nueva renderiza Inicio sin overlay.


### T30d1: Auditoría de Consumidores del Shell (Slice S)
- **Estado:** aceptado tras auditoría Codex.
- **Baseline LOC:** 2326 líneas físicas autoritativas para `mobile-app.component.ts`.
- **Análisis de Reachability (Raíces = Template Handlers y Angular Lifecycle):**
  - **(A) Removible probado (Isla de Métodos Muertos):**
    - Métodos: `checkRoute()`, `generateTimeSlots()`, `selectTimeSlot()`, `selectLocation()`, `openLocationSelector()`, `closeLocationSelector()`, `setPinAsOriginAndPromptDestination()`, `setPinAsDestinationAndPromptOrigin()`, `setCustomDestination()`, `discoveryModeForMunicipality()`, `handleSelectionHandoff()`, `shareLocation()`.
    - *Evidencia:* Ninguna de estas lógicas está conectada a eventos del template `mobile-app.component.html`. Su única finalidad era mutar variables de estado interno legadas. Sus puntos de invocación originales fueron migrados, creando una ruta de ejecución inalcanzable desde raíces externas.
  - **(B) Wiring Público Requerido (Home/Map):**
    - Métodos: `updateMapMarkers()`, `onMapHighlightRoute()`, `viewOnMap(loc, pointRole)`, `recenterMap()`, `resetMapMarkers()`, `showNearbyPoints()`.
    - Estado: `selectedPin`, `isMapResourceMode`, `highlightedRoute`.
    - *Evidencia:* Todos estos están enlazados a outputs explícitos o inputs de `<app-home>`. `updateMapMarkers()` es un consumidor directo de la instancia hija (vía `this.homeCmp`).
  - **(C) Wiring Admin Intacto (Fuera de alcance):**
    - `viewOnMap($event)` del Admin, `previewMap()`, `loadAdminEmpresas()`, y estados como `adminFilteredLocations`, `isPickingLocation`. Conectados válidamente a `<app-admin>` o aislados en lógica empresarial.
  - **(D) Inciertos / Bloqueados por Map Wiring (Candidatos):**
    - Variables: `origen`, `destino`, `origenMunicipio`, `destinoMunicipio`, `flightResults`, `municipalityResults`, `displayedResults`, `timeSlots`, `dropoffDate`, `dropoffTime`, `activeInput`, `selectingLocation`, `filteredMunicipalities`, `result`.
    - *Evidencia:* Aunque no se renderizan en el DOM directamente, **son leídas explícitamente por una raíz alcanzable**: `updateMapMarkers()`. Cuando `isInicio=false`, el operador ternario hace un *fallback* a leer este estado obsoleto (`this.flightResults`, `this.origen`, etc.). Por lo tanto, no se pueden remover sin que el compilador TypeScript falle o se altere el flujo del mapa. Deben ser desacoplados antes de purgarse.

**Plan de Eliminación/Migración (Nuevos Slices S/M):**
1. **T30d2a: Preparación del Contrato de Proyección de Mapa:**
   - **Estado:** aceptado tras auditoría Codex.
   - **Alcance (<=5 archivos):** `public-map-view-state.ts`, `public-map-view-state.spec.ts`, `home.component.ts`, `tasks/specs/T30-mobile-shell.md`, `tasks/todo.md`.
   - **Criterios de Aceptación:**
     1. Introducir el contrato tipado `PublicMapViewState` y la función pura de proyección.
     2. La función de proyección replica exactamente las ramas de precedencia del `updateMapMarkers` original, con tests exhaustivos sin variables `any` nuevas.
     3. `HomeComponent` cambia el output `updateMapMarkers` para emitir este payload mediante un helper, sin alterar el momento ni la cantidad de emisiones.
   - **Evidencia:** 232 pruebas pasan, el build compila, las ocho emisiones originales se preservan y las líneas añadidas no incorporan `any`, MapLibre, Mapbox ni `console`.
2. **T30d2b: Consumo de Proyección en el Shell (Desacoplamiento):**
   - **Estado:** aceptado por Codex.
   - **Alcance (<=5 archivos):** `mobile-app.component.ts`, `mobile-app.component.html`.
   - **Criterios de Aceptación:**
     1. El shell actualiza su binding `(updateMapMarkers)` para recibir el `$event` y pasarlo a su método.
     2. `updateMapMarkers(state: PublicMapViewState)` en el shell descarta la lectura directa a `this.homeCmp` (erradicando la dependencia sobre variables de Categoría D).
     3. El shell dibuja lo provisto en el payload sin alterar la funcionalidad del mapa para Admin.
   - **Evidencia:** 232 pruebas pasan, build de producción correcto, runtime móvil validado en `127.0.0.1:4303`, sin dependencia `homeCmp` ni nuevos `any`; la selección administrativa conserva una proyección explícita de un solo punto.
3. **T30d3: Purga de Búsqueda Legada (Limpieza Final):**
   - **Alcance (<=5 archivos):** `mobile-app.component.ts`, `mobile-app.component.spec.ts`.
   - **Criterios de Aceptación:**
     1. Tras confirmar mediante una nueva auditoría rápida que `updateMapMarkers()` ya no lee variables de la Categoría D, eliminar definitivamente todo el bloque de propiedades huérfanas de estado.
     2. Remover en su totalidad los métodos muertos de la Categoría A.
     3. Refactorizar los flujos inalcanzables restantes (como la llamada a `generateTimeSlots` en `ngOnInit` o las condiciones erróneas en `map.onClick`), actualizando specs para garantizar integridad (test:ci/build/diff-check).

**Evidencia T30d1:** búsqueda de bindings en `mobile-app.component.html`, referencias globales con `rg`, llamadas internas y lecturas dentro de `updateMapMarkers()` auditadas desde las raíces de lifecycle y outputs. El baseline reproducible es 2326 líneas físicas en `471efc2`.
