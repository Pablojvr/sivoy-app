# Plan técnico: public-company-data

Estado: ejecución aprobada el 28 de octubre de 2026.

Especificación fuente: [`SPEC-public-company-data.md`](../SPEC-public-company-data.md).

Lista ejecutable: [`public-company-data-todo.md`](./public-company-data-todo.md).

## Objetivo

Incorporar una frontera pública, paginada y de solo lectura para buscar empresas
y consultar su perfil, identidad, presencia digital y cobertura. El módulo
prepara los datos que consumirán posteriormente `company-directory`,
`company-point-browser` y `company-profile` sin ampliar `/admin`, `/partner` ni
las escrituras operativas.

## Fuera de alcance

- Directorio, tarjetas, perfil o navegación Angular.
- Creación, edición o eliminación de empresas y redes.
- Autenticación o autorización del panel externo.
- Carga manual de datos productivos.
- Cambios en ETA, rutas logísticas o contratos de puntos.
- Índices nuevos sin evidencia de rendimiento.

## Grafo de dependencias

```text
PCD-00 congelar contrato legacy → PCD-01A esquema y migración → PCD-01B gate PostgreSQL ─┐
                                                                                          ├─→ PCD-03 repositorio y medición
PCD-02 validación y cursor ───────────────────────────────────────────────────────────────┘
        → PCD-04 servicio, política y DTO
        → PCD-05 frontera HTTP
        → PCD-06 documentación y cierre
```

PCD-00 y PCD-02 pueden ejecutarse en paralelo después de fijar el contrato.
PCD-01A espera a PCD-00 para que la migración no amplíe el endpoint legacy;
PCD-01B valida el esquema migrado y conecta el gate efímero a CI.
PCD-03, PCD-04 y PCD-05 son secuenciales. PCD-06 cierra el módulo después de
todos los gates.

## Decisiones arquitectónicas

1. **Catálogo canónico.** Los endpoints nuevos viven bajo `/api/catalog`; no se
   amplía `GET /api/empresas` ni se reactiva `GET /api/locations`.
2. **Contrato consistente.** Las listas usan `data/page/meta`, cursores opacos,
   `catalogRevision`, `400 CURSOR_INVALID` y `409 CURSOR_STALE`.
3. **Identidad estable.** Toda relación usa `companyId` canónico; el nombre solo
   sirve como contenido de búsqueda y presentación.
4. **Persistencia propiedad del catálogo.** `data-foundation/location-catalog`
   conserva columnas, FK, índices y triggers. `public-company-data` publica DTOs
   explícitos mediante un repositorio de lectura.
5. **Lectura segura.** Descripción es texto plano. Web y redes solo exponen URLs
   HTTPS válidas; cada red exige un host permitido. La web aplica validación
   sintáctica y rechaza credenciales, hosts locales e IP literales privadas o
   reservadas, sin resolver DNS. Los registros legacy inválidos se omiten sin
   exponer la URL en logs.
6. **Forma predecible.** Campos escalares opcionales usan `null` y
   `socialLinks` siempre es un arreglo.
7. **Empresas sin puntos.** Permanecen en el directorio con conteos en cero. Los
   conteos comparten el predicado público del catálogo de puntos.
8. **Rendimiento medido.** El MVP acepta un recorrido secuencial acotado sobre
   empresas. Solo se propone un índice trigram concurrente si un `EXPLAIN
   (ANALYZE, BUFFERS)` representativo lo justifica y recibe aprobación.
9. **Rollback operativo.** Ante incidentes se revierte código y rutas, pero se
   conserva el esquema aditivo. Cualquier retiro de columnas o tabla requiere
   una migración compensatoria posterior y checkpoint propio.
10. **Compatibilidad antes del esquema.** `GET /api/empresas` usa una proyección
    explícita antes de añadir columnas; la migración no expande su DTO legacy.

## Gates aportados por los skills

Los skills orientan la revisión, pero no reemplazan la especificación, la
dirección visual, la Definition of Done ni las reglas de `AGENTS.md`.

- **`security-audit` (guidance mode):** revisar por corte la entrada HTTP, el
  contenido administrado persistido, SQL parametrizado, enlaces externos,
  disponibilidad y redacción de errores. Esta revisión focalizada no se
  presentará como una auditoría integral.
