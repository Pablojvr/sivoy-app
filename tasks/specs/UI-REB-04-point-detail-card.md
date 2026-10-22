# UI-REB-04 — detalle progresivo del punto

## Objetivo

Convertir el detalle del punto en una hoja flotante compacta, reconocible y
segura para pantallas pequeñas. La vista previa debe identificar el punto y
explicar cómo abrirlo; la vista expandida debe priorizar una sola decisión de
ruta y organizar la información secundaria sin superponerse al dock.

## Alcance

- Rediseñar `PinDetailCardComponent` sin cambiar sus entradas, salidas ni el
  estado que administra `HomeComponent`.
- Mantener selección de origen/destino, compartir, copiar, mapa, imagen,
  disponibilidad y horarios.
- Extraer la presentación del detalle a una hoja propia basada en tokens
  `--si-*`; la limpieza global se hará únicamente después de confirmar cero
  consumidores.
- Mantener Partner, ETA, servicios, navegación y contratos HTTP fuera de este
  incremento.

## Jerarquía e interacción

1. El estado compacto muestra imagen o fallback, empresa, nombre, municipio y
   un control textual `Ver detalles` además del asa.
2. El estado expandido cambia el control a `Ocultar detalles` y muestra como
   máximo dos acciones rápidas: decisión de ruta y mapa.
3. Información y horarios permanecen en un selector segmentado accesible; solo
   el contenido de la pestaña activa está presente.
4. El cuerpo expandido desplaza internamente y termina por encima del dock y de
   la safe area; cerrar y compartir permanecen disponibles.
5. El gesto vertical existente y el botón de expansión representan la misma
   transición, sin mutar contratos ni lógica de negocio.

## Sistema visual

- Radio exterior de 24–28 px y superficies interiores de 14–18 px.
- Título de 20 px; cuerpo de 14 px; metadatos nunca menores de 12 px.
- Grafito para acción principal, coral para intención logística y tonos
  semánticos existentes para disponibilidad.
- Targets de 44 px, foco visible, contraste AA y transiciones de 180–240 ms.
- Sin gradientes decorativos nuevos fuera del fallback de imagen; movimiento
  eliminado con `prefers-reduced-motion`.

## Criterios de aceptación

- [x] La vista compacta comunica explícitamente `Ver detalles`.
- [x] La vista expandida comunica `Ocultar detalles` y conserva todas las
  acciones/eventos públicos.
- [x] El selector Información/Horarios expone semántica de pestañas y estado.
- [x] El contenido no queda bajo el dock ni produce scroll horizontal en
  320×568, 386×912, 768×1024, 1024×900 y 1440×900.
- [x] Prueba focalizada, suite frontend, contratos de color/boundaries, build y
  E2E quedan verdes.

## Rollback

Revertir el commit de presentación restaura el detalle anterior. No hay
migración, dependencia ni cambio de backend que deshacer.
