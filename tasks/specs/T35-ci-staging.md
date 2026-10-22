# T35: Implementar pipeline completo y staging

## T35a: Prerrequisito de seguridad auditado (multer)
- **Threat Model**: multipart no confiable, DoS reachable en rutas de upload.
- **Evidencia**: Advisory desde `npm audit` indica que la versión 2.2.0 de multer era vulnerable a DoS por múltiples vías (crafted multipart field names, file descriptor leak on aborted uploads, etc.). Fix disponible en la versión 2.3.0.
- **Fix**: multer actualizado de `^2.2.0` a `^2.3.0`.
- **Impacto**: Sin cambios funcionales en los handlers. 
- **Estado**: Aceptado por Codex con `multer@2.3.0`, 122/122 pruebas backend, cero vulnerabilidades de producción y 234 paquetes con firmas verificadas.

## T35b: CI quality gates without deployment
- **Acceptance Exacto**: Pipeline CI sin despliegue en `.github/workflows/ci.yml` para backend y frontend. En cada push o pull request dirigido a `main`/`develop`, instala desde los lockfiles anidados, audita dependencias y firmas, ejecuta pruebas y valida el build de producción. También admite ejecución manual.
- **Threat/supply-chain Rationale**: Se utilizan versiones mayores oficiales (v4) para steps de actions (checkout, setup-node) para evitar inyección de código de terceros no auditado. Cache de dependencias ligado estrictamente a `package-lock.json` por job usando `cache-dependency-path`. Ejecución explícita por bloque con lockfile congelado mediante `npm ci`. No se exponen secretos, no hay deploy ni permisos de escritura (global `contents: read`).
- **Estado**: Aceptado por Codex con 122 pruebas backend, 239 pruebas frontend, auditorías y firmas verificadas, y build de producción exitoso. El build conserva dos advertencias preexistentes: presupuesto CSS de `app.css` y wrapper CommonJS legado de Mapbox.

## T35c: Validación de migraciones en PostgreSQL efímero
- **Objetivo**: Validar la aplicación e idempotencia de las migraciones `0001`–`0006` sobre PostgreSQL efímero en CI antes de considerar staging. T35c no configura staging externo ni cierra T35 por sí sola.
- **Topología CI y Credenciales**:
  - Service container `postgres:16-alpine` en `.github/workflows/ci.yml`.
  - Sin secretos privados: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sivoy_test` y `DATABASE_SSL=false`.
  - Credencial fija explícitamente etiquetada como efímera y de prueba, nunca reutilizable en otros entornos, permitiendo ejecución transparente en PRs de forks.
- **Baseline de compatibilidad**:
  - Archivo DDL `backend/test/fixtures/legacy-schema.sql` estructural, mínimo y sin datos ni secretos.
  - No pretende replicar el estado completo de producción: solo define las tablas `empresas`, `agencias`, `horarios_operativos` y `reglas_entrega` con las columnas y relaciones indispensables para que `0001`–`0006` ejecuten.
- **Flujo de ejecución e idempotencia**:
  - Ejecución mediante el paquete `pg` ya instalado en backend, sin requerir el cliente binario `psql` en el runner.
  - Primera aplicación: aplica en orden estricto `0001` a `0006`, registrando 6 entradas en `schema_migrations`.
  - Segunda aplicación: reporta cero migraciones pendientes/aplicadas y conserva el ledger y checksums sin modificaciones.
- **Verificaciones estructurales reales**:
  - Suite de integración dedicada que consulta catálogos de PostgreSQL:
    - Ledger: exactamente 6 versiones registradas con checksums sha256 idénticos a los archivos en disco.
    - Índices: índices creados por `0002`–`0005` existen y registran `pg_index.indisvalid = true`.
    - Integridad y nulabilidad: columnas `empresa_id` (en `agencias`) y `agencia_id` (en `horarios_operativos` y `reglas_entrega`) quedan como `NOT NULL`.
    - Claves foráneas: las FKs del baseline hacia `agencias`/`empresas` permanecen con `pg_constraint.convalidated = true`.
- **Aislamiento de pruebas y ejecución offline**:
  - La prueba de integración vive en `backend/integration/migrations.pg.spec.js`, fuera de `backend/test/`.
  - No coincide con los patrones automáticos de `node --test`; `npm test` continúa siendo estrictamente offline, hermético y sin conexión a red ni base de datos.
- **Validación local y en CI**:
  - Localmente solo es ejecutable si existe una instancia local de PostgreSQL. Sin PostgreSQL local, se audita sintaxis (`--check`), tests unitarios offline y configuración; el resultado del workflow en CI constituye la evidencia autorizada de integración.
  - Las ramas `codex/**` ejecutan los mismos quality gates para producir evidencia antes del PR; no implica merge, staging ni despliegue y puede retirarse sin tocar jobs.
- **Rollback y contención**:
  - Retirar el job o steps del workflow y los archivos de prueba del slice. No existe estado persistente externo ni migración que deshacer en entornos compartidos.
- **Archivos autorizados para el slice de implementación (máximo 4)**:
  1. `.github/workflows/ci.yml`
  2. `backend/test/fixtures/legacy-schema.sql`
  3. `backend/integration/migrations.pg.spec.js`
  4. `backend/package.json`
- **Fuera de alcance**:
  - Partner, motor ETA, staging externo, despliegue a producción, modificación de SQL en `0001`–`0006` y agregado de dependencias.