- **`requesting-code-review`:** solicitar revisión independiente al cerrar cada
  checkpoint y sobre el diff completo antes de integrar. El revisor recibirá
  requisitos, `BASE_SHA` y `HEAD_SHA`; los hallazgos críticos o importantes se
  resuelven antes de continuar.
- **`verification-before-completion`:** ninguna tarea se marca completa con
  evidencia histórica o por resumen de otro agente; Codex vuelve a ejecutar los
  comandos del corte sobre el estado vigente.
- Los skills de UI no se aplican a este módulo porque no contiene interfaz. Su
  adopción por `company-directory`, `company-point-browser` y `company-profile`
  está delimitada en
  [`docs/UI_SKILLS_ADOPTION_PLAN.md`](../docs/UI_SKILLS_ADOPTION_PLAN.md).

### Fronteras de seguridad a demostrar

1. Entrada pública → validación: consulta, límite, ID y cursor son no confiables
   y no pueden ampliar el trabajo más allá de los límites aprobados.
2. PostgreSQL → DTO: descripción, logo, web y redes siguen siendo no confiables
   aunque hayan sido guardados por el panel externo.
3. URL almacenada → navegador: el backend no hace fetch ni DNS; la política
   omite valores inválidos y la futura UI usa navegación externa segura.
4. Ruta pública → disponibilidad: las rutas de empresa heredan el rate limit de
   `/api/catalog`. Staging y producción usan `RATE_LIMIT_MODE=enforce` y un smoke
   demuestra `429` con el proxy real. Esa prueba no valida el fallo del store: el
   fail-open queda `needs_validation` hasta una tarea separada de
   `delivery-platform` con prueba de fallo y señal operativa.
5. Fallo interno → respuesta/log: solo se exponen códigos estables y request ID,
   sin contenido almacenado, cursores completos, SQL ni stack traces.

## Cortes de implementación

### Fase 1 — Fundaciones

- **PCD-00:** congelar la proyección pública del endpoint legacy.
- **PCD-01A:** añadir el esquema de perfil/redes, su trigger y el fixture legacy.
- **PCD-01B:** validar PostgreSQL y conectar el gate efímero a CI.
- **PCD-02:** implementar validación y cursor independientes para empresas.

### Checkpoint A — Integridad

- El endpoint legacy conserva exactamente su DTO después del esquema nuevo.
- Migraciones aplican desde el fixture legacy y quedan registradas una sola vez.
- El trigger vigente de `empresas` se conserva; solo se añade el trigger de la
  tabla social. La revisión es un token monotónico: cada sentencia directa sobre
  una tabla observada la incrementa una vez; una cascada que afecte ambas tablas
  puede producir más de un incremento y ningún consumidor depende del delta.
- El procedimiento compensatorio del trigger social se ensaya y restaura en la
  base efímera sin editar una migración aplicada.
- Validación y cursores cubren entradas válidas, inválidas y stale.
- `npm test`, `npm run test:migrations:pg` y
  `npm run test:company-catalog:pg` están verdes.

### Fase 2 — Lectura pública

- **PCD-03:** implementar consultas PostgreSQL de lista/detalle y medir planes.
- **PCD-04:** presentar DTOs, paginación, caché y errores de aplicación.

### Checkpoint B — Contrato interno

- Lista, detalle, conteos, orden y paginación son deterministas.
- Empresas con cero puntos y valores legacy inválidos tienen forma segura.
- No hay regresión en `/api/catalog/points` ni sus facetas.
- `npm test` y pruebas PostgreSQL focalizadas están verdes.

### Fase 3 — Frontera HTTP y documentación

- **PCD-05:** registrar endpoints públicos y probar su contrato HTTP.
- **PCD-06:** actualizar contrato vigente y ejecutar gates completos.

### Checkpoint C — Módulo terminado

- Respuestas HTTP cumplen la especificación aprobada.
- No existen escrituras nuevas ni cambios en `/admin`, `/partner` o ETA.
- Suite backend completa, migraciones, escala y dry-run están verdes.
- Diff revisado en arquitectura, seguridad, rendimiento y compatibilidad.
- El módulo queda listo para que `company-directory` y
  `company-point-browser` empiecen sus propias especificaciones; no se integra
  ni despliega sin una aprobación posterior.

## Estrategia de pruebas

- **Unitarias:** parsers, gramática de ID, política de URLs, cursor, ranking y
  mapeo de DTO.
- **Repositorio:** SQL parametrizado, orden total, conteos, empresas sin puntos,
  redes visibles e inválidas y comodines de búsqueda tratados como literales.
