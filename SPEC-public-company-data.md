# Spec: public-company-data

Estado: aprobado para planificación el 28 de octubre de 2026.

## Supuestos explícitos

1. Todas las empresas que ya forman parte del catálogo público continúan
   apareciendo en el directorio, incluso si temporalmente tienen cero puntos;
   esta fase no introduce borradores ni un estado de publicación nuevo.
2. Descripción, sitio web y redes sociales son opcionales. Su ausencia nunca
   bloquea el perfil ni produce elementos vacíos en la interfaz.
3. La administración de esos datos se realizará desde un panel externo. Este
   módulo solo ofrece lecturas públicas y no agrega escrituras operativas.
4. Los puntos se consultan mediante el catálogo canónico usando `companyId`; no
   se reactivará `GET /api/locations` ni se filtrará por el nombre de empresa.
5. El contrato debe funcionar sin proveedor de mapas o lugares externos.
6. El panel externo será la fuente futura de descripción, web y redes. Hasta que
   ese sistema escriba datos válidos, los campos permanecen nulos o vacíos y la
   vista pública los omite; esta iniciativa no usa SQL manual como flujo normal.

## Modelo de amenazas y fronteras de confianza

Esta especificación publica datos, pero no convierte esos datos en confiables.
Los activos protegidos son la disponibilidad del catálogo, la integridad de las
relaciones empresa-punto, la confidencialidad de secretos y detalles internos, y
la navegación segura de la persona hacia recursos externos.

- Las consultas HTTP, `companyId` y cursores son entrada no confiable. Se
  validan antes de acceder a persistencia y permanecen acotados en longitud,
  cardinalidad y trabajo. El cursor es estado de paginación, no una credencial
  ni un mecanismo de autorización.
- Descripción, logo, sitio y redes proceden de una futura frontera
  administrativa distinta. Aunque estén persistidos, se tratan como contenido
  no confiable: se mapean campo por campo, la descripción se entrega solo como
  texto y ninguna URL se descarga, resuelve o ejecuta en backend.
- El repositorio usa exclusivamente SQL parametrizado. Los filtros, ranking y
  posiciones del cursor nunca interpolan identificadores o fragmentos SQL
  aportados por el cliente.
- Los endpoints nuevos heredan la política acotada de `/api/catalog`. En staging
  y producción `RATE_LIMIT_MODE` debe ser `enforce`; se prueba un `429` usando la
  configuración real de proxy/IP. Ese smoke solo valida enforcement e identidad
  de cliente. El `passOnStoreError` vigente es una decisión de disponibilidad
  fail-open y no tiene una alerta operativa demostrada; queda como
  `needs_validation` hasta una tarea separada de `delivery-platform` que pruebe
  el fallo del store y su señal operativa. No se presenta como control preventivo.
- Los errores y logs exponen únicamente códigos estables, `requestId` y eventos
  operativos. No registran URLs almacenadas, descripción, SQL, cursores completos
  ni excepciones internas.
- El consumidor frontend usa interpolación de texto, no `innerHTML`, y abre
  enlaces externos con `rel="noopener noreferrer"`. No hay confianza implícita
  por provenir de la base de datos.

Este modelo es un gate focalizado del módulo, no sustituye la auditoría integral
de seguridad previa a un lanzamiento de producción.

## Objetivo

Proveer la frontera pública, estable y de solo lectura que necesitan el
directorio y el perfil de empresas para mostrar identidad, presencia digital y
resumen de cobertura, sin exponer capacidades administrativas.

Una persona debe poder:

- buscar una empresa por nombre desde el primer carácter;
- abrir un perfil mediante un identificador estable;
- consultar su descripción, web y redes visibles cuando existan;
- conocer cuántos puntos y municipios cubre;
- continuar hacia sus puntos mediante el catálogo público vigente.

## Contrato HTTP propuesto

### `GET /api/catalog/companies`

Parámetros:

