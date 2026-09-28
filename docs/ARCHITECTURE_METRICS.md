# Comparativa de métricas de reestructuración arquitectónica

**Fecha de evaluación:** 2026-09-28<br>
**Commit evaluado (HEAD):** `6c5b147767be13ae5e0f13b339692b1fe79c731a`<br>
**Línea base de comparación:** Commit `471efc2` / Checkpoints A, C y tareas T01–T31 en `tasks/todo.md`

---

## 1. Alcance y delimitación

Este documento registra la comparación cuantitativa y cualitativa de la reestructuración arquitectónica del flujo público de SiVoy App contra la línea base establecida al inicio del proceso.

- **Alcance evaluado:**
  - Reducción y desacoplamiento del shell público (`MobileAppComponent`).
  - Extracción y carga diferida (lazy loading) del panel administrativo a su propia ruta (`/admin` / `AdminPageComponent`).
  - Modularización del catálogo CSS global (`app.css`) y eliminación de atributos `style="` inline.
  - Verificación de contratos, límites arquitectónicos (`core`/`shared`/`features`), tokens de diseño y estabilidad del backend.
- **Exclusión explícita:**
  - El módulo **Partner** (`PartnerComponent`, `src/app/features/partner/` y sus flujos asociados) está formalmente excluido de esta iniciativa y de la auditoría por instrucción explícita del usuario. No ha sido modificado ni auditado.
- **Entorno de ejecución y contexto de infraestructura local:**
  - La aplicación fue verificada en desarrollo local respondiendo HTTP 200 en `http://127.0.0.1:4303/#/`. Este resultado es exclusivamente evidencia de funcionamiento en el servidor local de desarrollo y **no constituye ni sustituye evidencia de despliegue en staging**.
  - Auditoría de contenedores locales: `wsl --status` reportó código de salida `50` (WSL no instalado); `docker version` reportó cliente `29.8.0` con `Server=null` (daemon no disponible en el host local).

---

## 2. Métricas estructurales y de código

| Métrica | Baseline | Actual (HEAD `6c5b147`) | Delta | Fuente / Comando reproducible |
| :--- | :--- | :--- | :--- | :--- |
| **Líneas físicas de `MobileAppComponent`** | 2,326 líneas (`471efc2`) | 825 líneas | -1,501 líneas (-64.53%) | Baseline: `$baseline = @(git show 471efc2:frontend/src/app/mobile-app.component.ts); $baseline.Count`<br>Actual: `(Get-Content frontend/src/app/mobile-app.component.ts).Count` |
| **Tamaño de CSS global (`app.css`)** | 107,084 bytes (`tasks/todo.md`) | 81,433 bytes | -25,651 bytes (-23.95%) | `(Get-Item frontend/src/app/app.css).Length` |
| **Atributos HTML `style="` (no-Partner)** | 139 atributos | 0 atributos | -139 (-100.0%) | `(rg -o 'style="' frontend/src/app -g '*.html' -g '!**/features/partner/**' \| Measure-Object).Count` |
| **Declaraciones `!important` en CSS productivo (no-Partner)** | 73 declaraciones | 67 declaraciones | -6 declaraciones (-8.22%) | `(rg -o '!important' frontend/src -g '*.css' -g '!**/features/partner/**' \| Measure-Object).Count` |
| **Bindings dinámicos de estilo (`[style.*]` / `[ngStyle]`)** | N/A (no categorizados en baseline) | 5 bindings dinámicos | 5 bindings delimitados | `(rg -o '\[style\.|\[ngStyle\]' frontend/src/app -g '*.html' -g '!**/features/partner/**' \| Measure-Object).Count` |