- **Integración PostgreSQL:** migración, constraints, triggers de revisión,
  paginación y medición del plan.
- **HTTP:** `200`, vacío, `400`, `404`, `409` y `500` seguro.
- **Abuso:** entradas sobredimensionadas o manipuladas, métodos no registrados,
  herencia del rate limit y logs sin valores no confiables.
- **Regresión:** suite completa y caracterización del catálogo de puntos.

Comandos desde `backend/`:

```powershell
npm test
npm run test:migrations:pg
npm run test:company-catalog:pg
npm run test:catalog-scale:pg
```

Las tres pruebas PostgreSQL se ejecutan exclusivamente con una URL explícita de
loopback, base `sivoy_migrations_ci` y su sentinel correspondiente. Nunca toman
el `.env` de la estación. `npm run migrate:status` solo se usa dentro de ese
entorno efímero después de validar host y nombre de base; no es un gate manual
contra una conexión heredada.

La medición de empresas usa 10 000 filas, página de 20, una consulta de lista,
payload acotado y máximo inicial de 1 500 ms. Si el presupuesto falla, el índice
trigram se propone como un corte nuevo; no se incorpora silenciosamente.

Antes de producción se añade un gate operativo separado: configuración real con
`RATE_LIMIT_MODE=enforce`, proxy/IP de Render y evidencia de `429`. Hasta ese
smoke, el enforcement se registra como `needs_validation` y el módulo no puede
promoverse a `main`. El fail-open del store permanece como riesgo distinto hasta
que `delivery-platform` demuestre su fallo y señal operativa; un `429` no lo
cierra.

## Estrategia Git y entrega

- Rama actual: `codex/public-company-profiles`, creada desde `origin/develop`.
- Un commit atómico por corte validado; no mezclar frontend o administración.
- Integración primero en `develop`, únicamente tras revisión del diff y gates.
- No hacer force-push, merge ni despliegue durante la implementación del módulo
  sin solicitud y checkpoint explícitos.

## Delegación permitida

- Pruebas unitarias o de caracterización sin red ni datos reales.
- Documentación técnica y revisión de contratos.
- Medición de consultas en fixtures efímeros, sin editar SQL productivo.

No se delegan migraciones, SQL, contratos HTTP, decisiones de persistencia,
integración Git ni despliegues. Cada encargo delegado debe respetar el límite de
cinco archivos y Codex repetirá sus validaciones.

## Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Conteos distintos entre perfil y puntos | Alto | Compartir el mismo predicado público y probar ambos lados con los mismos fixtures |
| Cursor omite o duplica empresas | Alto | Orden total `(matchRank, normalizedName, companyId)` y pruebas con empates |
| Migración expande el DTO legacy | Alto | PCD-00 reemplaza `SELECT e.*` por proyección explícita y caracteriza la respuesta antes del esquema |
| Enlaces sociales maliciosos | Alto | HTTPS, allowlist por plataforma, sin credenciales y omisión segura de legacy inválido |
| Contenido persistido usado como HTML o URL confiable | Alto | DTO explícito, texto plano, origen de medios permitido y contrato frontend sin `innerHTML` |
| Enumeración o abuso del catálogo público | Medio | Límites acotados, SQL medido, rate limit heredado y verificación del modo operativo antes de producción |
| Migración invalida la revisión o CI | Alto | Trigger probado, expectativa de migraciones actualizada y dry-run antes de aplicar |
| Campos opcionales vacíos en producción | Medio | DTO explícito y vistas futuras que omiten secciones; panel externo fuera de esta entrega |
| Consulta por contenido escala mal | Medio | Fixture de 10 000, presupuesto de 1 500 ms y `EXPLAIN`; índice concurrente solo con evidencia y aprobación |
| Ruptura del catálogo vigente | Alto | Servicios/cursor separados y pruebas de regresión de puntos/facetas |

## Rollback

1. Revertir los commits de rutas, controller y servicio para retirar los
   endpoints nuevos.
2. Conservar columnas y tabla aditivas; no ejecutar `DROP` en el incidente.
3. Verificar `/api/health`, `/api/catalog/points` y facetas.
4. Si un trigger causa el incidente, desactivarlo únicamente mediante una
   migración compensatoria revisada y con backup verificado.
5. Reintegrar cualquier hotfix en `develop` para evitar divergencia.

## Preguntas abiertas

Ninguna para este módulo.

