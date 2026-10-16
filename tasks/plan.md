# Plan de implementación: reinvención arquitectónica de SiVoy

Estado: evolución arquitectónica profunda pausada; carril MVP de producto activo.
Contratos públicos, base de datos y producción requieren sus respectivos gates y
aprobaciones; este documento no autoriza por sí solo cambios observables ni despliegues.

## Objetivo

Transformar SiVoy de un frontend concentrado y estilos globales hacia un monolito
modular con arquitectura limpia, conservando el comportamiento del motor ETA y el
flujo público sin login. La migración será incremental, reversible y desplegable
por cortes pequeños.

## Repriorización MVP — 2026-10-05

La reinvención arquitectónica deja de ser el camino crítico del MVP. Se congela
en el commit verde `a5c9eae`: las salvaguardas ya integradas permanecen, pero no
se habilitan componentes experimentales ni se continúa una sustitución profunda
mientras no resuelva una necesidad observable del producto.

### Carril activo: producto utilizable

1. Auditar el recorrido público Inicio → destino → resultados → compartir y mapa
   opcional, en móvil y escritorio.
2. Simplificar Inicio para que la búsqueda de destino sea la acción principal.
3. Compactar las tarjetas de resultado: resumen colapsable, horarios agrupados y
   acciones inequívocas para buscar origen, compartir y ver en el mapa.
4. Corregir la ficha/modal móvil: encabezado colapsable, horarios visibles y sin
   superposición con la navegación inferior.
5. Consolidar navegación y estado: volver a Inicio, regresar a resultados y
   conservar la selección sin callejones sin salida.
6. Aplicar una pasada visual acotada mediante tokens existentes de tipografía,
   color, espaciado, iconos y movimiento; evitar otra reescritura global de CSS.
7. Cerrar cada corte con pruebas del flujo principal en 386×912 y escritorio,
   build verde y revisión humana antes de producción.

### Mínimos técnicos que siguen siendo obligatorios

- Corregir fallos de seguridad, pérdida de datos, contratos públicos o cálculo ETA
  que bloqueen el recorrido principal.
- Mantener CI, pruebas, migraciones existentes y auditoría de dependencias verdes.
- Conservar Partner fuera de alcance y las escrituras públicas desactivadas en
  producción hasta definir un canal privado.
- Mantener mapa y Mapbox/MapLibre como recurso auxiliar, no como entrada principal.

### Excepción activa: datos actuales de Pedidos Express

Los ajustes de datos necesarios para usar el catálogo real sí forman parte del
MVP. La verificación pública del 2026-10-05 confirmó 1 empresa, 185 puntos, 530
intervalos publicados y 292 reglas de entrega; todos los puntos tienen
`id_destino`, coordenadas, horarios y al menos una regla, sin identificadores
duplicados. La ausencia de imagen y URL de mapa en 181 puntos es una brecha de
contenido, no de estructura.

El objetivo inmediato es reproducibilidad local, no sustituir el motor actual:

1. Capturar un snapshot versionado y verificable del contrato público, sin
   credenciales ni datos internos.
2. Levantar PostgreSQL local en un puerto no conflictivo y aplicar el ledger de
   migraciones existente.
3. Importar de forma idempotente `empresas`, `agencias`, `horarios_operativos` y
   `reglas_entrega`, conservando identificadores estables y relaciones.
4. Verificar conteos, ausencia de huérfanos, unicidad de `id_destino`, rangos de
   coordenadas y validez de intervalos antes de habilitar el backend local.
5. Ejecutar SiVoy API en un puerto distinto de `3000` y conectar el frontend de
   desarrollo a ese origen local.

Estado del corte (2026-10-06): completado. El catálogo quedó versionado,
validado e importable; PostgreSQL local conserva sus datos en el disco `A:`, la
API sirve los 185 puntos y la interfaz local mostró cobertura, resultados,
horarios agrupados y fallbacks de contenido en una prueba de navegador real.
La segunda ejecución de migraciones e importación no produjo duplicados.

Las migraciones serán aditivas. No se hará backfill ni cutover hacia
`service_calendars`/`delivery_policies` durante este corte; esos modelos se
activarán cuando una segunda empresa o una regla real no pueda expresarse con el
contrato actual. Tampoco se interpretarán procesos internos de Pedidos Express:
los datos representan únicamente disponibilidad publicada en destino.

