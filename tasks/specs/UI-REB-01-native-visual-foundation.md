# Spec: `native-visual-foundation`

## Objective

Crear el sistema visual base del rebranding nativo de SiVoy sin modificar lógica de negocio ni recorridos. La base debe hacer que cada módulo posterior use la misma tipografía, paleta, espaciado, radios, elevación, iconografía y movimiento, evitando nuevos valores aislados en componentes.

La persona usuaria objetivo necesita encontrar y compartir puntos de envío rápidamente desde un teléfono. El sistema debe priorizar lectura clara, controles táctiles y una sensación de aplicación móvil estable, no de página web decorada.

## Approved product assumptions

- SiVoy continúa como web app responsive.
- El mapa permanece como recurso secundario.
- No se modifican ETA, disponibilidad, datos ni contratos HTTP.
- La pila tipográfica nativa no distribuye ni descarga SF Pro.
- Coral + grafito conservan la identidad; los estados usan tintes discretos.
- Partner, login y registro empresarial quedan fuera de alcance.

## Tech stack

- Angular `21.2.x`, TypeScript `5.9.x` y CSS global/component-scoped.
- Primitives Angular standalone existentes en `shared/ui/ui-primitives.ts`.
- Vitest mediante Angular Test Runner.
- Sin dependencias nuevas, librerías de iconos, frameworks CSS ni fuentes remotas.

## Commands

```powershell
# Desarrollo local
cd frontend
npm start -- --host 127.0.0.1 --port 4303

# Contratos visuales y arquitectura
npm run check:css-colors
npm run check:boundaries

# Verificación completa
npm run test:ci
npm run build
```

## Project structure

```text
frontend/src/styles.css
  Entrada global. Importa la base nativa y conserva únicamente estilos de composición vigentes.

frontend/src/styles/native-tokens.css
  Tokens semánticos, escalas y aliases compatibles con la identidad anterior.

frontend/src/styles/native-primitives.css
  Apariencia de botones, inputs, chips, cards, sheets y modales `si-*`.

frontend/src/app/shared/ui/ui-primitives.ts
  Contratos Angular de los primitives. No contiene reglas de negocio.

frontend/css-color-contract.json
  Lista auditada de colores y custom properties permitidos.

docs/UI_NATIVE_DESIGN_SYSTEM.md
  Guía de uso, ejemplos, decisiones y patrones prohibidos.
```

## Visual contract

### Typography

```css
--si-font-text: -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, system-ui, sans-serif;
--si-font-display: -apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, system-ui, sans-serif;

--si-type-page: 700 2rem/2.25rem var(--si-font-display);      /* 32/36 */
--si-type-title: 700 1.5rem/1.75rem var(--si-font-display);   /* 24/28 */
--si-type-section: 700 1.25rem/1.5rem var(--si-font-display); /* 20/24 */
--si-type-card: 650 1.0625rem/1.375rem var(--si-font-text);    /* 17/22 */
--si-type-body: 400 0.9375rem/1.375rem var(--si-font-text);   /* 15/22 */
--si-type-meta: 500 0.8125rem/1.125rem var(--si-font-text);   /* 13/18 */
```

- No se usarán pesos superiores a 750 en contenido ordinario.
- Ningún texto informativo será menor de 13 px.
- Texto de acciones: mínimo 15 px; placeholders: mínimo 15 px.
- Nombres de puntos admiten dos líneas antes de truncarse.

### Color roles

| Role | Value | Usage |
|---|---|---|
| Canvas | `#F4F4F1` | Fondo continuo de la app |
| Surface | `#FFFFFF` | Cards, sheets, inputs |
| Ink | `#171817` | Texto principal y acción contrastante |
| Muted ink | `#626760` | Texto secundario con contraste AA |
| Border | `rgba(23, 24, 23, 0.10)` | Separación discreta |
| Brand | `#F45B78` | Selección, progreso y CTA de marca |
| Brand strong | `#D94262` | Texto/acento sobre superficies claras |
| Brand soft | `#FFF0F3` | Fondos seleccionados |
| Success ink/soft | `#41651B` / `#F2F8E5` | Disponibilidad positiva |
| Info ink/soft | `#21657D` / `#EAF7FC` | Orientación y ayuda |
| Warning ink/soft | `#754D0C` / `#FFF7E8` | Atención sin error |
| Danger ink/soft | `#C93655` / `#FFF1F4` | Error o indisponibilidad |

