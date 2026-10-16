# UI-REB-05 — Tarjeta progresiva de ruta

## Objetivo

Reducir la carga visual de cada resultado de ruta y alinearlo con el lenguaje
nativo de SiVoy sin cambiar el cálculo ETA, los contratos HTTP, la navegación ni
los eventos públicos del componente.

## Alcance

- `route-result-card.component.html`: jerarquía y copy presentacional.
- `route-result-card.component.css`: composición, tokens, responsive y movimiento.
- `route-result-card.component.spec.ts`: contrato de resumen y expansión.
- `public-shipment-flow.pw.spec.ts`: reflujo y acciones críticas del flujo real.
- Documentación de ejecución en `tasks/`.

Quedan fuera Partner, backend, modelos de dominio, presenter, cálculo ETA,
servicios, navegación y dependencias.

## Contrato de experiencia

### Resumen colapsado

1. La tarjeta responde en una lectura a: empresa, origen, destino y llegada
   estimada.
2. `Opción N` identifica alternativas sin competir con la empresa.
3. Origen y destino forman un recorrido visual único; sus nombres admiten dos
   líneas sin truncamiento destructivo en 320 px.
4. La estimación usa una sola franja informativa con fecha, horario y el control
   textual `Ver detalles`.
5. No se muestran alertas, selector de día ni acciones secundarias mientras la
   tarjeta está colapsada.

### Detalle expandido

1. Una alerta de cierre, si existe, precede la selección del día.
2. El selector conserva todas las opciones y emite el mismo índice público.
3. Fecha y horario seleccionados se agrupan como resultado de esa elección, sin
   introducir procesos internos de las empresas.
4. `Cambiar origen` y `Ver en mapa` conservan sus eventos actuales y targets de
   al menos 44 px.

## Apariencia y accesibilidad

- Solo tokens `--si-*`; no se crea paleta paralela ni se agregan colores al
  contrato.
- Radio de tarjeta `--si-radius-card`, borde semántico y elevación nivel 1; el
  estado expandido puede usar nivel 2.
- Tipografía nativa, copy legible y metadatos de al menos 12 px.
- Foco visible, `aria-expanded`, área táctil mínima de 44 px y
  `prefers-reduced-motion`.
- Sin scroll horizontal ni superposición con la navegación en 320×568,
  386×912, 768×1024, 1024×900 y 1440×900.

## Criterios de aceptación

- El resumen conserva empresa, origen, destino, ETA y control de expansión.
- El detalle no existe en el DOM hasta expandir.
- La expansión conserva selector, alertas y ambos eventos de acción.
- No cambia TypeScript de negocio, presenter ni contratos.
- Prueba focalizada, suite frontend, colores, boundaries, build y E2E verdes.
- Inspección visual en cinco viewports y revisión independiente aprobadas.

## Rollback

Revertir en orden inverso los commits de presentación, pruebas y documentación.
No hay migración, dependencia, backend ni datos involucrados.
