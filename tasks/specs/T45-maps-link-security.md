# T45 Enlaces de mapas y respuesta externa segura

## Objetivo

Impedir que `POST /api/resolve-maps-link` use una URL del cliente para acceder a
servicios internos o servidores arbitrarios. Conservar la extracción de
coordenadas de enlaces Google Maps válidos. El endpoint de Places existente queda
fuera de este paquete salvo una auditoría posterior de su respuesta externa.

## Supuestos y compatibilidad

- Se admiten enlaces HTTPS de hosts exactos `maps.app.goo.gl`, `goo.gl`
  (solo ruta `/maps/`), `www.google.com`, `google.com`, `maps.google.com` y
  `www.google.com.sv`. Los hosts Google generales requieren ruta `/maps` o
  `/maps/...`; `maps.google.com` admite también `/` con consulta.
- No se aceptan credenciales en la URL, puertos personalizados ni URL de más de
  4096 caracteres. No se permiten IP literales ni sufijos/subdominios parecidos.
- Un enlace directo con coordenadas se valida antes de devolverlas. Cada salto
  de redirección se valida antes de solicitarlo.
- El JSON exitoso `{ success, lat, lng, resolvedUrl }` se mantiene. El código
  500 de fallos internos se mantiene; el reemplazo de su mensaje por texto
  genérico requiere respuesta expresa del usuario (solicitada).

## Entorno y fuentes verificadas

- CI usa Node.js 22; ejecución local usa Node.js 24. No se añaden paquetes.
- `https.request(URL, options)` acepta opciones de `http.request`, incluyendo
  `lookup` y `signal`; `dns.lookup` con `all: true` entrega direcciones y familia.
  El timeout de socket por sí solo no aborta la petición. Fuentes oficiales:
  [HTTPS de Node 22](https://nodejs.org/download/release/v22.19.0/docs/api/https.html),
  [HTTP de Node 22](https://nodejs.org/download/release/latest-jod/docs/api/http.html),
  [DNS de Node](https://nodejs.org/api/dns.html),
  [URL WHATWG de Node 22](https://nodejs.org/download/release/latest-jod/docs/api/url.html).

## Paquetes ejecutables

### T45a Política pura de URL (sin cambio de red)

- Archivos: `backend/src/domains/mapas/maps-link-policy.js` y
  `backend/test/maps-link-policy.test.js`.
- Validar URL absoluta, esquema, host exacto, ruta, puerto, credenciales y tamaño.
  Devolver `URL` canónica; nunca iniciar una petición. Rechazar entradas con
  coordenadas en URLs no permitidas.
- Pruebas: `cd backend; node --test test/maps-link-policy.test.js; npm test`.
- Rollback: revertir el commit aditivo; no cambia el endpoint.

### T45b Transporte seguro y cutover

- Archivos: `backend/src/domains/mapas/mapas.service.js`,
  `backend/test/maps-link-resolver.test.js` y, si requiere factorizar el pinning,
  `backend/src/domains/mapas/maps-link-policy.js`.
- Validar antes de cada petición y redirección; DNS a IPv4 pública y fijar esa
  dirección para la conexión TLS conservando `hostname` y SNI; sin downgrade a
  HTTP. Limitar redirecciones, tiempo total y cuerpo leído. Fallar cerrado ante
  resolución inválida, respuesta no exitosa o datos excedidos.
- Pruebas con transporte/DNS inyectados, sin red real: localhost, IP privada,
  host parecido, redirección relativa permitida, redirección externa bloqueada,
  timeout, cuerpo grande y enlace legítimo con coordenadas.
- Verificación: `cd backend; node --test test/maps-link-policy.test.js test/maps-link-resolver.test.js; npm test; npm audit --omit=dev; git diff --check`.
- Rollback: revertir el commit del cutover; no hay migración de datos.

### T45c Respuesta HTTP segura

- Requiere aprobación expresa para sustituir el texto literal de excepciones
  internas por un error genérico, manteniendo 500 y el envelope legacy.
- Archivos: `backend/src/domains/mapas/mapas.controller.js` y
  `backend/test/http-observability.test.js`.
- Pruebas focalizadas y contrato HTTP real; no se filtran URLs internas,
  direcciones IP ni detalles de DNS al cliente.

## Fronteras

- Siempre: cero peticiones a destino no aprobado, pruebas de abuso RED→GREEN,
  comparación de respuesta exitosa y de error, y auditoría del diff.
- Requiere aprobación: cambiar cuerpo público de error, hosts admitidos tras
  fijar esta lista, dependencias o integración externa.
- Nunca: tocar Partner, ETA, SQL, migraciones, secretos o producción en T45.

## Estado

Spec redactado tras revisar el resolvedor vigente. T45a puede implementarse sin
modificar el tráfico; T45b y T45c permanecen pendientes de sus pruebas y de la
decisión sobre el cuerpo de error.
