# Sistema de Diseño Nativo de SiVoy (`UI-REB-01`)

Guía técnica autoritativa para la base visual nativa de SiVoy. Define los tokens semánticos, primitivas de interfaz, contratos de accesibilidad y reglas de consumo aprobadas en la especificación `tasks/specs/UI-REB-01-native-visual-foundation.md`.

---

## 1. Propósito, Alcance y No-objetivos

### 1.1 Propósito
Establecer un lenguaje visual unificado, rápido y de alta legibilidad para SiVoy. La aplicación está diseñada para personas usuarias que buscan y comparten puntos de envío y recepción logística principalmente desde un teléfono móvil. Debe transmitir la solidez y estabilidad de una aplicación nativa, evitando el aspecto de un sitio web decorado con estilos dispersos.

### 1.2 Alcance
- Pila tipográfica local basada en fuentes del sistema (sin descargas de fuentes remotas).
- Paleta semántica centralizada con roles de color de alto contraste.
- Escala de espaciado, radios de curvatura, elevaciones de un solo nivel y curvas de movimiento.
- Primitivas reutilizables en Angular (`button[siButton]`, `button[siIconButton]`, `input[siInput]`, `textarea[siInput]`, `si-chip`, `article[siCard]`, `section[siSheet]`, `dialog[siModal]`).
- Reglas de interacción táctil, foco visible, contraste WCAG AA y accesibilidad (`prefers-reduced-motion`, zoom 200%).

### 1.3 No-objetivos (Non-goals)
- **Cero cambios en lógica de negocio:** No se modifican el motor de cálculo ETA, disponibilidad, catálogo de ubicaciones, rutas ni contratos HTTP.
- **Sin afectación a Partner:** El módulo de Partner, inicio de sesión corporativo y registro empresarial quedan fuera del alcance de este sistema nativo.
- **Sin backend ni base de datos:** No incluye migraciones, esquemas, semillas ni endpoints Express/PostgreSQL.
- **Sigue siendo web app responsive:** No se crea una aplicación empaquetada ni binarios nativos para tiendas de aplicaciones.
- **Cero dependencias nuevas:** No se instalan librerías de componentes, frameworks CSS (como Tailwind o Bootstrap), fuentes externas ni paquetes de iconos rasterizados.

---

## 2. Tokens Semánticos y Política de Compatibilidad

Todos los tokens canónicos residen en `frontend/src/styles/native-tokens.css` dentro del bloque `:root`. Los nombres de las variables describen **función y rol semántico**, nunca pantallas específicas ni colores literales aislados.

### 2.1 Tipografía

La tipografía nativa aprovecha las fuentes optimizadas por cada sistema operativo sin descargar fuentes comerciales ni realizar llamadas de red:

```css
--si-font-text: -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, system-ui, sans-serif;
--si-font-display: -apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, system-ui, sans-serif;

--si-type-page: 700 2rem/2.25rem var(--si-font-display);      /* 32px / 36px */
--si-type-title: 700 1.5rem/1.75rem var(--si-font-display);   /* 24px / 28px */
--si-type-section: 700 1.25rem/1.5rem var(--si-font-display); /* 20px / 24px */
--si-type-card: 650 1.0625rem/1.375rem var(--si-font-text);    /* 17px / 22px */
--si-type-body: 400 0.9375rem/1.375rem var(--si-font-text);   /* 15px / 22px */
--si-type-meta: 500 0.8125rem/1.125rem var(--si-font-text);   /* 13px / 18px */
```

#### Reglas tipográficas obligatorias:
1. **Peso máximo:** No se deben emplear pesos mayores a `750` en contenido ordinario.
2. **Tamaño mínimo legible:** Ningún texto informativo o metadato será menor a 13 px (`--si-type-meta`).
3. **Acciones y campos:** Textos de botones, enlaces principales y placeholders deben medir como mínimo 15 px (`--si-type-body`).
4. **Truncado en nombres de punto:** Los nombres de locales y puntos de envío admiten hasta dos líneas de texto antes de aplicar elipsis (`text-overflow: ellipsis`).

### 2.2 Paleta Semántica de Colores