### Pospuesto hasta después del MVP

- Integración, exposición y prueba en staging del shadow runtime ETA
  (`T43c2c`, `T43c2d2`, `T43c2e`). Los componentes ya creados permanecen
  desactivados por defecto.
- Evidencia avanzada de rendimiento PostgreSQL (`T14b`) mientras no exista una
  regresión medible en el flujo público.
- Formalización completa de staging/rollback (`T35`/`T36`) más allá del arnés y
  los gates actuales; un despliegue solicitado seguirá requiriendo smoke y ruta
  de reversión concreta.
- Microservicios, arquitectura orientada a eventos y nuevas abstracciones que no
  reduzcan tiempo de entrega o riesgo inmediato del MVP.
- Ampliación general del modelo de reglas empresariales sin un caso real aprobado;
  se exceptúa únicamente la reproducción local del catálogo actual descrita arriba.

Estas tareas no se cancelan: quedan en espera y se reactivan por evidencia
(incidente, cuello de botella, nueva empresa o requisito de operación), no por
completar arquitectura por sí misma.

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

- Rotar las credenciales PostgreSQL expuestas y activar detección de secretos.
- Inventariar esquema, constraints, índices, tamaños y calidad de datos.
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
- Adoptar envelope uniforme de datos/errores y timestamps ISO 8601 con offset.
- Separar IDs públicos estables de claves internas y prohibir búsquedas por nombre.

Salida: compilación estricta en módulos migrados y pruebas de contrato verdes.

## Fase 2 — Núcleo ETA limpio

Objetivo: hacer que el motor sea puro, determinista y portable.

- Mover reglas de fechas y cortes a `eta-core/domain`.
- Separar búsqueda de datos, cálculo y serialización de resultados.
- Inyectar reloj y zona horaria para eliminar dependencia del tiempo del sistema.
- Cubrir bordes: cierre exacto, siguiente día hábil, consecutivos y sin ruta.
- Mantener una fachada compatible con los endpoints actuales.
- Separar `submittedAt` y `availableFrom/Until`; cualquier operación intermedia
  de la empresa permanece opaca para SiVoy.
- Definir precedencia determinista para reglas generales y punto a punto.
- Modelar anticipación mínima, promesas semanales y excepciones de calendario.

Salida: suite de regresión demuestra equivalencia con el motor vigente.

## Fase 3 — Catálogo y persistencia confiable

Objetivo: aislar empresas, puntos, municipios y horarios.

- Crear repositorios por contrato y ocultar `pg` a los casos de uso.
- Actualizar punto y horarios dentro de una transacción.
- Normalizar el uso de `id` e `id_destino` mediante una decisión documentada.
- Evitar lecturas completas y consultas repetidas en búsquedas de rutas.
- Añadir índices después de medir planes de consulta reales.
- Sustituir día/hora textual por `smallint`/`time` y múltiples intervalos diarios.
- Añadir calendarios de excepción, vigencia, timestamps y auditoría de reglas.
- Introducir políticas de promesa con alcance origen/destino sin eliminar tablas
  legacy al inicio.
- Endurecer el resolvedor de URLs contra SSRF y validar respuestas externas.
- Separar APIs públicas de lectura y operaciones de escritura, restringir CORS,
  tamaños de payload, timeouts y límites de tasa según endpoint.
- Configurar límites del pool, timeout de consultas y apagado ordenado.

Salida: integración PostgreSQL verde y rollback transaccional comprobado.

El diseño detallado, precedencia y estrategia de backfill están en
`docs/DATABASE_AND_CONTRACT_AUDIT.md`.

## Fase 4 — Design system y saneamiento CSS

Objetivo: reemplazar estilos globales impredecibles por una capa visual mantenible.

- Extraer tokens, tipografía, movimiento, elevación y breakpoints.
- Crear primitivas: botón, icon button, card, sheet, chip, input y modal.
- Migrar una superficie vertical por vez; no reescribir `app.css` de golpe.
- Eliminar gradualmente estilos inline, `!important` y `ViewEncapsulation.None`.
- Incorporar pruebas visuales y accesibilidad por componente migrado.

Salida: ninguna regresión visual en los viewports objetivo y reducción medible de
CSS global. Esta fase es delegable parcialmente a Antigravity.

