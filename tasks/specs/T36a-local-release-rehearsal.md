# T36a: Ensayo Local de Release y Rollback

## 1. Contexto y Objetivos

Como parte de la tarea **T36** (*"Probar despliegue, smoke test y rollback"*), el slice **T36a** implementa un arnés hermético, local y reproducible de pre-flight que permite ensayar la preparación, compilación, arranque, verificación y detención controlada de dos revisiones git locales:
1. Una revisión candidata de release (por defecto `HEAD`).
2. Una revisión previa conocida para rollback (por defecto `HEAD~1`).

Este mecanismo garantiza que cualquier versión candidata sea capaz de compilarse en modo producción, arrancar y responder a sondas básicas de disponibilidad (`/api/health`), configuración de runtime (`/runtime-config.js`) y entrega de activos estáticos frontend (`/index.html`) en un entorno efímero y limpio, y que la versión previa pueda igualmente arrancar y responder a las tres sondas en caso de necesidad de reversión.

> [!CAUTION]
> **Delimitación de Alcance y Gobernanza**:
> Este slice **NO autoriza ningún despliegue a producción** ni da por cerrada la tarea T36 completa. **Solo el usuario/propietario del producto puede autorizar el paso a producción**. Ni Codex ni Antigravity tienen potestad para autorizar o realizar despliegues en producción. Las migraciones reales de base de datos dependen del baseline estructural de T35c y la rotación de credenciales (T00). T36a establece la herramienta de ensayo y su prueba estructural.

---

## 2. Archivos Afectados (Exactamente 6 Archivos Autorizados)

La implementación de este slice se estructura de forma desacoplada y se limita estrictamente a los siguientes seis archivos autorizados:
1. `tasks/specs/T36a-local-release-rehearsal.md`: Especificación técnica del slice, modelo de amenazas y criterios de aceptación.
2. `scripts/release-rehearsal.cjs`: CLI delgada (<= 120 líneas) que procesa banderas, maneja la ayuda y delega la orquestación.
3. `scripts/release-rehearsal-core.cjs`: Núcleo desacoplado de orquestación sin dependencias npm adicionales (helpers de seguridad, redacción de secretos, gestión de entorno de lista blanca, ciclo de vida de procesos, sondas HTTP y runner de ensayo).
4. `scripts/release-rehearsal.test.cjs`: Suite de pruebas automatizadas con dobles inyectados que cubren el core y la interfaz CLI.
5. `.github/workflows/release-rehearsal.yml`: Pipeline de CI para pruebas unitarias y dry-run estructural seguro.
6. `docs/DEPLOYMENT_ROLLBACK_RUNBOOK.md`: Runbook operativo para staging, rollback y uso de la herramienta.

---

## 3. Desacople Arquitectónico del Arnés

Para cumplir con la barra de mantenibilidad del proyecto:
- **CLI Delgada (`scripts/release-rehearsal.cjs`)**: Contiene únicamente la función `main`, presentación de `--help`, captura de argumentos mediante `parseArgs`, invocación a `runRehearsal` y manejo de códigos de salida (`process.exit(0)` / `process.exit(1)`).
- **Motor de Orquestación (`scripts/release-rehearsal-core.cjs`)**: Exporta de forma modular todas las funciones de validación, construcción de entornos, ciclo de vida de procesos y ejecución de etapas, facilitando su consumo en pruebas sin efectos secundarios en el proceso global.

---

## 4. Niveles de Verificación Diferenciados

1. **Ensayo Estructural (Dry-Run)**:
   - Valida la resolución estricta de commits Git (`git rev-parse --verify <ref>^{commit}`), evalúa activamente los límites de directorios temporales con `isSafeTempDirectory` reportando `pathBoundaryVerified: true` (sin crear residuos en disco), adquiere puerto TCP efímero en loopback (reconociendo el riesgo de condición de carrera inherente hasta el `listen`), y valida el entorno hijo de lista blanca.
   - En este modo, **`rollbackProcedureVerified: false`** de manera explícita y honesta; no se levantan servidores ni bases de datos en CI.
2. **Ciclo de Vida Simulado por Unit Tests**:
   - `node --test scripts/release-rehearsal.test.cjs` ejecuta mediante dobles inyectados el ciclo completo: orden de instalación (`npm ci` backend y frontend), compilación explícita de producción (`npm run build -- --configuration production`), arranque, captura de streams, sondas triples, terminación forzosa, arranque y sondas de rollback, y limpieza garantizada del directorio de ejecución.
3. **Ensayo Real Completo**:
   - Crea un directorio de ejecución único con `fs.mkdtempSync` (`run-<id>`) dentro de `baseTempDir`.
   - Extrae ambas revisiones por su SHA de commit resuelto (eliminando TOCTOU).
   - Aísla npm configurando `NPM_CONFIG_USERCONFIG` hacia un `.npmrc` vacío y `NPM_CONFIG_CACHE` hacia un subdirectorio local propio.
   - Ejecuta `npm ci` en cada backend/frontend y la compilación explícita de producción del frontend (`npm run build -- --configuration production`).
   - Arranca servidores con drenaje activo de pipes, ejecuta las sondas triples y destruye el directorio de ejecución completo.

---

## 5. Criterios de Aceptación Técnicos