| Token | Valor Hex / RGBA | Rol y Uso Aprobado |
|---|---|---|
| `--si-color-canvas` | `#F4F4F1` | Fondo mineral continuo de la aplicación. |
| `--si-color-surface` | `#FFFFFF` | Superficie pura para tarjetas, hojas modales, controles y campos. |
| `--si-color-ink` | `#171817` | Texto principal, títulos y acciones primarias de alto contraste. |
| `--si-color-ink-muted` | `#626760` | Texto secundario y metadatos con contraste garantizado WCAG AA (>= 4.5:1). |
| `--si-color-border` | `rgba(23, 24, 23, 0.10)` | Delimitación discreta de componentes sobre canvas o superficie. |
| `--si-color-brand` | `#F45B78` | Coral de marca para selección activa, progreso y botones de avance clave. |
| `--si-color-brand-strong` | `#D43C5D` | Acento tipográfico sobre fondos claros; alcanza 4.56:1 sobre blanco. |
| `--si-color-brand-soft` | `#FFF0F3` | Fondo de énfasis suave para elementos seleccionados o acentuados. |
| `--si-color-success-ink` | `#41651B` | Texto e iconos para estados operativos positivos o abiertos. |
| `--si-color-success-soft` | `#F2F8E5` | Contenedor suave de estado disponible u operativo. |
| `--si-color-info-ink` | `#21657D` | Texto e iconos informativos, de orientación o ayuda. |
| `--si-color-info-soft` | `#EAF7FC` | Fondo de asistencia informativa. |
| `--si-color-warning-ink` | `#754D0C` | Texto e iconos de advertencia o atención sin bloqueo. |
| `--si-color-warning-soft` | `#FFF7E8` | Fondo de estado preventivo. |
| `--si-color-danger-ink` | `#C93655` | Texto, borde e icono de error, bloqueo o punto cerrado. |
| `--si-color-danger-soft` | `#FFF1F4` | Fondo de notificación crítica o invalidación. |

#### Reglas de aplicación de color:
- **Restricción del coral:** `--si-color-brand` nunca colorea secciones enteras de la pantalla ni fondos de lista. Se reserva para llamadas a la acción determinantes y selecciones.
- **Semántica multimodal:** Todo estado informativo combina icono, texto y color; nunca debe depender exclusivamente del color para comunicar estado.
- **Sin patrones cromáticos alternados:** Prohibido ciclar tarjetas con colores decorativos aleatorios en un listado homogéneo.
- **Sin gradientes decorativos:** Se prohíben gradientes complejos en superficies planas; solo se admiten superposiciones funcionales de legibilidad sobre fotografías o mapas.

### 2.3 Espaciado y Geometría

Escala proporcional de 4 px para márgenes y espaciadores internos:

```css
--si-space-1: 0.25rem;  /* 4px */
--si-space-2: 0.5rem;   /* 8px */
--si-space-3: 0.75rem;  /* 12px */
--si-space-4: 1rem;     /* 16px */
--si-space-5: 1.25rem;  /* 20px */
--si-space-6: 1.5rem;   /* 24px */
--si-space-8: 2rem;     /* 32px */
--si-space-10: 2.5rem;  /* 40px */
```

Radios de curvatura consistentes:

```css
--si-radius-control: 0.75rem; /* 12px: inputs y controles secundarios */
--si-radius-content: 1rem;    /* 16px: paneles internos e imágenes */
--si-radius-card: 1.375rem;   /* 22px: tarjetas de resultado */
--si-radius-sheet: 1.75rem;   /* 28px: esquinas superiores de bottom sheets */
--si-radius-round: 999px;     /* Pills: botones, chips, filtros segmentados */
```

### 2.4 Elevación y Foco

Cada elemento en pantalla debe utilizar **un único nivel de sombra**, nunca apilar sombras arbitrarias:

- `--si-shadow-level-0: none;`: Contenido plano contenido dentro de tarjetas con borde sutil.
- `--si-shadow-level-1: 0 1px 2px rgba(23, 24, 23, 0.06);`: Tarjetas en listas de resultados.
- `--si-shadow-level-2: 0 12px 32px rgba(23, 24, 23, 0.10);`: Elementos flotantes sobre el mapa y modales de confirmación.
- `--si-shadow-sheet: 0 -16px 48px rgba(23, 24, 23, 0.14);`: Bottom sheet activo sobre el contenido.
- `--si-focus-ring: 0 0 0 4px rgba(244, 91, 120, 0.22);`: Anillo de foco accesible sin alterar la caja del layout.

