# Contratos HTTP vigentes en la rama de trabajo

Inventario para T44a. Describe el código actual; **no** certifica el despliegue
productivo ni el esquema/datos PostgreSQL. `[HTTP]` significa que existe una
prueba HTTP local; `[código]` que la forma se deriva del controller/servicio;
`[cliente]` que se localizó un consumidor Angular. No se audita Partner.

## Lecturas y archivos públicos

| Ruta | Éxito | Error / condición | Consumidor y evidencia |
| --- | --- | --- | --- |
| `GET /api/empresas` | `200 { success: true, empresas: [...] }` | `500 { error: "Database error" }` | `EmpresasService.getEmpresas()` → `AdminComponent` [código, cliente]. La forma de cada empresa depende del repositorio y no tiene prueba HTTP aquí. |
| `GET /api/locations` | `200` con arreglo directo; el repositorio proyecta `id`, `id_destino`, nombre, empresa, ubicación, horarios y reglas | `500 { error: "Database error" }` | `UbicacionesService.getLocations()` → `MobileAppComponent` [código, cliente]. El frontend valida/mapea la respuesta; no hay prueba HTTP de la proyección contra PostgreSQL real. |
| `GET /api/empresas/excel-template` | `200` binario XLSX con `Content-Disposition: attachment` | `500 { success: false, message: "Failed to generate excel template" }` | No se audita su consumidor Partner [código]. |
| `GET /api/test-location` | `200` con el resultado de buscar “Agencia Lourdes”, posiblemente `null` | `500 { error: "Database error" }` | Sin consumidor Angular localizado [código]. Es una ruta de diagnóstico pública, no un contrato de catálogo. |

Fuentes: `backend/src/domains/empresas/empresas.routes.js`,
`empresas.controller.js`, `empresas.excel.controller.js` y
`backend/src/domains/ubicaciones/ubicaciones.routes.js`,
`ubicaciones.controller.js`, `ubicaciones.repository.js`; servicios frontend en
`frontend/src/app/core/services/`.

## Búsquedas ETA

Las tres rutas tienen pruebas HTTP en `backend/test/rutas-contract.test.js`.
La matriz precisa de requests, variantes escalares/arreglo, 400/404/500 y
ejemplos está en `docs/contracts/routes-legacy-v1.md`; esa matriz prevalece
sobre este resumen. `RutasService` en Angular consume las tres [HTTP, cliente].

| Ruta | Éxito y ausencia de ruta | Error HTTP | Fechas/identidad |
| --- | --- | --- | --- |
| `POST /api/get-upcoming-routes` | `200`: escalares producen campos en raíz; arrays producen `{ success: true, results: [...] }`. Una búsqueda escalar sin ruta puede devolver `200 { success: false, origen_msg }`. | `400 { error }`; `500 { error: "Database error" }` | `dropoff_date` y `fecha_llegada_iso` son fechas civiles `YYYY-MM-DD`; `fecha_llegada` es texto de presentación. Los nombres de punto no son IDs estables. |
| `POST /api/search-routes-by-municipality` | `200`: `results` cambia de forma entre origen escalar y array; existe `200 { success: false, origen_msg, results: [] }`. | `400 { error }`; `404 { error: "Origen no encontrado" }`; `500 { error: "Database error" }` | `dropoff_date`, `arrival_date`, `fecha_llegada_iso` se tratan como fechas civiles. |
| `POST /api/search-flights` | `200 { success: true, results: [...] }`, incluso con `results: []`. | `400 { error }`; `500 { error: "Database error in search-flights" }` | Cada opción contiene `dropoff_date`, `fecha_llegada` y `horario_recoleccion`; la respuesta está tipada en `frontend/src/app/core/services/route-api.contracts.ts`. |

Estas rutas no se alteran en T44a. La prueba HTTP usa dobles del servicio, no
una base PostgreSQL, por lo que no prueba la exactitud de ETA ni datos reales.

## Mapas y lugares

