# Plan escalonado de skills para las superficies públicas de empresa

Estado: aprobado como marco escalonado el 28 de octubre de 2026. Este documento
organiza revisiones y gates; no autoriza por sí solo instalación de
dependencias, integración ni despliegue.

## Autoridad y compatibilidad

El orden de precedencia es:

1. `AGENTS.md` y requisitos explícitos aprobados;
2. `docs/UI_REDESIGN_DIRECTION.md` y `docs/DEFINITION_OF_DONE.md`;
3. la especificación particular de cada módulo;
4. los skills seleccionados como técnicas de auditoría o implementación.

Un skill no introduce por sí solo una librería, un patrón visual o una decisión
de producto. Se reutilizan Angular 21, CSS, tokens, componentes e iconos
existentes. Toda dependencia nueva requiere aprobación separada.

## Skills seleccionados

### `improve-ui`

Se usa para auditar una superficie que ya existe y tiene una ruta de runtime
demostrable. Su trabajo es de solo
lectura sobre producto y sus planes viven en `design-plans/`. Cada auditoría se
limita a una familia coherente de pantallas, demuestra contrato, ruta de runtime
y corrección, y devuelve como máximo tres hallazgos verificables.

### `fixing-accessibility`

Se usa al diseñar y revisar controles interactivos: búsqueda, enlaces sociales,
tabs, filtros, diálogos, lista/mapa y estados asíncronos. Prioriza HTML nativo,
nombres accesibles, teclado, foco, anuncios y contraste. No se añade ARIA cuando
la semántica nativa ya resuelve el caso.

### `apple-design`

Se usa únicamente cuando exista manipulación directa o movimiento con propósito:
paneles, cambio lista/mapa, galería o transiciones reversibles. El gesto debe ser
interrumpible, seguir el puntero, conservar continuidad espacial y ofrecer una
alternativa con `prefers-reduced-motion`. No justifica vidrio, rebote o animación
decorativa, y no reemplaza los tokens ni los tiempos documentados de SiVoy.

### Ingeniería, seguridad y cierre

- `frontend-ui-engineering` aporta criterios framework-neutral de composición,
  estados, responsive y calidad. Sus ejemplos React/TSX, hooks, React Query y
  Tailwind no se trasladan; la implementación sigue las convenciones Angular 21
  y CSS existentes y la documentación oficial del framework.
- `security-audit` revisa en modo focalizado cada frontera nueva. La auditoría
  integral se ejecuta como trabajo separado antes del lanzamiento productivo.
- `requesting-code-review` exige revisión independiente al cerrar cada módulo y
  antes de integrar, con requisitos y rango de commits precisos.
- `verification-before-completion` exige volver a ejecutar los gates del estado
  candidato antes de declarar una tarea completa.

## Skills no seleccionados ahora

- `baseline-ui` no se aplica: sus requisitos obligatorios de React, Tailwind,
  `motion/react` y `cn` son incompatibles con el stack Angular/CSS vigente.
- `create-design-md` no se usa mientras
  `docs/UI_REDESIGN_DIRECTION.md` sea la fuente visual vigente; crear otra
  autoridad duplicaría decisiones.
- `component-canvas` y `create-canvas` quedan disponibles para exploración
  aislada, no como dependencia ni como paso obligatorio de producción.
- `fixing-metadata` se evaluará solo si el perfil obtiene URLs públicas
  indexables y previews sociales como requisito aprobado.

## Aplicación por etapa

| Etapa | Skills | Resultado exigido |
|---|---|---|
| `public-company-data` | `security-audit`, `requesting-code-review`, `verification-before-completion` | API pública acotada, contenido persistido tratado como no confiable y gates backend frescos |
| `company-directory` | `frontend-ui-engineering`, `fixing-accessibility`; `improve-ui` solo para auditar la entrada pública existente o después del primer corte renderizable | Especificación desde la dirección visual vigente, búsqueda y estados vacíos/carga/error; auditoría basada en runtime cuando exista superficie |
| `company-point-browser` | `fixing-accessibility`, `apple-design`; `improve-ui` solo después del primer corte renderizable | Relación lista/mapa comprensible, controles con teclado y transiciones interrumpibles con reducción de movimiento |
| `company-profile` | `frontend-ui-engineering`, `fixing-accessibility`; `apple-design` si hay interacción física e `improve-ui` solo con runtime existente | Jerarquía de identidad, cobertura, enlaces y puntos; secciones opcionales omitidas sin huecos ni placeholders falsos |
| Flujo de consultas existente | plan independiente posterior | Revisión por superficie; no se mezcla con la entrega de perfiles públicos |

## Gates de cada módulo visual

1. **Auditoría:** identificar la ruta, documentación gobernante, tokens y
   componentes que realmente llegan a la superficie. No convertir preferencias
   genéricas del skill en hallazgos.
2. **Especificación:** fijar estados, copy, navegación, responsive, carga, vacío,
   error, accesibilidad, seguridad de enlaces y rollback antes de editar código.
3. **Implementación incremental:** cortes de máximo cinco archivos cuando se
   delegue; sin servicios, navegación o estado de negocio en encargos visuales.
4. **Validación:** probar 386×912 y después 768, 1024 y 1440 px cuando aplique;
   teclado, foco, contraste, hit areas, safe areas y reducción de movimiento.
5. **Gates frontend:** ejecutar desde `frontend/`:

   ```powershell
   npm run test:ci
   npm run build
   npm run check:boundaries
   npm run e2e
   ```

   `npm run e2e` es obligatorio cuando cambien navegación, accesibilidad o un
   flujo público.
6. **Revisión y evidencia:** Codex inspecciona el diff, solicita revisión
   independiente y repite los comandos pertinentes. El resumen de un agente no
   constituye evidencia suficiente.

## Criterios de experiencia transversales

- Cada pantalla responde dónde está la persona, qué puede hacer y cómo volver.
- Una acción primaria por zona; acciones secundarias se agrupan cerca del
  contenido que afectan.
- El buscador explica su alcance y ofrece estados de carga, vacío y error sin
  bloquear el resto de la vista.
- Redes y sitio web se distinguen como navegación externa y usan
  `rel="noopener noreferrer"`; texto administrado nunca se renderiza como HTML.
- Secciones sin contenido se omiten por completo y el layout no reserva huecos.
- Las animaciones comunican relación o estado, nunca compensan una jerarquía
  confusa ni retrasan la interacción.

## Condición para avanzar

Cada módulo empieza cuando sus dependencias del mapa tengan especificación
aprobada, gates verdes y revisión independiente sin hallazgos críticos o
importantes. `company-directory` y `company-point-browser` pueden avanzar en
paralelo después de `public-company-data`; `company-profile` espera a
`public-company-data` y `company-point-browser`, sus dependencias declaradas.
`company-directory` no es un bloqueo para el perfil. La promoción a `main` sigue
siendo un lanzamiento separado con su propio plan de rollback.