### Detalle de bindings dinámicos `[style.*]` / `[ngStyle]` (no-Partner)
Los 5 bindings dinámicos identificados en templates de producción no son atributos HTML literales `style="`, sino expresiones dinámicas calculadas por Angular necesarias para variables de arrastre o valores derivados de datos. No constituyen una regresión silenciosa:
1. `frontend/src/app/features/discovery/discovery-home.component.html`: `[style.--company-accent]="company.accent"`
2. `frontend/src/app/features/admin/admin.component.html`: `[style.backgroundImage]="viewingLocation.imagen_referencia ? ..."`
3. `frontend/src/app/features/admin/admin.component.html`: `[style.border-bottom]="last ? 'none' : '1px solid var(--border-color)'"`
4. `frontend/src/app/features/home/home.component.html`: `[style.--sheet-drag-offset]="sheetDragOffset + 'px'"`
5. `frontend/src/app/features/home/results/pin-detail-card.component.html`: `[style.backgroundImage]="heroImageUrl ? ..."`

---

## 3. Calidad automatizada y regresión

| Suite / Verificación | Baseline | Actual (HEAD `6c5b147`) | Estado | Comando reproducible |
| :--- | :--- | :--- | :--- | :--- |
| **Pruebas unitarias Frontend** | 271 pruebas (Checkpoint A) | 342 pruebas pasando (32 archivos) | Verde (100% pasando) | `npm --prefix frontend run test:ci` |
| **Pruebas E2E (Playwright multi-viewport)** | 16 pruebas (T05b1) | 36 pruebas pasando (36/36) | Verde (100% pasando) | `npm --prefix frontend run e2e` |
| **Límites arquitectónicos (Boundary Guard)** | 0 violaciones toleradas | 47 archivos evaluados, 0 violaciones, 0 excepciones | Verde | `npm --prefix frontend run check:boundaries` |
| **Contrato de colores y tokens CSS** | 0 violaciones toleradas | 11 archivos CSS evaluados, 0 violaciones | Verde | `npm --prefix frontend run check:css-colors` |
| **Pruebas Backend** | 322 pruebas (Checkpoint A) | 322 pruebas pasando (10 suites) | Verde (sin regresión, 0 delta) | `npm --prefix backend test` |
| **Compilación de producción (Frontend build)** | Build verde | Build verde (1 advertencia preexistente) | Verde | `npm --prefix frontend run build` |

### Notas de calidad automatizada:
- **Viewports E2E verificados:** 386×912 (móvil primario), 768×1024 (tablet portrait), 1024×768 (tablet landscape) y 1440×900 (escritorio).
- **Advertencias de compilación:** El build de producción emite una única advertencia conocida y preexistente referida al empaquetado CommonJS de `mapbox-gl`. No se introdujeron nuevas advertencias.

---

## 4. Presupuestos y tamaño de bundles (Bundle Size)

Métricas generadas por la compilación de producción (`npm run build` en `frontend/`):

| Chunk / Recurso | Tamaño Raw | Tamaño de Transferencia | Tipo de Carga |
| :--- | :--- | :--- | :--- |
| **Initial bundle** | 484.60 kB | 100.93 kB | Inicial sincrónico |
| **Lazy chunk `mobile-app`** | 240.56 kB | 46.56 kB | Diferida (on-demand) |
| **Lazy chunk `admin-page`** | 96.15 kB | 19.83 kB | Diferida (ruta `/admin`) |

La compilación de producción emite `admin-page` como chunk lazy separado fuera del shell inicial (T29).

---

## 5. Comandos de verificación reproducible

Los siguientes comandos permiten auditar y reproducir de forma determinista las cifras reportadas en este documento:

