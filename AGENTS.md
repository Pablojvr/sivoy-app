# SiVoy App — reglas de colaboración con agentes

Estas reglas aplican a todo el repositorio. El objetivo es usar Codex como
orquestador y delegar trabajo acotado a Antigravity sin comprometer el motor ETA,
los datos ni cambios locales de otras personas.

## Contexto mínimo

- Frontend: Angular 21 en `frontend/`.
- Backend: Express y PostgreSQL en `backend/`.
- La lógica ETA y sus contratos son críticos.
- La dirección visual vigente está en `docs/UI_REDESIGN_DIRECTION.md`.
- Antes de editar, revisar `git status` y conservar todo cambio preexistente.

## Uso eficiente del contexto

- Buscar primero con `rg`; abrir únicamente los archivos y fragmentos necesarios.
- No copiar archivos completos al chat ni repetir el contexto del producto.
- Preferir cambios pequeños, verificables y fáciles de revertir.
- No reformatear archivos completos para resolver un cambio localizado.
- El informe de entrega debe limitarse a: archivos modificados, resultado,
  validaciones ejecutadas y bloqueos reales.

## Qué puede delegarse a Antigravity

Codex puede delegar una tarea cuando sea reversible, tenga criterios de aceptación
concretos y afecte como máximo tres archivos conocidos. Son candidatas:

- ajustes CSS/SCSS y tokens visuales;
- espaciado, tipografía, color, bordes, sombras y estados visuales;
- adaptación responsive y correcciones de superposición;
- cambios menores de marcado HTML exclusivamente presentacionales;
- revisión visual o identificación de selectores, sin modificar lógica.

Cada encargo debe indicar: objetivo, archivos permitidos, archivos prohibidos,
criterios de aceptación, tamaños de viewport y comando de validación. Antigravity
debe devolver un resumen breve y el resultado de las validaciones.

## Qué no se delega

- lógica ETA, SQL, migraciones, seeds o contratos HTTP;
- TypeScript con estado, navegación, servicios o modelos de dominio;
- dependencias, secretos, credenciales o configuración de producción;
- operaciones Git destructivas, commits, push, merge o despliegues;
- refactorizaciones transversales o cambios fuera de los archivos autorizados.

Si una tarea visual exige alguno de estos cambios, Antigravity debe detenerse y
explicar el bloqueo. Codex decide el siguiente paso y revisa siempre el diff.

## Contrato de ejecución para estilos

- Reutilizar tokens, componentes e iconos existentes; no crear una paleta paralela.
- Mantener contraste, foco visible, áreas táctiles y `prefers-reduced-motion`.
- Probar primero en 386×912 y luego en 768, 1024 y 1440 px cuando aplique.
- No ocultar contenido para corregir una superposición salvo que el flujo lo exija.
- No cambiar nombres de clases usados por TypeScript sin autorización explícita.
- Para frontend, validar al menos con `npm run build` desde `frontend/`.

## Flujo de revisión

1. Codex define y delimita el encargo.
2. Antigravity modifica solamente los archivos autorizados.
3. Codex inspecciona el diff y ejecuta la validación pertinente.
4. Solo Codex integra, publica o despliega, cuando el usuario lo haya solicitado.

