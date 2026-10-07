# Reconocimiento y plan MVP de seguridad, escalabilidad y rendimiento

Fecha: 2026-10-06

Alcance: aplicación pública SiVoy, API Express, PostgreSQL, CI/CD y despliegue en Render.

Fuera de alcance: comportamiento y estilo de Partner; autenticación de usuarios finales; microservicios.

Este reconocimiento combina revisión de código/configuración, auditoría de
dependencias, observación local y PostgreSQL local. No sustituye una prueba de
penetración autorizada ni demuestra capacidad de producción; esas evidencias se
obtendrán en staging durante las fases siguientes.

## Decisión ejecutiva

SiVoy tiene una base técnica mejor de lo que su superficie HTTP sugiere: las
dependencias están limpias, las consultas usan parámetros, el pool está acotado,
las migraciones son verificables, las métricas requieren token y las escrituras
operativas están desactivadas en producción. Sin embargo, el catálogo actual no
está preparado para N empresas y N puntos: una petición carga agencias, horarios
y reglas completas, y parte del motor filtra y cruza esos datos en memoria.

La escala no se resolverá con caché. Primero se crearán contratos paginados,
identidad estable, consultas acotadas por empresa/municipio y acceso batch a
horarios/reglas. La caché sí forma parte de la arquitectura objetivo, pero como
un puerto reemplazable y una optimización posterior a consultas correctas y
medidas. No hace falta introducir microservicios ni Kubernetes para conseguirlo.

El siguiente corte debe concentrarse en cinco defensas de alto retorno:

1. resolver la credencial histórica pendiente;
2. endurecer HTTP y reducir el cuerpo máximo aceptado;
3. limitar el consumo de API, especialmente Google Places;
4. sustituir lecturas globales por catálogo paginado y búsquedas SQL acotadas;
5. medir carga/consultas en volúmenes crecientes y después activar caché e
   infraestructura horizontal donde las métricas lo justifiquen.

## Evidencia recabada

### Estado favorable

- `npm audit` reportó 0 vulnerabilidades en 231 dependencias del backend y 0 en
  598 dependencias totales del frontend.
- CI ya verifica auditoría npm, firmas de paquetes, pruebas, build, migraciones
  idempotentes, PostgreSQL efímero y una línea base de consultas.
- El pool PostgreSQL limita conexiones a 10 por defecto, acepta un rango de 1 a
  20, define espera de conexión e inactividad y se cierra ordenadamente.
- Las consultas de aplicación observadas usan parámetros `$1...$n`; no se
  encontró interpolación de entrada del usuario en SQL de runtime.
- La resolución de enlaces de Maps tiene política SSRF y las llamadas a Google
  Places abortan a los 8 segundos.
- `/api/metrics` solo existe si hay token y compara credenciales en tiempo
  constante. Los logs evitan query strings y campos arbitrarios.
- Producción bloquea `POST/PUT` operativos de empresas, agencias y ubicaciones.
- PostgreSQL local contiene 1 empresa, 185 agencias, 530 horarios y 292 reglas,
  sin necesidad actual de particionado.

### Medición local de referencia

Prueba corta, no equivalente a capacidad de producción, realizada contra
`127.0.0.1:3001` con Node 24.14.1:

| Recurso | Solicitudes | Concurrencia | Errores | p50 | p95 | p99 |
|---|---:|---:|---:|---:|---:|---:|
| `/api/health` | 200 | 20 | 0 | 7.65 ms | 30.71 ms | 35.94 ms |
| `/api/locations` | 80 | 20 | 0 | 102.57 ms | 210.61 ms | 217.71 ms |

`/api/locations` devuelve aproximadamente 125,771 bytes sin comprimir y ejecuta
tres lecturas completas. Esta cifra solo describe el catálogo actual; no es el
objetivo arquitectónico. El endpoint debe dejar de crecer linealmente antes de
incorporar nuevas empresas, aun si hoy su latencia resulta aceptable.

### Hallazgos priorizados