- `q`: opcional, de 1 a 80 caracteres, normalizado sin sensibilidad a mayúsculas
  ni tildes;
- `limit`: opcional, entero de 1 a 50; valor predeterminado `20`;
- `cursor`: opcional, opaco y con límite de 2048 caracteres.

Respuesta `200`, alineada con el envelope vigente del catálogo:

```json
{
  "data": [
    {
      "companyId": "1",
      "name": "Pedidos Express",
      "logoUrl": "/uploads/logo.webp",
      "pointCount": 185,
      "municipalityCount": 42
    }
  ],
  "page": {
    "limit": 20,
    "hasMore": false,
    "nextCursor": null
  },
  "meta": {
    "catalogRevision": "catalog:12"
  }
}
```

La búsqueda ordena coincidencia exacta, prefijo y contenido antes del orden
alfabético estable. La tupla total de orden es
`(matchRank, normalizedName, companyId)`, donde el rango menor es más relevante;
sin `q`, todas las filas usan el mismo rango. El cursor codifica esa posición,
la huella de los filtros y la revisión del catálogo. Un cursor inválido responde
`400 CURSOR_INVALID`; si cambian la consulta o la revisión, responde
`409 CURSOR_STALE`. Un resultado vacío responde `200` con `data: []`,
`hasMore: false` y conserva `meta.catalogRevision`.

Los caracteres `%`, `_` y `\` de `q` se interpretan literalmente. El repositorio
escapa el patrón y declara `ESCAPE` en SQL; la forma normalizada literal participa
en la huella del cursor. El cliente no puede introducir comodines propios.

El directorio incluye empresas con cero puntos para mantener visible una empresa
ya incorporada al catálogo. `pointCount` cuenta únicamente agencias que cumplen
el predicado público vigente: `id_destino` no nulo y no vacío, con relación válida
a la empresa. `municipalityCount` cuenta pares distintos y no vacíos
`(departamento, municipio)` normalizados con `btrim/lower` bajo ese mismo
predicado; `departmentCount` aplica la misma regla al departamento.

### `GET /api/catalog/companies/:companyId`

Respuesta `200`:

```json
{
  "companyId": "1",
  "name": "Pedidos Express",
  "logoUrl": "/uploads/logo.webp",
  "description": "Red de puntos de entrega en El Salvador.",
  "websiteUrl": "https://example.com",
  "socialLinks": [
    {
      "platform": "INSTAGRAM",
      "url": "https://instagram.com/example",
      "order": 1
    }
  ],
  "coverage": {
    "pointCount": 185,
    "municipalityCount": 42,
    "departmentCount": 14
  }
}
```

Reglas:

- `companyId` siempre es la representación decimal canónica de un entero entre
  `1` y `2147483647`, acorde con el tipo PostgreSQL actual; otra forma responde
  `400 VALIDATION_ERROR` y una forma válida inexistente responde
  `404 COMPANY_NOT_FOUND`;
- `logoUrl`, `description` y `websiteUrl` usan `string | null`;
- `socialLinks` siempre es un arreglo, vacío cuando no hay redes visibles;
- `description` es texto plano de hasta 500 caracteres, sin HTML ni caracteres
  de control;
- `logoUrl` tiene un máximo de 2048 caracteres. Admite una ruta administrada
  canónica bajo `/uploads/` o una URL absoluta HTTPS cuyo `URL.origin` pertenece
  a `PUBLIC_MEDIA_ORIGINS`. Se rechazan rutas `//`, barras invertidas,
  caracteres de control y segmentos `.` o `..`; cualquier valor legacy inseguro
  se presenta como `null`;
- solo se devuelven redes marcadas como visibles, ordenadas por `order` y luego
  por plataforma;
- una empresa inexistente responde `404` con el envelope seguro del catálogo y
  código `COMPANY_NOT_FOUND`;
