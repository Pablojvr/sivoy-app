# Spec: `native-app-shell` (UI-REB-02)

## 1. Objective

Especificar la arquitectura, geometría y contratos del shell público nativo de SiVoy: canvas continuo, slots de contenido desacoplados, navegación inferior persistente (dock), soporte integral de safe areas, jerarquía estricta de capas (`z-index`) y overlays globales del sistema (banner de fallback de mapa y visor de imagen ampliada).

La persona usuaria objetivo utiliza SiVoy principalmente desde dispositivos móviles para encontrar y compartir puntos de envío y retiro logístico. El shell debe proporcionar una experiencia visual sólida y estable de aplicación nativa iOS/móvil:
- Canvas continuo que elimina el scroll global y previene rebotes o desbordamientos del navegador.
- Slots de contenido que aíslan el ciclo de vida de cada vista sin destruir el contexto en memoria.
- Barra de navegación inferior anclada con objetivos táctiles ergonómicos y estados de orientación claros.
- Contención visual y de layout que separa limpiamente el marco estructural de los módulos funcionales de búsqueda, resultados y detalle.

### Contratos y Preservación de Estado
- **Rutas y Parámetros:** Preserva exactamente las rutas `/`, `/enviar` y `/admin`, así como los parámetros de consulta `tab` y `vista`.
- **Lógica de Negocio y Servicios:** No altera el estado de negocio, el motor de cálculo ETA, los servicios de catálogo (`CatalogService`), la geolocalización del usuario (`UserGeolocationService`) ni los contratos HTTP.
- **Ciclo de Vida de MapLibre:** Preserva intacta la inicialización, eventos, adaptadores y gestión de ciclo de vida del mapa (`MapPort`, `MapLibreMapAdapter`, `MapLifecycleManager`). El mapa continúa disponible como recurso subordinado bajo demanda (`[mapResourceMode]="isMapResourceMode"`), sin convertirlo en paso obligatorio.
- **Separación de Responsabilidades:** El shell solo define el contenedor y los slots; no implementa lógica de autocompletado, sugerencias de destino, filtrado de agencias, renderizado de tarjetas de resultados ni continuación de envío (responsabilidades asignadas a `destination-discovery` [UI-REB-03], `point-results` [UI-REB-04], `point-detail` [UI-REB-05] y `shipment-continuation` [UI-REB-06]).
- **Fuera de Alcance (Non-goals):** El módulo de Partner, inicio de sesión corporativo, registro empresarial y cualquier cambio en backend Express o base de datos PostgreSQL permanecen fuera de alcance.

---

## 2. Approved Product Assumptions

1. **Web App Responsive Nativa:** SiVoy continúa como aplicación web responsive con calidad de interacción nativa (canvas fijo, touch targets >= 44 × 44 px, safe areas).
2. **Mapa como Recurso Secundario:** El mapa interactivo permanece subordinado a la ficha de punto o consulta bajo demanda; la búsqueda tabular es la ruta primaria.
3. **Inmutabilidad de URLs Públicas:** Se mantienen estrictamente las rutas `/` (Inicio), `/enviar?tab=perfil` (Perfil) y `/admin` (Panel), asegurando compatibilidad con enlaces compartidos.
4. **Partner Fuera de Alcance:** No se tocan vistas, estilos ni lógica relacionados con Partner o administración corporativa.
5. **Cero Dependencias Adicionales:** No se añaden librerías externas de UI, fuentes web remotas ni paquetes de iconos.
6. **Extracción Gradual de CSS:** La migración de estilos desde `frontend/src/app/app.css` hacia hojas modulares dedicadas se realiza de manera incremental, preservando selectores compatibles para no alterar pantallas no migradas.

---

## 3. Tech Stack y Comandos

- **Framework & Lenguaje:** Angular `21.2.x` (Standalone Components), TypeScript `5.9.x`.
- **Componentes del Shell:**
  - `MobileAppComponent` (selector `app-mobile-layout`): Controlador del contenedor principal y orquestador de slots/overlays.
  - `BottomNavComponent` (selector `app-bottom-nav`): Barra de navegación inferior pública y accesible.
- **Sistema Visual:** Tokens semánticos `--si-*` de `frontend/src/styles/native-tokens.css` y primitivas de `frontend/src/styles/native-primitives.css`.
- **Herramientas de Calidad:** Vitest vía Angular Test Runner (`npm run test:ci`), Playwright para E2E (`npm run e2e`), verificador de colores (`npm run check:css-colors`) y verificador de fronteras arquitectónicas (`npm run check:boundaries`).

### Comandos de Validación
```powershell
# Desarrollo local
cd frontend
npm start -- --host 127.0.0.1 --port 4303

# Verificación de contratos y arquitectura
npm run check:css-colors
npm run check:boundaries

# Verificación de pruebas unitarias y compilación
npm run test:ci
npm run build

# Verificación E2E de navegación pública y accesibilidad
npm run e2e
```

