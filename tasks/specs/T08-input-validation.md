# T08 Validación de entrada y errores consistentes

## Objetivo

Validar los payloads de los tres casos de uso públicos de rutas antes de consultar
repositorios o ejecutar el motor ETA. La validación debe ser determinista, sin
dependencias externas y debe preservar los cuerpos de respuesta legacy. T44 será
el encargado de versionar y uniformar envelopes públicos; T08 no adelanta ese
cambio.

## Supuestos explícitos

1. Los identificadores de origen y destino siguen siendo nombres o IDs legacy
   hasta resolver T13; se aceptan strings no vacíos y se limita su tamaño.
2. Omitir `dropoff_date` o `dropoff_time` conserva literalmente el comportamiento
   actual: el servicio sustituye ambos por la fecha y hora del servidor. Cambiar
   esa semántica requiere versionado o deprecación posterior.
3. Los campos adicionales se ignoran por compatibilidad. La validación estricta
   de envelopes y versionado pertenece a T44.

## Stack y comandos

- Runtime: Node.js CommonJS, Express y `node:test` existentes.
- Pruebas focalizadas: `cd backend; node --test test/rutas-validation.test.js test/routes-service.test.js`
- Suite completa: `cd backend; node --test`
- Sintaxis: `cd backend; node -c src/domains/rutas/rutas.validation.js; node -c src/domains/rutas/rutas.service.js; node -c src/domains/rutas/rutas.controller.js`
- Dependencias: `cd backend; npm audit --omit=dev`

## Estructura y estilo

- `backend/src/domains/rutas/rutas.validation.js`: validadores puros y error de
  validación tipado por `code`; no importa Express, repositorios ni logística.
- `backend/src/domains/rutas/rutas.service.js`: orquesta validación, repositorios
  y ETA; no interpreta mensajes de error para decidir estado HTTP.
- `backend/src/domains/rutas/rutas.controller.js`: traduce únicamente errores
  tipados conocidos a HTTP y preserva `{ error: string }`.
- `backend/test/rutas-validation.test.js`: matriz de límites y payloads adversos.
- `backend/test/routes-service.test.js`: prueba que una entrada inválida no toca
  el repositorio ni el motor ETA.

Los validadores devuelven copias normalizadas y nunca mutan el payload recibido.
No se añaden paquetes ni expresiones regulares con backtracking no acotado.

## Límites del contrato

- Payload: objeto plano no nulo; arrays y valores escalares heredados donde el
  endpoint ya los admite.
- Identificador o nombre: string recortado de 1 a 160 caracteres.
- Colecciones: 1 a 100 elementos; cada elemento cumple el límite anterior.
- Fecha civil: `YYYY-MM-DD`, año entre 1900 y 2100 y fecha calendario real.
- Hora civil: `HH:mm` o `HH:mm:ss` de 24 horas; se normaliza a `HH:mm`.
- `arrival_date`, cuando exista, no puede ser anterior a `dropoff_date` si ambas
  fueron proporcionadas.

## Estrategia de pruebas

- Unitarias de tabla para cada límite, tipo incorrecto, whitespace, fecha
  imposible, año extremo, hora imposible, arrays vacíos/excesivos y mutabilidad.
- Integración de servicio con dobles existentes para demostrar fail-fast sin I/O.
- Regresión completa para asegurar que payloads actuales y respuestas públicas no
  cambian.

## Paquetes ejecutables

### T08a Validadores puros de rutas

- **Archivos (2):**
  - `backend/src/domains/rutas/rutas.validation.js`
  - `backend/test/rutas-validation.test.js`
- **Criterios de aceptación:**
  1. Validar y normalizar los tres shapes (`upcoming`, `municipality`, `flights`)
     según los límites de este documento, sin I/O ni mutación.
  2. Rechazar con un error tipado estable (`code = "VALIDATION_ERROR"`) y mensaje
     seguro que no incluya el payload.
  3. Cubrir límites inferiores/superiores y fechas/horas reales con `node:test`.
- **Verificación:**
  `cd backend; node --test test/rutas-validation.test.js; node -c src/domains/rutas/rutas.validation.js`

### T08b Integración fail-fast en casos de uso

- **Dependencia:** T08a.
- **Archivos (2):**
  - `backend/src/domains/rutas/rutas.service.js`
  - `backend/test/routes-service.test.js`
- **Criterios de aceptación:**
  1. Cada export público valida antes de invocar repositorios o logística.
  2. Los payloads válidos mantienen sus shapes y valores de respuesta actuales.
  3. Las pruebas demuestran que los errores de entrada no producen I/O.
- **Verificación:**
  `cd backend; node --test test/rutas-validation.test.js test/routes-service.test.js; node --test`

### T08c Traducción consistente en la frontera HTTP

- **Dependencia:** T08b.
- **Archivos (3):**
  - `backend/src/domains/rutas/rutas.controller.js`
  - `backend/test/http-observability.test.js`
  - `backend/test/rutas-contract.test.js` (regresión HTTP real y dobles tipados)
- **Criterios de aceptación:**
  1. Solo `VALIDATION_ERROR` produce 400; errores no reconocidos continúan como
     500 y `Origen no encontrado` conserva 404.
  2. Se preservan los envelopes `{ error: string }` y eventos estructurados
     existentes sin filtrar stack, SQL ni payloads. Por aprobación expresa del
     usuario, el 500 municipal usa `{ "error": "Database error" }`.
  3. Ninguna decisión HTTP depende de prefijos del mensaje (`startsWith`).
- **Verificación:**
  `cd backend; node --test test/http-observability.test.js test/routes-service.test.js; node --test; npm audit --omit=dev`

## Fronteras

- **Siempre:** conservar respuestas exitosas, validar antes de I/O, parametrizar
  toda consulta existente y mantener pruebas de regresión.
- **Requiere aprobación:** cambiar límites aquí definidos, envelopes públicos,
  IDs, dependencias, SQL o esquema de base de datos.
- **Nunca:** incluir payloads o secretos en mensajes/logs, tocar Partner, retirar
  fallbacks ETA por el solo hecho de completar este paquete, o convertir errores
  internos en respuestas 4xx.

## Criterios de éxito

1. Los tres endpoints de rutas rechazan tipos y límites inválidos de forma
   consistente antes de I/O.
2. La suite completa y el audit de dependencias de producción quedan verdes.
3. No cambia ningún contrato exitoso. La única excepción aprobada al cuerpo
   público de error es la redacción del 500 municipal, sin cambiar su código.

## Pregunta de aprobación

¿Se aprueban los límites de 160 caracteres, máximo 100 elementos y años 1900–2100,
manteniendo la sustitución legacy de fecha/hora cuando falte cualquiera de ambas?

## Estado de aprobación

El usuario aprobó expresamente esos límites y la conservación del valor por
defecto legacy de fecha/hora el 2026-09-16. No se aprobaron cambios de envelope,
IDs, dependencias ni despliegue.

El 2026-09-21 el usuario aprobó expresamente ocultar detalles internos en el
500 de búsqueda por municipio mediante `{ "error": "Database error" }`, conservando
el código 500. Esta excepción de seguridad al cuerpo legacy está cubierta por
pruebas HTTP y fixture del contrato. T08a, T08b y T08c están auditados.