1. **Cero dependencias npm adicionales**: Requiere herramientas del sistema host: Git, tar, Node.js y npm.
2. **Eliminación de TOCTOU en extracción**: Tras resolver las referencias a commits inmutables vía `git rev-parse --verify <ref>^{commit}`, la extracción de código se realiza estrictamente pasando el commit SHA resuelto a `git archive`.
3. **Directorio único y aislamiento de credenciales npm**: Todo el ensayo corre dentro de un único directorio temporal generado con `fs.mkdtempSync`. Se configura `NPM_CONFIG_USERCONFIG` a un archivo vacío y `NPM_CONFIG_CACHE` a un directorio local propio para aislar npm de credenciales o caches globales del usuario.
4. **Separación de timeouts**: `--timeout` (por defecto 15s) acotado estrictamente a las sondas HTTP y boot del servidor; `--command-timeout` (por defecto 300s = 5 minutos) acotado a la ejecución de comandos de `npm ci` y compilación.
5. **Compilación de producción explícita**: El build de Angular invoca exactamente `npm run build -- --configuration production`.
6. **Entorno hijo de lista blanca estricta (`buildSafeChildEnv`)**: Prohíbe la herencia indiscriminada de `process.env`. Solo incluye variables esenciales del sistema (`PATH`, `SYSTEMROOT`, `TEMP`, etc.) y configuraciones mock seguras (`NODE_ENV=test`, `DATABASE_URL` simulada, `MAPBOX_PUBLIC_TOKEN` mock). Secretos arbitrarios como `SECRET_SENTINEL` no llegan al proceso hijo.
7. **Drenaje seguro de flujos y detección de errores de spawn/salida prematura**: Los servidores de backend drenan activamente sus flujos de salida; si el proceso emite un evento `error` al arrancar o termina prematuramente antes de responder a las sondas, el runner falla de inmediato reportando código de salida, señal y stderr capturado.
8. **Defensa contra manipulación de rutas**: `isSafeTempDirectory` y `safeRemoveTempDir` aseguran que no se pueda eliminar ni alterar ningún archivo fuera del directorio temporal propio asignado a la ejecución.
9. **Validación estricta de referencias git**: `validateRef` rechaza caracteres de control, secuencias de inyección de shell y argumentos que inicien con guion (`-`).
10. **Redacción de secretos**: `sanitizeLog` enmascara automáticamente contraseñas en URLs de base de datos (`postgres://`), tokens Bearer y variables sensibles.
11. **Puertos efímeros seguros**: Asignación dinámica de puertos TCP libres en loopback (`127.0.0.1`), reconociendo el riesgo de carrera TOCTOU entre el cierre del socket de prueba y el enlace efectivo del backend.
12. **Sondeo simétrico de endpoints**: Tanto para el candidato como para el rollback se verifican `/api/health`, `/runtime-config.js` y `/index.html`.
13. **Garantía de terminación de procesos**: `createProcessTracker` administra los procesos secundarios de Node. Envía `SIGTERM`, espera un tiempo de gracia y degrada a `SIGKILL` si no terminan. Escuchadores globales (`SIGINT`, `SIGTERM`) garantizan que no queden procesos huérfanos.

---

## 6. Threat Model y Garantías de Seguridad

| Amenaza | Vector de Ataque | Mitigación Implementada |
| :--- | :--- | :--- |
| **Command Injection en Git/npm** | Inyección de operadores shell (`&&`, `\|`, `;`, `$()`) o flags (`--help`) en `--candidate` o `--previous`. | `validateRef` exige patrón seguro `/^[a-zA-Z0-9][a-zA-Z0-9_\.\-\/~^@]*$/` y prohíbe guion inicial. Git y npm se ejecutan pasando arrays de argumentos sin shell. |
| **TOCTOU en Referencias Git** | Mutación de una ref mutable (ej. `HEAD` o rama) entre la verificación inicial y la extracción del código. | `resolveCommit` resuelve el SHA inmutable mediante `git rev-parse --verify <ref>^{commit}`; `extractRevision` utiliza exclusivamente dicho SHA resuelto. |
| **Fuga de Credenciales / Inyección npm** | Lectura inadvertida de tokens en `~/.npmrc` o variables secretas del padre. | `buildSafeChildEnv` aplica lista blanca estricta; se inyecta `NPM_CONFIG_USERCONFIG` apuntando a un archivo vacío y `NPM_CONFIG_CACHE` local. |
| **Path Traversal / Destrucción de Archivos** | Suministro de rutas relativas o absolutas que apunten al repositorio, `C:\`, `/` o al directorio del usuario para su eliminación. | `isSafeTempDirectory` verifica que la ruta resuelta sea un descendiente estricto de la base temporal configurada, no igual a la base y distinta del CWD, HOME o raíz del sistema de archivos. |
| **Bloqueo por Pipe Buffer Lleno (DoS)** | Servidor escribiendo en stdout/stderr que bloquea el proceso al llenarse el buffer del SO (64 KB). | Flujos de stdio son activamente drenados (`.resume()`) y recolectados en buffers acotados. |
| **Procesos Huérfanos / DoS de Puertos** | Procesos de backend que queden en ejecución tras un fallo o cancelación de la prueba. | `createProcessTracker` rastrea cada PID hijo y asegura su terminación en el bloque `finally` y mediante escuchadores globales (`SIGINT`, `SIGTERM`). |

---

## 7. Estrategia de Rollback de este Slice

El slice T36a es puramente aditivo y no modifica ningún archivo preexistente de la aplicación ni altera el esquema de la base de datos:
- Para revertir este slice de forma limpia:
  ```bash
  git revert <commit-hash-t36a>
  ```
  Esto eliminará los 6 archivos agregados sin dejar efectos secundarios ni residuos en la base de código.
