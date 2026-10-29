# Tareas: public-company-data

Estado: ejecución aprobada el 28 de octubre de 2026.

Cada tarea se ejecuta en un corte aislado, con máximo cinco archivos previstos.
Los cambios descubiertos fuera de esos archivos requieren revisar este plan
antes de ampliar el alcance.

## PCD-00 — Congelar el contrato legacy de empresas

**Descripción:** reemplazar la selección abierta del endpoint legacy por una
proyección explícita antes de añadir columnas al esquema.

**Criterios de aceptación:**

- [x] `GET /api/empresas` mantiene exactamente los campos vigentes necesarios
      y deja de depender de `SELECT e.*`.
- [x] Una prueba de caracterización demuestra que columnas adicionales de
      `empresas` no aparecen en el DTO legacy.
- [x] No cambia el comportamiento de escrituras ni se expone descripción, web o
      redes mediante el endpoint anterior.

**Verificación:**

- [x] `node --test test/empresas-read-contract.test.js` desde `backend/`.
- [x] `npm test` desde `backend/`.

**Dependencias:** ninguna.

**Archivos previstos:**

- `backend/src/domains/empresas/empresas.repository.js`
- `backend/test/empresas-read-contract.test.js`

**Alcance:** bajo, 2 archivos.

**Rollback del corte:** revertir el commit restaura la consulta anterior; PCD-01
no puede iniciarse mientras este corte no esté validado.

## PCD-01A — Esquema aditivo y revisión del catálogo

**Descripción:** añadir metadatos opcionales de empresa, tabla normalizada de
redes y triggers que incrementen la revisión canónica del catálogo.

**Criterios de aceptación:**

- [ ] `empresas` incorpora `descripcion` y `website_url` opcionales sin alterar filas existentes.
- [ ] `empresa_redes_sociales` aplica FK, unicidad, plataforma permitida, visibilidad y orden.
- [ ] El trigger vigente de `empresas` se conserva. Cada sentencia directa sobre
      empresa o redes incrementa una vez el token monotónico; una cascada que
      afecte ambas tablas puede incrementarlo más de una vez.
- [ ] El fixture migrado conserva el DTO legacy y ensaya retirar/restaurar el
      trigger social como procedimiento compensatorio, verificando la revisión
      después de restaurarlo.

**Verificación:**

- [ ] `npm run migrate:status` desde `backend/`, únicamente con URL explícita de loopback y base efímera verificada.
- [ ] `npm run test:migrations:pg` desde `backend/`.
- [ ] Aplicación repetida no modifica migraciones registradas ni crea objetos duplicados.

**Dependencias:** PCD-00.

**Archivos previstos:**

- `backend/migrations/0011_public_company_profiles.sql`
- `backend/test/fixtures/legacy-schema.sql`
- `backend/integration/migrations.pg.spec.js`

**Alcance:** medio, 3 archivos.

**Rollback del corte:** revertir el código conservando el esquema aditivo si ya
fue aplicado; cualquier corrección de trigger usa una migración compensatoria
nueva, nunca la edición de `0011` aplicada.

## PCD-01B — Gate PostgreSQL del catálogo de empresas

**Descripción:** probar el esquema migrado con datos reales de PostgreSQL y
conectar una ejecución efímera, aislada y explícita al pipeline.

**Criterios de aceptación:**

- [ ] FK, unicidad, plataformas, visibilidad, orden y revisión se verifican en PostgreSQL.
- [ ] El gate exige loopback, base `sivoy_migrations_ci` y sentinel dedicado.
- [ ] La prueba queda conectada a un script y a CI sin usar secretos productivos.
- [ ] El procedimiento compensatorio del trigger social demuestra fallo seguro,
      restauración e invalidación posterior.

**Verificación:**

- [ ] `npm run test:company-catalog:pg` desde `backend/`.
- [ ] `npm test` desde `backend/`.

**Dependencias:** PCD-01A.

**Archivos previstos:**

- `backend/integration/company-catalog.pg.spec.js`
- `backend/package.json`
- `.github/workflows/ci.yml`

**Alcance:** medio, 3 archivos.

**Rollback del corte:** revertir el script, la prueba y el paso de CI; el esquema
aditivo permanece y se corrige únicamente mediante migración compensatoria.

## PCD-02 — Validación y cursor de empresas

**Descripción:** crear primitivas independientes para consultas de empresa sin
debilitar validación o cursores del catálogo de puntos.

**Criterios de aceptación:**

- [x] `q`, `limit`, `cursor` y `companyId` cumplen la gramática de la especificación.
- [x] El cursor liga tipo, versión, revisión, consulta y posición total.
- [x] Cursores manipulados, de otra consulta o revisión producen códigos seguros y estables.
- [x] Entradas sobredimensionadas, con caracteres de control o formas no
      canónicas se rechazan antes de invocar el repositorio.