### 2.5 Movimiento y Safe Areas

```css
--si-motion-feedback: 160ms;
--si-motion-standard: 240ms;
--si-motion-sheet: 320ms;
--si-ease-native: cubic-bezier(0.22, 1, 0.36, 1);
--si-safe-area-top: env(safe-area-inset-top, 0px);
--si-safe-area-bottom: env(safe-area-inset-bottom, 0px);
```

### 2.6 Política de Aliases Legacy y Deprecación

En `native-tokens.css` se mantienen variables de compatibilidad anteriores (`--primary`, `--text-main`, `--surface-solid`, `--radius-lg`, etc.) vinculadas directamente a sus equivalentes canónicos `--si-*`.

**Política de retiro:**
1. Ningún alias preexistente debe eliminarse mientras existan pantallas o componentes consumidores en el repositorio.
2. Cada componente migrado debe reemplazar el alias por el rol semántico `--si-*`.
3. Un alias solo puede borrarse de `native-tokens.css` cuando una búsqueda con `rg` demuestre **cero ocurrencias** en todo el proyecto.

---

## 3. Primitivas UI (`si-*`) y Ejemplos de Integración

Las directivas y componentes standalone residen en `frontend/src/app/shared/ui/ui-primitives.ts`, con estilos asociados en `frontend/src/styles/native-primitives.css`.

### 3.1 Button (`SiButtonDirective`)

Aplica apariencia nativa, objetivo táctil mínimo de 44 px (52 px en `lg`) y control de estado ocupado/deshabilitado.

- **Selector:** `button[siButton]`
- **Clase host:** `.si-button`
- **Modificadores:** `.si-button--secondary`, `.si-button--ghost`, `[data-size]`, `.si-control--disabled`
- **Inputs:**
  - `variant`: `'primary' | 'secondary' | 'ghost'` (por defecto: `'primary'`)
    - `'primary'`: Contenedor grafito `#171817` con texto blanco (acción principal estándar).
    - `'secondary'`: Fondo blanco `#FFFFFF`, borde `--si-color-border`, texto grafito.
    - `'ghost'`: Fondo transparente, texto grafito, sin borde persistente.
  - `size`: `'sm' | 'md' | 'lg'` (por defecto: `'md'`)
  - `busy`: `boolean` (por defecto: `false`) — activa `aria-busy="true"`, desactiva puntero y desactiva el botón nativo.
  - `disabled`: `boolean` (por defecto: `false`) — desactiva el botón y reduce opacidad a 0.46.

```html
<!-- Primario estándar -->
<button siButton (click)="seleccionarPunto()">
  Seleccionar punto
</button>

<!-- Secundario compacto -->
<button siButton variant="secondary" size="sm" (click)="verEnMapa()">
  Ver en mapa
</button>

<!-- En estado ocupado / cargando -->
<button siButton [busy]="guardandoRuta()" (click)="guardar()">
  Guardando...
</button>
```

### 3.2 IconButton (`SiIconButtonDirective`)

Control táctil circular para acciones puramente iconográficas (44 × 44 px en `md`, 52 × 52 px en `lg`).

- **Selector:** `button[siIconButton]`
- **Clase host:** `.si-icon-button`
- **Modificadores:** `.si-icon-button--secondary`, `.si-icon-button--ghost`, `[data-size]`, `.si-control--disabled`
- **Inputs:**
  - `aria-label`: `string` (**obligatorio** / required vía `alias: 'aria-label'`).
  - `variant`: `'primary' | 'secondary' | 'ghost'` (por defecto: `'primary'`).
  - `size`: `'sm' | 'md' | 'lg'` (por defecto: `'md'`).
  - `busy`: `boolean` (por defecto: `false`).
  - `disabled`: `boolean` (por defecto: `false`).

```html
<button
  siIconButton
  variant="secondary"
  aria-label="Compartir ubicación del punto"
  (click)="compartir()"
>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="18" cy="5" r="3"></circle>
    <circle cx="6" cy="12" r="3"></circle>
    <circle cx="18" cy="19" r="3"></circle>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
  </svg>
</button>
```

