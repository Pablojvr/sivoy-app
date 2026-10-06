# T25 — Resultados, horarios y compartir

T25 se ejecuta en cortes pequeños para no trasladar el monolito de Home a otro
componente.

## T25a1 — Dominio puro de horarios

Archivos de implementación (máximo tres):

1. `frontend/src/app/features/home/results/schedule-utils.ts` (nuevo)
2. `frontend/src/app/features/home/results/schedule-utils.spec.ts` (nuevo)
3. `frontend/src/app/features/home/home.component.ts`

Extraer `formatTime` y el algoritmo de agrupación a funciones puras con tipos para
la entrada cruda y los grupos. Home conserva su `WeakMap` y sus métodos públicos
como adaptadores para no cambiar el template ni recalcular grupos en cada ciclo.

Criterios:

1. Misma salida para rangos consecutivos, pares, días aislados y varios horarios.
2. Entradas vacías o inválidas se ignoran sin excepción y el arreglo original no
   se muta.
3. Pruebas, build y diff verdes sin cambios visuales o de red.

## T25a2 — Presentación reutilizable de horarios

Archivos de implementación (máximo cinco):

1. `frontend/src/app/features/home/results/schedule-display.component.ts` (nuevo)
2. `frontend/src/app/features/home/results/schedule-display.component.html` (nuevo)
3. `frontend/src/app/features/home/results/schedule-display.component.spec.ts` (nuevo)
4. `frontend/src/app/features/home/home.component.ts`
5. `frontend/src/app/features/home/home.component.html`

El componente recibe horarios crudos, calcula grupos al cambiar el input mediante
las utilidades de T25a1 y sólo renderiza filas. Home sustituye los dos iteradores
duplicados, pero conserva headings, contador, estado vacío y wrappers semánticos.
Las clases `pin-hours-list` y `point-hours-grid` se aplican al host del componente,
de modo que sus hijos continúan cumpliendo los selectores CSS `> div` existentes.

Criterios:

1. Mismas etiquetas agrupadas y horas formateadas en pin y tarjeta de punto.
2. Cambio de input recalcula filas; input vacío no renderiza filas ni inventa el
   mensaje vacío, que sigue siendo responsabilidad de Home.
3. DOM visual, pruebas, build y diff aprobados sin CSS ni efectos secundarios.

## T25b — Tarjeta de punto

Archivos de implementación (máximo cinco):

1. `frontend/src/app/features/home/results/point-result-card.component.ts` (nuevo)
2. `frontend/src/app/features/home/results/point-result-card.component.html` (nuevo)
3. `frontend/src/app/features/home/results/point-result-card.component.spec.ts` (nuevo)
4. `frontend/src/app/features/home/home.component.ts`
5. `frontend/src/app/features/home/home.component.html`

Extraer una tarjeta presentacional controlada por Home mediante un componente con
selector de atributo sobre `article`. Así el host continúa siendo el mismo nodo
semántico, conserva `siCard`, las clases e identificadores actuales y no introduce
un wrapper que altere el layout. El hijo recibe un modelo estricto con únicamente
los campos renderizados (`id*`, empresa, distancia, nombres, ubicación, imagen,
estado y horarios), además del estado derivado de selección, expansión e imagen.

La expansión sigue siendo exclusiva en el padre. Alternar expansión, seleccionar
origen o destino, compartir, copiar imagen, informar error de imagen y ver mapa se
emiten como eventos tipados con el punto como payload. El hijo no usa servicios,
fachada, APIs del navegador, navegación ni dependencias del mapa.

Criterios:

1. El host sigue siendo `article.point-result-card`; IDs, ARIA, copy, SVG, clases,
   distancia y estados visuales producen el mismo DOM observable.
2. Colapsado oculta imagen y filas; expandido muestra imagen y horarios o el estado
   vacío. Cada acción emite exactamente una vez el punto recibido y no ejecuta
   efectos secundarios.
3. Home conserva una única tarjeta expandida y delega cada evento al método actual;
   pruebas, build, diff y verificación móvil pasan sin CSS ni cambios en Partners.

## T25c1 — Servicio de compartir y copiar

Archivos de implementación (máximo cuatro):

