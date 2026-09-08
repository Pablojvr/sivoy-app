# Plan de implementación: reinvención arquitectónica de SiVoy

Estado: borrador para aprobación. Este documento no autoriza implementación ni
despliegue por sí solo.

## Objetivo

Transformar SiVoy de un frontend concentrado y estilos globales hacia un monolito
modular con arquitectura limpia, conservando el comportamiento del motor ETA y el
flujo público sin login. La migración será incremental, reversible y desplegable
por cortes pequeños.

## Supuestos

1. Angular 21, Express y PostgreSQL se mantienen durante la migración.
2. No se cambia el producto ni el contrato público salvo aprobación explícita.
3. Mapbox/MapLibre continúa como recurso opcional de visualización.
4. `main` representa producción y `develop` integración; cada lote usa rama propia.
5. Codex orquesta, revisa e integra. Antigravity solo ejecuta encargos acotados.

## Decisiones arquitectónicas

- Monolito modular antes de microservicios.
- Arquitectura limpia dentro de cada dominio: `domain`, `application`,
  `infrastructure`, `http` o `ui`.
- Migración tipo strangler: la implementación antigua permanece hasta que su
  reemplazo tenga equivalencia funcional comprobada.
- Signals y fachadas por feature para estado del frontend; no incorporar NgRx sin
  una necesidad medible.
- Eventos internos únicamente para trabajo asíncrono no requerido en la respuesta.
- Contratos identificados y tipados antes de dividir componentes.

## Estrategia de ramas y entregas

- Una rama por tarea o slice; máximo aproximado de cinco archivos por tarea.
- Cada commit debe ser atómico y mantener build verde.
- Integración inicial en `develop`; producción solo después del checkpoint de fase.
- Toda modificación de esquema necesita migración hacia adelante y rollback probado.
- Feature flags o adaptadores permiten alternar implementación nueva/antigua cuando
  la sustitución afecte el flujo principal.

## Fase 0 — Línea base y seguridad de refactorización

Objetivo: capturar qué hace hoy la aplicación antes de mover responsabilidades.

- Registrar comandos reproducibles de build, arranque y pruebas.
- Crear fixtures mínimos para agencias, horarios, reglas y combinaciones de rutas.
- Añadir pruebas de caracterización del motor ETA y contratos HTTP críticos.
- Capturar recorridos E2E: buscar destino, elegir origen, ver ruta y compartir.
- Registrar baseline visual en 386×912, 768, 1024 y 1440 px.

Salida: ETA y flujo principal pueden verificarse automáticamente. Sin esta salida
no comienza la extracción arquitectónica.

## Fase 1 — Contratos y lenguaje de dominio

Objetivo: eliminar la ambigüedad causada por `any` en las fronteras importantes.

- Definir modelos de punto, empresa, municipio, horario y regla de entrega.
- Definir request/response para búsquedas punto-punto y municipio-municipio.
- Añadir validación de payload en la frontera HTTP.
- Centralizar transformación entre filas PostgreSQL, dominio y DTO público.
- Mantener adaptadores temporales para respuestas legacy.

Salida: compilación estricta en módulos migrados y pruebas de contrato verdes.

## Fase 2 — Núcleo ETA limpio

Objetivo: hacer que el motor sea puro, determinista y portable.

- Mover reglas de fechas y cortes a `eta-core/domain`.
- Separar búsqueda de datos, cálculo y serialización de resultados.
- Inyectar reloj y zona horaria para eliminar dependencia del tiempo del sistema.
- Cubrir bordes: cierre exacto, siguiente día hábil, consecutivos y sin ruta.
- Mantener una fachada compatible con los endpoints actuales.

Salida: suite de regresión demuestra equivalencia con el motor vigente.

## Fase 3 — Catálogo y persistencia confiable

Objetivo: aislar empresas, puntos, municipios y horarios.

- Crear repositorios por contrato y ocultar `pg` a los casos de uso.
- Actualizar punto y horarios dentro de una transacción.
- Normalizar el uso de `id` e `id_destino` mediante una decisión documentada.
- Evitar lecturas completas y consultas repetidas en búsquedas de rutas.
- Añadir índices después de medir planes de consulta reales.

Salida: integración PostgreSQL verde y rollback transaccional comprobado.

## Fase 4 — Design system y saneamiento CSS

Objetivo: reemplazar estilos globales impredecibles por una capa visual mantenible.

- Extraer tokens, tipografía, movimiento, elevación y breakpoints.
- Crear primitivas: botón, icon button, card, sheet, chip, input y modal.
- Migrar una superficie vertical por vez; no reescribir `app.css` de golpe.
- Eliminar gradualmente estilos inline, `!important` y `ViewEncapsulation.None`.
- Incorporar pruebas visuales y accesibilidad por componente migrado.

Salida: ninguna regresión visual en los viewports objetivo y reducción medible de
CSS global. Esta fase es delegable parcialmente a Antigravity.

## Fase 5 — Flujo de búsqueda como feature independiente

Objetivo: encapsular destino → origen → rutas → compartir.

- Crear `ShipmentSearchFacade` con signals y estado explícito.
- Extraer buscador de destino, selector de origen y resultados.
- Extraer tarjetas, resumen de horarios y recurso para compartir.
- Centralizar acceso HTTP y manejo de errores/cancelación.
- Preservar URLs y navegación hacia atrás mediante Router.