- [x] `%`, `_` y `\` se conservan como texto literal normalizado y esa forma
      participa en la huella del cursor.
- [x] Las pruebas dejan explícito que el cursor es estado no confiable de
      paginación y no una credencial.

**Verificación:**

- [x] `node --test test/company-catalog-validation.test.js` desde `backend/`.
- [x] `node --test test/company-cursor.test.js` desde `backend/`.
- [x] `npm test` desde `backend/`.

**Dependencias:** ninguna.

**Archivos previstos:**

- `backend/src/domains/catalog/company-catalog.validation.js`
- `backend/src/application/catalog/company-cursor.js`
- `backend/test/company-catalog-validation.test.js`
- `backend/test/company-cursor.test.js`

**Alcance:** medio, 4 archivos.

**Rollback del corte:** revertir el commit; no altera persistencia ni contratos
vigentes hasta que se registre la ruta pública.

## Checkpoint A — Fundaciones

- [ ] PCD-00, PCD-01A, PCD-01B y PCD-02 cumplen sus criterios.
- [ ] `npm test` pasa.
- [ ] `npm run test:migrations:pg` pasa con PostgreSQL efímero.
- [ ] `npm run test:company-catalog:pg` pasa con PostgreSQL efímero.
- [ ] Revisión humana del esquema, cursor y rollback antes de PCD-03.

## PCD-03 — Repositorio público de empresas

**Descripción:** implementar lista y detalle parametrizados, con ranking,
conteos consistentes, redes visibles y medición del plan SQL.

**Criterios de aceptación:**

- [ ] Lista y detalle usan `companyId` y el predicado público vigente de puntos.
- [ ] El orden total y la paginación no omiten ni duplican empresas, incluso con empates.
- [ ] La clave `normalizedName` usada por orden/cursor queda acotada a 250
      caracteres Unicode y 1 024 bytes; nombres legacy mayores conservan un
      orden determinista por el prefijo acotado y `companyId` sin producir `500`.
- [ ] Empresas sin puntos devuelven conteos en cero y redes crudas se recuperan sin ejecutar ni resolver sus URLs.
- [ ] La búsqueda escapa `%`, `_` y `\` con una cláusula `ESCAPE` explícita; no
      existe interpolación de patrones aportados por el cliente.
- [ ] El fixture reproducible contiene 10 000 empresas; la lista usa una
      consulta, devuelve como máximo 21 filas para una página de 20, mantiene el
      payload acotado y ejecuta en no más de 1 500 ms en la base efímera.

**Verificación:**

- [ ] `node --test test/company-catalog-repository.test.js` desde `backend/`.
- [ ] `npm run test:company-catalog:pg` desde `backend/`, con loopback, base esperada y sentinel explícitos.
- [ ] `EXPLAIN (ANALYZE, BUFFERS)` registra tiempo, filas, bloques y nodos sobre
      el fixture de 10 000 sin crear índices automáticamente.

**Dependencias:** PCD-01B y PCD-02.

**Archivos previstos:**

- `backend/src/infrastructure/postgres/company-catalog.repository.js`
- `backend/test/company-catalog-repository.test.js`
- `backend/integration/company-catalog.pg.spec.js`

**Alcance:** medio, 3 archivos.

**Rollback del corte:** revertir el commit del repositorio; conservar esquema y
fixtures de migración hasta una decisión compensatoria separada.

## PCD-04 — Servicio de consulta y DTO público

**Descripción:** presentar envelopes, DTOs, caché ligada a revisión y errores de
aplicación para lista y detalle.

**Criterios de aceptación:**

- [ ] Lista produce `data/page/meta` y detalle mantiene forma estable y campos opcionales normalizados.
- [ ] Caché y cursor se invalidan cuando cambia la revisión del catálogo.
- [ ] Empresa inexistente produce `COMPANY_NOT_FOUND` sin detalles internos.
- [ ] Descripción y URLs aplican la política pública; legacy inválido se omite sin registrar su valor.
- [ ] `logoUrl` solo expone rutas administradas u orígenes públicos de medios
      configurados; descripción y redes siguen tratándose como contenido no
      confiable aunque provengan de PostgreSQL.
- [ ] `logoUrl` rechaza más de 2048 caracteres, `//`, barras invertidas,
      controles, segmentos ambiguos y orígenes no incluidos en
      `PUBLIC_MEDIA_ORIGINS`; las rutas relativas válidas empiezan en `/uploads/`.
- [ ] `PUBLIC_MEDIA_ORIGINS` acepta una lista de orígenes HTTPS exactos sin
      ruta, query, fragmento o credenciales; vacío falla cerrado para URLs
      absolutas.
- [ ] Los fallos de caché o política no incluyen URL, descripción, cursor
      completo, SQL ni stack trace en logs o respuestas.

**Verificación:**

- [ ] `node --test test/company-query-contract.test.js` desde `backend/`.
- [ ] Casos de caché fallida demuestran que PostgreSQL sigue siendo fuente de verdad.
- [ ] `npm test` desde `backend/`.

**Dependencias:** PCD-02 y PCD-03.

**Archivos previstos:**

- `backend/src/application/catalog/company-query.service.js`
- `backend/src/application/catalog/company-public-data.policy.js`
- `backend/test/company-query-contract.test.js`
- `backend/test/company-public-data-policy.test.js`

**Alcance:** medio, 4 archivos.