### 3.3 Input y Textarea (`SiInputDirective`)

Campo de entrada accesible con altura mínima de 48 px (96 px para textareas).

- **Selector:** `input[siInput], textarea[siInput]`
- **Clase host:** `.si-input`
- **Modificador:** `.si-input--invalid`
- **Inputs:**
  - `invalid`: `boolean` (por defecto: `false`) — activa `aria-invalid="true"` y resalta el borde en `--si-color-danger-ink`.

```html
<!-- Input con label accesible asociado -->
<label for="buscar-destino" class="visually-hidden">Buscar destino</label>
<input
  id="buscar-destino"
  siInput
  type="text"
  placeholder="Agencia o municipio"
  [invalid]="tieneErrorBusqueda()"
/>
```

### 3.4 Chip (`SiChipComponent`)

Etiqueta compacta en píldora para estados, categorías y filtros rápidos (altura mínima 28 px).

- **Selector:** `si-chip` (Componente standalone con `<ng-content />`)
- **Clase host:** `.si-chip`
- **Atributo host:** `[data-tone]`
- **Inputs:**
  - `tone`: `'neutral' | 'accent' | 'success' | 'info' | 'warning'` (por defecto: `'neutral'`).

```html
<si-chip tone="success">Abierto ahora</si-chip>
<si-chip tone="warning">Cierra pronto</si-chip>
<si-chip tone="accent">Recomendado</si-chip>
```

### 3.5 Card (`SiCardDirective`)

Contenedor semántico para unidades de contenido o tarjetas de resultado.

- **Selector:** `article[siCard], section[siCard]`
- **Clase host:** `.si-card`
- **Modificadores:** `.si-card--elevated`, `[data-tone]`
- **Inputs:**
  - `tone`: `'neutral' | 'accent' | 'success' | 'info' | 'warning' | 'contrast'` (por defecto: `'neutral'`).
  - `elevated`: `boolean` (por defecto: `false`) — aplica elevación `--si-shadow-level-1`.

```html
<article siCard [elevated]="true" tone="neutral">
  <!-- Contenido de tarjeta de resultado -->
</article>
```

### 3.6 Sheet (`SiSheetDirective`)

Panel deslizable inferior (bottom sheet) con soporte de safe area en dispositivos móviles.

- **Selector:** `section[siSheet]`
- **Clase host:** `.si-sheet`
- **Atributo host:** `[data-state]`, `[attr.aria-label]`
- **Inputs:**
  - `state`: `'collapsed' | 'half' | 'expanded'` (por defecto: `'collapsed'`).
    - `'collapsed'`: Altura de 6.5rem (104 px), resumen o indicador mínimo.
    - `'half'`: Altura de 52dvh, exploración inicial de lista.
    - `'expanded'`: Altura de `min(76dvh, calc(100dvh - 1.5rem))`, lectura detallada de resultados.
  - `aria-label`: `string` (**obligatorio** / required vía `alias: 'aria-label'`).

```html
<section
  siSheet
  [state]="estadoSheet()"
  aria-label="Resultados de puntos de envío"
>
  <button type="button" class="sheet-handle" aria-label="Cambiar tamaño de panel"></button>
  <!-- Lista de resultados -->
</section>
```

### 3.7 Modal (`SiModalDirective`)

Diálogo centrado para confirmaciones irreversibles o avisos críticos.

- **Selector:** `dialog[siModal]`
- **Clase host:** `.si-modal`
- **Atributo host:** `[data-size]`, `[aria-modal]="true"`
- **Inputs:**
  - `size`: `'sm' | 'md' | 'lg'` (por defecto: `'md'`)
    - `'sm'`: Ancho máximo 20rem (320 px).
    - `'md'`: Ancho máximo 30rem (480 px).
    - `'lg'`: Ancho máximo 45rem (720 px).

```html
<dialog siModal size="sm" aria-label="Confirmar selección de sucursal">
  <h3>¿Confirmar punto de entrega?</h3>
  <p>El paquete será entregado en DHL Express Centro.</p>
  <div class="modal-actions">
    <button siButton variant="secondary" (click)="cerrar()">Cancelar</button>
    <button siButton (click)="confirmar()">Aceptar</button>
  </div>
</dialog>
```

---

## 4. Reglas de Iconografía, Interacción y Accesibilidad

