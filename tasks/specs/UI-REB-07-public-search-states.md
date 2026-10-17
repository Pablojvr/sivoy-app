# UI-REB-07 — Estados públicos de búsqueda

Fecha: 2026-10-16

## Objetivo

Completar el lenguaje visual público para los estados de carga, error, ausencia
de rutas e inicio sin destino. Deben sentirse parte de las tarjetas nativas ya
integradas, ofrecer una recuperación clara y conservar intactos búsqueda, mapa,
rutas, ETA y contratos.

## Alcance

- Crear un componente presentacional standalone para `loading`, `error`,
  `empty` e `initial`.
- Usar únicamente tokens semánticos `--si-*`, SVG lineales y áreas táctiles de
  al menos 44 por 44 px.
- Anunciar carga con `role="status"` y error con `role="alert"`.
- Desactivar la animación de carga con `prefers-reduced-motion: reduce`.
- Reemplazar los estados heredados del bottom sheet y reutilizar la apertura
  actual del selector de destino como acción de recuperación.
- Retirar estilos globales huérfanos solo después de demostrar cero consumidores.

## Fuera de alcance

- Partner y Admin visual.
- Servicios, modelos, navegación, URLs, MapLibre, backend, PostgreSQL y ETA.
- Dependencias nuevas, fuentes remotas o nuevos estados de negocio.

## Contrato visual

- Superficie compacta de una sola columna, radio `--si-radius-card`, borde y
  sombra de los tokens existentes.
- Icono de 48 px con tono semántico: marca para inicio, información para carga,
  advertencia para vacío y peligro para error.
- Título `--si-type-section`, mensaje `--si-type-body` con ancho máximo de 34
  caracteres y acción inferior opcional.
- En 320x568 no define altura mínima y usa `--si-space-3`; desde 386 px usa
  `--si-space-4`. En tablet y escritorio se centra en el panel lateral.

## Criterios de aceptación

1. Los cuatro estados se renderizan desde un componente presentacional sin
   estilos inline, colores literales ni `!important`.
2. Loading expone `role="status"`, `aria-live="polite"` y `aria-busy="true"`;
   error expone `role="alert"` y `aria-live="assertive"`.
3. El indicador de carga se inmoviliza con movimiento reducido.
4. Initial y empty permiten volver a abrir el selector de destino mediante un
   evento, sin conocer Router, servicios o estado de Home.
5. El mensaje técnico de error aparece una sola vez dentro del contenido; el
   encabezado conserva únicamente un resumen estable.
6. El panel no desborda en 320x568 y permanece legible en 386, 768, 1024 y 1440.
7. Pruebas focalizadas, suite frontend, colores, fronteras, build y E2E quedan
   verdes; el resultado se revisa en navegador real.

## Incrementos

1. `UI-REB-07a`: componente + CSS + prueba (3 archivos).
2. `UI-REB-07b`: integración Home TS + HTML + prueba (3 archivos).
3. `UI-REB-07c`: limpieza de estilos globales + CSS Home + documentación
   (máximo 5 archivos).

## Rollback

Revertir los commits de UI-REB-07 en orden inverso. No existe migración,
dependencia, dato o cambio de backend que recuperar.
