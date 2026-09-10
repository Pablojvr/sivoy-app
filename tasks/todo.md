# Reinvención arquitectónica — índice de ejecución

No iniciar tareas hasta aprobar `CAPABILITY-MAP.md` y `tasks/plan.md`.

T01–T05 son tareas ejecutables de descubrimiento. T06–T37 son paquetes de trabajo:
antes de iniciar cada uno se debe aprobar el spec de su módulo y descomponerlo en
tareas S/M con el formato completo de aceptación, verificación, dependencias y
máximo cinco archivos. Un paquete no es autorización para modificar código.

## Fase 0 — Línea base

- [ ] T00 Rotar y revocar las credenciales PostgreSQL expuestas.
  - Aceptación: credencial antigua inválida y scripts sin secretos embebidos.
  - Verificación: secret scan del árbol e historial; conexión solo mediante entorno.
  - Dependencias: ninguna; bloquea cualquier migración.
  - Avance: secreto eliminado del árbol actual; rotación y limpieza histórica pendientes.
- [x] T01 Documentar comandos y Definition of Done.
  - Aceptación: comandos ejecutables y matriz de auditoría versionados.
  - Verificación: ejecutar cada comando documentado.
  - Dependencias: ninguna.
- [x] T02 Crear fixtures del dominio ETA.
  - Aceptación: cubren horarios, cortes, días hábiles y ausencia de ruta.
  - Verificación: fixtures cargan sin red ni base de datos.
  - Dependencias: T01.
- [x] T03 Caracterizar `calcularIngresoOficial`.
  - Aceptación: casos antes, durante y después del cierre protegidos.
  - Verificación: suite unitaria verde.
  - Dependencias: T02.
- [x] T04 Caracterizar proyección y endpoints de rutas.
  - Aceptación: punto-punto y municipio-municipio preservan respuestas.
  - Verificación: unitarias y contrato HTTP verdes.
  - Dependencias: T02.
- [ ] T05 Capturar smoke E2E y baseline visual.
  - Aceptación: recorrido destino→origen→ruta→compartir reproducible.
  - Verificación: E2E y capturas en cuatro viewports.
  - Dependencias: T01.

### Checkpoint A

- [ ] Build frontend y pruebas backend verdes.
- [ ] Flujo actual preservado.
- [ ] Revisión humana antes de arquitectura interna.

## Fases 1–3 — Dominio y backend

- [ ] T06 Definir modelos y DTOs de ubicaciones.
- [ ] T07 Definir contratos de búsqueda de rutas.
- [ ] T08 Añadir validación de entrada y errores consistentes.
- [ ] T09 Extraer fechas y horarios al núcleo ETA puro.
- [ ] T10 Extraer casos de uso de rutas y adaptador legacy.
- [ ] T11 Añadir repositorios por interfaz.
- [x] T12 Transaccionar actualización de punto y horarios.
- [ ] T13 Resolver y migrar contrato `id`/`id_destino`.
- [ ] T14 Optimizar búsquedas después de medir consultas.
- [x] T38 Versionar baseline y ledger de migraciones reproducibles.
- [x] T39 Añadir constraints e índices de FK con validación previa (pendiente ventana de aplicación).
- [x] T40 Crear calendarios con múltiples intervalos y excepciones (modelo aditivo; pendiente backfill/cutover).
- [x] T41 Crear políticas de promesa, alcances y reglas de precedencia (modelo aditivo; pendiente backfill/cutover).
- [ ] T42 Implementar escritura dual y backfill idempotente.
- [ ] T43 Ejecutar ETA antiguo/nuevo en paralelo y comparar resultados.
- [ ] T44 Uniformar envelopes, errores, IDs y timestamps del API.
- [ ] T45 Endurecer resolución de URLs y respuestas externas.
- [ ] T46 Separar superficie pública y operativa; endurecer HTTP y pool.
- [x] T47 Actualizar MapLibre a v6 segura y validar el adaptador compartido.
  - Resultado auditado: `maplibre-gl@6.8.0`, 0 vulnerabilidades en `npm audit --omit=dev`, 17 pruebas frontend y build de producción verdes.
  - Validación local: fallback MapLibre cargado sin errores de consola o worker; pin restaurado a la misma posición tras zoom in/out.
  - Spec ejecutado: `tasks/specs/T47-maplibre-v6-security-upgrade.md`.

Cada tarea debe incluir al abrirse: máximo cinco archivos, hasta tres criterios de
aceptación y comandos exactos de prueba. T13 requiere aprobación explícita.

### Checkpoint B

- [ ] Paridad completa del ETA.
- [ ] Pruebas de integración PostgreSQL verdes.
- [ ] Ningún endpoint público cambió sin versión o adaptador.

## Fase 4 — Sistema visual

- [x] T15 Extraer tokens, tipografía y movimiento.
- [x] T16 Crear primitivas Button/IconButton/Input/Chip.
- [x] T17 Crear primitivas Card/Sheet/Modal.
- [x] T18 Migrar tarjetas de resultados.
- [x] T19 Migrar detalle de punto y horarios.
- [x] T20 Migrar navegación y overlays.
- [x] T21 Reducir estilos inline y `!important` con métricas comparativas.
  - Resultado auditado: `style="` 139 -> 0; `!important` 73 -> 67; hex CSS 496 -> 496.
  - Se conservan únicamente bindings `[style.*]` calculados para contenido dinámico.

T15–T21 pueden delegarse parcialmente a Antigravity en encargos de máximo tres
archivos. Codex debe revisar cada diff y ejecutar build y auditoría visual.

