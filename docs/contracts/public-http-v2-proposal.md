# T44b — Propuesta de contrato HTTP público v2 (sin implementar)

Esta es una **propuesta**, no una descripción del runtime ni una autorización
para cambiar respuestas. La evidencia de v1 está en
`docs/contracts/public-http-current.md` y la matriz ETA en
`docs/contracts/routes-legacy-v1.md`. No incluye Partner ni un flujo de login.

## Decisión propuesta: convivencia por URL

Mantener `/api/*` intacto y publicar las nuevas lecturas y consultas bajo
`/api/v2/*`. Conservar inicialmente los sufijos vigentes para reducir el
riesgo de migración: `empresas`, `locations`, `get-upcoming-routes`,
`search-routes-by-municipality`, `search-flights`, `resolve-maps-link`,
`places/autocomplete` y `places/resolve`. No versionar por ahora
`/api/health`, `/api/metrics` ni `/runtime-config.js`: son endpoints de
infraestructura/configuración con consumidores distintos de la SPA.

| Aspecto | Contrato v2 propuesto |
| --- | --- |
| Éxito | `200 { "data": ... }`; colecciones siempre como arreglo, incluso vacío. `meta` es opcional y tipado por endpoint. |
| Sin coincidencias / sin viaje elegible | `200 { "data": [], "meta": { "reason": "NO_MATCH" } }`; no confundirlo con error del servidor. El motivo requiere una enumeración y mapeo comprobado antes de codificar. |
| Error | `{ "error": { "code": "CODIGO_ESTABLE", "message": "Mensaje seguro" } }`. `details` solo para validación, sin SQL, URLs privadas ni trazas. |
| Entrada inválida | `400` con código `INVALID_INPUT`, conservando límites y defaults aprobados para T08. |
| Referencia inexistente | `404` solo cuando la entidad indicada no existe; una consulta válida sin cobertura no es 404. |
| Fallo interno | `500` con `INTERNAL_ERROR`, sin excepción literal en la respuesta. |
| Proveedor externo | `502` para respuesta/fallo upstream y `503` para servicio no configurado o temporalmente no disponible, si el código permite distinguirlos con seguridad. |
| Fechas | `YYYY-MM-DD` para fecha **civil local** de depósito/llegada, sin sufijo `Z` ni conversión automática a medianoche UTC. Horas `HH:mm` con zona IANA explícita cuando representen un instante operativo. Un timestamp de evento real, si existiera, sí usaría RFC 3339 con offset. |
| Identidad | ID estable y opaco para empresas y puntos solo donde el repositorio pueda garantizarlo; no inferirlo de nombre. Durante la transición, un adaptador debe mapear `id`/`id_destino` y fallar de modo explícito si falta identidad, no inventarla. |

Un error de validación puede incluir `details: [{ field, code }]`, con nombres
de campo controlados. No se propone un envelope `success`: el estado HTTP ya
distingue éxito de error y `data: []` representa ausencia de resultados.

## Cortes por dominio

| Ruta v2 propuesta | `data` objetivo | Migración / evidencia pendiente |
| --- | --- | --- |
| `GET /api/v2/empresas` | Arreglo de empresas con `id` estable, `nombre` y campos públicos permitidos. | `EmpresasService` consume `{ success, empresas }` en v1. Verificar proyección real contra PostgreSQL antes de fijar campos. |
| `GET /api/v2/locations` | Arreglo de puntos con un único `id` público, referencia a empresa, municipio/departamento, coordenadas y horario público. | `UbicacionesService` consume arreglo directo v1; validar `id` frente a `id_destino` y nulos en datos reales. |
| `POST /api/v2/get-upcoming-routes` | Arreglo uniforme de opciones ETA; `meta` puede contener el mensaje de ingreso, separado del resultado. | `RutasService` consume tanto objeto escalar como `results` de arreglo. El adaptador debe caracterizar ambos, no duplicar SQL. |
| `POST /api/v2/search-routes-by-municipality` | Arreglo uniforme de rutas con origen/destino identificables y opciones de llegada. | Verificar la semántica de `origen_msg`, origen escalar/arreglo y 404 de origen inexistente con pruebas HTTP. |
| `POST /api/v2/search-flights` | Arreglo uniforme de rutas; cada opción conserva fecha civil de depósito y llegada, más texto de presentación separado. | `RutasService` ya tipa `results`; no perder `opciones_entrega`, horarios ni distancia. |
| `POST /api/v2/resolve-maps-link` | `{ lat, lng, resolvedUrl }` validado. | `MapasService` consume `success`; revisar exposición de URL y error 500 de v1 por separado (T45c). |
| `POST /api/v2/places/autocomplete` | Arreglo de sugerencias `{ placeId, text, mainText, secondaryText }`. | Mantener Places como ayuda secundaria; no convertirlo en dependencia obligatoria de búsqueda ETA. |
| `POST /api/v2/places/resolve` | Objeto de lugar con componentes de dirección y coordenadas. | El municipio inferido debe seguir requiriendo match con el catálogo propio. |

El formato definitivo de una opción ETA necesita un esquema campo por campo
antes de implementarse. La propuesta no presupone conocer recepción,
recolección, tránsito ni otros procesos internos de las empresas: SiVoy
publica una **promesa calculada de disponibilidad en destino** a partir de
reglas compartidas, no seguimiento de eventos.

## Secuencia de implementación y verificaciones

1. Aprobar los puntos de decisión de abajo y medir una línea base E2E con
   catálogo/DB reales o fixture reproducible (T05b). La falta de esquema
   local impide prometer paridad de IDs y fechas por ahora.
2. T44c: fijar esquemas de request/response por endpoint, con pruebas HTTP
   primero; montar adaptadores v2 sobre casos de uso existentes. Mantener v1
   y ETA SQL sin cambios en ese corte. Un adaptador no debe invocar un
   controller HTTP v1 para obtener datos.
3. T44d: migrar `EmpresasService`, `UbicacionesService`, `RutasService` y
   `MapasService` uno a uno; probar destino→origen→ETA→compartir y sus estados
   vacíos/errores en móvil y escritorio. Activar por consumidor, con vuelta
   inmediata a v1 si difiere el resultado funcional.
4. Retirar v1 solo tras una ventana de deprecación explícita y evidencia de
   uso; esa retirada no está autorizada aquí. Monitorear status y códigos de
   error por versión sin registrar datos sensibles.

Rollback de la propuesta documental: revertir este archivo. El rollback de
una implementación futura será desconectar las rutas v2 o devolver cada
consumidor a v1, no alterar la base ni la lógica de ETA.

## Aprobaciones requeridas antes de T44c

1. Prefijo de URL `/api/v2/*` y convivencia temporal con `/api/*`.
2. Envelope `data`/`meta` y error `{ error: { code, message } }` sin `success`.
3. `200 data: []` para consulta válida sin ruta; `404` solo para referencia
   inexistente; códigos estables para motivos de ausencia.
4. ID público único de punto y tratamiento de registros donde falte, tras
   inspeccionar el esquema/datos; formatos de fecha civil, hora y zona.
5. Lista de campos públicos y período de coexistencia antes de retirar v1.

Hasta esas decisiones y las pruebas de integración, T44b no habilita cambios
observables en la API ni un despliegue.