---

## 4. Project Structure e Incrementos de Archivos

Para garantizar reversibilidad, revisión atómica y cumplimiento estricto de la regla de gobernanza, cada incremento de implementación afectará como **máximo cinco archivos**.

### 4.1 Archivos Involucrados en el Módulo
```text
frontend/src/app/mobile-app.component.html
  Template del shell: define el canvas continuo, slots de contenido con atributo [hidden], slot de perfil, overlays globales y dock de navegación.

frontend/src/app/mobile-app.component.ts
  Controlador del shell: orquesta la resolución de pestañas públicas (resolveMainTab), gestión de fallback de mapa y previsualización de imagen sin mover lógica MapLibre ni catálogo.

frontend/src/app/mobile-app.component.css
  Nueva hoja de estilos del shell nativo: encapsula canvas, contención de layout, slots, banner de fallback y visor de imagen a pantalla completa.

frontend/src/app/shared/components/bottom-nav/bottom-nav.component.ts
  Componente standalone del dock de navegación: enlaza semánticamente '/', '/enviar?tab=perfil' y '/admin' con roles accesibles y estados activos.

frontend/src/app/shared/components/bottom-nav/bottom-nav.component.css
  Estilos del dock con tokens --si-*, soporte de safe areas, touch targets >= 44 px y foco visible accesible.

frontend/src/app/app.css
  Extracción progresiva y depuración de reglas del shell, conservando compatibilidad para pantallas legacy.
```

### 4.2 Plan de Incrementos (Slices) de Implementación
- **Incremento 1: Dock de Navegación Nativo (`app-bottom-nav`) (3 archivos)**
  - `frontend/src/app/shared/components/bottom-nav/bottom-nav.component.ts`
  - `frontend/src/app/shared/components/bottom-nav/bottom-nav.component.css`
  - `frontend/src/app/shared/components/bottom-nav/bottom-nav.component.spec.ts`
  - *Resultado:* Barra de navegación inferior migrada a tokens `--si-*`, touch targets certificados >= 44 × 44 px, soporte de `env(safe-area-inset-bottom)` y foco visible.
- **Incremento 2: Canvas Continuo, Slots y Overlays Globales (4 archivos)**
  - `frontend/src/app/mobile-app.component.html`
  - `frontend/src/app/mobile-app.component.ts`
  - `frontend/src/app/mobile-app.component.css` (nueva hoja de estilos)
  - `frontend/src/app/mobile-app.component.spec.ts`
  - *Resultado:* Contención `100dvh`, slots desacoplados con preservación de WebGL vía `[hidden]`, banner de fallback accesible (`role="status"`) y visor de imagen con tecla `Escape`.
- **Incremento 3: Desacople y Limpieza Gradual de CSS (2 archivos)**
  - `frontend/src/app/app.css`
  - `frontend/css-color-contract.json` (auditoría de no-regresión de colores)
  - *Resultado:* Eliminación de reglas duplicadas en `app.css` garantizando cero regresiones visuales.

---

## 5. Arquitectura del Shell Nativo

### 5.1 Canvas Continuo (Application Canvas)
- **Fondo:** Aplica `--si-color-canvas` (`#F4F4F1`) de forma uniforme y continua en toda la superficie.
- **Contención de Viewport:**
  - Alto: `100dvh` con fallback a `100vh` para navegadores antiguos.
  - Ancho: `100%`.
  - Desbordamiento: `overflow: hidden; position: relative;`.
  - **Regla de contención:** La raíz del documento (`html`, `body`, `app-root`) no produce scroll bajo ninguna circunstancia. El scroll se confina exclusivamente a los contenedores internos de cada vista activa o panel desplegable.
  - Previene saltos de layout causados por la barra de navegación dinámica de iOS Safari o Chrome en Android.

### 5.2 Slots de Contenido (Content Slots)
El shell desacopla el marco de navegación de las vistas funcionales mediante dos slots coordinados por la propiedad de estado `activeMainTab: 'inicio' | 'perfil'`:

1. **Slot Inicio (`.si-shell-slot--inicio` / `.inicio-tab-content`):**
   - Aloja el componente `<app-home>` con sus enlaces de entrada vigentes:
     `[mapAvailable]`, `[catalogMode]="true"`, `[locations]`, `[userLocation]`, `[initialIntent]`, `[selectedPin]`, `[highlightedRoute]`, `[mapResourceMode]="isMapResourceMode"`.
   - **Regla Crítica de Preservación de Memoria:** Se gestiona mediante el binding `[hidden]="activeMainTab !== 'inicio'"`. **Queda prohibido sustituirlo por `*ngIf`**. Esto garantiza que el contexto WebGL de MapLibre, los marcadores activos y el árbol DOM del buscador no se destruyan ni requieran re-inicialización al alternar entre pestañas.
   - Aplica contención de layout `width: 100%; height: 100%; display: flex; flex-direction: column;`.