1. `frontend/src/app/features/home/results/point-share.service.ts` (nuevo)
2. `frontend/src/app/features/home/results/point-share.service.spec.ts` (nuevo)
3. `frontend/src/app/features/home/home.component.ts`
4. `frontend/src/app/features/home/results/point-result-card.component.ts` sólo si
   un contrato compartido estrictamente requiere reutilización.

El servicio pertenece al flujo Home, no a `core`: recibe un `ShareablePoint`
estructural y la URL de imagen ya resuelta. Encapsula Web Share, conversión PNG,
portapapeles y sus fallbacks, además del texto y URL de Maps actuales. Las APIs de
navegador y DOM se acceden mediante puertos o tokens inyectables definidos junto
al servicio; las pruebas no sustituyen globals. Home conserva disponibilidad de
imagen, resolución de URLs, intents, navegación y estado visual.

Criterios:

1. Texto, URL, nombre PNG, prioridad imagen → share → copia y todos los mensajes
   de éxito/error permanecen idénticos, incluido `AbortError` sin toast.
2. Pruebas deterministas cubren compartir con archivo, fallback sólo texto,
   copiar imagen, fallos CORS/conversión y fallback de portapapeles sin globals.
3. Home sólo adapta y delega; servicio sin mapa, fachada, Router o estado visual;
   pruebas, build, diff y navegador local pasan sin cambios en Partners.

## T25c2a — Tarjeta de ruta

Archivos de implementación (máximo cinco):

1. `frontend/src/app/features/home/results/route-result-card.component.ts` (nuevo)
2. `frontend/src/app/features/home/results/route-result-card.component.html` (nuevo)
3. `frontend/src/app/features/home/results/route-result-card.component.spec.ts` (nuevo)
4. `frontend/src/app/features/home/home.component.ts`
5. `frontend/src/app/features/home/home.component.html`

Extraer cada `article.sivoy-route-card` mediante selector de atributo y un modelo
estricto limitado a la ruta y sus opciones. Home conserva y muta `isExpanded` y
`selected_opcion_idx`; el hijo emite ruta para alternar, `{ route, index }` para
cambiar día, reinicio de origen y ruta para mostrar mapa. Los formateadores puros
pueden exportarse desde el archivo TypeScript del componente y Home delegar en
ellos para evitar duplicación sin añadir archivos.

Criterios:

1. Host `article`, clases, SVG, copy, fallback ETA, select, alertas y ARIA se
   mantienen; colapsado/expandido producen el mismo DOM observable.
2. Cada acción emite exactamente una vez payload tipado; el hijo no muta la ruta,
   usa servicios, navegador, fachada, Router ni mapa.
3. Home mantiene todo el estado y side effects; pruebas, build, diff y flujo local
   pasan sin CSS, cambios visuales o modificaciones en Partners.

## T25c2b — Detalle de pin

Archivos de implementación (máximo cinco):

1. `frontend/src/app/features/home/results/pin-detail-card.component.ts` (nuevo)
2. `frontend/src/app/features/home/results/pin-detail-card.component.html` (nuevo)
3. `frontend/src/app/features/home/results/pin-detail-card.component.spec.ts` (nuevo)
4. `frontend/src/app/features/home/home.component.ts`
5. `frontend/src/app/features/home/home.component.html`

Extraer `article.pin-details-card` mediante selector de atributo y un modelo de pin
estricto. Home conserva `isPinCardExpanded`, `activePinTab`, bloqueo manual, física
de swipe, selección origen/destino, navegación y efectos. El hijo recibe imagen ya
resuelta y flags derivados; emite toggle, touch start/end, preview, share, close,
tab, copiar, abrir mapa y las dos selecciones sin mutar inputs.

Criterios:

1. Host dialog, clases, fondo hero, copy, SVG, ARIA, tabs, horarios, disponibilidad
   y acciones condicionales conservan el mismo DOM observable en ambos estados.
2. Eventos se emiten una vez con payload estricto; swipe y estados sólo cambian en
   Home y el hijo no usa servicios, globals, fachada, Router o mapa.
3. Pruebas, build, diff y gesto/botones en navegador móvil pasan sin CSS, cambios
   visuales ni modificaciones en Partners.

## Límites comunes

- Sin cambios de estilos ni rediseño durante la extracción.
- Sin dependencias de mapa, servicios HTTP o fachada en componentes de resultado.
- Mantener tarjetas colapsables, identidad activa y selección repetible de origen.
- Partners queda fuera de alcance.