- entradas inválidas responden `400 VALIDATION_ERROR` sin detalles internos;
- el endpoint nunca descarga ni resuelve las URLs externas almacenadas.
- los enlaces sociales deben usar HTTPS y un host permitido para su plataforma;
  los valores legacy inválidos se omiten sin invalidar el perfil completo;
- publicar un enlace de WhatsApp implica consentimiento de la empresa porque el
  enlace puede revelar un número telefónico.

### Puntos de una empresa

No se crea otro endpoint. Los consumidores usan:

```text
GET /api/catalog/points?companyId=<id>&q=<texto>&limit=<n>&cursor=<cursor>
```

El contrato actual de puntos permanece compatible. La exactitud del conteo de
empresa y la lista filtrada deben usar la misma definición de punto público.
El buscador de puntos conserva su mínimo vigente de dos caracteres. Los filtros
de municipio y departamento consumen facetas acotadas por `companyId` mediante:

```text
GET /api/catalog/facets?facet=municipality&companyId=<id>
GET /api/catalog/facets?facet=department&companyId=<id>
```

## Persistencia aditiva propuesta

`empresas` incorpora campos opcionales:

- `descripcion varchar(500)`;
- `website_url varchar(2048)`.

Las redes se normalizan en `empresa_redes_sociales`:

- `id` como clave primaria;
- `empresa_id` como FK a `empresas(id)` con `ON DELETE CASCADE`;
- `plataforma` restringida inicialmente a `FACEBOOK`, `INSTAGRAM`, `WHATSAPP`,
  `TIKTOK`, `YOUTUBE` y `LINKEDIN`;
- `url varchar(2048)`;
- `visible boolean NOT NULL DEFAULT true`;
- `orden smallint NOT NULL DEFAULT 0`;
- unicidad por `(empresa_id, plataforma)`.

Los hosts sociales permitidos inicialmente son los dominios oficiales de cada
plataforma y sus subdominios documentados: `facebook.com`, `instagram.com`,
`wa.me` o `api.whatsapp.com`, `tiktok.com`, `youtube.com` o `youtu.be`, y
`linkedin.com`. `website_url` aplica una política sintáctica: esquema HTTPS,
hostname válido, sin credenciales embebidas y sin host local ni IP literal
privada o reservada. El backend no resuelve DNS ni afirma que la URL sea
alcanzable.

La migración será aditiva, versionada e idempotente. Debe incluir un camino de
rollback o roll-forward compensatorio. Los cambios en `nombre`, `logo_url`,
`descripcion`, `website_url` o en cualquier red social deben incrementar la
revisión del catálogo mediante triggers. El directorio incluye
`meta.catalogRevision`; los cachés de directorio y detalle y los cursores se
ligan internamente a esa revisión, siguiendo el patrón del detalle de puntos.
La revisión es un token monotónico de invalidación, no un contador de cambios de
dominio. Cada sentencia directa sobre una tabla observada lo incrementa una vez;
una eliminación en cascada que afecte empresa y redes puede incrementarlo más de
una vez, y ningún consumidor depende de un delta exacto.

La propiedad del esquema, FK, índices y triggers permanece en
`data-foundation/location-catalog`; `public-company-data` solo consume esa
persistencia mediante su repositorio de lectura y publica DTOs validados.

Antes de aplicar las columnas nuevas, el endpoint legacy `GET /api/empresas`
debe dejar de usar `SELECT e.*` y proyectar explícitamente su contrato vigente.
Una prueba de caracterización demuestra que `descripcion`, `website_url` y redes
no aparecen en esa respuesta tras migrar. La migración no amplía contratos
legacy por accidente.