| Prioridad | Hallazgo | Riesgo |
|---|---|---|
| P0 | Rotación/revocación y saneamiento histórico de la credencial PostgreSQL siguen pendientes (T00). | Acceso no autorizado aun cuando el árbol actual ya no exponga el valor. |
| P0 | No hay límite de frecuencia. Google Places, Maps y consultas ETA pueden consumirse sin cota. | Denegación de servicio y costos de terceros; OWASP API4. |
| P0 | `GET /api/empresas/excel-template` y `/api/test-location` siguen públicos aunque Partner está fuera de alcance. | Superficie y trabajo de CPU innecesarios para el MVP público. |
| P0 | Faltan cabeceras de seguridad y se publica `X-Powered-By: Express`. | XSS/clickjacking/MIME sniffing y configuración débil. |
| P0 | JSON y formularios admiten 10 MB globalmente; no hay límites por endpoint ni para cabeceras/tiempos del servidor. | Agotamiento de memoria, conexiones lentas y event-loop ocupado. |
| P0 | La política CORS vuelve a `*` si falta `FRONTEND_URL`. | Un error de configuración amplía el acceso desde navegadores. |
| P0 | `/api/locations` lee y devuelve todas las agencias, horarios y reglas; `searchFlights` filtra el catálogo completo en memoria. | Tiempo, memoria, red y costo de CPU crecen con cada empresa/punto. |
| P0 | Rutas resuelven puntos repetidamente por nombre y comparan la empresa por texto. | Nombres no son identidad estable y los bucles generan consultas N×M. |
| P1 | El contrato público carece de paginación, filtros, proyección resumida e identidad canónica de empresa/punto. | No existe un límite estable de trabajo por solicitud. |
| P1 | No hay política explícita de caché salvo `runtime-config.js` y métricas. | No existe aún una capa de aceleración, pero añadirla ahora ocultaría lecturas globales. |
| P1 | `statement_timeout` e `idle_in_transaction_session_timeout` están en 0. | Una consulta o transacción atascada puede retener pool, locks y recursos. |
| P1 | Las métricas viven en memoria por proceso y no hay alertas ni monitor externo. | Se pierden al reiniciar y no representan múltiples instancias. |
| P1 | `render.yaml` no declara `healthCheckPath`, versión de Node ni hook de migración. | Despliegues menos reproducibles y readiness superficial. |
| P1 | Render construye con `npm install`, mientras CI usa Node 22, npm 11.11 y `npm ci`; local usa Node 24. | La revisión probada en CI no es necesariamente el mismo runtime/árbol que producción. |
| P1 | La búsqueda `LOWER(nombre_destino) = $1 OR id::text = $2` hace `Seq Scan` en la línea base de 10,000 agencias. | La búsqueda puntual escala linealmente. |
| P1 | JSON inválido usa el manejador HTML por defecto de Express; no existe un 404/500 JSON global para `/api`. | Contrato inconsistente y posible filtración accidental en entornos mal configurados. |
| P1 | Los controladores de Maps/Places aún pueden devolver el mensaje del proveedor en errores 500/502 (T45c). | Exposición de detalles externos y contrato inestable. |
| P2 | No existe DAST, SAST, escaneo de secretos histórico ni escaneo de imagen/SBOM automatizados. | Defectos propios y de cadena de suministro pueden llegar a merge. |
| P2 | No se ha ejecutado restauración real de backup ni carga sostenida en staging. | Recuperación y capacidad no demostradas. |

Render ya aporta TLS, HTTP/2, Brotli y protección DDoS. Eso reduce ataques
volumétricos, pero no sustituye límites por endpoint, validación ni protección de
flujos con costo, como Places.

## Arquitectura objetivo para N empresas y N puntos

La arquitectura objetivo conserva el monolito modular, pero separa explícitamente
lecturas de catálogo, detalle de punto, cálculo ETA y futuras escrituras privadas.

```text
Angular
  ├─ búsqueda/listado ──> CatalogQuery API ──> CatalogQueryService
  │                                              ├─ CatalogRepository ──> PostgreSQL
  │                                              └─ CatalogCachePort ───> Noop/Edge/Key Value
  ├─ detalle/horarios ──> PointDetail API ──────┘
  └─ estimación ETA ────> EtaApplicationService ─> consultas batch por IDs

Canal privado futuro ──> CatalogCommandService ─> transacción PostgreSQL
                                                   └─ revisión de catálogo/invalidez
```