2. **Slot Perfil (`.si-shell-slot--perfil`):**
   - Aloja `<app-perfil>` condicionado a `*ngIf="activeMainTab === 'perfil'"`.
   - Se despliega sobre el canvas con scroll vertical independiente y reserva de espacio inferior para la navegación.
3. **Límite Funcional:** El shell no administra estados de búsqueda, ni conoce el catálogo de agencias, ni interactúa directamente con los resultados de envíos.

### 5.3 Navegación Inferior Persistente (Dock / Bottom Navigation)
La barra de navegación fija proporciona una orientación inmediata y constante para la aplicación pública:

- **Geometría y Posicionamiento:**
  - Anclaje: `position: fixed; bottom: 0; left: 0; right: 0;`.
  - Pista centrada: `width: min(100%, 460px); margin: 0 auto;`.
  - Superficie translúcida: `background: color-mix(in srgb, var(--si-color-surface) 96%, transparent); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);`.
  - Delimitación: `border-top: 1px solid var(--si-color-border)`.
  - Elevación: Sombra superior sutil `0 -8px 24px rgba(23, 24, 23, 0.05)`.
  - Altura base: `72px`; Altura efectiva: `calc(72px + var(--si-safe-area-bottom))`.
- **Destinos y Contratos de Enlace:**
  1. **Panel:**
     - Enlace: `routerLink="/admin"`.
     - Estado activo: `activeTab === 'puntos'`.
     - Icono: SVG lista/panel de 22 × 22 px (`viewBox="0 0 24 24"`, trazo 2.0).
     - Etiqueta: "Panel" (11 px, font-weight 700).
     - Atributo accesible: `[attr.aria-current]="activeTab === 'puntos' ? 'page' : null"`.
  2. **Inicio (Botón Prominente Central):**
     - Enlace: `routerLink="/"`.
     - Estado activo: `activeTab === 'inicio'`.
     - Geometría destacada: Botón circular de 52 × 52 px con elevación superior (-16 px respecto a la línea base), borde exterior de 4 px `--si-color-surface` y sombra de elevación `--si-shadow-level-2`.
     - Fondo: `--si-color-ink` en reposo; `--si-color-brand` (`#F45B78`) cuando está seleccionado.
     - Icono: SVG casa de 22 × 22 px en color blanco.
     - Etiqueta: "Inicio" (11 px, font-weight 700).
     - Atributo accesible: `[attr.aria-current]="activeTab === 'inicio' ? 'page' : null"`.
  3. **Perfil:**
     - Enlace: `routerLink="/enviar" [queryParams]="{ tab: 'perfil' }"`.
     - Estado activo: `activeTab === 'perfil'`.
     - Icono: SVG usuario/perfil de 22 × 22 px (`viewBox="0 0 24 24"`, trazo 2.0).
     - Etiqueta: "Perfil" (11 px, font-weight 700).
     - Atributo accesible: `[attr.aria-current]="activeTab === 'perfil' ? 'page' : null"`.
- **Ergonomía Táctil y Accesibilidad:**
  - Contenedor con `aria-label="Navegación principal"`.
  - Touch targets certificados de al menos **44 × 44 px** para cada elemento interactivo (pista de ítem con altura de 60 px).
  - Separación entre controles táctiles superior a 8 px.
  - Foco visible: `:focus-visible` aplica `--si-focus-ring` (`0 0 0 4px rgba(244, 91, 120, 0.22)`) con radio `--si-radius-control`.
  - Contraste: Texto e iconos inactivos en `--si-color-ink-muted` (contraste >= 5.79:1 sobre blanco); activos en `--si-color-brand-strong` o contenedor con texto blanco (>= 4.5:1).

### 5.4 Soporte Riguroso de Safe Areas
Las zonas de exclusión física de dispositivos móviles (notches, Dynamic Island, barras de inicio inferiores) se gestionan mediante tokens estandarizados:
- `--si-safe-area-top: env(safe-area-inset-top, 0px);`
- `--si-safe-area-bottom: env(safe-area-inset-bottom, 0px);`

#### Reglas de Compensación en el Shell:
1. **Margen Superior para Banners y Modales:** `top: max(var(--si-space-4), var(--si-safe-area-top));`.
2. **Padding Inferior del Dock:** `padding-bottom: var(--si-safe-area-bottom); min-height: calc(72px + var(--si-safe-area-bottom));`.
3. **Resguardo Inferior Único:** El shell expone `--si-shell-content-inset-bottom: calc(88px + var(--si-safe-area-bottom))`. Los slots aplican ese inset en su propia composición; los módulos posteriores pueden consumirlo sin duplicar alturas ni obligar a modificar todas las vistas hijas en este corte.