Para el volumen actual de empresas, el MVP admite un recorrido secuencial
acotado y medido. La prueba reproduce 10 000 empresas, una página de 20, una sola
consulta de lista, payload acotado y un presupuesto inicial de 1 500 ms en la
base efímera, coherente con el gate de escala vigente. También registra bloques
compartidos y nodos del plan. No se añade un índice trigram a `empresas.nombre`
sin que ese fixture incumpla el presupuesto o muestre crecimiento no acotado. Si
la medición lo exige, el índice se propone en una migración `.notx.sql` separada
mediante `CREATE INDEX CONCURRENTLY` y requiere aprobación.

La carga de contenido no pertenece a la API pública: pruebas y entornos locales
usan fixtures controlados; producción recibe los valores desde el panel externo
cuando esté disponible. El lanzamiento del directorio no depende de que esos
campos opcionales estén poblados.

`PUBLIC_MEDIA_ORIGINS` es una lista separada por comas de orígenes HTTPS exactos,
sin ruta, query, fragmento ni credenciales. Un valor vacío falla cerrado para
URLs absolutas y conserva únicamente rutas administradas bajo `/uploads/`. El
archivo de ejemplo mantiene `RATE_LIMIT_MODE=observe` para desarrollo y
documenta que staging/producción deben sobreescribirlo con `enforce`.

## Stack técnico

- Backend: Node.js, Express y PostgreSQL existentes.
- Consultas: SQL parametrizado mediante la infraestructura PostgreSQL actual.
- Contratos: controladores del dominio `catalog`, servicios de aplicación y
  repositorio PostgreSQL; no se añade una dependencia.
- Identidad pública: `companyId` serializado como cadena.
- Validación y cursor: parser y codec específicos de empresas; no se debilitan
  `parseListQuery` ni el cursor de puntos. El cursor de empresa incluye tipo,
  versión, revisión, huella de consulta, `matchRank`, nombre normalizado e ID.

## Comandos

Desde `backend/`:

```powershell
npm test
npm run test:migrations:pg
npm run test:company-catalog:pg
npm run test:catalog-scale:pg
npm run migrate:status
```

Las pruebas PostgreSQL requieren la conexión efímera documentada por el
repositorio. La expectativa de migraciones se actualizará para incluir los
nuevos archivos numerados sin modificar migraciones ya aplicadas.
`migrate:status` se ejecuta únicamente con una URL explícita de loopback y la
base efímera esperada; nunca usa por omisión el `.env` de la estación.

Validación del consumidor, desde `frontend/` cuando se integre un cliente:

```powershell
npm run test:ci
npm run build
npm run check:boundaries
```

## Estructura del proyecto

```text
backend/migrations/                         Migración aditiva
backend/src/domains/catalog/                Validación y frontera HTTP pública
backend/src/application/catalog/            Casos de uso y cursores
backend/src/infrastructure/postgres/         Consultas parametrizadas
backend/test/                               Pruebas unitarias y HTTP
backend/integration/                        Pruebas PostgreSQL focalizadas
docs/contracts/public-http-current.md       Contrato vigente tras implementar
```

Los módulos legacy de `empresas` conservan su forma actual y no son el proveedor
del nuevo perfil público.

## Estilo de código

Se mantienen CommonJS, funciones fábrica e inyección explícita de dependencias:

```js
function createCompanyProfileService({ repository }) {
  async function getCompanyProfile(companyId) {
    const profile = await repository.getCompanyProfile(companyId);
    if (!profile) {
      throw new CatalogError(404, 'COMPANY_NOT_FOUND', 'No encontramos la empresa solicitada.');
    }
    return profile;
  }

  return { getCompanyProfile };
}
```

- SQL siempre parametrizado.
- Nombres internos en inglés coherentes con el catálogo; textos públicos en
  español.
- Sin nuevos `any`, secretos, logs de datos o excepciones expuestas al cliente.
- Los DTO públicos se mapean explícitamente; no se serializan filas completas.

## Estrategia de pruebas

