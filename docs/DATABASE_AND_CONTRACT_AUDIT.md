# Auditoría de base de datos, contratos y motor ETA

Fecha de revisión: 2026-09-08. Estado: propuesta; no se ejecutaron escrituras en
la base. Las comprobaciones en producción se realizaron dentro de una transacción
`READ ONLY` terminada con `ROLLBACK`.

## Resumen de la base observada

| Tabla | Filas | Relaciones principales |
|---|---:|---|
| `empresas` | 1 | PK `id` |
| `agencias` | 185 | PK `id`, FK nullable `empresa_id` |
| `horarios_operativos` | 530 | FK nullable `agencia_id` |
| `reglas_entrega` | 292 | FK nullable `agencia_id` |

La auditoría no encontró huérfanos, duplicados exactos, nombres vacíos,
coordenadas fuera de rango ni horas con formato inválido. Ese buen estado depende
hoy de la aplicación: faltan constraints para garantizarlo al crecer.

## Hallazgos

### Crítico — credenciales PostgreSQL versionadas

`backend/fix_horarios_db.js` y `backend/fix_reglas_db.js` contienen una cadena de
conexión completa incrustada y aparecen en el historial Git. La credencial debe
considerarse comprometida aunque el repositorio sea privado.

Acciones obligatorias:

1. Rotar la contraseña/rol en el proveedor.
2. Revocar la credencial anterior y comprobar conexiones activas.
3. Sustituir scripts por `process.env.DATABASE_URL`.
4. Limpiar el secreto del historial con un procedimiento coordinado.
5. Activar secret scanning y una verificación pre-commit/CI.

No se copiará el valor del secreto a documentos, tickets o logs.

### Alto — migraciones irrepetibles y no transaccionales

Los scripts `migrate_v3.js` y `migrate_ids.js` están duplicados, ejecutan cambios
destructivos sin una transacción global, capturan el error sin propagar un código
de salida fallido y fuerzan TLS con `rejectUnauthorized: false`.

Se necesita un ledger de migraciones, ejecución una sola vez, transacción cuando
PostgreSQL lo permita, validación previa/posterior y migración de rollback.

### Alto — integridad insuficiente

Faltan garantías estructurales:

- `agencias.id_destino` no tiene `UNIQUE`.
- Las FK de horarios y reglas permiten `NULL`.
- No hay índices sobre `empresa_id` o `agencia_id`.
- Días, tipo de acción y reglas se almacenan como texto libre.
- Apertura/cierre son `text`, no `time`.
- Latitud/longitud son `real` y no tienen `CHECK` de rango.
- No hay restricciones para intervalos horarios duplicados o solapados.
- `agencias.empresa` duplica el nombre relacionado por `empresa_id` y puede divergir.
- No existen timestamps, vigencia temporal ni auditoría de cambios.

### Alto — actualización de horarios puede perder datos

El repositorio actual actualiza la agencia, borra todos sus horarios y los vuelve
a insertar sin `BEGIN/COMMIT/ROLLBACK`. Un fallo intermedio deja un estado parcial.

### Alto — resolución de URLs permite una frontera SSRF

El backend sigue redirecciones de una URL suministrada por el usuario. Antes de
cada solicitud y redirección debe existir allowlist HTTPS de hosts de Google Maps,
rechazo de IP privadas/link-local, límite de respuesta y timeout global.

### Alto — superficie HTTP demasiado permisiva

Si `FRONTEND_URL` falta, CORS permite cualquier origen. El límite global de JSON y
formularios es 10 MB, incluso para consultas ETA pequeñas, y no se observan límites
de tasa, headers de endurecimiento ni validación uniforme. El panel sin login es una
decisión de MVP, pero sus endpoints de escritura no deben quedar confundidos con el
directorio público de solo lectura: como mínimo necesitan una frontera operativa
separada antes de incorporar varias empresas.

### Medio — consultas y escala

- Obtener ubicaciones carga las tablas completas de horarios y reglas.
- Buscar rutas por nombre genera consultas repetidas dentro de bucles.
- La búsqueda municipal carga todas las ubicaciones y filtra en memoria.
- Los endpoints de listas carecen de paginación y filtros de servidor.
- El pool no declara límites, timeouts de adquisición/consulta ni cierre ordenado.

Con el volumen actual el tamaño es pequeño; la corrección y predictibilidad son
más urgentes que optimizaciones prematuras. Los índices deben validarse con
`EXPLAIN (ANALYZE, BUFFERS)` sobre datos representativos antes de incorporarse.

## Problemas de contrato

- Un mismo caso de uso devuelve formas diferentes cuando recibe escalares o arrays.
- `success: false` se usa como resultado de negocio dentro de respuestas exitosas.
- Los errores no tienen un envelope uniforme y códigos estables.
- Se buscan puntos por nombre o por un identificador ambiguo.
- Los DTO contienen textos formateados en lugar de fechas/horas canónicas.
- El cliente usa ampliamente `any`, por lo que no verifica el contrato al compilar.
- Las rutas REST contienen verbos y exponen detalles del caso de uso.

Contrato objetivo mínimo:

```ts
interface ApiEnvelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}

interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
    correlationId: string;
  };
}

interface RouteQuote {
  originPointId: string;
  destinationPointId: string;
  submittedAt: string;      // entrega del vendedor, ISO 8601 con offset
  availableFrom: string;    // disponibilidad en destino
  availableUntil?: string;
  appliedRuleIds: string[];
  explanationCode: string; // texto localizado en el cliente
}
```