### 5.5 Jerarquía de Capas (Layering / Z-Index Elevation Matrix)
Para evitar conflictos de apilamiento visual, solapamientos incontrolados o elementos flotantes que compitan con diálogos, el shell instituye la siguiente matriz oficial de capas `z-index`:

| Nivel de Capa | Rango `z-index` | Elementos del Shell Asignados | Propósito e Interacción |
|---|---|---|---|
| **Lienzo Base** | `0` – `1` | Contenedor del mapa WebGL (`.map-container`), canvas mineral continuo. | Fondo visual. Interactivo únicamente cuando el mapa está en modo recurso explícito. |
| **Slots de Contenido** | `10` | `.inicio-tab-content`, `<app-perfil>`, vistas enrutadas. | Superficie activa de contenido y scroll primario de la aplicación. |
| **Controles Flotantes** | `100` | Botones de recentrado GPS, toggle de mapa, chips compactos sobre mapa. | Interactivos, contenidos estrictamente dentro de la vista activa. |
| **Sheets y Paneles** | `1000` | Bottom sheet de resultados (`siSheet`), paneles de búsqueda expandidos. | Elevación `--si-shadow-sheet`, asa táctil superior, se despliegan sobre el mapa y contenido. |
| **Avisos del Sistema** | `2000` | `.map-fallback-banner`, notificaciones de estado y conectividad. | Fijos flotantes sobre la lista y por encima del nivel de sheets, pero bajo el dock. |
| **Dock de Navegación** | `3000` | `app-bottom-nav` (`.persistent-bottom-nav`). | Persistente sobre el contenido y los sheets; siempre accesible en la base del viewport. |
| **Diálogos Modales** | `5000` | `dialog[siModal]`, confirmaciones críticas del flujo. | Modal centrado con backdrop oscuro (`rgba(23, 24, 23, 0.4)`), atrapa foco del teclado. |
| **Overlays Globales** | `9000` | `.image-preview-overlay` (visor de fotos de sucursal a pantalla completa). | Cobertura total de pantalla (`100dvh`), desenfoque profundo, prioridad absoluta de visualización. |

### 5.6 Overlays Globales del Shell

#### 5.6.1 Banner de Fallback del Mapa (`.map-fallback-banner`)
- **Propósito:** Notificar con cortesía a la persona usuaria cuando el mapa interactivo no es compatible con el dispositivo o navegador, confirmando que puede continuar su operación mediante la lista de resultados.
- **Activación:** Se muestra si `mapFallbackVisible === true`.
- **Contratos Accesibles:**
  - Contenedor con `role="status"` y `aria-live="polite"`.
  - Encabezado: "Mapa no disponible" (`font: var(--si-type-card); color: var(--si-color-ink); font-weight: 700`).
  - Descripción: "Puedes seguir buscando y compartiendo puntos desde la lista." (`font: var(--si-type-meta); color: var(--si-color-ink-muted)`).
  - Botón de cierre: Icono de aspa (`×`), `aria-label="Cerrar aviso de mapa"`, touch target de 44 × 44 px, `:focus-visible` con `--si-focus-ring`.
- **Posicionamiento:**
  - `position: fixed;`
  - `bottom: calc(84px + var(--si-safe-area-bottom));` (flotando inmediatamente sobre la barra de navegación sin tocarla ni ocultar sus iconos).
  - `left: max(var(--si-space-4), env(safe-area-inset-left)); right: max(var(--si-space-4), env(safe-area-inset-right));`
  - Ancho máximo contenido: `max-width: 460px; margin: 0 auto;`.
- **Estilos:**
  - Fondo: `--si-color-surface` (`#FFFFFF`).
  - Borde: `1px solid var(--si-color-border)`.
  - Radio: `--si-radius-content` (`16px`).
  - Sombra: `--si-shadow-level-2`.

#### 5.6.2 Visor de Imagen en Pantalla Completa (`.image-preview-overlay`)
- **Propósito:** Proporcionar una vista detallada de la fachada o punto de retiro cuando la persona usuaria pulsa una fotografía en la ficha de detalle.
- **Activación:** Se muestra si `fullScreenImage !== null`.
- **Contratos Accesibles e Interacción:**
  - Contenedor modal con `role="dialog"`, `aria-modal="true"`, `aria-label="Vista previa de imagen ampliada"`.
  - Métodos de cierre garantizados:
    1. Clic en el botón de cierre superior.
    2. Clic en el área oscura de fondo (backdrop).
    3. Presión de la tecla `Escape` mediante listener de teclado en el componente.
  - Botón de cierre:
    - Ubicado en `top: max(var(--si-space-5), var(--si-safe-area-top)); right: max(var(--si-space-5), env(safe-area-inset-right));`.
    - Dimensiones mínimas de 44 × 44 px.
    - Contenedor circular translúcido con alto contraste y foco visible.
  - Imagen contenida:
    - `max-width: 90vw; max-height: 80dvh; object-fit: contain;`.
    - Radio de esquinas `--si-radius-content` (`16px`).
    - Sombra de alto contraste.