### Contratos de lectura

- Definir `companyId`, `pointId` y `agencyId` como identidades distintas. Los
  nombres quedan para presentación/búsqueda, nunca para relaciones o joins.
- Resolver mediante ADR si `pointId` público es global o único dentro de empresa;
  no cambiar `id_destino` hasta cerrar esa decisión y su migración compatible.
- Crear un contrato canónico de catálogo con paginación por cursor estable y
  filtros `companyId`, departamento, municipio, tipo y texto normalizado.
- Separar el DTO resumido de resultados del detalle. El listado no carga reglas
  ni la semana completa de horarios; al expandir una tarjeta se consulta el
  detalle por ID o un batch de los IDs visibles.
- Añadir endpoints de facetas/conteos por municipio y empresa para que el frontend
  no descargue el catálogo para construir filtros.
- Mantener el contrato legacy mediante un adaptador transitorio, migrar primero
  el único consumidor público y retirar el endpoint global en un corte auditado;
  no sostener dos APIs permanentes.

### Acceso a datos

- Toda consulta de lista debe tener filtro, orden total y límite máximo. Ninguna
  ruta pública puede ejecutar `SELECT *` sin `WHERE/LIMIT` sobre el catálogo.
- Empujar filtros de municipio, departamento y empresa a PostgreSQL. El frontend
  no es el motor de selección de N puntos.
- Sustituir los bucles `getLocationByName` por resolución batch de IDs y consultas
  acotadas. El número de consultas por request debe ser constante, no N×M.
- Cargar horarios/reglas con `WHERE agencia_id = ANY($1)` para el conjunto visible
  o bajo demanda por punto, conservando el agrupamiento en la capa de aplicación.
- Comparar compatibilidad por `empresa_id`, no por el texto denormalizado
  `empresa`; mantener el texto únicamente como proyección legacy durante el corte.
- El frontend cancela búsquedas anteriores, aplica debounce y conserva solo la
  página visible, selecciones y detalles expandidos; usa virtualización/infinite
  scroll si el resultado visible supera el presupuesto de DOM.

### Matriz de capacidad

La palabra “N” se convierte en escenarios reproducibles, no en una promesa
abstracta. Los tamaños iniciales propuestos se ajustarán con datos comerciales:

| Escenario | Empresas | Puntos | Horarios | Reglas | Propósito |
|---|---:|---:|---:|---:|---|
| Actual | 1 | 185 | 530 | 292 | Compatibilidad funcional |
| Crecimiento | 10 | 10,000 | 70,000 | 20,000 | CI de consultas y API |
| Escala | 100 | 100,000 | 700,000 | 200,000 | Staging/carga programada |

Gate estructural: el tiempo y la memoria por página permanecen acotados al tamaño
de página; una empresa adicional no aumenta el trabajo de una consulta filtrada
de otra empresa.

## Estrategia de caché eventual

La caché se diseñará desde el contrato, pero se activará después de eliminar
lecturas globales y establecer la línea base de 10k/100k puntos.

- `CatalogCachePort` define `get`, `set` e invalidación por revisión de empresa.
  Su implementación inicial puede ser Noop; los casos de uso no conocen Redis ni
  cabeceras de CDN.
- Claves versionadas: `catalog:v1:{scope}:{scopeRevision}:{queryHash}`. `scope` es
  una empresa o `all`; búsquedas transversales usan una revisión global y las
  limitadas a empresa usan su revisión. Cursor, filtros, idioma y proyección forman
  parte de la clave; nunca se usan headers arbitrarios del cliente.
- Cada modificación futura incrementa en la misma transacción la revisión de la
  empresa y la global. Las búsquedas de una empresa invalidan solo su scope; las
  transversales cambian de revisión global. Si el canal de escritura se vuelve
  asíncrono, la revisión se propaga con outbox.