### Subplan UI-REB-01 — `native-visual-foundation`

Estado: plan técnico aprobado el 2026-10-14. La especificación
aprobada es `tasks/specs/UI-REB-01-native-visual-foundation.md`. Este subplan
extiende `MVP06`; no reactiva los paquetes arquitectónicos pospuestos ni autoriza
cambios en producción.

#### Decisiones de implementación

- Mantener `styles.css` como único punto de entrada global y hacer que importe
  `styles/native-tokens.css` antes de `styles/native-primitives.css`.
- Introducir los roles `--si-*` de forma aditiva. Los nombres legacy continúan
  disponibles como aliases hasta que las pantallas consumidoras sean migradas.
- Extraer la apariencia de los primitives sin renombrar selectores, inputs,
  variantes ni atributos `data-*`; la API Angular permanece estable.
- Retirar la solicitud remota de Manrope y usar exclusivamente la pila nativa
  aprobada. No se agrega fuente, dependencia ni framework visual.
- Tratar los cinco viewports, teclado, contraste, zoom y reducción de movimiento
  como gate de aceptación, no como una fase de pulido opcional.

#### Grafo de dependencias

```text
Caracterización y contratos actuales
                |
                v
       Tokens nativos + aliases
                |
                v
      Primitives visuales `si-*`
                |
                v
     Auditoría visual + documentación
                |
                v
   Habilitar módulos UI-REB posteriores
```

La extracción de primitives depende de que los tokens y aliases estén estables.
La validación final depende de ambas capas. El borrador de documentación puede
prepararse en paralelo con los tokens, pero se integra solo después de auditar los
valores realmente implementados.

#### Incrementos previstos

1. **Caracterizar el contrato vigente.** Capturar los tokens, aliases, selectores
   y estados públicos que ya consumen las pantallas; ampliar primero las pruebas
   de contrato para que una extracción accidental o un cambio de API falle antes
   de alterar estilos.
2. **Instalar la capa de tokens nativos.** Crear la fuente única para tipografía,
   color, espacios, geometría, sombras, movimiento y safe areas; conectarla a
   `styles.css`, redirigir aliases legacy y actualizar el contrato de colores.
3. **Extraer y recalibrar primitives.** Mover las reglas `.si-*` a su hoja dedicada
   y aplicar el contrato aprobado a Button, IconButton, Input, Chip, Card, Sheet y
   Modal, conservando DOM y comportamiento. Los tests cubren variantes, estados,
   tamaño táctil, foco, disabled/busy y nombres accesibles.
4. **Cerrar el fundamento.** Documentar uso y anti-patrones, ejecutar contratos,
   suite y build, y revisar visualmente las pantallas consumidoras actuales en los
   cinco viewports antes de habilitar `native-app-shell`.

Cada incremento se descompondrá en tareas S/M de máximo cinco archivos después de
aprobar este plan. Cada tarea dejará build verde y tendrá un commit reversible;
`tasks/todo.md` se actualizará en la fase de tareas, no durante esta revisión.

#### Checkpoints

- **Checkpoint A — contrato protegido:** las pruebas fallan si desaparece un token
  obligatorio, un alias compatible o un estado público de los primitives.
- **Checkpoint B — tokens integrados:** `check:css-colors`, `check:boundaries`,
  suite completa y build verdes; cero peticiones a Google Fonts.
- **Checkpoint C — primitives integrados:** API `.si-*` intacta, objetivos táctiles
  de 44 px, foco visible y `prefers-reduced-motion` verificados.
- **Checkpoint D — aceptación visual:** 320×568, 386×912, 768×1024, 1024×900 y
  1440×900 sin scroll horizontal, contenido tapado ni regresión del flujo público;
  aprobación humana antes de continuar al siguiente módulo.

#### Delegación y auditoría

- Antigravity puede ejecutar la extracción mecánica de CSS o el reemplazo de
  valores por tokens en un encargo cerrado de hasta cinco archivos.
- Codex conserva la definición del contrato, revisa el diff completo, comprueba
  consumidores y vuelve a ejecutar todas las validaciones; el reporte del agente
  no sustituye evidencia local.
- Cambios Angular de API, estructura DOM, navegación, datos, dependencias, Git o
  despliegue quedan fuera de la delegación de este módulo.