- **Safe Area Inferior:**
  - Padding inferior de protección: `padding-bottom: calc(72px + var(--si-safe-area-bottom))` para evitar colisiones con gestos del sistema.

---

## 6. Code Style y Ejemplos de Tokens (`--si-*`)

Todo estilo nuevo o migrado debe emplear estrictamente tokens semánticos aprobados en `native-tokens.css`. Quedan vetados los estilos inline, los valores de color literales y el uso de `!important` (con la única excepción de contención estricta para atributos utilitarios preexistentes `[hidden]`).

### 6.1 Hoja de Estilos del Shell (`mobile-app.component.css`)
```css
/* ==========================================================================
   SiVoy Native App Shell - Estilos Estructurales
   ========================================================================== */

:host {
  display: block;
  width: 100%;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  background-color: var(--si-color-canvas);
  color: var(--si-color-ink);
  font-family: var(--si-font-text);
}

.si-shell-canvas {
  --si-shell-content-inset-bottom: calc(88px + var(--si-safe-area-bottom));
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Slots de Contenido */
.si-shell-slot {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  z-index: 10;
}

.si-shell-slot[hidden] {
  display: none !important;
}

.si-shell-slot--perfil {
  background-color: var(--si-color-canvas);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-bottom: var(--si-shell-content-inset-bottom);
}

/* Banner de Fallback del Mapa */
.si-map-fallback-banner {
  position: fixed;
  bottom: calc(84px + var(--si-safe-area-bottom));
  left: max(var(--si-space-4), env(safe-area-inset-left));
  right: max(var(--si-space-4), env(safe-area-inset-right));
  margin: 0 auto;
  max-width: 460px;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--si-space-3);
  padding: var(--si-space-3) var(--si-space-4);
  background-color: var(--si-color-surface);
  border: 1px solid var(--si-color-border);
  border-radius: var(--si-radius-content);
  box-shadow: var(--si-shadow-level-2);
}

.si-map-fallback-content strong {
  display: block;
  font: var(--si-type-card);
  color: var(--si-color-ink);
}

.si-map-fallback-content p {
  margin: var(--si-space-1) 0 0;
  font: var(--si-type-meta);
  color: var(--si-color-ink-muted);
}

.si-map-fallback-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--si-radius-round);
  color: var(--si-color-ink-muted);
  cursor: pointer;
  transition: color var(--si-motion-feedback) var(--si-ease-native),
              background-color var(--si-motion-feedback) var(--si-ease-native);
}

.si-map-fallback-close:hover {
  background-color: var(--si-color-brand-soft);
  color: var(--si-color-brand-strong);
}

.si-map-fallback-close:focus-visible {
  outline: none;
  box-shadow: var(--si-focus-ring);
}

/* Visor de Imagen a Pantalla Completa */
.si-image-preview-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  background: color-mix(in srgb, var(--si-color-ink) 85%, transparent);
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--si-space-4);
  padding-bottom: calc(72px + var(--si-safe-area-bottom));
  box-sizing: border-box;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.si-image-preview-close {
  position: absolute;
  top: max(var(--si-space-5), var(--si-safe-area-top));
  right: max(var(--si-space-5), env(safe-area-inset-right));
  width: 44px;
  height: 44px;
  min-width: 44px;
  min-height: 44px;
  border-radius: var(--si-radius-round);
  background: color-mix(in srgb, var(--si-color-surface) 20%, transparent);
  border: none;
  color: var(--si-color-surface);
  font-size: 1.5rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 9001;
  transition: background-color var(--si-motion-feedback) var(--si-ease-native);
}

.si-image-preview-close:hover {
  background: color-mix(in srgb, var(--si-color-surface) 35%, transparent);
}

.si-image-preview-close:focus-visible {
  outline: none;
  box-shadow: var(--si-focus-ring);
}

.si-image-preview-img {
  max-width: 90%;
  max-height: 85%;
  border-radius: var(--si-radius-content);
  object-fit: contain;
  box-shadow: var(--si-shadow-level-2);
}

@media (prefers-reduced-motion: reduce) {
  .si-map-fallback-close,
  .si-image-preview-close {
    transition: none;
  }
}
```

