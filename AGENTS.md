# SiVoy App — reglas de colaboración con agentes

Estas reglas aplican a todo el repositorio. El objetivo es usar Codex como
orquestador y delegar trabajo acotado a Antigravity sin comprometer el motor ETA,
los datos ni cambios locales de otras personas.

## Contexto mínimo

- Frontend: Angular 21 en `frontend/`.
- Backend: Express y PostgreSQL en `backend/`.
- La lógica ETA y sus contratos son críticos.
- La dirección visual vigente está en `docs/UI_REDESIGN_DIRECTION.md`.
- La barra permanente de calidad está en `docs/DEFINITION_OF_DONE.md`.
- Antes de editar, revisar `git status` y conservar todo cambio preexistente.

## Flujo de ramas obligatorio

- `main` representa producción y debe permanecer desplegable. No se trabaja
  directamente sobre ella ni se usa como base para funcionalidades ordinarias.
- `develop` es la rama de integración y la base obligatoria para todo trabajo
  nuevo. Antes de crear una rama, actualizar referencias remotas y partir de
  `origin/develop`.
- Las ramas de trabajo usan el prefijo `codex/` y un nombre corto por objetivo;
  deben ser temporales, acotadas y auditables.
- Una rama terminada se integra primero en `develop` después de revisar el diff
  y ejecutar las validaciones aplicables. No se reescribe historia compartida ni
  se hace `force push`.
- La promoción `develop` -> `main` es un lanzamiento de producción: requiere
  solicitud explícita, gates completos y una estrategia de rollback. No se
  incluyen cambios adicionales durante esa promoción.
- Un hotfix urgente nace de `main`; después de publicarlo debe reintegrarse en
  `develop` para evitar divergencias.
- Si un worktree tiene cambios locales o conflictos, se preserva intacto y la
  integración se prepara en un worktree aislado.

## Uso eficiente del contexto

- Buscar primero con `rg`; abrir únicamente los archivos y fragmentos necesarios.
- No copiar archivos completos al chat ni repetir el contexto del producto.
- Preferir cambios pequeños, verificables y fáciles de revertir.
- No reformatear archivos completos para resolver un cambio localizado.
- El informe de entrega debe limitarse a: archivos modificados, resultado,
  validaciones ejecutadas y bloqueos reales.

## Skills de ingeniería

El paquete `addyosmani/agent-skills` está disponible para estructurar el ciclo de
trabajo. Se carga bajo demanda: no se deben abrir todos sus skills en cada tarea.

- Descubrimiento y selección: `using-agent-skills`.
- Requisitos grandes o ambiguos: `spec-driven-development`.
- Implementación en varias piezas: `incremental-implementation`.
- Cambios de interfaz: `frontend-ui-engineering`.
- Errores: `debugging-and-error-recovery`.
- Antes de integrar: `code-review-and-quality`.
- Antes de producción: `shipping-and-launch`.

Las reglas de este archivo y las instrucciones explícitas del usuario prevalecen
sobre cualquier recomendación genérica del paquete. Un skill nunca concede por sí
solo permiso para instalar dependencias, modificar Git o desplegar.

## Qué puede delegarse a Antigravity

Codex puede delegar una tarea cuando sea reversible, tenga criterios de aceptación
concretos y afecte como máximo cinco archivos conocidos. Si toca backend debe
existir un spec aprobado, pruebas focalizadas y una ruta de rollback. Son candidatas:

- ajustes CSS/SCSS y tokens visuales;
- espaciado, tipografía, color, bordes, sombras y estados visuales;
- adaptación responsive y correcciones de superposición;
- cambios menores de marcado HTML exclusivamente presentacionales;
- componentes y directivas TypeScript exclusivamente presentacionales, sin
  servicios, estado de negocio, navegación, RxJS ni efectos de infraestructura;
- revisión visual o identificación de selectores, sin modificar lógica;
- adopción de observabilidad ya especificada en servicios no críticos;
- refactors mecánicos de claridad que preserven comportamiento y contratos;
- pruebas unitarias o de caracterización sin acceso a red ni datos reales;
- documentación técnica y automatización de calidad que no cambie despliegues,
  dependencias ni secretos.

Cada encargo debe indicar: objetivo, archivos permitidos, archivos prohibidos,
criterios de aceptación, rollback y comandos de validación; para UI también debe
incluir tamaños de viewport. Antigravity debe devolver un resumen breve y el
resultado de las validaciones. Codex vuelve a ejecutar las pruebas relevantes y
no acepta como evidencia suficiente el resumen del agente.

## Qué no se delega

- lógica ETA, SQL, migraciones, seeds o cambios de contratos HTTP;
- TypeScript con estado de negocio, navegación, servicios o modelos de dominio;
- dependencias, secretos, credenciales o configuración de producción;
- operaciones Git destructivas, merge, releases o despliegues;
- refactorizaciones transversales o cambios fuera de los archivos autorizados;
- decisiones arquitectónicas nuevas no recogidas en un spec aprobado.

Si una tarea delegada exige alguno de estos cambios, Antigravity debe detenerse y
explicar el bloqueo. Codex decide el siguiente paso y revisa siempre el diff.

## Contrato de ejecución para estilos

- Reutilizar tokens, componentes e iconos existentes; no crear una paleta paralela.
- Mantener contraste, foco visible, áreas táctiles y `prefers-reduced-motion`.
- Probar primero en 386×912 y luego en 768, 1024 y 1440 px cuando aplique.
- No ocultar contenido para corregir una superposición salvo que el flujo lo exija.
- No cambiar nombres de clases usados por TypeScript sin autorización explícita.
- Para frontend, validar al menos con `npm run build` desde `frontend/`.
- Para backend, validar al menos con `npm test` desde `backend/`.

## Flujo de revisión

1. Codex define y delimita el encargo.
2. Antigravity modifica solamente los archivos autorizados.
3. Codex inspecciona el diff y ejecuta la validación pertinente.
4. Tras aprobación explícita de Codex, Antigravity puede preparar un commit
   atómico y hacer push de ese commit a la rama de trabajo indicada. No puede
   ampliar el diff, reescribir historia, hacer merge ni desplegar.
5. Codex verifica el commit y el remoto después del push. Solo Codex integra o
   despliega, cuando el usuario lo haya solicitado.