**Rollback del corte:** revertir el commit; el repositorio interno permanece sin
exposición HTTP si este corte se retira.

## Checkpoint B — Contrato interno

- [ ] PCD-03 y PCD-04 cumplen sus criterios.
- [ ] Conteos comparados con `/api/catalog/points?companyId=...` en los mismos fixtures.
- [ ] No hay regresiones en puntos, facetas, cursores ni revisión del catálogo.
- [ ] Revisión humana de seguridad, SQL y rendimiento antes de exponer rutas.

## PCD-05 — Frontera HTTP pública

**Descripción:** registrar lista y detalle bajo `/api/catalog/companies` y
verificar respuestas y errores por HTTP.

**Criterios de aceptación:**

- [ ] `GET /api/catalog/companies` soporta búsqueda desde un carácter, límite y cursor.
- [ ] `GET /api/catalog/companies/:companyId` devuelve perfil o `404 COMPANY_NOT_FOUND`.
- [ ] Los casos `400`, `409` y `500` usan el envelope seguro del catálogo.
- [ ] Las rutas heredan el rate limit de `/api/catalog`; una prueba de
      caracterización incluye lista y detalle de empresas.
- [ ] La configuración documenta `RATE_LIMIT_MODE=enforce` para staging y
      producción. El smoke `429` valida enforcement/proxy, no el fallo del store.
- [ ] El fail-open del store queda marcado `needs_validation` y enlazado a una
      tarea separada de `delivery-platform` para probar fallo y señal operativa.
- [ ] Métodos de escritura no están registrados y los logs de error conservan
      únicamente evento y `requestId`.

**Verificación:**

- [ ] `node --test test/company-catalog-http-contract.test.js` desde `backend/`.
- [ ] `npm test` desde `backend/`.
- [ ] Prueba negativa confirma que no se registró ninguna escritura nueva.

**Dependencias:** PCD-04.

**Archivos previstos:**

- `backend/src/domains/catalog/company-catalog.controller.js`
- `backend/src/domains/catalog/catalog.routes.js`
- `backend/test/company-catalog-http-contract.test.js`
- `backend/test/api-rate-limits.test.js`
- `backend/.env.example`

**Alcance:** medio, 5 archivos.

**Rollback del corte:** retirar únicamente el controller y registro de rutas de
empresa; comprobar que puntos y facetas conservan sus contratos.

## PCD-06 — Contrato documentado y gate completo

**Descripción:** actualizar el inventario HTTP, verificar el diff completo y
dejar trazabilidad suficiente para iniciar los módulos de interfaz.

**Criterios de aceptación:**

- [ ] El contrato documentado coincide con las pruebas HTTP y no describe escrituras inexistentes.
- [ ] El estado de la especificación refleja el resultado realmente implementado.
- [ ] El diff no contiene secretos, datos productivos ni cambios fuera del módulo.
- [ ] La revisión focalizada de seguridad cubre las cinco fronteras del plan sin
      presentarse como auditoría integral.
- [ ] Una revisión independiente recibe requisitos y rango de commits; no quedan
      hallazgos críticos o importantes abiertos.

**Verificación:**

- [ ] `npm test` desde `backend/`.
- [ ] `npm run test:migrations:pg` desde `backend/`.
- [ ] `npm run test:company-catalog:pg` desde `backend/`.
- [ ] `npm run test:catalog-scale:pg` desde `backend/`.
- [ ] `npm run migrate:status` desde `backend/`, únicamente con URL explícita de loopback y base efímera verificada.
- [ ] Revisión multi-eje del diff antes de cualquier integración.
- [ ] Cada afirmación de finalización se apoya en comandos ejecutados nuevamente
      sobre el `HEAD` candidato.

**Dependencias:** PCD-05.

**Archivos previstos:**

- `docs/contracts/public-http-current.md`
- `backend/migrations/README.md`
- `SPEC-public-company-data.md`
- `tasks/public-company-data-plan.md`
- `tasks/public-company-data-todo.md`

**Alcance:** medio, 5 archivos.

**Rollback del corte:** revertir únicamente documentación y estados de tarea si
no reflejan el código final; no altera ejecución.

## Checkpoint C — Aprobación del módulo

- [ ] PCD-00, PCD-01A, PCD-01B y PCD-02 a PCD-06 completos.
- [ ] Todos los comandos de validación están verdes.
- [ ] La integración PostgreSQL específica `test:company-catalog:pg` está verde en CI efímero.
- [ ] Smoke local de lista, detalle, vacío y error seguro documentado.
- [ ] Rollback operativo revisado.
- [ ] Evidencia efímera del procedimiento compensatorio del trigger social y su
      restauración.
- [ ] Aprobación humana antes de integrar en `develop`.
- [ ] No promover a `main` ni desplegar sin solicitud explícita y gates de lanzamiento.
- [ ] Antes de promover a `main`, smoke de staging confirma `429` con
      `RATE_LIMIT_MODE=enforce` y la configuración real de proxy/IP.
- [ ] El riesgo fail-open del store no se cierra con el smoke `429`; promoción a
      producción requiere la decisión y evidencia de `delivery-platform` o una
      aceptación de riesgo explícita.