- Primera capa: caché HTTP/edge para GET públicos ya paginados. Segunda capa:
  Render Key Value/Redis solo cuando existan múltiples instancias o consultas
  calientes que sigan presionando PostgreSQL.
- Evitar estampidas con `stale-while-revalidate`, coalescencia y TTL con jitter.
  No usar una TTL larga como sustituto de invalidación.

| Recurso | Política propuesta | Invalidez |
|---|---|---|
| `index.html` | `Cache-Control: no-cache, must-revalidate` | Cada navegación revalida el shell. |
| Assets Angular con hash | `public, max-age=31536000, immutable` | El nombre cambia en cada build. |
| `/runtime-config.js` | `no-store` | Ya aplicado; conservar. |
| `/api/health`, `/api/metrics` | `no-store` | Nunca compartir estado operativo. |
| Páginas con disponibilidad | CDN máximo 60 s o hasta el próximo cambio de estado; disponibilidad se calcula después de la caché estática. | Tiempo + revisión aplicable. |
| Facetas/catálogo estático | CDN `s-maxage=300, stale-while-revalidate=60, stale-if-error=86400`; ETag. | Revisión por empresa/global, deploy o purga. |
| Detalle/horarios públicos | TTL corto y clave por `pointId` + revisión de empresa. | Cambio de catálogo de esa empresa. |
| ETA | `no-store` inicialmente; evaluar caché solo con reloj/entrada incluidos en la clave y evidencia de repetición. | Ventana temporal y revisión de reglas. |
| Places | `no-store`; no compartir respuestas entre sesiones. | Sesión y facturación de Google. |

Antes de habilitar “todos los tipos de archivo” en el edge de Render, cada
respuesta dinámica debe declarar explícitamente si es pública o `no-store`.

## Protección de API y servidor

### P0 — corte de seguridad HTTP

- Incorporar Helmet con CSP compatible con Angular, MapLibre/Mapbox, imágenes y
  Google Places. Empezar CSP en modo `Report-Only`, revisar violaciones y después
  aplicar; no usar comodines globales.
- Desactivar `x-powered-by`; fijar `Referrer-Policy`, `frame-ancestors`,
  `X-Content-Type-Options` y HSTS únicamente en producción HTTPS.
- Convertir CORS en allowlist cerrada. Producción debe fallar al arrancar si no
  existe un origen válido; localhost se permite solo en desarrollo.
- Bajar el parser general a 32–64 KiB y definir excepciones estrechas solo donde
  sean necesarias. El multipart de logos debe validar tamaño, MIME detectado por
  contenido y dimensiones; queda además detrás del bloqueo operativo.
- Configurar en Node `requestTimeout`, `headersTimeout`, `keepAliveTimeout` y
  `maxRequestsPerSocket`, compatibles con el proxy de Render.
- Añadir manejadores JSON uniformes de body inválido, 404 de API y 500 genérico;
  registrar `requestId`/`CF-Ray`, nunca cuerpo, token ni URL con credenciales.
- Limitar por IP y ruta. Punto de partida para observar, no dogma:
  - catálogo público: 120 solicitudes/minuto;
  - cálculo/búsqueda: 60/minuto;
  - Maps/Places: 20/minuto y máximo de longitud por término;
  - escrituras operativas: denegadas en producción hasta disponer de canal privado.
- Aplicar primero en modo métrica/log durante 48–72 horas y después responder
  `429` con `Retry-After`. Si se escala a varias instancias, mover el contador al
  edge o a un almacén compartido; no agregar Redis antes de eso.

### Matriz mínima de ataques y abusos

