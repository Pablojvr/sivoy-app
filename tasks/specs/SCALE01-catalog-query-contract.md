# SCALE01 — contrato canónico de catálogo escalable

Estado: aprobado y en ejecución. La implementación se entrega en cortes pequeños,
manteniendo el contrato legacy durante la migración del consumidor público.

## Objetivo

Definir la interfaz pública de lectura que permitirá buscar y presentar puntos de
N empresas sin descargar el catálogo completo. El contrato debe soportar el flujo
Inicio → buscar destino → resultados → expandir horarios → elegir/compartir, sin
depender del mapa y sin cambiar todavía el motor ETA legacy.

El éxito de SCALE01 significa que backend, frontend, PostgreSQL y la futura caché
pueden evolucionar contra una única interfaz estable. No significa que la nueva
API ya esté implementada.

## Stack y restricciones

- Backend: Node.js/Express 5, CommonJS y `pg`, sin ORM nuevo.
- Datos: PostgreSQL 16 y migraciones aditivas con ledger/checksum existente.
- Frontend consumidor: Angular 21 y servicios HTTP tipados.
- Infraestructura: Render; caché detrás de `CatalogCachePort`, sin proveedor en
  SCALE01.
- Contratos actuales: `/api/locations` y rutas ETA legacy permanecen intactos.

## Supuestos propuestos

1. El directorio público continúa sin login.
2. `pointId` es el actual `id_destino`: string opaco, estable y globalmente único.
3. `companyId` es string opaco en HTTP, aunque inicialmente represente el entero
   `empresas.id`. Así la API no queda atada al tipo de PK de PostgreSQL.
4. `agencyId` es la PK interna y nunca se usa como identidad pública.
5. El listado usa cursor opaco, 20 elementos por defecto y máximo 50; no devuelve
   `totalCount`, porque contar todo no es necesario para continuar navegando.
6. Cada resultado incluye disponibilidad y máximo dos líneas de horario agrupado;
   el horario completo se solicita al expandir o abrir el detalle.
7. Los filtros iniciales son empresa, departamento, municipio, tipo y texto. `q`
   usa `matchMode=CONTAINS`: substring normalizado sin distinguir mayúsculas ni
   acentos. Fuzzy se añadirá como `matchMode=FUZZY`, nunca cambiando silenciosamente
   la semántica existente. El cursor solo vale para iguales filtros, modo y revisión.
8. `/api/locations` permanece temporalmente como adaptador legacy hasta que el
   único consumidor público migre; después se retira en un corte auditado.
9. Partner y escrituras siguen fuera de alcance.

## Contratos HTTP propuestos

### Listado/búsqueda

```http
GET /api/catalog/points
  ?companyId=1
  &department=San%20Salvador
  &municipality=San%20Salvador
  &pointType=AGENCIA
  &q=unicentro
  &matchMode=CONTAINS
  &limit=20
  &cursor=<opaque>
```

Todos los filtros son opcionales, pero la petición siempre tiene límite. `q`
acepta 2–80 caracteres; departamento/municipio/empresa se validan con límites
acotados. El cursor es opaco y no debe editarse ni persistirse como enlace eterno.

```json
{
  "data": [
    {
      "pointId": "AG_SOYAPANGO_UNICENTRO_01",
      "company": {
        "companyId": "1",
        "name": "Pedidos Express",
        "logoUrl": null
      },
      "name": "AGENCIA UNICENTRO SOYAPANGO",
      "pointType": "AGENCIA",
      "location": {
        "department": "San Salvador",
        "municipality": "Soyapango",
        "address": "Soyapango, San Salvador",
        "coordinates": { "lat": 13.710000, "lng": -89.140000 }
      },
      "media": {
        "imageUrl": null,
        "mapsUrl": null
      },
      "availability": {
        "status": "OPEN",
        "closesAt": "16:00",
        "nextOpeningAt": null,
        "evaluatedAt": "2026-10-06T15:00:00-06:00",
        "timeZone": "America/El_Salvador"
      },
      "schedulePreview": [
        { "daysLabel": "Lunes a viernes", "opensAt": "09:00", "closesAt": "16:00" },
        { "daysLabel": "Sábado", "opensAt": "09:00", "closesAt": "13:00" }
      ]
    }
  ],
  "page": {
    "limit": 20,
    "hasMore": true,
    "nextCursor": "<opaque>"
  },
  "meta": {
    "catalogRevision": "catalog:42"
  }
}
```