### 4.1 Iconografía SVG
- **Formato:** SVG inline exclusivo.
- **Geometría base:** `viewBox="0 0 24 24"`, color mediante `fill="none"` y `stroke="currentColor"`.
- **Trazos:** Extremos redondeados (`stroke-linecap="round" stroke-linejoin="round"`) con ancho óptico entre `1.8` y `2.0`.
- **Dimensiones autorizadas:**
  - `20 × 20 px`: Tamaño estándar en tarjetas, botones y listas.
  - `22 × 22 px`: Elementos de la barra inferior o dock de navegación.
  - `24 × 24 px`: Únicamente para llamadas a la acción determinantes y singulares.
- **Prohibiciones de iconos:** No utilizar emojis, imágenes rasterizadas (`.png`, `.webp`, `.jpg`), librerías de fuentes de iconos pesadas ni mezclar estilos iconográficos.

### 4.2 Objetivos Táctiles y Márgenes Responsivos
- **Objetivo táctil mínimo (Touch Target):** Todo botón, enlace o elemento interactivo debe tener un área mínima de **44 × 44 px** (CSS `min-height: 44px` y padding compensado).
- **Separación entre controles táctiles:** Mínimo **8 px** (`--si-space-2`) entre dos botones o campos interactivos contiguos para evitar toques involuntarios.
- **Márgenes laterales de pantalla:**
  - Móvil (< 768 px): **16 px** (`--si-space-4`).
  - Tablet y escritorio (>= 768 px): **20 px** (`--si-space-5`).
- **Respeto a Safe Areas:** En elementos fijados arriba o abajo (como el sheet o dock), sumar siempre `--si-safe-area-top` y `--si-safe-area-bottom` al padding.

### 4.3 Foco, Contraste y Navegación por Teclado
- **Foco visible:** Todo elemento interactivo debe exponer `--si-focus-ring` (`0 0 0 4px rgba(244, 91, 120, 0.22)`) en `:focus-visible` o `:focus-within`. Prohibido usar `outline: none` o `outline: 0` sin proveer el anillo de foco del sistema.
- **Contraste mínimo WCAG AA:**
  - Texto estándar: al menos **4.5:1** contra el fondo (`#171817` o `#626760` sobre `#F4F4F1` y `#FFFFFF`).
  - Controles e iconos funcionales: al menos **3:1** contra su fondo inmediato.
- **Operatividad por teclado:**
  - Tabulación lógica y secuencial.
  - Activación mediante `Enter` y `Espacio` en todo botón o selector.
  - La tecla `Escape` debe cerrar modales y colapsar paneles expandidos.

### 4.4 Movimiento Reducido y Zoom 200%
- **`prefers-reduced-motion: reduce`:** Las primitivas eliminan sus transiciones (`transition: none`) y cada consumidor debe eliminar además cualquier animación no esencial, sin ocultar ni alterar el contenido ni los estados finales.
- **Zoom al 200%:** La interfaz debe ser completamente navegable al 200% de aumento del navegador:
  - Sin desbordamiento ni scroll horizontal imprevisto (`overflow-x: hidden`).
  - Sin textos solapados ni botones que queden tapados por barras fijas.

---

## 5. Reglas de Consumo: Tarjetas de Resultado y Ficha de Punto

Para garantizar una lectura ágil en pantalla pequeña:

1. **Una decisión por tarjeta:** Cada tarjeta de resultado representa una única entidad elegible. No agrupar múltiples decisiones no relacionadas dentro del mismo contenedor.
2. **Jerarquía fija de información:**
   - **Encabezado:** Empresa o proveedor logístico y distancia estimada.
   - **Dato dominante:** Nombre claro de la sucursal o punto de entrega (máximo dos líneas).
   - **Estado:** Horario y disponibilidad inmediata comunicados mediante `si-chip` semántico.
   - **Acciones:** Zona inferior de la tarjeta.
3. **Máximo dos acciones visibles en estado compacto:**
   - Una acción primaria (ej. botón primario con texto directo "Seleccionar punto").
   - Una acción secundaria o iconográfica (ej. botón secundario "Ver en mapa" o icono de compartir).
