# T35: Implementar pipeline completo y staging

## T35a: Prerrequisito de seguridad auditado (multer)
- **Threat Model**: multipart no confiable, DoS reachable en rutas de upload.
- **Evidencia**: Advisory desde `npm audit` indica que la versión 2.2.0 de multer era vulnerable a DoS por múltiples vías (crafted multipart field names, file descriptor leak on aborted uploads, etc.). Fix disponible en la versión 2.3.0.
- **Fix**: multer actualizado de `^2.2.0` a `^2.3.0`.
- **Impacto**: Sin cambios funcionales en los handlers. 
- **Estado**: Aceptado por Codex con `multer@2.3.0`, 122/122 pruebas backend, cero vulnerabilidades de producción y 234 paquetes con firmas verificadas.

## T35b: CI no-deploy (Bosquejo)
- **Objetivo**: Configurar integración continua sin despliegue.
- **Pasos sugeridos**:
  1. Instalar dependencias puras con `npm ci`.
  2. Correr `npm audit --omit=dev --audit-level=high` para prevenir vulnerabilidades de alta severidad.
  3. Ejecutar suite de pruebas de backend (`npm test`).
  4. Validar sintaxis (`node --check server.js`).
  5. Ejecutar build y pruebas del frontend.