Reglas del listado:

- Orden total y determinista para `CONTAINS`: nombre normalizado y `pointId`.
  `FUZZY` definirá ranking y cursor propios antes de habilitarse.
- El resumen nunca incluye reglas ETA completas.
- `schedulePreview` contiene como máximo dos grupos consecutivos; no toda la semana.
- La disponibilidad se calcula después de leer cualquier caché de catálogo estático
  e incluye `evaluatedAt`; no se reutiliza más allá del siguiente cambio de estado.
- Campos no disponibles se expresan como `null`, no como strings vacíos.
- Coordenadas son números o `null`; el mapa es una acción auxiliar.
- `catalogRevision` es opaco: una consulta transversal usa revisión global y una
  consulta limitada a empresa puede usar su revisión. Un cursor de otra revisión
  devuelve `409 CURSOR_STALE` para evitar páginas mezcladas durante actualizaciones.

### Detalle de punto

```http
GET /api/catalog/points/{pointId}
```

Devuelve el mismo resumen más `schedules`, con intervalos tipados por día, y la
información pública necesaria para compartir el punto. No expone la configuración
interna completa del motor ETA. Un punto inexistente devuelve `404 POINT_NOT_FOUND`.

### Facetas

```http
GET /api/catalog/facets
  ?facet=municipality
  &department=San%20Salvador
  &q=soy
  &limit=20
  &cursor=<opaque>
```

Devuelve una sola dimensión paginada (`company`, `department`, `municipality` o
`pointType`) con `{ value, label, count }` para los filtros activos. Permite
construir “Empresas registradas”, municipios disponibles y conteos sin descargar
los puntos ni generar una respuesta de facetas ilimitada.

La faceta `municipality` añade `context.department` para distinguir municipios
homónimos sin obligar al cliente a interpretar `value`. Es un campo contextual
aditivo; las demás dimensiones pueden omitir `context`.

```json
{
  "value": "San Antonio Pajonal",
  "label": "San Antonio Pajonal",
  "count": 2,
  "context": { "department": "Santa Ana" }
}
```

### Error uniforme

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Los filtros de búsqueda no son válidos.",
    "requestId": "6da76a21-6c9c-4fae-9af1-ddc358407aea",
    "fields": ["limit"]
  }
}
```

- `400`: query/cursor inválido.
- `404`: punto no encontrado.
- `409`: cursor pertenece a otra consulta o revisión del catálogo.
- `429`: límite de frecuencia.
- `500`: mensaje genérico sin texto de PostgreSQL/proveedor.
- `fields` es opcional y solo contiene nombres de campos permitidos; nunca valores.

## Fronteras internas

```text
HTTP controller
  -> valida CatalogQuery
  -> CatalogQueryService
       -> CatalogRepository.listPage(query)
       -> CatalogRepository.getDetails(pointId)
       -> CatalogRepository.getFacets(query)
       -> CatalogCachePort (Noop al inicio)
  -> serializa CatalogPage / PointDetail / CatalogFacets
```

- El servicio recibe/retorna modelos canónicos, no filas PostgreSQL.
- El repositorio filtra y pagina en SQL; no retorna tablas completas.
- Horarios para una página se obtienen por los IDs visibles en un único batch.
- La caché depende del contrato de consulta, no al revés.
- ETA recibe IDs canónicos en una fase posterior y resuelve sus datos internamente.

## Comandos

```powershell
cd A:\SiVoyApp\backend
corepack npm test