#### Riesgos específicos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| La pila nativa cambia métricas y saltos de línea | Alto | Probar nombres largos y 320/386 px antes de aceptar tokens |
| El orden de imports altera especificidad | Alto | Tokens primero, primitives después y comparación visual de consumidores |
| Un alias legacy deja de resolver | Alto | Pruebas de contrato y eliminación únicamente con cero consumidores confirmados |
| La extracción duplica reglas o aumenta CSS | Medio | Búsqueda de selectores, diff de bundle y borrado solo tras suite verde |
| Estados suaves pierden contraste | Alto | Medición AA y revisión de foco/iconos en cada tono |
| Una animación afecta accesibilidad o rendimiento | Medio | Solo opacity/transform y gate explícito de reduced motion |

Rollback: revertir en orden inverso el commit de primitives y luego el commit de
tokens. Como templates y contratos Angular no cambian, el flujo vuelve a la hoja
global anterior sin migración de datos ni intervención de backend.

### Subplan UI-REB-02 — `native-app-shell`

Estado: especificación `tasks/specs/UI-REB-02-native-app-shell.md` aprobada el
2026-10-15. El módulo estabiliza el marco público antes de migrar búsqueda,
resultados y detalle; no autoriza cambios funcionales en esos consumidores.

#### Dependencias y orden

```text
Dock accesible y safe areas
             |
             v
 Canvas, slots y overlays
             |
             v
 Limpieza del CSS global
             |
             v
 Auditoría integral del shell
```

1. **Dock nativo.** Proteger primero rutas, estados activos y nombres accesibles;
   después migrar su apariencia a tokens, targets de 44 px e inset inferior.
2. **Canvas y overlays.** Extraer solamente la composición del shell desde
   `app.css`, conservar `[hidden]` para Inicio y añadir cierre accesible al visor.
3. **Limpieza y certificación.** Eliminar reglas duplicadas únicamente con cero
   consumidores confirmados y ejecutar contratos, suite, build, E2E y cinco
   viewports.

Cada incremento afecta como máximo cinco archivos y deja un commit reversible.
Antigravity puede editar CSS/markup presentacional dentro del encargo delimitado;
Codex conserva contratos Angular, TDD, revisión del diff y validación final.

#### Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| El dock tapa acciones o safe areas | Alto | Inset único del shell y cinco viewports |
| Un cambio destruye el canvas de mapa | Alto | Mantener `[hidden]` y contratos existentes |
| La extracción altera selectores globales | Alto | TDD, `rg` de consumidores y corte gradual |
| Capas compiten con sheets/modales | Medio | Matriz de z-index y prueba de overlays |

Rollback: revertir el commit del incremento afectado. No requiere backend,
migraciones, datos ni cambios de producción.

### Subplan UI-REB-03 — `search-result-cards`

Estado: completado y aprobado el 2026-10-16. El módulo reduce la carga visual de
los resultados sin modificar catálogo, ETA, navegación ni contratos de eventos.

1. **Resumen escaneable.** Punto, ubicación y disponibilidad permanecen visibles;
   empresa y distancia funcionan como metadatos secundarios.
2. **Dos decisiones inmediatas.** Elegir origen y compartir son las únicas
   acciones del estado compacto.
3. **Revelado progresivo.** Horarios completos, imagen y mapa viven en una sola
   región accesible controlada por `Ver detalles`/`Ocultar detalles`.
4. **Certificación.** TDD, suite, contratos, build, E2E y cinco viewports validan
   el incremento antes de integrarlo.

Rollback: revertir los commits de pruebas y presentación. No hay dependencia,
migración ni cambio de backend asociado.

### Subplan UI-REB-04 — `point-detail-card`

Estado: módulo cerrado y certificado el 2026-10-16; presentación y limpieza de
estilos globales duplicados aprobadas.

1. **Vista previa explícita.** Imagen o fallback, empresa, punto y ubicación se
   mantienen en 148 px junto a `Ver detalles`, compartir y cerrar.
2. **Hoja segura.** La expansión se limita entre la isla superior y el dock,
   usa scroll interno y un ancho máximo de 680 px en escritorio.
3. **Información progresiva.** Ruta y mapa preceden a Información/Horarios; el
   selector implementa foco, estado ARIA y teclado circular.
