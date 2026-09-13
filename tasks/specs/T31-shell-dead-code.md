# T31: Eliminar duplicación y legado del shell

## Alcance

Reducir residuos no administrativos de `MobileAppComponent` mediante evidencia de consumidores. Partner queda excluido y el CRUD administrativo duplicado se reserva para T29.

## T31a — estado visual fantasma

- Eliminar `highlightRouteOnMap`, coordenadas de centro nunca leídas y el listener `onMove` asociado.
- Eliminar bottom-sheet del shell (`bottomSheetState`, gestos y handlers) y su binding raíz; Home conserva su implementación real.
- Eliminar `isProgrammaticMove`, listeners y escrituras si queda sin consumidor tras retirar el bottom-sheet.
- Preservar comandos de mapa, proyección pública, rutas destacadas, preview administrativo y lifecycle.
- Gates: búsqueda de consumidores, `git diff --check`, suite completa, build y recorrido local.

**Estado:** aceptado por Codex. Se retiraron 124 líneas del shell y el binding raíz sin consumidores inesperados; los comandos activos del mapa permanecen.

## T31b — teardown temporal

- Caracterizar con temporizadores falsos que destruir el shell cancela la actualización periódica de disponibilidad.
- Capturar el identificador del intervalo iniciado tras cargar ubicaciones y ejecutar `clearInterval` en `ngOnDestroy`.
- Evitar intervalos duplicados ante reinicialización del flujo de datos.
- Gates: prueba RED/GREEN focalizada, suite completa, build y cero timers huérfanos en la caracterización.

**Estado:** aceptado y completado. Evidencia RED: la prueba de destrucción observó inicialmente una llamada post-destrucción. Evidencia GREEN: 232 pruebas pasan; el build pasa (solo con advertencias conocidas y diff-check limpio).

## T31c — cobertura temporal y de rutas

- Añadir pruebas deterministas para límites de disponibilidad (`disponible`, `cerrará pronto`, próxima apertura).
- Caracterizar la proyección de una ruta en el mapa sin depender de MapLibre real.
- No inventar umbrales globales de cobertura; reportar únicamente pruebas y ramas verificadas.

**Estado:** aceptado y completado. Evidencia: estas son pruebas de caracterización del comportamiento existente (no un RED fabricado). 238 pruebas pasan; el build pasa (solo advertencias conocidas de CSS budget/CommonJS) y el diff-check es limpio. Se verificó el contrato actual "Disponible mañana" y la proyección de ruta se probó a través de dobles de puerto independientes del renderizador.

## Evidencia de auditoría

Antigravity (`gemini-3.1-pro-high`) auditó lifecycle, template, decorators y callbacks MapPort. Codex confirmó los consumidores mediante `rg`: el estado de bottom-sheet no cruza al template real de Home, `mapCenterLat/mapCenterLng` solo reciben escrituras y `highlightRouteOnMap` no tiene llamadas. El intervalo de `updateAgencyStatuses` carece de teardown.
