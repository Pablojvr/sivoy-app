# UI-REB-09 — resultados de puntos a página completa

Estado: aprobado, implementado y certificado el 2026-10-22.

Evidencia final: 500/500 pruebas frontend, 100/100 recorridos E2E seriales en
386, 768, 1024 y 1440 px, fronteras 31/31, colores 17/17 y build productivo
verdes. Los E2E usan su API fixture aislada y ya no dependen del catálogo local.

## Objetivo

Convertir la exploración de puntos por municipio en una vista dedicada de
página completa. La superficie exterior deja de comportarse como una tarjeta o
bottom sheet dentro de otra pantalla: el encabezado, los filtros y la lista
ocupan el espacio disponible, mientras cada punto continúa siendo una tarjeta
individual escaneable.

El cambio debe permitir comparar rápidamente puntos por disponibilidad y
franja de atención sin alterar la selección de origen/destino, el mapa, el cálculo
de rutas, ETA, backend ni contratos HTTP.

## Alcance aprobado propuesto

- Aplica a la lista de puntos de un municipio en modo destino u origen.
- No modifica las tarjetas de rutas calculadas, la ficha flotante del mapa ni
  la pantalla de Guardados.
- Conserva la isla superior de municipio seleccionado y el dock inferior.
- Sustituye únicamente el contenedor de resultados tipo sheet por una vista de
  contenido completa, sin marco exterior elevado ni doble tarjeta.
- Mantiene las acciones existentes de cada punto: guardar, ampliar foto,
  elegir origen/destino, compartir y abrir mapa.

## Contrato de diseño

### Jerarquía

1. Encabezado de resultados con municipio, cantidad visible y acción para
   cambiar el destino.
2. Barra de filtros compacta y sticky, separada visualmente de la lista.
3. Lista de tarjetas de punto; una columna en móvil y hasta dos columnas en
   escritorio cuando el ancho lo permita.
4. Acción `Ver más puntos` integrada al final de la lista, no dentro de una
   tarjeta adicional.

### Filtros

Se muestran dos grupos semánticos compactos que se pueden combinar:

- **Disponibilidad:** `Todos`, `Abierto ahora` y `Cierra pronto`.
- **Horario:** `Cualquier horario`, `Mañana`, `Tarde` y `Jornada extendida`.

Reglas:

- `Todos + Cualquier horario` es el estado inicial y preserva el orden del catálogo.
- `Abierto ahora` conserva solo puntos con disponibilidad canónica `OPEN`.
- `Cierra pronto` conserva puntos `OPEN` cuyo cierre ocurre en más de cero y
  hasta 120 minutos respecto a `evaluatedAt` del catálogo.
- El cálculo usa los campos estructurados de disponibilidad; no analiza textos
  formateados como `Hasta las 05:00 PM`.
- `Mañana` exige que al menos un horario publicado cruce 06:00–12:00.
- `Tarde` exige que al menos un horario publicado cruce 12:00–18:00.
- `Jornada extendida` exige cierre a las 18:00 o después, o una jornada que
  cruce medianoche.
- Los puntos sin horarios válidos se excluyen cuando se activa una franja.
- `Con foto` y la cercanía al remitente no son filtros: la foto sigue siendo
  un recurso de la tarjeta y el punto comparado es un destino.
- El contador anuncia `N de M puntos` cuando algún filtro reduce la lista.
- Un estado sin coincidencias explica el filtro activo y ofrece `Limpiar
  filtros`.

### Estado y URL

- La disponibilidad se representa con
  `disponibilidad=todos|abierto|cierra-pronto`.
- La franja se representa con
  `horario=todos|manana|tarde|extendido`.
- El parámetro legado `orden` se retira de la URL al restaurar o cambiar filtros.
- Los valores inválidos vuelven a los valores seguros por defecto.
- Al cambiar de municipio se mantienen solo valores válidos, se recalcula la
  lista y el scroll vuelve al inicio.
- Recargar, Atrás y Adelante restauran el estado sin duplicar historial.

### Responsive y movimiento

- 386×912: encabezado compacto, cada grupo mantiene su propia fila y sus chips
  se desplazan horizontalmente sin producir overflow de página.
- 768 px: contenido centrado, filtros sin cubrir resultados y una o dos
  columnas según el ancho útil.
- 1024 y 1440 px: máximo de dos columnas, ancho de lectura acotado y sin panel
  flotante lateral.
- El dock nunca cubre el último resultado o `Ver más puntos`.
- Objetivos táctiles mínimos de 44 px, foco visible y orden de tabulación igual
  al visual.
- Las transiciones usan tokens existentes, transform/opacidad y 180–280 ms;
  `prefers-reduced-motion` elimina movimiento no esencial.

La recomendación genérica de “minimalismo exagerado” producida por la guía
UI/UX se descarta porque contradice la densidad logística del producto. Se
mantienen Manrope, los tokens SiVoy Signal, los radios jerárquicos y la paleta
semántica vigente.

## Stack y comandos