4. **Limpieza posterior.** Se eliminaron las reglas `pin-*` globales después de
   trasladar el estilo requerido por `ScheduleDisplay`; pruebas, build, E2E,
   cinco viewports y revisión independiente confirmaron cero regresiones.

Rollback: revertir primero la limpieza global y luego los commits de prueba y
presentación. No hay migración, dependencia ni cambio de backend asociado.

### Subplan UI-REB-05 — `route-result-card`

Estado: cerrado y certificado el 2026-10-16. La tarjeta de ruta quedó compacta
en reposo, conserva empresa, recorrido y ETA, y difiere selector, resultado y
acciones al detalle expandido sin modificar cálculo, contratos ni eventos.

1. **Contrato compacto.** Caracterizar que el resumen conserva empresa, origen,
   destino, ETA y expansión, mientras difiere alertas, selector y acciones.
2. **Jerarquía nativa.** Recalibrar marcado y estilos con tokens `--si-*`, menor
   altura, recorrido escaneable y una franja ETA inequívoca.
3. **Detalle progresivo.** Mantener selector, resultado de fecha/horario y las
   acciones públicas sin tocar presenter, servicios, navegación ni cálculo.
4. **Certificación.** Suite, contratos, build, E2E, cinco viewports y revisión
   independiente antes de integrar en `develop`.

Rollback: revertir documentación, pruebas y presentación en orden inverso. No
hay migración, dependencia, backend ni datos asociados.

Evidencia de cierre: 9/9 pruebas focalizadas, 377/377 pruebas frontend, 17/17
controles de color, 31/31 controles de fronteras sobre 53 archivos, build
productivo, 60/60 recorridos Playwright y revisión independiente sin hallazgos
P0-P3. Se validaron 320x568, 386x912, 768, 1024x900 y 1440 px; el detalle usa
scroll interno y permanece por encima de la navegación inferior.

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

## Paquete de trabajo T43 — Paridad de Snapshot y Shadow-Run ETA

Objetivo: certificar la paridad del 100% entre el motor logístico legacy y el nuevo motor ETA modular mediante comparación determinista de snapshots canónicos y ejecución shadow desacoplada en runtime. T43 permanece abierto.

