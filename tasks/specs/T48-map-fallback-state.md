# T48a — Acciones de mapa seguras en modo list-first

## Objetivo

Cuando `mapAvailable` sea falso, las acciones “explorar mapa”, “ver punto” y
“ver ruta” deben solicitar el modo mapa al shell para que muestre su aviso,
pero no deben mutar el `@Input() mapResourceMode`, ocultar/colapsar la lista ni
emitir comandos de mapa. Con mapa disponible se conserva el comportamiento
visual y los eventos vigentes. Partner queda fuera de alcance.

## Paquete delegado

- Editables únicamente:
  `frontend/src/app/features/home/home.component.ts` y
  `frontend/src/app/features/home/home.component.spec.ts`. Durante la auditoría
  Codex puede ajustar únicamente el binding `mapHighlightRoute` de
  `frontend/src/app/mobile-app.component.html` para evitar activar dos veces
  el modo mapa.
- Antigravity puede leer este spec y los dos archivos editables; máximo tres
  archivos conocidos. Sin HTML/CSS, shell, servicios, rutas, dependencias,
  contratos HTTP, mapa adaptador, Partner, Git ni despliegue.
- Implementar con prueba RED primero. Preferir un único helper privado que
  emita `mapResourceModeChange(true)` y responda si el mapa está disponible;
  no escribir sobre el input para simular la decisión del padre.

## Aceptación y verificación

1. Con `mapAvailable=false`, cada una de las tres acciones emite exactamente
   una solicitud de mapa y no cambia `mapResourceMode`, `bottomSheetState`,
   marcador/pin ni eventos `mapHighlightRoute`, `showPinDetails` o
   `resetMapMarkersEvent`.
2. Con `mapAvailable=true`, explorar colapsa y reinicia marcadores; ver punto
   selecciona/emite detalle; ver ruta emite la ruta y colapsa. Ninguna acción
   asigna directamente `mapResourceMode=true`; el shell no vuelve a activar el
   modo desde `mapHighlightRoute` porque ya recibió `mapResourceModeChange`.
3. Prueba focalizada, suite frontend completa, build y `git diff --check`
   verdes. Rollback: revertir el commit de estos dos archivos.