`frontend/src/app/core/services/mapas.service.ts` consume las tres rutas.
`HomeComponent` usa Places para ayudar a elegir municipio de origen y
`AdminComponent` usa el resolvedor de enlace. Evidencia de forma: controllers
y servicios; no hay en T44a una prueba de contrato HTTP integral de estas
tres respuestas.

| Ruta | Éxito | Error vigente |
| --- | --- | --- |
| `POST /api/resolve-maps-link` | `200 { success: true, lat, lng, resolvedUrl }` según el resolvedor | `400 { error }` si falta URL; otro error produce `500 { success: false, error: e.message }`. Ese 500 todavía expone el texto de excepción; T45c está pendiente de decisión separada. |
| `POST /api/places/autocomplete` | `200 { success: true, suggestions: [{ placeId, text, mainText, secondaryText }, ...] }` | `e.statusCode || 500` con `{ success: false, code: e.code || "MAPS_ERROR", error: e.message }`. |
| `POST /api/places/resolve` | `200 { success: true, place: { placeId, name, formattedAddress, addressComponents, location } }` | Mismo patrón de status y error que autocomplete. |

Places puede devolver 400 por entrada inválida, 503 si no está configurado y
502 ante fallo del proveedor, según `backend/src/domains/mapas/mapas.service.js`.
No se asume que todo `e.message` sea seguro para exposición pública.

## Salud, métricas y frontera operativa

`GET /api/health` responde `200 { status: "ok" }` [HTTP:
`backend/test/observability-routes.test.js`]. `GET /api/metrics` solo se
registra si hay `METRICS_TOKEN`; con token Bearer correcto responde un snapshot
JSON y `Cache-Control: no-store`, y con token ausente o incorrecto responde
404 sin cuerpo [HTTP: prueba aislada del router]. Si el token **no está
configurado**, el servidor completo no registra esa ruta, pero su catch-all
`/{*splat}` devuelve `200 text/html` con la SPA: confirmado con una petición
HTTP local a `app` en esta rama. Es una diferencia entre la prueba aislada y
el comportamiento integrado, no un contrato deseado. Ninguna de estas rutas
tiene consumidor Angular localizado.

Fuera de `/api`, `GET /runtime-config.js` devuelve JavaScript sin caché con
`window.__SIVOY_CONFIG__.mapboxPublicToken` (valor público configurable),
según `backend/server.js`; no es un envelope JSON.

Las escrituras `POST /api/empresas`, `PUT /api/empresas/:id`,
`POST /api/agencias` y `PUT /api/locations/:id` devuelven
`403 { error: "Operational writes are disabled" }` **cuando el código actual
corre con `NODE_ENV=production`**, antes de parsear el cuerpo [HTTP:
`backend/test/operational-write-guard.test.js`]. En desarrollo llegan a los
controllers existentes; T44a no audita su negocio ni modifica Partner.

## Diferencias que T44 debe resolver, sin cambiar aún el wire format

1. El catálogo de ubicaciones es un arreglo directo, empresas usa
   `{ success, empresas }`, rutas tienen variantes y Places usa
   `{ success, suggestions/place }`.
2. Un `200` puede significar “sin ruta” con `success: false`; otros casos usan
   404. Los errores no comparten un código estable ni un único envelope.
3. `id` y `id_destino` coexisten en puntos. Las rutas también identifican
   puntos por nombre; no hay garantía de identidad pública uniforme.
4. Fechas civiles ISO, textos de llegada y horarios de presentación coexisten;
   no hay un timestamp único con zona/offset para todos los endpoints.
5. El catch-all de la SPA también alcanza rutas `/api` no registradas: al
   menos `/api/metrics` sin token devuelve HTML 200 en el servidor completo,
   aunque el router aislado devuelve 404. Requiere un corte y prueba de
   compatibilidad propios.

Un contrato nuevo requiere estrategia de versión/adaptador y aprobación antes
de cambiar status, nombres, IDs o fechas. Este inventario no demuestra paridad
con producción ni sustituye pruebas de integración PostgreSQL.