### 6.2 Hoja de Estilos del Dock (`bottom-nav.component.css`)
```css
/* ==========================================================================
   SiVoy Bottom Navigation Dock - Estilos Nativos
   ========================================================================== */

:host {
  position: relative;
  z-index: 3000;
}

.persistent-bottom-nav {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 3000;
  min-height: calc(72px + var(--si-safe-area-bottom));
  padding: 0 var(--si-space-3) var(--si-safe-area-bottom);
  border-top: 1px solid var(--si-color-border);
  background: color-mix(in srgb, var(--si-color-surface) 96%, transparent);
  box-shadow: 0 -8px 24px rgba(23, 24, 23, 0.05);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.persistent-nav-track {
  width: min(100%, 460px);
  height: 72px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: end;
  margin: 0 auto;
}

.nav-item {
  position: relative;
  min-width: 44px;
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: var(--si-space-1);
  padding: var(--si-space-1) var(--si-space-2);
  border: 0;
  background: transparent;
  color: var(--si-color-ink-muted);
  font: var(--si-type-meta);
  font-weight: 700;
  text-decoration: none;
  cursor: pointer;
  transition: color var(--si-motion-feedback) var(--si-ease-native);
}

.nav-item:hover {
  color: var(--si-color-ink);
}

.nav-item:focus-visible {
  outline: none;
  box-shadow: var(--si-focus-ring);
  border-radius: var(--si-radius-control);
}

.nav-item.active:not(.nav-home) {
  color: var(--si-color-brand-strong);
}

.nav-item.active:not(.nav-home)::after {
  position: absolute;
  right: 28%;
  bottom: var(--si-space-1);
  left: 28%;
  height: 3px;
  border-radius: var(--si-radius-round);
  background: var(--si-color-brand);
  content: '';
}

.nav-icon {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
}

.nav-icon svg {
  width: 22px;
  height: 22px;
}

/* Botón Central Home */
.nav-home {
  min-height: 78px;
  align-self: end;
  padding-top: 0;
  color: var(--si-color-ink);
}

.nav-home .nav-icon {
  width: 52px;
  height: 52px;
  margin-top: -16px;
  border: 4px solid var(--si-color-surface);
  border-radius: var(--si-radius-round);
  background: var(--si-color-ink);
  color: var(--si-color-surface);
  box-shadow: var(--si-shadow-level-2);
  transition: background-color var(--si-motion-feedback) var(--si-ease-native),
              box-shadow var(--si-motion-feedback) var(--si-ease-native);
}

.nav-home.active .nav-icon {
  background: var(--si-color-brand);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--si-color-brand) 30%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .persistent-bottom-nav .nav-item,
  .persistent-bottom-nav .nav-home .nav-icon {
    transition: none;
  }
}
```

---

## 7. Testing Strategy

La estrategia de pruebas combina validaciones automáticas de contratos y arquitectura, pruebas unitarias de componentes, suite E2E de flujos públicos y certificación visual en navegador sobre la matriz de viewports obligatoria.

### 7.1 Pruebas Automatizadas

1. **Auditoría de Contratos y Límites (`npm run check:*`):**
   - `npm run check:css-colors`: Certifica que las hojas de estilos nuevas y modificadas no introduzcan colores `#...` o `rgb(...)` literales fuera de los autorizados en `frontend/css-color-contract.json`.
   - `npm run check:boundaries`: Certifica que el baseline arquitectónico de 53 archivos se mantenga sin violaciones ni excepciones.
2. **Pruebas Unitarias de Componentes (`npm run test:ci`):**
   - `MobileAppComponent` (`mobile-app.component.spec.ts`):
     - Verifica que el contenedor raíz renderice el canvas con alto `100dvh` y `overflow: hidden`.
     - Verifica que `<app-home>` reciba `[hidden]="activeMainTab !== 'inicio'"` y conserve sus inputs y eventos intactos.
     - Verifica que el slot `<app-perfil>` se muestre exclusivamente cuando `activeMainTab === 'perfil'`.
     - Verifica que al activar `mapFallbackVisible = true`, el banner contenga `role="status"` y su botón de cierre mida al menos 44 × 44 px.
     - Verifica que al recibir un evento de imagen, se monte el overlay modal con `role="dialog"`, `aria-modal="true"` y se cierre correctamente al pulsar `Escape` o el botón de cierre.
   - `BottomNavComponent` (`bottom-nav.component.spec.ts`):
     - Valida la existencia de los tres enlaces públicos: `/admin`, `/`, y `/enviar?tab=perfil`.
     - Valida la aplicación dinámica de la clase `.active` y el atributo `aria-current="page"` según el `@Input() activeTab`.
     - Valida que cada enlace interactivo cumpla con `min-height: 44px` y `min-width: 44px`.
3. **Pruebas de Flujo E2E (`npm run e2e`):**
   - Confirma la navegación fluida entre Inicio y Perfil sin recargas de página completas.
   - Confirma que la barra de direcciones actualice fielmente los query params (`/enviar?tab=perfil`).
   - Verifica que el ancho del documento no exceda el viewport (`scrollWidth === clientWidth`) en ningún paso del flujo.