Los endpoints nuevos deben ser aditivos y convivir temporalmente con un adaptador
legacy. Las búsquedas se realizan por identificadores estables, nunca por nombre.

## Límite del modelo temporal

SiVoy es un índice de reglas declaradas por las empresas, no un sistema de gestión
logística. No conoce ni debe inferir recolecciones, salidas, rutas físicas, tránsito
o procesos internos. El cálculo solo relaciona dos hechos observables:

```text
submittedAt (cuándo y dónde el vendedor entrega el paquete)
        ↓ política pública comunicada por la empresa
availableFrom/Until (cuándo puede retirarse en destino)
```

Esto permite explicar los casos suministrados:

- **N días de anticipación:** política de promesa con `minimumLeadDays`.
- **Mismo día desde punto específico:** política más específica, condicionada por
  origen, destino, día y hora límite, que promete disponibilidad el mismo día.
- **Entrega el lunes siguiente:** la empresa declara que los paquetes ingresados
  durante la ventana actual estarán disponibles el lunes de la siguiente semana.
  SiVoy almacena esa promesa; no registra por qué ocurre ni cuándo fue recolectado.
- **Descanso al mediodía:** dos intervalos operativos para el mismo día.
- **Horarios distintos por día:** un calendario normalizado con múltiples ventanas.

## Esquema objetivo conceptual

```text
companies
  └── locations
       ├── service_calendars
       │    ├── weekly_intervals
       │    └── calendar_exceptions
       └── delivery_policies (alcance origen → destino)
            ├── policy_versions
            └── policy_exceptions
```

### Entidades propuestas

`locations`

- `id uuid` interno y `public_id text UNIQUE` estable.
- `company_id NOT NULL REFERENCES companies(id)`.
- `name`, `type`, dirección y coordenadas validadas.
- Sin copia mutable del nombre de empresa.

`weekly_intervals`

- `calendar_id`, `weekday smallint CHECK (weekday BETWEEN 0 AND 6)`.
- `opens_at time`, `closes_at time`, `sequence smallint`.
- `purpose`: `SELLER_DROP_OFF`, `CUSTOMER_PICKUP` o `CUSTOMER_SERVICE`.
- Varias filas por día permiten descansos e intervalos distintos.

`calendar_exceptions`

- Fecha específica, tipo `CLOSED`/`OPEN`, intervalos opcionales y motivo.
- Permite feriados, cierres extraordinarios y horarios especiales.

`delivery_policies`

- Empresa, origen opcional, destino, vigencia, tipo y prioridad.
- Origen `NULL` significa cualquier punto compatible de la empresa.
- Una política específica origen-destino prevalece sobre la regla general.
- Describe una promesa pública, no un proceso operativo interno.

`policy_versions`

- Tipo discriminado: `FIXED_LEAD_DAYS`, `SAME_DAY`, `NEXT_WEEKDAY` o
  `WEEKDAY_IN_FOLLOWING_WEEK`.
- Día/hora límite de recepción o anticipación mínima.
- Parámetros versionados y validados según el tipo de política.
- Ventana de disponibilidad en destino.
- Vigencia temporal para reproducir cálculos históricos.

`policy_exceptions`

- Condiciones estructuradas por origen, destino, día y vigencia.
- Prioridad y regla aplicada registrables en el resultado.
- Evitar un motor de JSON arbitrario durante el MVP.

## Precedencia determinista

De mayor a menor especificidad:

1. Origen específico + destino específico + vigencia/día.
2. Origen específico + destino específico.
3. Municipio de origen + destino específico.
4. Cualquier origen de la empresa + destino específico.
5. Política predeterminada de la empresa.

En empate se rechaza la configuración al guardar; no se selecciona una regla de
manera accidental. Cada cálculo devuelve los identificadores de reglas aplicadas.

## Algoritmo ETA propuesto

1. Validar identificadores, zona horaria y timestamp solicitado.
2. Resolver `submittedAt` con el calendario público del punto de origen.
3. Cargar políticas candidatas por IDs, empresa y vigencia.
4. Ordenar por especificidad explícita y comprobar que no haya empate.
5. Aplicar la política declarada al `submittedAt`, sin inferir eventos internos.
6. Ajustar la promesa al calendario y excepciones públicas del destino.
7. Devolver timestamps canónicos, política aplicada y código de explicación.

El cálculo debe usar una zona horaria declarada (`America/El_Salvador`) y un reloj
inyectable. No debe comparar fechas mediante strings ni depender de la zona horaria
del servidor.

## Migración segura

1. Rotar secretos antes de cualquier trabajo adicional.
2. Versionar un esquema baseline sin modificar datos.
3. Añadir tablas nuevas y constraints inicialmente no bloqueantes.
4. Backfill idempotente con conteos y checksums.
5. Ejecutar motor antiguo y nuevo en paralelo sin afectar respuesta.
6. Comparar resultados y clasificar divergencias esperadas/errores.
7. Activar lectura nueva mediante feature flag.
8. Mantener rollback hacia lectura antigua durante una ventana acordada.
9. Retirar columnas legacy solo tras verificar consumidores y backup restaurable.

## Auditoría mínima por migración

- Backup y restauración probados.
- Migración `up`/`down` o roll-forward compensatorio documentado.
- Constraints, huérfanos, duplicados y conteos antes/después.
- `EXPLAIN` de consultas críticas.
- Pruebas concurrentes de escrituras relacionadas.
- Contratos y fixtures ETA verdes.
- Sin secretos ni datos personales en logs o artefactos.