- Angular 21, TypeScript, plantillas y CSS de componentes existentes.
- Sin dependencias nuevas ni cambios de servidor.
- Prueba focalizada:
  `npx ng test --watch=false --include src/app/features/home/results/point-results.filters.spec.ts --include src/app/features/home/home.component.spec.ts`.
- Suite frontend: `npm run test:ci` desde `frontend/`.
- Build: `npm run build` desde `frontend/`.
- Fronteras: `npm run check:boundaries` desde `frontend/`.
- Colores: `npm run check:css-colors` desde `frontend/`.
- E2E: `npm run e2e` desde `frontend/`.

## Estructura propuesta

- `frontend/src/app/features/home/point-results.filters.ts`:
  función pura para filtrar puntos sin alterar su orden.
- `frontend/src/app/features/home/point-results.filters.spec.ts`:
  casos deterministas de disponibilidad, franjas y cierre próximo.
- `frontend/src/app/features/home/home.component.ts`: estado de filtros,
  integración con URL y proyección derivada de resultados.
- `frontend/src/app/features/home/home.component.html`: encabezado, toolbar,
  estados y lista semántica.
- `frontend/src/app/features/home/home.component.css`: vista completa y matriz
  responsive.
- `frontend/src/app/mobile-app.component.ts`: persistir filtros válidos y retirar
  el parámetro legado de orden.
- E2E público existente: persistencia de filtros, teclado y responsive.

## Estilo de código

La lógica de filtrado será pura, tipada y sin mutar la colección de entrada:

```ts
export function projectPointResults(
  points: readonly PointResultFilterItem[],
  state: PointResultFilterState
): PointResultFilterItem[] {
  return [...points];
}
```

- Estados como uniones literales; no se introduce `any` nuevo.
- No se ordena `municipalityResults` in place.
- La plantilla consume una colección derivada única; no ejecuta filtros
  costosos desde bindings repetidos.
- Iconos SVG y tokens existentes; sin colores literales, estilos inline,
  `!important` ni una paleta paralela.

## Estrategia de pruebas

### Unitarias

- Orden estable de relevancia.
- `Abierto ahora` y `Cierra pronto` con bordes de 0, 120 y 121 minutos.
- Mañana, tarde y jornada extendida con horarios válidos, incompletos y nocturnos.
- Combinación de disponibilidad y horario preservando el orden del catálogo.
- Parámetros inválidos restauran valores por defecto.
- El componente muestra contador filtrado, estado vacío y limpia filtros.

El primer incremento seguirá RED → GREEN: la prueba de proyección debe fallar
antes de crear la función productiva.

### E2E y visual

- La lista por municipio usa una vista completa y no el marco visual de un
  bottom sheet.
- Los filtros actualizan tarjetas, contador y URL; recarga y navegación
  restauran el estado.
- `Con foto`, `Más cerca` y distancia al remitente no aparecen como filtros.
- Navegación por teclado y foco visible.
- 386×912, 768, 1024 y 1440 px sin overflow horizontal ni contenido bajo el
  dock.

## Límites

- **Siempre:** reutilizar catálogo, disponibilidad, horarios, tarjetas,
  servicios, iconos y tokens actuales; preservar las acciones existentes.
- **Pedir aprobación:** cambiar el umbral de 120 minutos, añadir nuevos tipos de filtro o modificar el
  formato de URL propuesto.
- **Nunca:** cambiar ETA, SQL, seeds, backend, contratos HTTP, Partner,
  dependencias, permisos del navegador o persistir la ubicación del usuario.

## Criterios de aceptación

- [ ] Los resultados de puntos ocupan una página de contenido completa, sin
  tarjeta exterior ni comportamiento de slider en modo lista.
- [ ] Las tarjetas se usan solo para puntos individuales y conservan todas sus
  acciones actuales.
- [ ] `Abierto ahora`, `Cierra pronto`, `Mañana`, `Tarde` y `Jornada extendida` siguen las reglas
  deterministas descritas.
- [ ] Los filtros combinados actualizan contador, URL, estado vacío y lista.
- [ ] La ubicación de respaldo nunca se representa como ubicación real.
- [ ] Teclado, foco, contraste, 44 px y movimiento reducido quedan verificados.
- [ ] 386, 768, 1024 y 1440 px pasan la revisión visual sin doble scroll,
  overflow ni contenido oculto por el dock.
- [ ] Unitarias, E2E, build, fronteras y contrato de colores quedan verdes.
- [ ] No hay cambios en backend, ETA, SQL, contratos HTTP ni dependencias.

## Rollback

Revertir los incrementos de UI-REB-09 restaura el contenedor list-first y su
colección sin filtros. Los parámetros adicionales de URL se ignoran de forma
segura por la versión anterior; no existe migración ni dato persistido que
revertir.

## Pregunta de aprobación

¿Apruebas esta vista completa, el umbral de dos horas para `Cierra pronto` y la
persistencia de filtros en la URL antes de preparar el plan e implementarla?