Reglas:

- El coral no colorea secciones completas ni fondos de listas.
- Cada estado combina icono, texto y color; nunca depende solo del color.
- No se alternan colores decorativos entre cards.
- No se usan gradientes salvo una superposición funcional sobre fotografía.

### Spacing and geometry

```css
--si-space-1: 0.25rem;  /* 4 */
--si-space-2: 0.5rem;   /* 8 */
--si-space-3: 0.75rem;  /* 12 */
--si-space-4: 1rem;     /* 16 */
--si-space-5: 1.25rem;  /* 20 */
--si-space-6: 1.5rem;   /* 24 */
--si-space-8: 2rem;     /* 32 */
--si-space-10: 2.5rem;  /* 40 */

--si-radius-control: 0.75rem; /* 12 */
--si-radius-content: 1rem;    /* 16 */
--si-radius-card: 1.375rem;   /* 22 */
--si-radius-sheet: 1.75rem;   /* 28 */
--si-radius-round: 999px;
```

- Margen móvil estándar: 16 px; 20 px desde 768 px.
- Separación mínima entre controles táctiles: 8 px.
- Objetivo táctil mínimo: 44 × 44 px.
- Las pills se reservan para chips, filtros y controles segmentados.

### Elevation

- `level-0`: borde sutil, sin sombra; contenido dentro de una card.
- `level-1`: `0 1px 2px rgba(23, 24, 23, 0.06)`; cards de lista.
- `level-2`: `0 12px 32px rgba(23, 24, 23, 0.10)`; elementos flotantes.
- `sheet`: `0 -16px 48px rgba(23, 24, 23, 0.14)`; sheet activo.
- Una superficie utiliza un solo nivel; no se apilan varias sombras decorativas.

### Icons

- SVG inline con `viewBox="0 0 24 24"`, `currentColor`, extremos redondeados y trazo óptico de 1.8–2.
- Tamaño estándar 20 px; 22 px para navegación; 24 px únicamente para acción destacada.
- Un icono no sustituye texto en acciones no universales.
- No emojis, iconos rasterizados ni familias mezcladas.

### Motion

```css
--si-motion-feedback: 160ms;
--si-motion-standard: 240ms;
--si-motion-sheet: 320ms;
--si-ease-native: cubic-bezier(0.22, 1, 0.36, 1);
```

- Feedback: color, opacidad y traslación máxima de 2 px.
- Expansión: opacidad + transform; no animar alturas enormes ni propiedades que provoquen layout continuo.
- Sheets: entrada/salida vertical y backdrop coordinado.
- `prefers-reduced-motion: reduce` elimina movimiento no esencial sin ocultar estados.

## Primitive behavior

### Buttons

- Primary: grafito por defecto; coral solo para CTA de avance decisivo.
- Secondary: superficie blanca + borde.
- Ghost: sin contenedor persistente.
- Estados obligatorios: default, pressed, focus-visible, disabled y busy.
- El estado pressed usa `transform: translateY(1px)`, nunca scale.

### Inputs

- Altura mínima 52 px en búsqueda principal y 48 px en formularios secundarios.
- Label persistente o accesible; placeholder nunca funciona como único label.
- Focus ring de marca visible sin desplazar layout.
- Loading, empty y error mantienen el tamaño reservado para evitar saltos.

### Cards

- La card expresa una sola unidad de decisión.
- Encabezado, dato dominante y acción siguen ese orden.
- Máximo dos acciones visibles en estado compacto.
- Detalles secundarios se expanden o viven en la ficha de punto.

### Sheets and modals

- Sheet móvil con radio superior 28 px, asa de 36 × 5 px y safe-area inferior.
- Backdrop y botón de cerrar no compiten con la acción primaria.
- Modal centrado se reserva para confirmaciones; explorar/buscar usa sheet o vista enrutada.

