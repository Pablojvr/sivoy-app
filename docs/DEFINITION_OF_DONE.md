# Definition of Done — SiVoy

Un cambio está terminado únicamente cuando cumple sus criterios particulares y
esta lista permanente. La presión de tiempo no reduce este estándar.

## Todo cambio

- Alcance y archivos coinciden con la tarea aprobada.
- No contiene secretos, datos productivos, logs de depuración ni código muerto.
- Tiene pruebas que demuestran el comportamiento nuevo o preservado.
- Las pruebas existentes siguen verdes.
- El diff fue revisado en corrección, claridad, arquitectura, seguridad y rendimiento.
- La documentación describe el estado vigente, no el historial del cambio.
- El commit es atómico y tiene un rollback claro.

## Backend y contratos

- Ejecutar `npm test` desde `backend/`.
- Validar entradas y respuestas externas en la frontera.
- Usar SQL parametrizado y transacciones para escrituras relacionadas.
- Mantener compatibilidad o proveer adaptador/deprecación explícita.
- Usar IDs estables, errores con código y fechas ISO 8601 con offset.
- No filtrar credenciales, stack traces ni detalles internos en respuestas.

## Frontend

- Ejecutar `npm run build` desde `frontend/`.
- Verificar 386×912 y al menos un viewport de escritorio.
- Comprobar teclado, foco visible, contraste y `prefers-reduced-motion`.
- No introducir nuevos `any`, estilos inline, `!important` o colores fuera de tokens.
- No aumentar los budgets sin evidencia y aprobación.

## Base de datos

- Migración aditiva, versionada e idempotente.
- Camino de rollback o roll-forward compensatorio probado.
- Backup restaurable confirmado antes de producción.
- Conteos, huérfanos, duplicados y constraints comparados antes/después.
- Consultas críticas medidas con `EXPLAIN (ANALYZE, BUFFERS)`.
- Ningún cambio destructivo comparte release con su sustitución.

## Producción

- Checkpoint de fase aprobado por una persona.
- CI completa en verde y dependencias auditadas.
- Smoke test documentado y ejecutado en staging.
- Logs/health checks disponibles sin datos sensibles.
- Procedimiento de rollback ensayado.
