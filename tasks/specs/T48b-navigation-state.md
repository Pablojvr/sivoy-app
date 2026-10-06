# T48b — Estado de búsqueda al navegar atrás y adelante

## Problema comprobado

En una misma sesión de la SPA, después de calcular una ruta punto a punto,
ir a Inicio y usar Atrás conserva la URL del municipio pero vuelve a ejecutar
el intent inicial. El nuevo `HomeComponent` tiene origen/destino locales
vacíos, llama `facade.reset()` y reemplaza la ruta por el listado de destinos.

## Contrato de comportamiento

- Atrás/adelante dentro de la misma sesión restaura la selección semántica
  (punto o municipio), filtros y resultado que conserva el facade raíz.
- Una recarga completa solo restaura la intención expresada en la URL; no se
  añade `localStorage`, `sessionStorage` ni se serializan resultados en la URL.
- Los comandos de búsqueda deben transportar la selección del usuario. No se
  puede inferir un municipio escogido tomando el primer punto resuelto.
- Estado de Partner, API, SQL, mapa y contratos HTTP quedan fuera de alcance.

## Corte T48b1 — Estado atómico en el facade

Archivos máximos conocidos/editables:

1. `tasks/specs/T48b-navigation-state.md` (solo lectura para Antigravity).
2. `frontend/src/app/features/home/shipment-search.models.ts`.
3. `frontend/src/app/features/home/shipment-search.facade.ts`.
4. `frontend/src/app/features/home/shipment-search.facade.spec.ts`.
5. `frontend/src/app/features/home/home.component.ts`.

El comando punto a punto incluye `origin` y `destination` como
`LocationSelection`, además de los puntos usados para consultar. El facade
guarda selecciones y filtros en la misma actualización que cambia a `loading`.
El comando municipal se convierte a selecciones municipales sin punto. Home
envía sus selecciones reales al comando punto a punto. Prueba RED primero.

## Corte T48b2 — Rehidratación de la pantalla

Archivos máximos conocidos/editables:

1. Este spec.
2. `frontend/src/app/features/home/home.component.ts`.
3. `frontend/src/app/features/home/home-flow.characterization.spec.ts`.

Al recibir catálogo/intención, Home detecta un estado activo
`municipality-routes` o `point-routes`, restaura campos y puntos por identidad,
y no reaplica el intent municipal. Los resultados siguen proyectándose desde
el `effect` existente. Una prueba destruye y recrea Home con el mismo facade y
demuestra que no se ejecuta otra consulta ni se pierde la ruta.

## Puertas de aceptación

1. Pruebas focalizadas RED→GREEN en cada corte.
2. Suite frontend completa, build y `git diff --check` verdes.
3. Navegador real: destino → origen → ruta → Inicio → Atrás conserva la ruta;
   Adelante/atrás repite el estado esperado.
4. Ningún archivo Partner, persistencia web, backend o despliegue.
5. Rollback: revertir los commits T48b2 y T48b1 en ese orden.