### Conteo estructural en PowerShell
```powershell
# 1. Líneas físicas de MobileAppComponent:
# Baseline (471efc2):
$baseline = @(git show 471efc2:frontend/src/app/mobile-app.component.ts); $baseline.Count
# Actual:
(Get-Content frontend/src/app/mobile-app.component.ts).Count

# 2. Tamaño en bytes del CSS global:
(Get-Item frontend/src/app/app.css).Length

# 3. Atributos HTML style=" en templates no-Partner:
(rg -o 'style="' frontend/src/app -g '*.html' -g '!**/features/partner/**' | Measure-Object).Count

# 4. Declaraciones !important en CSS productivo no-Partner (ocurrencias):
(rg -o '!important' frontend/src -g '*.css' -g '!**/features/partner/**' | Measure-Object).Count

# 5. Bindings dinámicos de estilo en templates no-Partner:
(rg -o '\[style\.|\[ngStyle\]' frontend/src/app -g '*.html' -g '!**/features/partner/**' | Measure-Object).Count
```

### Ejecución de pruebas y validación
```bash
# Pruebas unitarias de Frontend:
npm --prefix frontend run test:ci

# Verificación de límites de arquitectura:
npm --prefix frontend run check:boundaries

# Verificación de contrato de colores CSS:
npm --prefix frontend run check:css-colors

# Compilación de producción de Frontend:
npm --prefix frontend run build

# Pruebas E2E en múltiples viewports:
npm --prefix frontend run e2e

# Pruebas del Backend:
npm --prefix backend test
```

*Nota de seguridad:* Ninguno de estos comandos expone secretos, variables de entorno protegidas ni endpoints productivos.

---

## 6. Evidencia todavía pendiente

Aunque las dimensiones estáticas de código, CSS, pruebas unitarias y E2E locales muestran mejoras medibles respecto al baseline, la evaluación integral de la línea base arquitectónica **no está completa**. Los siguientes ítems críticos continúan pendientes:

1. **T35c — Validación de migraciones en PostgreSQL efímero e idempotencia:**
   - Aplicar 0001–0006 sobre PostgreSQL efímero limpio y ejecutar de nuevo sobre la MISMA base; la segunda ejecución debe ser no-op, sin mutar ledger/estado.
   - En el host local actual, WSL no está instalado (exit 50) y el daemon de Docker no se encuentra disponible (Server=null), por lo que no es posible levantar la base de datos efímera localmente sin infraestructura externa.
2. **T14 — Medición de consultas críticas con `EXPLAIN (ANALYZE, BUFFERS)`:**
   - Falta ejecutar y documentar el plan, tiempo real y uso de búferes de las consultas SQL críticas del flujo logístico frente a un volumen representativo de datos.
3. **T43 — Comparación paralela de ETA antiguo vs nuevo:**
   - Falta ejecutar en paralelo el cálculo del motor legacy frente al motor nuevo según el plan, limitándose a certificar la paridad de resultados y las diferencias registradas entre ambos motores.
4. **Telemetría y validación en Staging (latencia, tasa de error, throughput) y smoke/rollback T36:**
   - Falta desplegar en un entorno de staging real para medir percentiles de latencia (p95/p99), tasas de error HTTP y capacidad de throughput bajo concurrencia.
   - Falta ejecutar el smoke test de staging y el simulacro de rollback verificable según lo establecido en T36.
   - El código HTTP 200 verificado localmente en `http://127.0.0.1:4303/#/` no sustituye esta validación.
5. **Auditoría final de seguridad/dependencias y aprobación humana:**
   - Falta completar la auditoría integral final de dependencias y seguridad de la cadena de suministro sin hallazgos bloqueantes.
   - Falta la revisión y aprobación humana explícita previa a cualquier liberación a producción, tal como estipula la Definition of Done.

---

## 7. Conclusión y estado del checkpoint

El checkpoint **`- [ ] Métricas comparadas contra la línea base.`** en `tasks/todo.md` **NO puede cerrarse todavía**.

Si bien la evidencia estructural de frontend, desacoplamiento del shell, CSS global, contratos de calidad automatizada y empaquetado de producción ha quedado sólidamente establecida, las métricas de base de datos real (T35c, T14), paridad operativa del ETA (T43) y telemetría de staging (T36) permanecen pendientes. El ítem correspondiente debe mantenerse formalmente abierto en el checklist del proyecto.