| Vector | Defensa | Prueba automatizada |
|---|---|---|
| SQL/JSON injection | validación, parámetros, errores genéricos | payloads de contrato + CodeQL/ZAP |
| XSS/clickjacking | Angular escaping + CSP/Helmet | ZAP baseline + assertions de headers |
| SSRF | allowlist HTTPS, IP pública, redirects/bytes/timeout acotados | fixtures DNS/IP/redirección existentes + casos de regresión |
| Flood/costo de terceros | rate limit por ruta, timeout, presupuesto Google | prueba 429 y k6 sin llamar a Google real |
| Body/header lento o enorme | límites de bytes y tiempos de Node | casos 413/408 y conexión abortada |
| Upload malicioso | tamaño, magic bytes, tipos permitidos, Cloudinary | fixtures MIME falso/bomba de tamaño |
| Escritura no autorizada | guard de producción y separación de router | contratos 403 para todas las rutas mutables |
| Error/secret leakage | respuestas genéricas, redacción, secret scan | snapshots negativos de cuerpo/log |
| Cache poisoning | allowlist de headers de variación y clave por ruta | tests de `Origin`, query y contenido cacheable |
| Supply chain | lockfiles, audit, firmas, CodeQL y SBOM | gates de CI |

## Pool, PostgreSQL e índices

### P0/P1

- Presupuestar conexiones: `pool_por_instancia × instancias + migraciones +
  administración < 70% de max_connections`. Con el local actual (100 conexiones)
  y una instancia de pool 10 hay margen, pero producción debe medirse contra el
  límite real del proveedor.
- Añadir métricas de `totalCount`, `idleCount`, `waitingCount`, tiempo de adquisición
  y tiempo de consulta por plantilla de baja cardinalidad.
- Aplicar por rol de aplicación, no globalmente, un `statement_timeout` inicial de
  2 s, `lock_timeout` de 1 s e `idle_in_transaction_session_timeout` de 10 s; probar
  migraciones con un rol separado y límites apropiados.
- Habilitar `pg_stat_statements` en staging/producción si el proveedor lo admite;
  revisar semanalmente p95, llamadas, tiempo total, filas y lecturas.
- Mantener `ANALYZE`/autovacuum; ejecutar `ANALYZE` después de importaciones grandes.

### Índices: solo después de medir

1. Definir las consultas canónicas antes de la migración: listado por empresa y
   municipio, búsqueda normalizada, detalle por `pointId`, horarios/reglas por
   conjunto de agencias y ETA por pares de IDs.
2. Medir por separado los dos accesos centrales: búsqueda transversal de todos los
   operadores en un municipio y navegación dentro de una empresa. Evaluar índices
   acordes, por ejemplo `(municipio_normalizado, nombre_normalizado, id)` y
   `(empresa_id, municipio_normalizado, nombre_normalizado, id)`. No fijar el DDL
   final hasta tener `EXPLAIN ANALYZE` de cada consulta.
3. Separar búsqueda por ID de búsqueda por nombre para retirar el `OR` que hoy
   fuerza `Seq Scan`; medir contra 10k y 100k puntos.
4. Considerar `(agencia_id, dia_semana, hora_apertura)` y
   `(agencia_id, dia_entrega)` si el orden/filtro de los contratos los usa. Los
   índices simples existentes se conservan hasta demostrar que son redundantes.
5. Para fuzzy search, definir normalización y umbral. Con datos suficientes,
   evaluar `pg_trgm` + GIN/GiST sobre la expresión normalizada; el cursor y un
   límite estricto siguen siendo obligatorios.
6. Mantener códigos/columnas normalizadas para municipio/departamento sin perder
   las etiquetas de presentación. PostGIS solo entra si existe búsqueda real por
   radio o viewport; el mapa auxiliar no lo justifica por sí solo.
7. Revisar `pg_stat_user_indexes`, escrituras y tamaño antes de conservar un índice.
   La caché nunca se acepta como evidencia de que una consulta es eficiente.

## Rendimiento y observabilidad

### Presupuestos propuestos para aprobar

| Señal | Objetivo inicial de staging |
|---|---|
| API pública | errores < 1%; p95 página de catálogo < 300 ms; p95 ETA < 500 ms |
| PostgreSQL | adquisición de pool p95 < 100 ms; espera = 0 estable; consulta p95 < 100 ms |
| Web móvil | LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 |
| Payload | página resumida ≤ 100 KiB; detalle solo bajo demanda |
| Complejidad | consultas DB por request acotadas y sin crecimiento N×M |
| Carga | crecimiento y escala con 20/50 usuarios virtuales sin superar presupuestos aprobados |
| Disponibilidad | definir después de abandonar el cold start del plan gratuito; no prometer un SLO falso |