- Unitarias para validación de `q`, `limit`, `cursor` y `companyId`.
- Unitarias para orden y ocultamiento de redes no visibles.
- Pruebas HTTP para `200`, resultado vacío, `400`, `404` y `500` seguro.
- Pruebas de `400 CURSOR_INVALID` y `409 CURSOR_STALE` por revisión o consulta.
- Integración PostgreSQL para conteos, búsqueda sin tildes, paginación estable,
  FK, unicidad y rollback/roll-forward de la migración.
- Compatibilidad del endpoint legacy contra el esquema migrado y ensayo efímero
  del procedimiento compensatorio del trigger social, seguido de su restauración
  y nueva verificación de revisión.
- Integración para empresas con cero puntos y conteo distinto por el par
  departamento/municipio.
- Integración para demostrar que cada campo de perfil y red social invalida la
  revisión utilizada por lista, detalle y cursores.
- Caracterización del contrato vigente de `/api/catalog/points` para demostrar
  que `companyId` continúa filtrando sin regresión.
- Medición de la consulta de directorio con `EXPLAIN (ANALYZE, BUFFERS)` sobre
  el fixture reproducible de 10 000 empresas y los umbrales anteriores antes de
  decidir si necesita índice trigram.
- La suite completa de backend debe permanecer verde antes de cada commit.

## Límites

### Siempre

- Validar parámetros en la frontera HTTP.
- Usar `companyId`, no nombres, para relaciones y navegación.
- Validar las URLs almacenadas como `https:` antes de exponerlas públicamente.
- Validar que cada red use el host permitido para su plataforma; omitir de la
  lectura cualquier registro legacy que no cumpla la política.
- Abrir enlaces externos en frontend con `rel="noopener noreferrer"`.
- Mantener compatible `GET /api/empresas` y el catálogo de puntos.
- Mantener consultas paginadas y límites acotados.
- Tratar el rollback normal como reversión del código y conservación del esquema
  aditivo; cualquier retiro posterior usa una migración compensatoria nueva.

### Consultar antes

- Cambiar el conjunto inicial de plataformas sociales.
- Agregar un estado de borrador/publicación de empresa.
- Cambiar el formato global de errores o cursores del catálogo.
- Añadir dependencias, caché externa o búsqueda administrada.
- Cargar datos productivos manualmente o ampliar el panel externo.

### Nunca

- Añadir endpoints de escritura a esta frontera pública.
- Rehabilitar escrituras operativas en producción.
- Exponer credenciales, nombres de tablas, SQL o stack traces.
- Descargar, rastrear o previsualizar en backend las URLs sociales o de sitio.
- Usar el nombre de empresa como identificador estable.
- Modificar el motor ETA o sus contratos.

## Criterios de éxito

- Una búsqueda por una sola letra devuelve empresas coincidentes de forma
  paginada y estable con el envelope canónico `data/page/meta`.
- El detalle de una empresa existente devuelve identidad, presencia digital
  opcional y conteos de cobertura verificables.
- Una empresa sin descripción, web o redes mantiene un DTO válido y no requiere
  valores ficticios.
- Solo aparecen redes visibles, con plataforma permitida y URL HTTPS válida.
- Las empresas sin puntos aparecen con conteos en cero; los conteos no incluyen
  agencias sin `id_destino` público válido.
- El perfil sigue siendo utilizable antes de que el panel externo cargue campos
  opcionales; no aparecen placeholders falsos ni se requiere intervención SQL.
- Los conteos de perfil coinciden con los puntos devueltos por el filtro
  `companyId` bajo la misma definición de punto público.
- Los endpoints legacy mantienen su formato y las escrituras siguen bloqueadas
  en producción.
- Las pruebas unitarias, HTTP, PostgreSQL y la suite completa documentadas pasan.

## Preguntas abiertas

Ninguna para este módulo. Las rutas de usuario serán públicas y estarán fuera de
`/admin`. La composición visual, navegación y comportamiento responsive
pertenecen a `company-directory`, `company-profile` y
`company-point-browser`, que tendrán especificaciones independientes.