## Code style

Se usan tokens semánticos y stylesheets colocados según responsabilidad:

```css
.si-native-card {
  padding: var(--si-space-4);
  border: 1px solid var(--si-color-border);
  border-radius: var(--si-radius-card);
  background: var(--si-color-surface);
  box-shadow: var(--si-shadow-level-1);
  color: var(--si-color-ink);
}

.si-native-card:focus-within {
  box-shadow: var(--si-focus-ring), var(--si-shadow-level-1);
}
```

- Prohibidos `!important`, estilos inline y nuevos literales de color fuera del contrato.
- Los nombres `--si-*` describen función, no un color o pantalla concreta.
- Los aliases actuales (`--primary`, `--text-main`, etc.) apuntan temporalmente al nuevo contrato para migración progresiva.
- Los componentes específicos conservan su CSS colocado junto al componente.

## Testing strategy

### Automated

- `check:css-colors` rechaza colores, named colors y root properties no aprobados.
- Tests del contrato verifican que existan los tokens obligatorios y que los aliases legacy apunten a ellos.
- Tests de primitives verifican variantes, tamaños, `aria-busy`, disabled y labels accesibles.
- Suite completa y build detectan regresiones de templates consumidores.

### Manual finish gate

- Viewports: 320×568, 386×912, 768×1024, 1024×900 y 1440×900.
- Navegación completa por teclado en primitives de muestra y pantallas consumidoras.
- Contraste mínimo 4.5:1 para texto normal y 3:1 para iconos/controles.
- Verificación con `prefers-reduced-motion` y zoom de navegador al 200%.
- Sin scroll horizontal ni contenido bajo la navegación fija/safe areas.

## Boundaries

### Always do

- Mantener compatibilidad mediante aliases durante la migración.
- Usar tokens semánticos y primitives existentes.
- Ejecutar contratos, tests, build y revisión visual antes de cada commit.
- Mantener cada incremento en un máximo aproximado de cinco archivos.

### Ask first

- Añadir dependencias o fuentes descargables.
- Eliminar un alias consumido por una pantalla no migrada.
- Cambiar estructura DOM o navegación de un flujo existente.
- Modificar budgets, configuración Angular o pipeline de despliegue.

### Never do

- Cambiar backend, base de datos, ETA o contratos públicos.
- Tocar Partner, autenticación o producción.
- Copiar branding, fotografías o textos de las referencias.
- Silenciar pruebas, checks de color o límites arquitectónicos.

## Rollout and rollback

1. Añadir tokens `--si-*` y redirigir aliases legacy sin borrar consumidores.
2. Migrar primitives globales a `native-primitives.css` preservando sus selectores.
3. Verificar visualmente pantallas actuales antes de iniciar módulos consumidores.
4. Cada módulo siguiente sustituye aliases por roles `--si-*` localmente.
5. Los aliases solo se eliminan cuando `rg` confirme cero consumidores.

Rollback: revertir los commits de foundation restaura `styles.css` y el contrato de color anterior sin afectar templates ni estado de la aplicación.

## Success criteria

- [ ] Existe una única fuente versionada para tokens y otra para primitives.
- [ ] La aplicación deja de solicitar Manrope/Google Fonts y usa la pila nativa aprobada.
- [ ] Tokens cubren tipografía, color, espacio, radio, sombra, movimiento y safe areas.
- [ ] Los selectores `si-*` existentes conservan API y comportamiento.
- [ ] No se introducen dependencias, estilos inline, `!important` ni colores no aprobados.
- [ ] Contratos, 360+ tests vigentes, build y boundaries están verdes.
- [ ] El cambio base se valida en cinco viewports, teclado, reduced motion y zoom 200%.
- [ ] No hay cambio funcional en búsqueda, resultados, detalle, rutas ni mapa.

## Open questions

No quedan preguntas funcionales. La aprobación de esta especificación confirma la escala tipográfica, la paleta semántica y la estrategia de compatibilidad descritas arriba.