Instrumentar RED (rate, errors, duration) por plantilla de ruta y USE
(utilization, saturation, errors) para pool/instancia. Conservar cardinalidad baja.
Agregar un monitor externo al flujo Inicio → resultados y alertar solo por cambio
accionable. Las métricas en memoria actuales sirven para una instancia, no como
histórico; OpenTelemetry/Sentry/Prometheus se seleccionará después de definir
quién atenderá alertas y durante cuánto tiempo se retendrán.

## Auditores automatizados recomendados

### Incorporar al MVP

- **CodeQL (default setup, JavaScript/TypeScript):** SAST en push/PR y semanal.
- **GitHub secret scanning + Gitleaks:** árbol e historial; bloquea secretos nuevos.
- **OWASP ZAP Baseline:** escaneo pasivo contra preview/staging, nunca ataque activo
  contra producción sin ventana aprobada.
- **k6:** smoke en CI y carga/soak manual o nocturna en staging con umbrales.
- **Lighthouse CI + `web-vitals`:** presupuesto de frontend y telemetría real con
  muestreo, sin recopilar texto de búsqueda.
- **Trivy filesystem/SBOM:** dependencias, secretos y misconfiguración; imagen cuando
  exista un Dockerfile de aplicación reproducible.
- **Dependabot y `npm audit signatures`:** conservar la auditoría actual y agrupar
  actualizaciones para evitar ruido.

No se recomienda instalar simultáneamente varias plataformas comerciales. Primero
se cubre SAST, DAST, secretos, dependencias y carga con herramientas reproducibles;
después se elige una plataforma de observabilidad según costo y operación real.

## Plan de ejecución por cortes auditables

SEC01–SEC05 y SCALE01 pueden avanzar en paralelo porque no comparten contratos de
datos. Dentro del carril de escalabilidad el orden sí es estricto:
SCALE01 → SCALE02/SCALE03 → SCALE04/SCALE05 → PERF → CACHE. Esto evita que el
endurecimiento HTTP vuelva a detener la evolución visible del MVP.

### Fase 0 — urgente, fuera de código

- [ ] T00 Cerrar la tarea existente: rotar/revocar la credencial histórica,
  revisar sesiones y sanear Git.
- [ ] SEC01 Confirmar backups automáticos y ejecutar una restauración en una base
  aislada, con tiempo de recuperación documentado.

Gate: la credencial anterior falla y el secret scan de árbol/historial está verde.

### Fase 1 — frontera HTTP segura

- [ ] SEC02 Añadir headers/CSP progresiva, CORS fail-closed y errores JSON.
- [ ] SEC03 Reducir cuerpos y fijar timeouts de Node/externos.
- [ ] SEC04 Rate limit por riesgo, con observación antes de bloqueo.
- [ ] SEC05 Inventariar OpenAPI/contratos, desactivar en producción
  `/api/test-location` y el Excel de Partner mientras no se utilicen, y probar que
  toda escritura responde 403 en producción.

Gate: unitarias y contratos verdes; ZAP sin hallazgos altos; no se rompe MapLibre,
Cloudinary ni el flujo Inicio → destino → compartir.

### Fase 2 — núcleo escalable de catálogo y ETA

- [ ] SCALE01 Aprobar identidad `companyId`/`pointId`, cursor y contratos de
  resumen, detalle, facetas y error; documentar compatibilidad legacy.
- [ ] SCALE02 Implementar consultas paginadas/filtradas de catálogo, horarios y
  reglas por IDs, sin lecturas completas ni `SELECT *` público sin límite.
- [ ] SCALE03 Migrar búsqueda/ETA a IDs y resolución batch por empresa; retirar
  comparación por nombre de empresa y bucles de consultas N×M.
- [ ] SCALE04 Crear migraciones aditivas de normalización/índices y medirlas con
  10k y 100k puntos antes de aceptar el DDL.
- [ ] SCALE05 Migrar el frontend a búsqueda remota cancelable, páginas/facetas y
  detalle bajo demanda; retirar el bootstrap del catálogo completo.