### Checkpoint C

- [ ] Visual regression y accesibilidad aprobadas.
- [ ] CSS global reducido sin cambiar comportamiento.
- [ ] No aparecen nuevos colores o tokens paralelos.

## Fases 5–8 — Frontend modular

- [x] T22 Crear `ShipmentSearchFacade` y pruebas de estados.
  - Resultado auditado: infraestructura Vitest Angular 21 activa; 15 pruebas de fachada y 17 pruebas frontend verdes.
  - La fachada es aditiva y aún no tiene consumidores de producción; la integración se realiza en T23-T25.
- [x] T23 Extraer búsqueda de destino.
  - Resultado auditado: componente presentacional tipado, puente aditivo a `ShipmentSearchFacade`, 20 pruebas frontend y build verdes.
  - Recorrido local aprobado: abrir, limpiar, filtrar, seleccionar municipio, cargar resultados, cerrar y volver a Inicio sin errores.
  - Spec ejecutado: `tasks/specs/T23-destination-search-component.md`.
- [x] T24 Extraer selección de origen.
  - Resultado auditado: selector presentacional tipado para municipio, punto, ubicación actual y ayuda de lugares; 35 pruebas frontend y build verdes.
  - Recorrido local aprobado: destino específico → municipio origen → ruta → cambiar origen → reabrir municipio/Google Places, sin errores.
  - Spec ejecutado: `tasks/specs/T24-origin-search-component.md`.
- [x] T25 Extraer resultados, horarios y compartir.
  - Ejecución incremental: `tasks/specs/T25-results-schedules-sharing.md` (T25a1–T25c).
  - [x] T25a1: agrupación y formato de horarios extraídos a dominio puro; 46 pruebas frontend y build verdes.
  - [x] T25a2: presentación reutilizable de horarios; 50 pruebas y DOM/CSS de pin y tarjeta auditados en local.
  - [x] T25b: tarjeta presentacional de punto; 59 pruebas, build y DOM/ARIA colapsable auditados en local.
  - [x] T25c: rutas, detalle y compartir.
    - [x] T25c1: Web Share, PNG y portapapeles extraídos tras auditoría; 73 pruebas y build verdes.
    - [x] T25c2: tarjetas de rutas y detalle de pin.
      - [x] T25c2a: tarjeta de ruta presentacional; 80 pruebas y flujo real de expansión/cambio de día auditados.
      - [x] T25c2b: detalle de pin; 92 pruebas, build y estados móvil/ARIA auditados.
- [x] T26 Centralizar data-access y errores del flujo.
  - [x] T26a: tipar contratos HTTP de rutas por endpoint; 100 pruebas y build auditados.
  - [x] T26b: orquestar búsquedas cancelables preservando el modelo completo de UI; 113 pruebas, build y runtime auditados.
  - [x] T26c: integrar el orquestador en Home y unificar estados/copy de error.
    - [x] T26c1: aislar filtro temporal y mutaciones de presentación; 126 pruebas y build auditados.
    - [x] T26c2: conectar Home y retirar suscripciones HTTP directas; 133 pruebas, build y flujo real auditados.
- [x] T27 Crear puerto y adaptador del mapa.
    - Incluir detección de WebGL2 y continuidad list-first con mensaje recuperable cuando el mapa no esté disponible.
    - [x] T27a: detector WebGL2 cacheado y seguro para SSR; 140 pruebas y build auditados.
    - [x] T27b: definir puerto estable y adaptador MapLibre; 178 pruebas y build auditados.
    - [x] T27c: integrar fallback list-first en el shell público; 178 pruebas, build y flujo normal en navegador auditados.
    - [x] T27d: migrar comandos del shell al puerto sin asumir el ciclo de vida de marcadores.
      - [x] T27d1: aislar cálculo geográfico del runtime del mapa.
      - [x] T27d2: encapsular el render diferido de rutas en el adaptador.
      - [x] T27d3: shell público migrado al puerto; 201 pruebas, build y runtime list-first/mapa auditados.
- [ ] T28 Encapsular ciclo de vida de marcadores y listeners.
    - [x] T28a: manager neutral y teardown resiliente; 211 pruebas y build auditados.
- [ ] T29 Separar operaciones de empresas en ruta propia.
- [ ] T30 Reducir `MobileAppComponent` al shell.
- [ ] T31 Eliminar duplicación y legado con búsqueda de consumidores.

### Checkpoint D

- [ ] Búsqueda funciona sin mapa.
- [ ] Navegación atrás/adelante preserva el estado esperado.
- [ ] Panel empresarial no comparte estado con búsqueda pública.
- [ ] No existen listeners o timers huérfanos en los recorridos E2E.

## Fases 9–10 — Operación y evolución

- [ ] T32 Definir eventos internos versionados.
- [ ] T33 Mover únicamente trabajos secundarios a eventos.
- [ ] T34 Añadir métricas y logs estructurados.
- [ ] T35 Implementar pipeline completo y staging.
- [ ] T36 Probar despliegue, smoke test y rollback.
- [ ] T37 Escribir ADR sobre mantener o extraer `eta-core`.

### Checkpoint final

- [ ] Todos los builds, pruebas y contratos están verdes.
- [ ] Auditoría de seguridad y dependencias sin hallazgos bloqueantes.
- [ ] Métricas comparadas contra la línea base.
- [ ] Documentación y rollback verificados.
- [ ] Aprobación humana antes de producción.