### Evidencia de fases completadas y auditoría de T43c1
- **T43a**: Comparador estructural profundo e inmutable (`backend/src/core/eta/eta-parity-comparator.js`), sanitización y ordenamiento determinista de diferencias. Pruebas unitarias RED/GREEN completadas.
- **T43b**: Referencia legacy de test fijada en commit `87684cbbca2f...`, adaptador a `CanonicalEtaSnapshot` y matriz offline de 26 escenarios en `America/El_Salvador` con paridad estricta al 100%.
- **T43c1 (Cierre auditado)**:
  - Commit atómico: `2731f05856eb0669831e421b8576deebeeeea624`.
  - Integración continua: GitHub Actions [run 37070686298](https://github.com/Pablojvr/sivoy-app/actions/runs/37070686298) completo `success` (Backend CI: success, Frontend CI: success).
  - Pruebas automatizadas: suite focalizada 59/59 pasadas (`backend/test/eta-parity-matrix.test.js`), suite backend 421/421 pasadas.
  - Revisión adversarial: Antigravity dictaminó `APPROVE` con 0 hallazgos Critical y 0 hallazgos Required.
  - Estado: Módulo `legacy-shadow-reference.js` aislado sin importar `backend/test/*` ni módulos actuales, sin integración a rutas de producción. T43 sigue abierto.

### Descomposición de T43c2 en Slices Atómicos (Máximo 3 archivos y rollback atómico)

#### T43c2a: Adaptador runtime puro del motor actual
- **Objetivo**: Implementar adaptador runtime puro que adapte las salidas de las funciones del core actual (`calculateOfficialEntry`, `validateDesiredDate`, `projectRoutes`) a `CanonicalEtaSnapshot`, y validar paridad contra el adaptador de test en los 26 escenarios offline.
- **Archivos permitidos**: Exactamente 3 archivos (`backend/src/core/eta/current-runtime-adapter.js`, `backend/test/eta-parity-matrix.test.js`, `tasks/specs/T43-eta-parity.md`).
- **Archivos prohibidos**: Rutas HTTP, controladores, runner, observabilidad, dependencias externas.
- **Regla de importación**: El adaptador actual **puede** importar los módulos ETA actuales (`official-entry.js`, `route-projection.js`), pero tiene **prohibido terminantemente** importar `backend/test/*`. Salida profundamente inmutable y desacoplada.
- **Criterios de aceptación**:
  1. Adapta las salidas de las funciones del core actual (`calculateOfficialEntry`, `validateDesiredDate`, `projectRoutes`) produciendo `CanonicalEtaSnapshot` idéntico al adaptador de prueba sobre los 26 escenarios del golden dataset.
  2. Función pura, determinista y de salida profundamente inmutable (`Object.freeze`) y desacoplada, sin mutar entradas ni emitir logs.
  3. Módulo runtime sin dependencias de `backend/test/*`, sin rutas HTTP, sin colas y sin observabilidad.
- **Rollback**: Eliminación de `current-runtime-adapter.js` y reversión atómica del commit del slice.
- **Comandos de verificación**:
  - `cd backend && npm test -- test/eta-parity-matrix.test.js`
  - `cd backend && npm test`

#### T43c2b: Runner y cola FIFO acotada en background
- **Objetivo**: Proveer el runner asíncrono con dependencias inyectadas y cola FIFO acotada para shadow execution diferida, desactivado por defecto mediante variable de entorno estricta.
- **Archivos permitidos**: Exactamente 3 archivos (`backend/src/application/rutas/eta-shadow-runner.js`, `backend/test/eta-shadow-runner.test.js`, `tasks/specs/T43-eta-parity.md`).
- **Archivos prohibidos**: Controladores HTTP, routers de Express, esquemas de BD.
- **Regla de importación**: Prohibido importar `backend/test/*` desde runtime.
- **Criterios de aceptación**:
  1. Desactivado por defecto: activación condicionada estrictamente a `process.env.ETA_SHADOW_PARITY === 'true'`; cualquier otro valor o ausencia opera como no-op inmediato con dependencias inyectadas.
  2. Ejecución diferida en background con cola FIFO acotada y descarte `drop-on-full` ante saturación (reconociendo que `setImmediate` difiere el trabajo pero no elimina la contención de CPU en Node.js de hilo único).
  3. Aislamiento total de excepciones (captura absoluta de errores síncronos y asíncronos sin afectar al llamador ni al proceso) y pruebas unitarias aisladas sin integración HTTP.
- **Rollback**: Operativamente, cambiar o remover `ETA_SHADOW_PARITY` y aplicar el reinicio/redeploy controlado que requiera la plataforma (sin requerir revertir código), o reversión atómica del commit.
- **Comandos de verificación**:
  - `cd backend && npm test -- test/eta-shadow-runner.test.js`
  - `cd backend && npm test`

#### T43c2d1: Telemetría pura del shadow-run con contadores y cardinalidad fija
- **Objetivo**: Implementar módulo de telemetría puro con exportación de factory y singleton `defaultEtaShadowTelemetry`, contadores agregados y labels de cardinalidad fija bajo allowlist cerrada para métricas de paridad, sin timestamps.
- **Archivos permitidos**: Exactamente 3 archivos (`backend/src/core/eta/eta-shadow-telemetry.js`, `backend/test/eta-shadow-telemetry.test.js`, `tasks/specs/T43-eta-parity.md`).
- **Archivos prohibidos**: Loggers externos no autorizados, endpoints de usuario, dependencias no autorizadas.
- **Regla de importación**: Prohibido importar `backend/test/*`.
- **Criterios de aceptación**:
  1. Exporta factory pura y singleton `defaultEtaShadowTelemetry` con contadores agregados y labels de cardinalidad estrictamente fija bajo allowlist cerrada, función `resetMetrics` para pruebas aisladas y sin ningún tipo de timestamp ni `lastEvaluatedAt`.
  2. Pruebas que serializan la salida confirman la ausencia total de `expected`/`actual`, payloads de entrada, IDs de puntos, nombres, fechas, horarios, reglas, trazas de stack y errores raw; coincidencia (`match: true`) no emite logs ni métricas de divergencia.
  3. El snapshot de métricas retornado es profundamente inmutable (`Object.freeze`) y desconectado del estado interno.
- **Rollback**: Reversión atómica del commit del slice o retiro del módulo puro de telemetría.
- **Comandos de verificación**:
  - `cd backend && npm test -- test/eta-shadow-telemetry.test.js`
  - `cd backend && npm test`

#### T43c2c: Integración del puerto shadow en composition root / casos de uso
- **Objetivo**: Conectar el puerto del shadow runner y telemetría en los casos de uso / composition root de forma desacoplada y segura.
- **Archivos permitidos**: Exactamente 3 archivos (`backend/src/application/rutas/route-use-cases.js`, `backend/src/domains/rutas/rutas.service.js`, `backend/test/route-use-cases.test.js`).
- **Archivos prohibidos**: Rutas/controladores de Express (mantener desacoplamiento), esquemas de base de datos, frontend.
- **Regla de importación**: Prohibido importar `backend/test/*`.
- **Criterios de aceptación**:
  1. Invocación al puerto shadow completamente desacoplada (sin `await`), enviando copias defensivas aisladas de los datos requeridos y nunca referencias mutables del request ni entidades de dominio; cualquier fallo del runner o telemetría nunca afecta la respuesta HTTP.
  2. Preservación estricta de respuestas HTTP: status code, body JSON y headers permanecen 100% idénticos con o sin shadow run activo (la contención de CPU, cola y latencia se miden en staging).
  3. Pruebas unitarias de casos de uso y suite de contrato HTTP (`test/rutas-contract.test.js`) verdes sin alterar el comportamiento de producción; runner y telemetría inyectables en `createRutasService` para tests, mientras el singleton productivo de runtime consume `defaultEtaShadowTelemetry` sin reexportarlo.
- **Rollback**: Retiro de la invocación en el composition root o cambio/remoción de `ETA_SHADOW_PARITY` con reinicio/redeploy controlado.
- **Comandos de verificación**:
  - `cd backend && node --test test/route-use-cases.test.js`
  - `cd backend && node --test test/rutas-contract.test.js`
  - `cd backend && npm test`
  *(Nota: `test/rutas-contract.test.js` se ejecuta en la validación sin modificar ese cuarto archivo).*

#### T43c2d2: Composición y exposición de métricas shadow en observabilidad
- **Objetivo**: Componer y exponer las métricas shadow en la infraestructura de observabilidad existente conservando el contrato de `/api/metrics` y sin nuevo endpoint público.
- **Archivos permitidos**: Exactamente 3 archivos (`backend/src/core/observability/observability-routes.js`, `backend/server.js`, `backend/test/observability-routes.test.js`). No incluye el spec como archivo del slice porque el contrato queda fijado en la iteración documental previa.
- **Archivos prohibidos**: Nuevos endpoints públicos, rutas no autenticadas, routers adicionales, módulos de dominio o ETA importados en `observability-routes.js`.
- **Regla de importación**: Prohibido importar `backend/test/*`. `observability-routes.js` no importa módulos de ETA. `server.js` importa directamente el singleton default seguro desde `backend/src/core/eta/eta-shadow-telemetry.js`, evitando circularidad y sin acoplamiento a `rutas.service.js`.
- **Diseño**:
  - `observability-routes.js` conserva `registerObservabilityRoutes` y agrega un compositor genérico de providers, sin importar nada de ETA.
  - `server.js` importa directamente el singleton default seguro desde `eta-shadow-telemetry.js`, no desde `rutas.service.js`, evitando circularidad y acoplamiento de dominio.
  - Provider único sigue devolviendo exactamente el snapshot actual.
  - Provider compuesto mantiene todas las claves HTTP existentes en la raíz y añade solo la clave reservada fija `etaShadowParity`.
  - `etaShadowParity` está ausente cuando `ETA_SHADOW_PARITY` no es exactamente `'true'`; presente con contadores cero cuando está activo pero aún no ha procesado trabajos.
  - No crear namespace `http` ni `eta_shadow`, no alterar las claves HTTP existentes y no crear endpoints.
  - Detección determinista de colisión con `etaShadowParity` mediante error genérico (sin sobreescritura silenciosa).
  - Si el provider shadow falla al tomar snapshot, el compositor conserva el snapshot HTTP y omite la clave shadow sin filtrar el error sensible; esto afecta exclusivamente la observabilidad, nunca las rutas de negocio.
  - Privacidad estricta: sin timestamps ni `lastEvaluatedAt`, sin fechas, `expected`/`actual`, payloads, IDs, nombres, horarios, reglas, stack ni errores raw.
- **Criterios de aceptación**:
  1. Compatibilidad aditiva exacta de raíz + flag estricto: conserva todas las claves HTTP existentes en la raíz de `/api/metrics`, omitiendo `etaShadowParity` si `process.env.ETA_SHADOW_PARITY !== 'true'` y exponiéndola como objeto de contadores fijos (en cero inicial) si es exactamente `'true'`, sin namespaces `http` ni `eta_shadow`.
  2. Seguridad actual de metrics intacta: preserva autenticación obligatoria por token Bearer, respuesta 404 ante token ausente/inválido en router aislado, cabeceras `Cache-Control: no-store` y cero endpoints nuevos.
  3. Compositor genéricamente probado: compositor genérico en `observability-routes.js` probado con contadores fijos, detección determinista de colisiones con error genérico, fail-open a HTTP-only ante fallos del provider shadow sin filtrar errores ni afectar rutas de negocio, y confirmación de ausencia absoluta de datos sensibles.
- **Rollback**: Reversión atómica del commit del slice o cambio/remoción de `ETA_SHADOW_PARITY` con reinicio/redeploy controlado.
- **Comandos de verificación**:
  - `cd backend && npm test -- test/observability-routes.test.js`
  - `cd backend && npm test`

#### T43c2e: Verificación en staging real y activación controlada
- **Objetivo**: Desplegar y auditar el comportamiento del shadow-run en staging real bajo condiciones representativas antes de autorizar cualquier activación en producción.
- **Archivos permitidos**: Máximo 3 archivos (`docs/STAGING_ETA_PARITY.md`, `tasks/plan.md`, `tasks/specs/T43-eta-parity.md`).
- **Criterios de aceptación**:
  1. Validación en zona horaria oficial `America/El_Salvador` con 100% de paridad estricta (0% de divergencia respecto a la referencia legacy).
  2. Medición objetiva en staging de porcentaje de CPU, profundidad de cola FIFO y descartes (`drops`), y latencia p95 y p99 en endpoints de rutas.
  3. Validación del procedimiento operativo de rollback: cambio o remoción de `ETA_SHADOW_PARITY` y aplicación del reinicio/redeploy controlado de la plataforma sin requerir revertir código, confirmando el cese de encolamiento y estabilidad del servicio antes de considerar activación productiva.
- **Rollback**: Cambiar o remover `ETA_SHADOW_PARITY` en el entorno staging y aplicar el reinicio/redeploy controlado.
- **Comandos de verificación**:
  - Inspección de métricas agregadas y health check en staging.
  - Validación de logs estructurados y verificación de latencia p95/p99.

### Grafo de dependencias y secuencia
- Secuencia obligatoria: `T43c2a` -> `T43c2b` -> `T43c2d1` -> `T43c2c` -> `T43c2d2` -> `T43c2e`.
- `T43c2a` depende de `T43c1`.
- `T43c2b` depende de `T43c2a`.
- `T43c2d1` depende de `T43c2b`.
- `T43c2c` depende de `T43c2b` y `T43c2d1`.
- `T43c2d2` depende de `T43c2c`.
- `T43c2e` depende de la integración completa de todos los slices anteriores (`T43c2a` a `T43c2d2`).
- Cada slice se ejecuta con máximo 3 archivos, hasta 3 criterios de aceptación, suite verde (`cd backend && npm test`) y ruta de rollback atómica.

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
| Credenciales versionadas | Crítico | Rotación inmediata, limpieza de historial y secret scanning |
| Reglas específicas se vuelven condicionales | Alto | Catálogo de promesas y precedencia por datos |
| Zona horaria altera resultados | Alto | Zona declarada, reloj inyectable y timestamps con offset |
| Backfill corrompe relaciones | Crítico | Escritura dual, checksums, ejecución paralela y rollback |
| API pública expone escrituras operativas | Crítico al crecer | Separar superficies y aplicar autorización antes del onboarding real |

## Puntos de aprobación humana

- Aprobar `CAPABILITY-MAP.md` antes de escribir specs por módulo.
- Aprobar contratos públicos antes de Fase 1.
- Aprobar estrategia `id`/`id_destino` antes de Fase 3.
- Aprobar el modelo de promesas, calendarios y precedencia antes del backfill.
- Aprobar cada eliminación de implementación legacy.
- Aprobar cualquier dependencia, migración o despliegue.