### 7.2 Matriz de Viewports Obligatorios (Auditoría Manual y Navegador)

Codex auditará visualmente el shell en los siguientes cinco viewports antes de aprobar e integrar el incremento:

| Viewport | Dispositivo de Referencia | Criterios de Aceptación Visual del Shell |
|---|---|---|
| **320 × 568 px** | Móvil ultra compacto (iPhone SE 1st gen) | Cero scroll horizontal (`width: 320px`); la barra de navegación distribuye sus 3 ítems sin superposición ni truncamiento destructivo; el banner de fallback y el visor de imágenes caben holgadamente; touch targets >= 44 × 44 px. |
| **386 × 912 px** | Móvil estándar de referencia (Android moderno) | Safe areas superior e inferior aplicadas correctamente; el botón central Home sobresale con elevación armónica; el slot activo hace scroll sin solapar el dock. |
| **768 × 1024 px** | Tablet vertical (iPad) | Márgenes laterales adaptados a 20 px (`--si-space-5`); el dock inferior acota su ancho a `460px` y se centra en la base de la pantalla; sin desbordamiento. |
| **1024 × 900 px** | Tablet horizontal / Pantalla mediana | Convivencia limpia entre el canvas, los slots y el mapa subordinado; el dock permanece accesible sin invadir los paneles principales. |
| **1440 × 900 px** | Escritorio estándar | El canvas ocupa el 100% de la ventana; las vistas hijas se centran de acuerdo a su ancho máximo de contenido; el dock inferior permanece fijo y centrado; contraste verificado. |

### 7.3 Criterios de Accesibilidad en Navegador
- **Touch Targets:** Todo enlace, botón de cierre o control táctil expone un área de activación mínima de **44 × 44 px**.
- **Contraste WCAG AA:**
  - Texto estándar: al menos **4.5:1** contra el fondo (`#171817` y `#626760` sobre `#F4F4F1` y `#FFFFFF`).
  - Controles e iconos funcionales: al menos **3:1** contra su fondo inmediato.
- **Foco Visible:** Navegación por teclado exhibe `--si-focus-ring` sin desplazar el layout.
- **Movimiento Reducido:** Con `prefers-reduced-motion: reduce`, todas las transiciones del dock y overlays se desactivan (`transition: none`).
- **Zoom al 200%:** Aumento al 200% probado sin solapamiento destructivo entre el dock y el contenido, y sin scroll horizontal en el canvas.

---

## 8. Boundaries (Límites de Implementación)

### 8.1 Always do (Obligatorio)
- Preservar exactamente las rutas (`/`, `/enviar`, `/admin`), parámetros (`tab`, `vista`) y contratos de Angular.
- Conservar los inputs, outputs y eventos de comunicación entre `MobileAppComponent` y `HomeComponent`.
- Utilizar `[hidden]` en el slot de Inicio para no destruir la instancia WebGL ni los marcadores de MapLibre al navegar a Perfil.
- Emplear exclusivamente tokens semánticos `--si-*` de `native-tokens.css`.
- Respetar el límite estricto de **máximo cinco archivos por incremento**.
- Garantizar safe areas (`--si-safe-area-top`, `--si-safe-area-bottom`) en elementos fijados.
- Garantizar objetivos táctiles mínimos de 44 × 44 px con separación de al menos 8 px.

### 8.2 Ask first (Consultar previamente)
- Añadir o eliminar destinos de la barra de navegación inferior.
- Modificar la función `resolveMainTab` o admitir pestañas no planificadas.
- Alterar la estructura de URLs o añadir nuevos query params.
- Añadir métodos de cierre distintos de botón, backdrop y tecla `Escape`, o modificar las proporciones aprobadas del visor de imágenes ampliado.

### 8.3 Never do (Terminantemente prohibido)
- Mover o modificar la lógica de inicialización y eventos de MapLibre (`MapLibreMapAdapter`, `MapLifecycleManager`).
- Alterar servicios de negocio, catálogo (`CatalogService`), geolocalización o persistencia.
- Tocar o modificar el módulo Partner, login empresarial o registros comerciales.
- Tocar backend Express, esquemas PostgreSQL, migraciones o lógica ETA.
- Instalar dependencias nuevas, frameworks CSS externos (Tailwind, Bootstrap), fuentes web remotas (Google Fonts) o iconos rasterizados/emojis.
- Introducir `!important` arbitrarios o estilos inline (`style="..."`).
- Silenciar pruebas, checks de color o contratos de arquitectura para alcanzar el verde artificial.

---

## 9. Riesgos Técnicos y Estrategia de Mitigación

