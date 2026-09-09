# T24 — Extraer selección de origen

## Objetivo

Extraer la interfaz del segundo paso (municipio, punto compatible, ubicación
actual y ayuda opcional de Google Places) a un componente presentacional tipado.
`HomeComponent` conserva toda operación asíncrona y transición de negocio.

## Corte aprobado

Máximo cinco archivos de implementación:

1. `frontend/src/app/features/home/origin-search/origin-search.component.ts` (nuevo)
2. `frontend/src/app/features/home/origin-search/origin-search.component.html` (nuevo)
3. `frontend/src/app/features/home/origin-search/origin-search.component.spec.ts` (nuevo)
4. `frontend/src/app/features/home/home.component.ts`
5. `frontend/src/app/features/home/home.component.html`

No crear CSS ni modificar estilos globales. No tocar Partner, destino, resultados,
tarjetas, mapa, rutas, backend o servicios.

## Contrato presentacional

El hijo no inyecta servicios ni conoce la fachada. Sus entradas se limitan a:

- valor visible y nombre del destino;
- disponibilidad de ubicación actual y nombre de su municipio;
- visibilidad de lista;
- municipios tipados con `MunicipalityOption`;
- puntos tipados con los únicos campos renderizados;
- título de la sección de puntos ya calculado por Home;
- estado tipado de Google Places: abierto, consulta, carga, error y sugerencias.

Sus salidas expresan intenciones: texto/foco/limpiar origen; seleccionar ubicación
actual, municipio o punto; abrir/cerrar ayuda; cambiar/limpiar consulta de lugar;
y seleccionar sugerencia. El hijo no muta entradas, no usa timers y no llama APIs.

## Responsabilidades de Home

Home mantiene `MapasService`, debounce, token de sesión, resolución y match de
municipio, toasts, `handleSelectionHandoff`, `executeSearch` y estados del modal.
Los eventos del hijo llaman los métodos heredados una sola vez. Las selecciones
confirmadas y la limpieza iniciadas por este selector sincronizan además
`ShipmentSearchFacade.setOrigin` de forma aditiva; la fachada aún no renderiza
resultados.

Los otros escritores heredados (`swapLocations`, intents, pines, reinicio y
selección desde tarjetas) se inventariarán y unificarán en T26; no se oculta esa
deuda ni se declara todavía a la fachada como única fuente de verdad.

## Pruebas primero

1. Render de contexto, municipio, punto, ubicación actual y estados vacío/carga.
2. Input, foco y limpiar emiten una vez sin mutar entradas.
3. Cada selector y cada control de Google Places emite el payload tipado exacto;
   las secciones ocultas no renderizan acciones inaccesibles.

## Criterios de aceptación

1. Municipio, punto específico, ubicación actual y ayuda de lugar conservan copy,
   clases, accesibilidad y comportamiento del flujo existente.
2. El componente es puramente presentacional y Home conserva API, debounce,
   matching, navegación y búsquedas sin llamadas duplicadas.
3. Pruebas, build, diff y recorrido local destino → origen → cambiar/repetir origen
   pasan sin errores; Partners permanece sin cambios.