Gate: el flujo público conserva su comportamiento, una página no supera el límite
acordado y el costo de una consulta filtrada no depende del total de otras
empresas. El contrato legacy solo permanece durante el cutover documentado.

### Fase 3 — rendimiento medible

- [ ] PERF01 Instrumentar pool/DB, conteo de consultas y payload por ruta.
- [ ] PERF02 Añadir k6 con smoke, crecimiento, escala, pico y soak en staging.
- [ ] PERF03 Añadir Lighthouse CI/Web Vitals con budgets del flujo público.
- [ ] PERF04 Completar T14b y publicar comparación actual/10k/100k sin caché.

Gate: p95/error/payload y consultas por request dentro del presupuesto, con
comparación antes/después y sin usar caché para aprobar SQL deficiente.

### Fase 4 — caché y escala horizontal

- [ ] CACHE01 Definir `CatalogCachePort`, claves versionadas, revisión por empresa,
  política de datos cacheables y pruebas de invalidación/aislamiento.
- [ ] CACHE02 Activar edge cache para catálogo paginado y verificar
  `CF-Cache-Status`, coalescencia y comportamiento stale.
- [ ] CACHE03 Incorporar Key Value/Redis solo si la prueba sin caché demuestra un
  hotspot o si existen varias instancias; repetir carga con caché fría/caliente.
- [ ] CACHE04 Dimensionar pools por instancia y evaluar PgBouncer/réplica de
  lectura únicamente al acercarse al presupuesto de conexiones/lecturas.

Gate: cero mezcla entre empresas o revisiones, invalidación demostrada y mejora
medible frente a la línea base sin caché. El sistema sigue correcto con caché caída.

### Fase 5 — seguridad continua y operación

- [ ] OPS01 CodeQL, Gitleaks, ZAP, Trivy/SBOM y Dependabot en CI.
- [ ] OPS02 Health de readiness que compruebe DB con timeout corto; declarar
  `healthCheckPath`, fijar Node/npm y usar instalación reproducible equivalente a
  CI en Render.
- [ ] OPS03 Monitor externo, alertas accionables, retención y runbooks.
- [ ] OPS04 Ensayo de degradación: DB lenta, Google caído, pool saturado, caché caída/fría
  y rollback de despliegue.

Gate: CI y staging verdes, restauración probada, aprobación humana antes de
producción.

## Qué se pospone

- El aprovisionamiento de Key Value/Redis, PgBouncer y réplicas se pospone hasta
  observar múltiples instancias, saturación o una tasa de aciertos que justifique
  la operación. El puerto de caché, revisión por empresa y pruebas de invalidez sí
  se diseñan antes para evitar acoplamiento futuro.
- WAF propio adicional: Render ya incluye DDoS mediante Cloudflare. Evaluar reglas
  administradas únicamente si aparecen ataques de aplicación que el código y rate
  limit no cubran.
- Microservicios, colas y particionado: no resuelven ningún cuello actual.
- Autenticación del usuario final: el directorio público sigue sin login. El canal
  de escritura de empresas permanece deshabilitado en producción.

## Fuentes oficiales

- Express: https://expressjs.com/en/advanced/best-practice-security/
- OWASP API Security Top 10: https://owasp.org/projects/api-security-project
- OWASP ZAP Baseline: https://www.zaproxy.org/docs/docker/baseline-scan/
- PostgreSQL, uso de índices: https://www.postgresql.org/docs/current/indexes-examine.html
- PostgreSQL, timeouts de sesión: https://www.postgresql.org/docs/16/runtime-config-client.html
- Render, caché de borde: https://render.com/docs/web-service-caching
- Render, health checks: https://render.com/docs/health-checks
- Render, protección DDoS: https://render.com/docs/ddos-protection
- Grafana k6, thresholds: https://grafana.com/docs/k6/latest/using-k6/thresholds/
- GitHub CodeQL: https://docs.github.com/en/code-security/concepts/code-scanning/setup-types
- Lighthouse CI: https://github.com/GoogleChrome/lighthouse-ci
- Web Vitals: https://github.com/GoogleChrome/web-vitals