cd A:\SiVoyApp\frontend
corepack npm run test:ci
corepack npm run build -- --configuration production
corepack npm run e2e -- --ignore-snapshots
```

Para integración PostgreSQL se reutiliza el contenedor local aislado y las
sentinelas existentes; ninguna prueba apunta a producción.

## Estructura prevista

```text
backend/src/domains/catalog/             HTTP, validación y serialización
backend/src/application/catalog/         casos de uso y puertos
backend/src/infrastructure/postgres/      repositorio PostgreSQL
backend/test/                             contratos/unitarias
backend/integration/                     consultas reales y escala
frontend/src/app/core/services/          cliente/contratos HTTP
frontend/src/app/features/home/           consumidor incremental
```

Los nombres finales deben respetar las fronteras ya verificadas del repositorio;
no se crea un paquete compartido nuevo en SCALE01.

## Estilo de contrato

```ts
interface CatalogPage<T> {
  data: readonly T[];
  page: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
  meta: { catalogRevision: string };
}
```

- JSON usa `camelCase`; enums usan `UPPER_SNAKE_CASE`.
- IDs son opacos; el cliente no extrae significado de ellos.
- Inputs, outputs y errores tienen tipos distintos.
- Campos nuevos serán aditivos y opcionales; eliminar/cambiar tipos requiere
  migración de consumidor y ventana de deprecación.

## Estrategia de pruebas

1. Unitarias de validación: límites, Unicode, cursor inválido y query vacía.
2. Contrato HTTP: forma exacta, nullabilidad, errores y ausencia de campos legacy.
3. Repositorio PostgreSQL: paginación sin duplicados/omisiones con empates de
   nombre; aislamiento por empresa/municipio; horarios batch.
4. Escala: 10k y 100k puntos con `EXPLAIN (ANALYZE, BUFFERS)` y conteo constante
   de consultas por página.
5. Frontend: cancelación de búsquedas, cursor siguiente, expansión de detalle y
   ausencia de descarga global.
6. E2E: Inicio → municipio → resultados → expandir horarios → compartir/mapa.

## Límites

### Siempre

- Preservar el endpoint legacy hasta que el consumidor público migre.
- Validar entradas en HTTP y respuestas PostgreSQL al mapearlas.
- Paginar toda lista y medir consultas sin caché.
- Mantener Partner fuera del corte.

### Requiere aprobación

- Cambiar la unicidad global de `id_destino`.
- Exponer reglas ETA completas en una respuesta pública.
- Añadir extensiones PostgreSQL o dependencias npm.
- Cambiar status/shape de endpoints legacy.

### Nunca

- Usar nombre de punto/empresa como FK o identidad pública.
- Ejecutar una lista sin límite o filtrar N puntos en Angular.
- Usar la caché para aprobar una consulta que falla el presupuesto sin caché.
- Incluir secretos, datos internos o mensajes de error de proveedores.

## Criterios de éxito

- [x] Las decisiones de identidad, cursor, página y preview están aprobadas.
- [x] Cada request/response/error tiene forma y límites explícitos.
- [x] El contrato soporta búsqueda transversal y filtro por empresa.
- [x] Listado, detalle, facetas y ETA tienen responsabilidades separadas.
- [ ] Existe una ruta de migración y retiro del contrato legacy.
- [ ] Los criterios de prueba cubren 10k/100k puntos y caché desactivada.

## Preguntas para aprobación

1. **Recomendado:** confirmar `pointId = id_destino` global y `companyId` público
   como string opaco. Alternativa: identidad compuesta empresa+punto, con mayor
   costo de migración y URLs.
2. **Recomendado:** incluir disponibilidad + máximo dos horarios agrupados en la
   tarjeta; cargar el horario completo al expandir. Alternativa: tarjeta sin
   horarios, más liviana pero contraria a la prioridad de producto acordada.
3. **Recomendado:** página por defecto 20, máximo 50 y sin `totalCount` global.
   Alternativa: total exacto, que encarece cada búsqueda a gran escala.
