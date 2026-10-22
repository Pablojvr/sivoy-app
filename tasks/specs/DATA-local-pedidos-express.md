# Spec: entorno local con datos públicos de Pedidos Express

## Objetivo

Permitir que el equipo ejecute SiVoy completamente en local y revise sus flujos e
interfaces con el catálogo público vigente de Pedidos Express, sin credenciales ni
dependencias de escritura sobre producción.

El catálogo se trata como información publicada por la empresa. SiVoy no modela
ni infiere recolección, tránsito u otros procesos internos.

## Alcance aprobado

1. Capturar y validar una copia determinista de `/api/empresas` y `/api/locations`.
2. Crear PostgreSQL local aislado y aplicar migraciones `0001`–`0006`.
3. Importar el catálogo legacy de forma idempotente.
4. Ejecutar API local en `127.0.0.1:3001` y frontend en `127.0.0.1:4303`.
5. Verificar Inicio, búsqueda y resultados con los datos locales.

Fuera de alcance: Partner, escrituras productivas, secretos, backfill hacia
`service_calendars`/`delivery_policies`, shadow ETA y cambios de contrato HTTP.

## Stack y comandos

- Node.js y `node:test` para captura, validación e importación.
- PostgreSQL 16 en contenedor local, expuesto solo en `127.0.0.1:5433`.
- Docker Compose para la infraestructura reproducible.
- Backend: `cd backend; npm test`.
- Estado de migraciones: `cd backend; npm run migrate:status`.
- Frontend: `cd frontend; npm run build`.

## Estructura

- `backend/data/`: snapshot público y manifiesto verificable.
- `backend/tools/`: captura e importación explícitas; nunca se ejecutan al arrancar.
- `backend/test/`: validación pura e integración PostgreSQL local.
- `compose.local.yml`: PostgreSQL de desarrollo sin servicios productivos.
- `tasks/`: especificación, plan y evidencia.

## Convenciones

- Ordenar empresas por nombre y puntos por `id_destino` antes de serializar.
- Preservar el contrato legacy que consume el frontend.
- Validar toda respuesta externa antes de escribir archivos o base de datos.
- Importar dentro de una transacción y usar claves estables para evitar duplicados.
- No registrar payloads completos, direcciones ni secretos en errores.

## Estrategia de pruebas

- Unitarias: normalización, validación, orden y manifiesto determinista.
- Integración: migraciones e importación contra PostgreSQL local desechable.
- Contrato: conteos, claves, relaciones, horarios y reglas del snapshot.
- E2E: Inicio → destino → resultados desde el frontend local.

## Límites

### Siempre

- Mantener el entorno local separado de producción.
- Usar credenciales de desarrollo no reutilizables fuera del contenedor.
- Verificar segunda migración e importación sin cambios ni duplicados.
- Conservar `id_destino` como identificador público estable.

### Requiere autorización adicional

- Aplicar migraciones o importar datos en producción.
- Modificar el contrato público o activar el modelo aditivo.
- Añadir una dependencia de runtime.

### Nunca

- Copiar `DATABASE_URL`, tokens o credenciales productivas.
- Usar el importador local contra un host no loopback por defecto.
- Borrar o renombrar columnas legacy en este corte.
- Habilitar escrituras públicas de Partner.

## Criterios de éxito

- Snapshot sin secretos con 1 empresa, 185 puntos, 530 intervalos y 292 reglas.
- `id_destino` único, relaciones sin huérfanos y coordenadas/horas válidas.
- PostgreSQL local saludable en `127.0.0.1:5433` y migraciones idempotentes.
- Dos importaciones producen exactamente los mismos conteos y relaciones.
- `GET http://127.0.0.1:3001/api/locations` devuelve los 185 puntos.
- La interfaz en `http://127.0.0.1:4303/` completa el flujo público con datos locales.

## Supuestos confirmados

- El catálogo público actual es la fuente permitida para desarrollo.
- El puerto `3000` pertenece a otro proyecto y no será intervenido.
- La ausencia de imágenes o URLs de Maps no bloquea el MVP.

## Preguntas abiertas

Ninguna para el corte local. La aplicación en producción queda fuera de alcance.
