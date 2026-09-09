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

## T25c — Rutas, detalle y compartir

Separar tarjetas de ruta y detalle de pin. La API Web Share, generación de imagen
y fallback de portapapeles se moverán a un servicio probado; Home conservará
intents, búsqueda y navegación hasta T26.

## Límites comunes

- Sin cambios de estilos ni rediseño durante la extracción.
- Sin dependencias de mapa, servicios HTTP o fachada en componentes de resultado.
- Mantener tarjetas colapsables, identidad activa y selección repetible de origen.
- Partners queda fuera de alcance.
