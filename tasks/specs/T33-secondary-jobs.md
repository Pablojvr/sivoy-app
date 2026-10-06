# T33: Mover únicamente trabajos secundarios a eventos

## Contexto y Evidencia
Tras una auditoría arquitectónica del código fuente actual, se determinó que **no existen trabajos secundarios genuinos** (con un productor y un consumidor independiente) que deban migrarse a eventos asíncronos en este momento.

Evidencias específicas en el código actual:
- Las acciones de compartir (Web Share, copia al portapapeles, generación de imágenes) son ejecutadas directamente desde el cliente con APIs nativas del navegador y requieren de interacción de usuario síncrona y esperada (referencia `frontend/src/app/features/home/results/point-share.service.ts`, ej. líneas 56, 141, 150).
- El cálculo de ETA y las búsquedas se mantienen intencionalmente síncronos para el correcto funcionamiento del modelo actual (referencia `backend/src/domains/rutas/rutas.service.js`, líneas 14, 55, 97, 124, 158).
- Las llamadas a Cloudinary son síncronas porque la respuesta necesita la URL definitiva; NO son consistentes transaccionalmente, pero su naturaleza obliga a esperar la subida (referencia `backend/src/domains/ubicaciones/ubicaciones.service.js`, líneas 38, 68).
- Las operaciones de empresas y flujos de importación están excluidos por el alcance de usuario definido.
- No existen consumidores asíncronos activos (como analíticas o colas de eventos), verificado en `backend/package.json` mediante la ausencia de librerías como amqp o kafka.

Por lo tanto, T33 se completa intencionalmente como una migración sin código ("no-op"). No se añadirán un bus de eventos, listeners, ni infraestructura o emisores diferidos en esta fase.

## Riesgos de emitir eventos sin uso
1. **Sobrecarga de mantenimiento**: Mantener tipos, aserciones y tests de contratos para eventos que no tienen consumidores reales suma ruido sin aportar valor.
2. **Falsa sensación de desacoplamiento**: Asumir que el sistema maneja flujos asíncronos de forma resiliente, cuando en realidad la arquitectura carece de reintentos o un patrón outbox activo.
3. **Oscurecimiento del flujo de control**: Emitir eventos a un "vacío" dificulta la lectura del flujo síncrono transaccional, el cual es la fuente real de verdad en la aplicación.

## Criterios de Aceptación
1. No se introduce ninguna infraestructura asíncrona de bus, listeners o colas de eventos en el código productivo.
2. Las consecuencias y los riesgos relacionados a emitir eventos sin uso, así como la resolución de T33, se registran en el ADR `0001-internal-events-in-modular-monolith.md`.
3. T33 se marca como completada y auditada en `tasks/todo.md` con una racionalización concisa del estado no-op.

## Verificación (Comandos `rg`)
Ejecutar para verificar la ausencia de infraestructura de colas y oyentes no autorizados:
```bash
# Asegurar que no se introdujo bus de eventos, message brokers, o outboxes (se espera que no retorne resultados de estas librerías)
rg -i "eventbus|eventemitter|amqp|kafka|bullmq|sqs|rabbitmq|outbox" backend/package.json backend/src

# Verificar que no existen subscripciones, escuchas directas u operaciones de emisión activas en dominios (se espera salida vacía)
rg -n -i "EventEmitter|\.publish\(|\.subscribeEvent\(" backend/src/domains
```

## Condiciones para reabrir
Este comportamiento asíncrono sólo debe retomarse y reabrirse si se cumple lo siguiente:
1. **Un consumidor real e independiente**: Surgimiento de una necesidad externa o módulo aislado (ej. analíticas agregadas, indexación separada, notificaciones diferidas) que no deba bloquear el flujo síncrono.
2. **Semántica de entrega y de error definida**: Claridad técnica sobre si la entrega es *at-most-once* o *at-least-once*, y requerimientos estrictos de idempotencia.
3. **Propietario de fallos establecido**: Identificación clara de qué dominio o componente se hará cargo de los reintentos, caídas y del procesamiento de la cola de mensajes no procesados (DLQ).
