# UI01 — Tarjetas de resultados de búsqueda

## Objetivo

Permitir que una persona identifique un punto, comprenda si está disponible y ejecute la siguiente acción en pocos segundos, sin que cada resultado compita visualmente con los demás.

## Alcance

- Rediseñar `PointResultCardComponent`, usado en los resultados por municipio.
- Conservar los datos, eventos y comportamiento de negocio existentes.
- Mantener la paleta de SiVoy: superficie cálida, tinta casi negra, coral como acento y colores semánticos de disponibilidad.
- No modificar el panel Partner, el motor de rutas, mapas ni contratos del backend.

## Jerarquía de información

1. Nombre del punto y municipio/departamento.
2. Disponibilidad inmediata y siguiente referencia horaria.
3. Empresa operadora y distancia, como metadatos secundarios.
4. Acciones rápidas: elegir origen y compartir.
5. Horarios completos, imagen y mapa, únicamente al expandir detalles.

## Comportamiento

### Estado compacto

- La tarjeta muestra identidad, ubicación, disponibilidad y dos acciones: `Elegir origen` (o `Usar como origen`) y `Compartir`.
- Un control visible `Ver detalles` con chevron expone que la tarjeta es desplegable.
- No muestra la cuadrícula semanal, imagen de referencia ni acción de mapa.

### Estado expandido

- El control cambia a `Ocultar detalles` y rota el chevron.
- Muestra horarios agrupados, imagen de referencia disponible y `Ver mapa` como recurso secundario.
- Conserva las acciones rápidas para no obligar a volver a colapsar.

## Sistema visual

- Radio exterior: 22–24 px; radios interiores: 12–16 px.
- Tipografía mínima visible: 12 px para metadatos; 14 px para cuerpo; 16–17 px para el nombre.
- Controles táctiles de al menos 44 × 44 px y separaciones de al menos 8 px.
- Borde sutil y una sola sombra suave; evitar gradientes o bloques de color que compitan con el contenido.
- El color semántico complementa texto e icono y nunca comunica estado por sí solo.
- Animaciones de 180–240 ms; desactivadas con `prefers-reduced-motion`.

## Accesibilidad

- La expansión sigue usando un `button` con `aria-expanded` y `aria-controls`.
- El texto del control de expansión es visible, no depende únicamente del icono.
- Los nombres largos se adaptan a dos líneas antes de truncarse.
- Foco visible y contraste WCAG AA.

## Criterios de aceptación

- [x] La tarjeta compacta reduce el desplazamiento sin ocultar identidad, disponibilidad o acciones principales.
- [x] `Ver mapa`, horarios completos e imagen solo aparecen cuando la tarjeta está expandida.
- [x] `Ver detalles`/`Ocultar detalles` describe explícitamente el control.
- [x] Los seis eventos existentes se emiten exactamente una vez con el mismo payload.
- [x] Los tests unitarios, de caracterización y el build del frontend pasan.
- [x] La pantalla se verifica visualmente a 386 × 912 y en escritorio.

## Fuera de alcance

- Rediseño del buscador inicial y de sus sugerencias.
- Cambios en datos o cálculo de disponibilidad.
- Cambios del detalle individual sobre mapa.
- Despliegue a producción.
