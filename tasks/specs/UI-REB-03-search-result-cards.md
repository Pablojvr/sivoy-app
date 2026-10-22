# UI-REB-03 — tarjetas compactas de resultados

## Objetivo

Permitir que una persona identifique un punto, comprenda su disponibilidad y
elija el siguiente paso en pocos segundos. Cada resultado debe sentirse como una
tarjeta nativa de iOS: respirada, escaneable y progresiva, sin cambiar datos,
eventos ni reglas de negocio.

## Alcance

- Rediseñar `PointResultCardComponent`, usado al buscar destinos u orígenes por
  municipio.
- Mantener intactos los seis eventos públicos, el motor ETA, servicios,
  navegación, contratos HTTP y datos.
- Reutilizar los tokens `--si-*`, primitivas e iconos existentes.
- Mantener Partner, rutas calculadas y el detalle individual del mapa fuera de
  este incremento.

## Jerarquía compacta

1. Nombre del punto y ubicación.
2. Disponibilidad inmediata y siguiente referencia horaria.
3. Empresa operadora y distancia como metadatos secundarios.
4. Dos acciones visibles: elegir origen y compartir.
5. Horarios completos, imagen y mapa solo al expandir detalles.

## Interacción

- El estado compacto muestra un control textual `Ver detalles`, no solo un
  chevron.
- Al expandir, el control cambia a `Ocultar detalles` y expone horarios, imagen
  disponible y `Ver en el mapa`.
- La acción principal usa `Elegir origen` al explorar destinos y `Usar como
  origen` durante la selección de origen.
- La expansión conserva `aria-expanded` y `aria-controls`; todos los controles
  tienen al menos 44 × 44 px y foco visible.

## Sistema visual

- Radio exterior de 22–24 px mediante el token de tarjeta y radios interiores de
  12–16 px.
- Nombre de 17 px; cuerpo de 14 px; metadatos nunca menores de 12 px.
- Una sola sombra suave, borde sutil y superficies semánticas sin gradientes.
- Nombres largos admiten dos líneas; ubicación puede truncarse en una línea.
- Transiciones de 180–240 ms y eliminación completa con
  `prefers-reduced-motion`.

## Criterios de aceptación

- [x] La tarjeta compacta no muestra imagen, cuadrícula semanal ni mapa.
- [x] Solo dos acciones son visibles en estado compacto.
- [x] `Ver detalles`/`Ocultar detalles` comunica la expansión explícitamente.
- [x] El estado expandido conserva todos los recursos y los seis eventos.
- [x] No hay texto cortado ni scroll horizontal en 320×568, 386×912, 768×1024,
  1024×900 y 1440×900.
- [x] Prueba focalizada, suite frontend, contratos de color/boundaries, build y
  E2E quedan verdes.

## Rollback

Revertir el commit de presentación restaura el marcado y estilos anteriores; no
hay migración, dependencia nueva ni cambio de contrato que deshacer.
