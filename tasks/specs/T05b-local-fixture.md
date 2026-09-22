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
