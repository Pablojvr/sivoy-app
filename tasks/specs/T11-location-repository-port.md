# T11 Puerto de persistencia de ubicaciones

## Objetivo y alcance

Completar el desacople iniciado en T10/T12: los casos de uso de rutas ya reciben
`locations` y `eta` inyectados, y el servicio de ubicaciones recibe `repo`.
Falta que la escritura de puntos deje de transportar expresiones SQL (`campo = ?`)
y parámetros posicionales a través del puerto. Este paquete cambia solo la firma
interna de `repo.updateLocation`; no cambia HTTP, DTO públicos, SQL efectivo,
tablas, ETA ni la interfaz Partner.

## Contrato interno

`repo.updateLocation(locId, changes, horarios)` recibe un objeto plano `changes`
con hasta estas claves: `nombre_destino`, `empresa`, `tipo`, `maps_url`,
`departamento`, `municipio`, `direccion_referencia`, `lat`, `lng` e
`imagen_referencia`. El servicio conserva exactamente sus condiciones legacy de
inclusión y normalización, incluida la omisión actual de coordenadas `0`.
`horarios === undefined` significa no reemplazar horarios; `[]` significa
reemplazarlos por ninguno. El repositorio rechaza claves fuera de la lista y
construye `UPDATE agencias` con nombres de columna constantes y valores `$N`
parametrizados. La lectura posterior permanece dentro de la misma transacción.

## Stack, archivos y comandos

- Node.js CommonJS, PostgreSQL mediante `pg`, `node:test`, sin paquetes nuevos.
- Código: `backend/src/domains/ubicaciones/ubicaciones.service.js` y
  `backend/src/domains/ubicaciones/ubicaciones.repository.js`.
- Pruebas: `backend/test/ubicaciones-service.test.js` y
  `backend/test/ubicaciones-repository.test.js`.
- Focalizadas: `cd backend; node --test test/ubicaciones-service.test.js test/ubicaciones-repository.test.js`.
- Completa: `cd backend; npm test`.
- Seguridad/sintaxis: `cd backend; npm audit --omit=dev; node --check src/domains/ubicaciones/ubicaciones.service.js; node --check src/domains/ubicaciones/ubicaciones.repository.js; git diff --check`.

## Incrementos y verificación

1. Caracterizar en pruebas el objeto de cambios enviado por el servicio,
   validación de claves permitidas y SQL parametrizado. La prueba debe fallar
   contra la firma previa antes de cambiar el código.
2. Mover el mapeo de nombres de columna y placeholders al repositorio, sin
   modificar el orden efectivo de valores ni el comportamiento de transacción.
3. Auditar diff, contratos HTTP existentes, suite completa y ausencia de nuevas
   vulnerabilidades. El cambio es revertible por commit sin migración de datos.

## Criterios de aceptación

1. `ubicaciones.service.js` no construye expresiones SQL ni placeholders para
   `updateLocation`; pasa solo datos y horarios al puerto.
2. El repositorio rechaza claves inesperadas y parametriza cada valor; un
   payload válido genera el mismo `UPDATE` y reemplazo de horarios que antes.
3. Pruebas focalizadas y backend completo verdes; el controlador, respuestas
   públicas y operaciones de creación de agencias quedan intactos.

## Fronteras

- Siempre: preservar cambios locales, transacción actual y whitelist de columnas.
- Pedir aprobación antes de: cambiar semántica de campos, límites, esquema,
  respuesta HTTP, dependencias o interfaz Partner.
- Nunca: SQL dinámico desde claves no verificadas, consultas reales contra datos
  productivos, tocar ETA o migraciones en este paquete.

## Delegación

Antigravity puede reescribir las pruebas sin red/DB y, tras auditoría, el refactor
mecánico del servicio. Codex implementa y revisa personalmente el SQL del
repositorio; ningún agente delegado edita consultas. Tras auditoría, Antigravity
puede preparar y subir solo el commit exacto autorizado a la rama de trabajo.