Salida: el flujo completo funciona sin depender del componente raíz ni del mapa.

## Fase 6 — Mapa como adaptador opcional

Objetivo: desacoplar Mapbox/MapLibre del estado de búsqueda.

- Crear un puerto de mapas y adaptador concreto.
- Encapsular marcadores, bounds, rutas y listeners.
- Destruir timers/listeners al salir de la vista.
- Mantener coordenadas y selección en modelos, no en elementos DOM.
- Probar que buscar y compartir funcionan aunque el mapa no cargue.

Salida: mapa sustituible y fallo del proveedor tratado como degradación controlada.

## Fase 7 — Operaciones de empresas

Objetivo: separar el panel administrativo del shell público.

- Crear ruta y fachada propias para empresas y puntos.
- Separar formularios, validación, imágenes, horarios y rutas logísticas.
- Mover HTTP directo a servicios de data-access.
- Reutilizar el design system sin compartir estado con búsqueda pública.
- Mantener el MVP sin login; documentar la frontera de seguridad pendiente.

Salida: administración no depende de `MobileAppComponent`.

## Fase 8 — App shell y eliminación de legado

Objetivo: reducir el componente raíz a composición y navegación.

- Convertir cada área principal en ruta lazy.
- Mantener en el shell solo navegación y overlays realmente globales.
- Eliminar código duplicado después de comprobar equivalencia.
- Borrar CSS legado solo cuando no tenga consumidores.
- Añadir budgets de bundle y reglas de dependencia entre módulos.

Salida: ningún componente de página concentra dominio, infraestructura y UI.

## Fase 9 — Eventos internos y escalabilidad operativa

Objetivo: desacoplar trabajos secundarios sin distribuir prematuramente el sistema.

- Definir eventos versionados para imports, recursos compartibles y analítica.
- Implementar outbox solo si existe una entrega externa que deba ser confiable.
- Medir latencia, volumen, errores y costo del motor ETA.
- Documentar criterios objetivos para extraer un microservicio.
- Mantener llamadas síncronas para búsquedas que necesitan respuesta inmediata.

Salida: decisión de microservicios sustentada por métricas, no por tendencia.

## Fase 10 — Plataforma de entrega

Objetivo: hacer repetible y observable cada liberación.

- Pipeline de lint, tipos, unitarias, integración, E2E y build.
- Auditoría de dependencias con política de severidad.
- Health checks y logs estructurados sin datos sensibles.
- Despliegue a staging, smoke tests y promoción controlada.
- Runbook de rollback y verificación postproducción.

Salida: un cambio no llega a producción sin evidencia automática y rollback.

## Protocolo de delegación a Antigravity

Delegable:

- extracción mecánica de CSS hacia archivos ya definidos;
- sustitución de valores literales por tokens existentes;
- componentes presentacionales sin estado ni llamadas HTTP;
- responsive, foco, contraste y `prefers-reduced-motion`;
- generación de pruebas visuales sobre contratos ya aprobados.

No delegable:

- motor ETA, SQL, migraciones y contratos públicos;
- fachadas de estado, navegación o integraciones externas;
- dependencias, commits, merges, push o despliegues;
- decisiones de arquitectura o eliminación de legado.

Cada encargo incluirá objetivo, máximo tres archivos, comportamiento protegido,
criterios, viewports y validación. Codex audita el diff antes de aceptar el trabajo.

## Auditoría obligatoria por ajuste

1. Revisar estado Git previo y posterior; no mezclar cambios ajenos.
2. Inspeccionar el diff completo y buscar cambios fuera del alcance.
3. Ejecutar prueba enfocada y después la suite de la capa afectada.
4. Ejecutar build de producción.
5. Para UI: verificar teclado, contraste, 386×912 y un viewport de escritorio.
6. Para backend: comprobar contrato, errores, transacción y consulta parametrizada.
7. Para ETA: comparar fixtures antiguo/nuevo y casos de frontera.
8. Para producción: smoke test, logs y procedimiento de rollback.

Un ajuste se rechaza si cambia comportamiento sin especificación, silencia una
prueba, introduce `any` en código nuevo, amplía alcance o carece de evidencia.

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Cambiar reglas ETA al refactorizar | Crítico | Caracterización y ejecución dual |
| Reescritura CSS tipo big bang | Alto | Migración por componente y visual diff |
| Contratos legacy inconsistentes | Alto | DTO adaptador y deprecación gradual |
| Ramas largas y conflictos | Alto | Slices pequeños y merges frecuentes |
| Agentes modifican fuera de alcance | Alto | Lista cerrada de archivos y auditoría |
| Añadir infraestructura prematura | Medio | Métricas y ADR antes de dependencias |
| Panel sin autenticación | Alto futuro | Mantener alcance MVP y documentar riesgo |

## Puntos de aprobación humana

- Aprobar `CAPABILITY-MAP.md` antes de escribir specs por módulo.
- Aprobar contratos públicos antes de Fase 1.
- Aprobar estrategia `id`/`id_destino` antes de Fase 3.
- Aprobar cada eliminación de implementación legacy.
- Aprobar cualquier dependencia, migración o despliegue.

