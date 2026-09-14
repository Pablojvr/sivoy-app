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

## T35c: Migraciones y staging
- **Migraciones efímeras**: Pendiente
- **Staging externo**: Aún no configurado
