# T05b — Catálogo sintético para smoke en navegador

## Objetivo y alcance

Habilitar en `http://127.0.0.1:4303/` el recorrido real de la SPA
destino→compartir→origen→ruta sin PostgreSQL local. El servidor de pruebas
responderá **solo** en loopback `localhost:3000`, que es la URL de API del
frontend de desarrollo. Sus puntos y ETA son inventados: no certifican
reglas de empresas ni paridad con producción. No se altera código productivo.

## Paquete delegado a Antigravity

- Archivos permitidos: `frontend/e2e/fixture-api.cjs` y
  `frontend/e2e/fixture-api.test.cjs` (máximo dos). Este spec y `tasks/todo.md`
  los mantiene Codex. Prohibido editar cualquier otro archivo.
- Usar únicamente `node:http`, `node:test` y módulos integrados; sin
  dependencias ni cambios a `package.json`, Angular, backend, SQL, Partner o
  configuración de producción.
- Respuestas mínimas legacy: `GET /api/locations` con dos puntos ficticios de
  la misma empresa en dos municipios; `POST /api/get-upcoming-routes` y
  `POST /api/search-flights` con formas compatibles con
  `frontend/src/app/core/services/route-api.contracts.ts`. Solo los nombres
  ficticios autorizados producen un resultado; otra búsqueda válida devuelve
  lista vacía. `GET /api/empresas` puede devolver la empresa ficticia para
  quitar el error de carga inicial. Places devuelve sugerencias vacías si
  la SPA lo consulta. No implementar un ETA falso como motor genérico.
- `OPTIONS` y CORS solo para `http://localhost:4303` y
  `http://127.0.0.1:4303`; escuchar en loopback, nunca en `0.0.0.0`.
  Desconocidos 404, JSON malformado 400 y método inesperado 405.

## Aceptación y verificación

1. `node --test frontend/e2e/fixture-api.test.cjs` pasa y demostró RED antes
   de implementar el servidor. Prueba catálogo, respuesta ETA punto-punto,
   vacío, CORS, JSON inválido y 404/405.
2. `npm run test:ci` y `npm run build` en `frontend/` siguen verdes.
3. Codex inicia el fixture de forma local, verifica HTTP real y recorre la SPA
   en navegador móvil y escritorio. Las capturas de cuatro anchos son un
   corte posterior; no marcar T05b completo solo por tener el servidor.
4. Sin archivos de fixture en el build ni en producción; `git diff --check`
   limpio. Rollback: parar proceso de fixture y revertir sus dos archivos.

## T05b2a — Recorrido reproducible en navegador

- Herramienta: `@playwright/test` 1.63.0 con Chromium y cuatro proyectos de
  viewport: 386×912, 768×1024, 1024×768 y 1440×900.
- Playwright inicia o reutiliza los dos servidores locales declarados en su
  configuración: fixture en `3000` y Angular en `4303`. El test no usa red ni
  datos empresariales reales y reemplaza Web Share dentro del contexto aislado
  del navegador para verificar el payload sin abrir UI del sistema.
- Aceptación: el mismo recorrido Inicio → destino → compartir → origen → ruta
  pasa en los cuatro proyectos; unitarias, build y auditoría de dependencias
  permanecen verdes. Las capturas versionadas se incorporan en T05b2b.
- Rollback: revertir dependencia, lockfile, configuración y spec E2E; el
  fixture T05b1 permanece independiente.

Fuentes oficiales verificadas:

- https://playwright.dev/docs/test-webserver
- https://playwright.dev/docs/ci
- https://playwright.dev/docs/browsers
- https://playwright.dev/docs/test-snapshots

## T05b2b–c — Baseline y CI

- Se versionan cuatro capturas canónicas de Windows, una por viewport. Solo se
  enmascaran los valores de fecha que cambian con el día de ejecución; estructura,
  contenido logístico estable, horarios y acciones permanecen comparables.
- CI instala únicamente Chromium headless y ejecuta el flujo funcional con
  snapshots ignorados. Playwright advierte que el render puede variar entre
  sistemas operativos; las comparaciones visuales de Linux se activarán cuando
  sus baselines se generen en ese mismo entorno.
- Los reportes y resultados temporales se ignoran y el reporte HTML se conserva
  como artefacto de CI. Las cuatro PNG canónicas no están ignoradas.