| Riesgo Técnico Identificado | Nivel de Impacto | Estrategia de Mitigación Planificada |
|---|---|---|
| **Destrucción accidental de la instancia WebGL de MapLibre:** Si el slot de inicio se conmuta con `*ngIf`, el canvas del mapa se desmonta y pierde memoria gráfica, generando parpadeos y retrasos de red al reabrir Inicio. | Alto | Regla contractual obligatoria: el slot de inicio se oculta mediante `[hidden]="activeMainTab !== 'inicio'"`, preservando el nodo DOM y los marcadores activos en memoria. |
| **Solapamiento del Dock fijo sobre acciones clave:** En pantallas pequeñas, el dock de 72px + safe area puede tapar los botones primarios o el último resultado de la lista. | Medio | El shell publica `--si-shell-content-inset-bottom` y lo aplica a sus slots; los módulos consumidores lo reutilizan sin redefinir alturas. |
| **Conflicto de capas (`z-index` fighting):** Diálogos, bottom sheets y overlays globales compitiendo por prioridad visual de apilamiento. | Alto | Institución de la Matriz Oficial de Capas (`0`, `10`, `100`, `1000`, `2000`, `3000`, `5000`, `9000`), prohibiendo valores `z-index` no normalizados. |
| **Regresiones de estilos al limpiar `app.css`:** Retirar reglas globales de un archivo de 4200 líneas puede afectar selectores secundarios inadvertidos. | Medio | Extracción gradual en 3 slices: primero crear hojas de componentes con clases canónicas; luego limpiar selectores obsoletos únicamente tras verificar con `rg` cero consumidores. |

---

## 10. Rollout y Rollback

### 10.1 Plan de Rollout Progresivo
1. **Slice 1 (Dock):** Migrar `bottom-nav.component.ts` y su CSS a tokens `--si-*`, safe areas y accesibilidad AA, validando con `bottom-nav.component.spec.ts`.
2. **Slice 2 (Canvas, Slots y Overlays):** Crear `mobile-app.component.css` y actualizar `mobile-app.component.html` con los slots desacoplados, contención `100dvh` y overlays accesibles.
3. **Slice 3 (Limpieza):** Depurar selectores obsoletos de `app.css` y verificar contratos con `npm run check:css-colors` y `npm run check:boundaries`.
4. **Validación Integral:** Ejecutar `npm run test:ci`, `npm run build` y `npm run e2e`, seguido de la auditoría en los cinco viewports.

### 10.2 Plan de Rollback
- Revertir exclusivamente los commits correspondientes al módulo `UI-REB-02` (`git revert <commits>`).
- Dado que el módulo no toca esquemas de base de datos, APIs de backend ni lógica de contratos HTTP, el rollback es puramente atómico a nivel de UI:
  - Restaura de inmediato las versiones previas de `mobile-app.component.html`, `mobile-app.component.ts`, `app.css` y `bottom-nav.component.*`.
  - Cero riesgo de datos corruptos, migraciones pendientes o inconsistencias en servidor.

---

## 11. Success Criteria (Criterios de Éxito)

- [ ] El canvas continuo (`--si-color-canvas`) ocupa `100dvh` con contención total y cero scroll global en `window` o `body`.
- [ ] Los slots de contenido separan limpiamente `inicio` de `perfil`, utilizando `[hidden]` en el slot de Inicio para preservar la memoria gráfica y marcadores de MapLibre.
- [ ] La barra de navegación inferior (`app-bottom-nav`) implementa touch targets mínimos de 44 × 44 px, safe areas (`--si-safe-area-bottom`) y contraste AA (>= 4.5:1 texto, >= 3:1 iconos).
- [ ] Las rutas `/`, `/enviar?tab=perfil` y `/admin` funcionan sin alteración alguna.
- [ ] La matriz oficial de elevación de capas (`z-index`) resuelve ordenadamente la superposición de canvas, slots, sheets, avisos, dock y overlays.
- [ ] Los overlays globales (`.map-fallback-banner` y `.image-preview-overlay`) son plenamente accesibles (`role="status"`, `role="dialog"`, soporte de tecla `Escape`, botones >= 44 px).
- [ ] No se traslada ni altera ninguna lógica de MapLibre, catálogo o geolocalización en `mobile-app.component.ts`.
- [ ] El módulo no altera ni contiene dependencias con el área de Partner.
- [ ] La implementación se divide en incrementos de máximo cinco archivos previstos por slice.
- [ ] Validación visual conforme en los cinco viewports canónicos: 320×568, 386×912, 768×1024, 1024×900 y 1440×900.
- [ ] Las suites automatizadas `check:css-colors`, `check:boundaries`, `test:ci`, `build` y `e2e` se mantienen verdes.

---

## 12. Open Questions (Preguntas Funcionales Abiertas)

No quedan preguntas funcionales abiertas. La arquitectura, tokens semánticos, contratos de navegación, safe areas y jerarquía de capas están completamente definidos y alineados con el mapa de capacidades `UI-REB-00` y la base visual `UI-REB-01`.
