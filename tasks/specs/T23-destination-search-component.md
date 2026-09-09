# T23 — Extraer búsqueda de destino

## Objetivo

Separar la captura y selección visual de municipio destino del componente
`HomeComponent`, sin mover todavía origen, resultados, Google Places ni mapa. La
fachada existente será el estado canónico nuevo en paralelo mientras Home conserva
sus campos heredados hasta T24–T26.

## Corte aprobado

Máximo cinco archivos de implementación:

1. `frontend/src/app/features/home/destination-search/destination-search.component.ts` (nuevo)
2. `frontend/src/app/features/home/destination-search/destination-search.component.html` (nuevo)
3. `frontend/src/app/features/home/destination-search/destination-search.component.spec.ts` (nuevo)
4. `frontend/src/app/features/home/home.component.ts`
5. `frontend/src/app/features/home/home.component.html`

No crear CSS nuevo: el componente mantiene las clases globales ya existentes. No
modificar `app.css`, Partner, servicios HTTP, rutas, origen, Google Places,
resultados, tarjetas ni mapa.

## Contrato del componente

El componente hijo es presentacional y tipado. Recibe el valor visible, la lista
de municipios `{ municipio, departamento, pointCount }` y si debe mostrarla. Emite:

- el texto introducido;
- el municipio seleccionado;
- la intención de limpiar.

Enter selecciona la primera opción visible. El hijo no inyecta servicios ni la
fachada y no conoce el modal, la navegación o el siguiente paso.

Home conserva el shell del diálogo, apertura/cierre, `initialIntent`, transición a
resultados/origen y ejecución heredada. Al seleccionar o limpiar un destino,
sincroniza también `ShipmentSearchFacade.setDestination` usando
`LocationSelection`; esta escritura es aditiva y aún no reemplaza la lectura
heredada.

## Pruebas primero

En Vitest/Angular:

1. renderiza valor, contador y opciones tipadas;
2. emite texto y limpiar sin mutar sus inputs;
3. click y Enter emiten exactamente la opción esperada, y Enter sin opciones no
   emite selección.

## Criterios de aceptación

1. Buscar, limpiar y seleccionar un municipio conserva el comportamiento y copy
   actuales, incluido teclado y foco; la selección sigue ejecutando el flujo
   existente una sola vez.
2. La selección/limpieza de destino queda reflejada en `ShipmentSearchFacade` sin
   convertir todavía la fachada en consumidora visual de resultados.
3. `npm run test:ci`, `npm run build`, `git diff --check` y un recorrido local
   inicio → buscar → filtrar → elegir → atrás/cerrar terminan sin errores.

## Riesgos y límites

- No extraer el diálogo completo: contiene el origen de T24.
- No mover Google Places: hoy pertenece exclusivamente a la ayuda de origen.
- No cambiar el significado de municipio frente a punto específico.
- No duplicar llamadas de red al sincronizar la fachada.
- Los intents por URL permanecen coordinados por Home; su comportamiento debe
  comprobarse manualmente en el recorrido local.