4. **Etiquetas transparentes y humanas:** Prohibido mostrar identificadores internos, códigos crudos de sucursal o terminología técnica del backend.
5. **Detalles diferidos al sheet:** La información densa (listado semanal de horarios, especificaciones de peso, teléfonos) vive en la ficha de detalle dentro del bottom sheet o acordeón expandible, no en la tarjeta de la lista general.

---

## 6. Patrones Prohibidos (Anti-patterns)

Quedan expresamente vetados los siguientes patrones en todo el código de interfaz:

1. **Fuentes remotas:** Prohibido insertar `<link>` o `@import url(...)` hacia Google Fonts, Typekit o CDNs de tipografía. Todo se resuelve mediante las familias locales del sistema (`--si-font-text`, `--si-font-display`).
2. **Estilos inline (`style="..."`):** Todo estilo debe provenir de clases CSS o tokens definidos en las hojas de estilo del componente o los primitives.
3. **Uso de `!important`:** Prohibido en código de aplicación o primitives. La especificidad debe manejarse mediante la arquitectura de selectores.
4. **Literales de color no aprobados:** Prohibido escribir códigos `#...`, `rgb(...)` o `hsl(...)` nuevos fuera del contrato auditado en `frontend/css-color-contract.json`. Usar siempre los tokens `--si-color-*`.
5. **Emojis o iconos rasterizados como elementos de UI:** No se admiten emojis en lugar de iconos vectoriales ni imágenes `.png` para controles.
6. **Placeholder como único label:** Todo campo `siInput` debe tener un `<label>` visible o un atributo `aria-label` descriptivo. El placeholder no reemplaza al label.
7. **Acciones no universales sin texto:** Prohibido utilizar botones únicamente iconográficos para acciones ambiguas o infrecuentes. Solo se admiten sin texto acciones universales como cerrar (`X`) o buscar (lupa), siempre con su correspondiente `aria-label`.
8. **Animaciones de grandes alturas:** Prohibido animar `height` variable o `max-height` a valores gigantescos que fuercen relayout continuo en el navegador. Utilizar `transform`, `opacity` o alturas basadas en unidades dinámicas del viewport (`dvh`).

---

## 7. Estrategia de Rollout y Rollback

### 7.1 Rollout Progresivo
1. **Paso 1:** Carga de tokens semánticos y preservación de aliases en `native-tokens.css`.
2. **Paso 2:** Disponibilidad de primitivas estables en `native-primitives.css` y `ui-primitives.ts`.
3. **Paso 3:** Migración progresiva de componentes y vistas existentes hacia las directivas `si-*` y tokens `--si-*`.
4. **Paso 4:** Verificación constante de no-regresión con `npm run check:css-colors`, `npm run check:boundaries` y `npm run test:ci`.
5. **Paso 5:** Retiro de aliases legacy únicamente cuando `rg` confirme cero usos en todo el árbol de código.

### 7.2 Rollback
- Para este documento: Borrar exclusivamente `docs/UI_NATIVE_DESIGN_SYSTEM.md`.
- Para cambios en el sistema visual: Revertir los commits específicos de tokens/primitives restaura la configuración previa sin romper vistas gracias a la preservación de selectores y contratos de color.

---

## 8. Checklist de Certificación para Codex

> [!IMPORTANT]
> Esta sección es una lista de verificación que **Codex debe ejecutar y completar** en su entorno de validación antes de integrar o promover cambios. El agente de implementación delegada no debe marcar las verificaciones manuales ni de navegador como aprobadas.

### 8.1 Comandos Automatizados Obligatorios

Ejecutar desde el directorio `frontend/`:

- [x] `npm run check:css-colors` (17/17 pruebas del contrato; 14 hojas CSS, 0 violaciones)
- [x] `npm run check:boundaries` (31/31 pruebas; 53 archivos productivos, 0 violaciones)
- [x] `npm run test:ci` (38 archivos y 361/361 pruebas en verde)
- [x] `npm run build` (Compilación de producción correcta; permanece el aviso preexistente CommonJS de `mapbox-gl`)
- [x] `npm run e2e` (56/56 casos en los cuatro proyectos Playwright)

### 8.2 Matriz de Viewports Obligatorios (Auditoría Visual en Navegador)

Codex debe auditar visualmente los flujos principales en los siguientes 5 viewports:

