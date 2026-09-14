# T10 Extraer casos de uso de rutas y adaptador legacy

## Objetivo

Separar la orquestación de búsquedas de rutas de Express, PostgreSQL y del adaptador
público actual. Los casos de uso recibirán sus dependencias explícitamente y
devolverán los mismos DTO legacy mientras T44 no versione la API. El núcleo ETA se
consume como puerto existente y no se modifica.

## Dependencias y supuestos

- Requiere T07 (contratos de búsqueda) y T08 (validación de frontera) aprobados y
  completados antes del cutover del adaptador.
- `rutas.controller.js` y `ubicaciones.repository.js` permanecen sin cambios.
- La fecha/hora por defecto se obtiene mediante un reloj inyectado, conservando la
  semántica local vigente; la migración a una zona horaria de negocio explícita se
  hará en un paquete posterior versionado.
- Nombres/IDs y shapes de éxito/error continúan siendo legacy hasta T13/T44.

## Stack y comandos

- Node.js CommonJS, `node:test`, sin dependencias nuevas.
- Focalizadas: `cd backend; node --test test/route-use-cases.test.js test/routes-service.test.js`
- Completa: `cd backend; node --test`
- Sintaxis: `cd backend; node -c src/application/rutas/route-use-case-support.js; node -c src/application/rutas/route-use-cases.js; node -c src/domains/rutas/rutas.service.js`
- Dependencias: `cd backend; npm audit --omit=dev`

## Fronteras de arquitectura

```text
HTTP controller
      |
legacy rutas.service adapter
      |
application route use cases
      |                 |
location repository port  ETA port
```

- La capa application no importa Express, `pg`, Cloudinary ni módulos de Partner.
- Las dependencias fluyen hacia funciones inyectadas; no se usa `require.cache` en
  las nuevas pruebas.
- El adaptador legacy instancia la fábrica con repositorio y fachada ETA actuales.
- No se introducen buses, eventos, clases base ni repositorios genéricos.

## Estrategia de pruebas

- Caracterizar scalar/array, ausencia de punto, empresa incompatible, pin,
  filtro `arrival_date`, orden estable y ausencia de opciones.
- Inyectar reloj, repositorio y ETA con dobles explícitos; cero DB/red.
- Verificar que las entradas no se mutan y que un error de dependencia conserva
  su identidad para que la frontera HTTP lo traduzca.

## Paquetes ejecutables

### T10a Soporte determinista de casos de uso

- **Archivos (2):**
  - `backend/src/application/rutas/route-use-case-support.js`
  - `backend/test/route-use-case-support.test.js`
- **Criterios de aceptación:**
  1. Extraer helpers puros para fechas candidatas, defaults temporales y filtro de
     llegada sin leer el reloj global; toda referencia temporal entra como dato.
  2. Preservar exactamente los siete días candidatos, la hora `08:00` desde el
     segundo día y el límite inclusivo de `arrival_date`.
  3. Probar límites de mes/año, entradas congeladas y tres zonas horarias.
- **Verificación:**
  `cd backend; node --test test/route-use-case-support.test.js; node -c src/application/rutas/route-use-case-support.js`

### T10b Fábrica de casos de uso

- **Dependencias:** T10a, T07 y T08.
- **Archivos (2):**
  - `backend/src/application/rutas/route-use-cases.js`
  - `backend/test/route-use-cases.test.js`
- **Criterios de aceptación:**
  1. Exponer `createRouteUseCases({ locations, eta, clock })` con los tres métodos
     actuales y validar el shape de las dependencias al construir.
  2. Ejecutar consultas/ETA con los mismos criterios de empresa, orden y omisión
     actuales, sin mutar payloads ni DTOs de dependencias.
  3. Cubrir todas las ramas legacy con dobles explícitos y sin I/O.
- **Verificación:**
  `cd backend; node --test test/route-use-case-support.test.js test/route-use-cases.test.js; node -c src/application/rutas/route-use-cases.js`

### T10c Adaptador legacy y cutover

- **Dependencias:** T10b.
- **Archivos (2):**
  - `backend/src/domains/rutas/rutas.service.js`
  - `backend/test/routes-service.test.js`
- **Criterios de aceptación:**
  1. Reducir `rutas.service.js` a composición de dependencias y tres exports
     legacy, sin lógica de búsqueda o serialización duplicada.
  2. Preservar firmas, respuestas, identidad de errores y consumo del controlador
     sin modificar `rutas.controller.js`.
  3. Eliminar el uso de `require.cache` de `routes-service.test.js` mediante una
     fábrica de adapter inyectable o los casos de uso exportados.
- **Verificación:**
  `cd backend; node --test test/route-use-cases.test.js test/routes-service.test.js; node --test; npm audit --omit=dev; node -c src/domains/rutas/rutas.service.js; git diff --check`

## Límites

- **Siempre:** preservar contratos legacy, probar antes/después y mantener cada
  incremento revertible.
- **Requiere aprobación:** cambiar DTOs, errores, IDs, límites, reloj/zona horaria,
  repositorio o firma ETA.
- **Nunca:** tocar Partner, SQL/migraciones, controladores, producción, dependencias
  o implementar lógica de transporte interno desconocida por SiVoy.

## Criterios de éxito

1. `rutas.service.js` queda como adaptador de composición sin lógica de dominio.
2. Casos de uso se prueban sin DB, red, Express ni manipulación de cache global.
3. Suite completa, sintaxis y audit quedan verdes con respuestas legacy idénticas.

## Pregunta de aprobación

¿Se aprueba esta separación y su dependencia estricta de T07/T08 antes del cutover?