| Viewport | Dispositivo de Referencia | Objetivo de la Inspección | Estado de Certificación |
|---|---|---|---|
| **320 × 568 px** | Móvil ultra compacto (iPhone SE 1st gen) | Sin scroll horizontal, textos legibles sin truncamiento destructivo. | [x] Inicio, resultados y ruta auditados; ancho de documento 320 px y sheet bajo el encabezado. |
| **386 × 912 px** | Móvil estándar de referencia (Android moderno) | Safe areas correctas, touch targets >= 44 px, bottom sheet funcional. | [x] Resultados, ficha colapsada/expandida, origen y ruta sin solapar navegación. |
| **768 × 1024 px** | Tablet vertical (iPad) | Transición adecuada de márgenes (20 px) y distribución balanceada. | [x] Sin desbordamiento horizontal ni objetivos táctiles menores de 44 px. |
| **1024 × 900 px** | Tablet horizontal / Pantalla mediana | Convivencia armónica entre mapa y panel de resultados sin solapamiento. | [x] Resultados y detalle conservan composición y pila tipográfica nativa. |
| **1440 × 900 px** | Escritorio estándar | Ancho contenido de modales/tarjetas, sin estiramientos desmedidos. | [x] Shell contenido, sheet y navegación sin solapamientos. |

### 8.3 Criterios de Accesibilidad y Usabilidad en Navegador

- [x] **Sin scroll horizontal:** `documentElement` y `body` permanecen dentro del viewport en toda la matriz.
- [x] **Teclado:** El modal encierra/restaura foco y el mapa inactivo queda fuera de tabulación mediante `inert`.
- [x] **Contraste:** Ink 17.80:1, muted 5.79:1, brand strong 4.56:1 e icono coral 3.17:1 sobre blanco.
- [x] **Movimiento reducido:** Playwright activa `prefers-reduced-motion: reduce` y verifica transiciones `0s` en primitives visibles.
- [x] **Zoom 200%:** Prueba de reflujo a 720×450, equivalente al área CSS de 1440×900 al 200%, sin desbordamiento horizontal en Inicio ni resultados.

### 8.4 Evidencia de cierre (2026-10-15)

- Se sustituyó la dependencia remota de Material Symbols y las referencias residuales a Manrope por pila nativa e iconos SVG inline con `currentColor`.
- El contrato automatizado impide reintroducir Google Fonts, Manrope o `material-symbols-outlined`, y valida contraste AA del acento tipográfico.
- En 320×568 se corrigieron dos regresiones detectadas durante la auditoría: badge de disponibilidad fuera de la tarjeta y sheet de ruta bajo el encabezado fijo.
- La suite E2E separa el contrato legacy de Admin con datos controlados; el fixture público continúa rechazando `/api/locations`, por lo que el flujo público no puede volver a depender de ese endpoint.
- Antigravity redactó la primera versión de esta guía. Codex revisó el contenido, corrigió los contratos y realizó la implementación, TDD, auditoría visual y certificación final.

---

## 9. Fuentes de Verdad y Referencias Técnicas

1. `AGENTS.md`: Reglas generales de gobernanza, flujo de ramas y colaboración entre agentes.
2. `tasks/specs/UI-REB-01-native-visual-foundation.md`: Especificación técnica aprobada del sistema visual nativo.
3. `frontend/src/styles/native-tokens.css`: Definición oficial de tokens semánticos y aliases compatibles.
4. `frontend/src/styles/native-primitives.css`: Estilos visuales de los primitives de interfaz.
5. `frontend/src/app/shared/ui/ui-primitives.ts`: Contratos TypeScript y directivas Angular standalone.
6. `frontend/css-color-contract.json`: Lista auditada de colores permitidos en la aplicación.

> [!NOTE]
> **Aclaración sobre la dirección anterior:** El documento `docs/UI_REDESIGN_DIRECTION.md` representó una exploración inicial que contemplaba la tipografía descargable *Manrope*. La especificación autoritativa actual (`UI-REB-01`) **sustituye definitivamente Manrope** por la pila nativa del sistema (`-apple-system`, `BlinkMacSystemFont`, etc.) y tokens `--si-*` para maximizar rendimiento y velocidad de carga sin descargas de red. No debe utilizarse Manrope en nuevas implementaciones.
