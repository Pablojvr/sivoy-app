# SiVoy App — Staging Deployment & Rollback Runbook

Este documento establece el procedimiento operativo estándar (SOP) para el ensayo local y los procedimientos de despliegue y rollback en **staging** de SiVoy App.

> [!WARNING]
> **Aviso de Gobernanza (T36a)**:
> La herramienta local de ensayo `scripts/release-rehearsal.cjs` (y su núcleo `scripts/release-rehearsal-core.cjs`) implementada en el slice **T36a** es un arnés de pre-flight y caracterización de arranque/parada. **NO autoriza ningún despliegue a producción ni da por cerrada la tarea T36 completa**. Solo el usuario/propietario del producto puede autorizar el paso a producción. Ni Codex ni Antigravity tienen atribución para autorizar o desplegar en producción. Todo avance hacia producción requiere adicionalmente la rotación de credenciales (T00) y el baseline de migraciones PostgreSQL (T35c).

---

## 1. Ensayo Local de Release y Rollback (Slice T36a)

El ensayo local permite verificar de manera reproducible y aislada que una revisión candidata y su revisión previa conocida pueden arrancar, responder a verificaciones de salud, configuración y assets estáticos, y detenerse sin dejar procesos huérfanos ni filtrar secretos.

### 1.1 Arquitectura Desacoplada del Arnés (6 Archivos Autorizados)
El arnés se compone de:
1. `scripts/release-rehearsal.cjs`: CLI delgada (<= 120 líneas) que procesa banderas, maneja la ayuda y delega la orquestación.
2. `scripts/release-rehearsal-core.cjs`: Núcleo desacoplado de orquestación sin dependencias npm adicionales (helpers de seguridad, redacción de secretos, gestión de entorno de lista blanca, ciclo de vida de procesos, sondas HTTP y runner de ensayo).
3. `scripts/release-rehearsal.test.cjs`: Suite de pruebas unitarias automatizadas.
4. `.github/workflows/release-rehearsal.yml`: Workflow para validación en integración continua.
5. `tasks/specs/T36a-local-release-rehearsal.md`: Especificación técnica del slice.
6. `docs/DEPLOYMENT_ROLLBACK_RUNBOOK.md`: Este runbook operativo.

### 1.2 Niveles de Verificación

Se definen tres niveles de verificación claramente diferenciados:

1. **Ensayo Estructural (Dry-Run)**:
   - Comando: `node scripts/release-rehearsal.cjs --dry-run --verbose`
   - Alcance: Valida resolución estricta de commits Git (`git rev-parse --verify <ref>^{commit}`), límites de directorios temporales (`pathBoundaryVerified: true`), adquisición efímera de puertos TCP (reconociendo el riesgo inherente de condición de carrera hasta el `listen` del proceso hijo) y generación de entorno hijo de lista blanca.
   - Estado de rollback: **`rollbackProcedureVerified: false`** de forma honesta y explícita. No arranca servidores de fondo ni bases de datos. No crea residuos en disco. Diseñado para CI rápido y seguro.

2. **Ciclo de Vida Simulado por Unit Tests**:
   - Comando: `node --test scripts/release-rehearsal.test.cjs`
   - Alcance: Ejecuta mediante dobles inyectados el ciclo completo: orden de instalación (`npm ci` backend y frontend), compilación explícita de producción (`npm run build -- --configuration production`), arranque, captura de streams, sondas triples (`/api/health`, `/runtime-config.js`, `/index.html`), terminación forzosa, arranque y sondas de rollback, y limpieza del directorio de ejecución.

3. **Ensayo Real Completo**:
   - Comando: `node scripts/release-rehearsal.cjs --candidate HEAD --previous HEAD~1`
   - Alcance: Crea un directorio único de ejecución (`run-<id>`) dentro de `baseTempDir` con `fs.mkdtempSync`. Extrae ambas revisiones por su SHA resuelto (eliminando vulnerabilidades TOCTOU), aísla npm configurando `NPM_CONFIG_USERCONFIG` hacia un `.npmrc` vacío y `NPM_CONFIG_CACHE` local, ejecuta `npm ci` y compilación explícita de producción (`npm run build -- --configuration production`), levanta los servidores con drenaje activo de pipes, ejecuta las sondas triples y destruye el directorio de ejecución completo.
   - Banderas de conveniencia: `--skip-install` (omite `npm ci`) y `--skip-build` (omite compilación frontend).

### 1.3 Características de Seguridad y Arquitectura
- **Cero dependencias npm adicionales**: Requiere herramientas estándar del sistema operativo host: Git, tar, Node.js y npm.
- **Aislamiento hermético de revisiones y eliminación de TOCTOU**: Tras resolver las referencias a commits inmutables, la extracción se efectúa directamente por SHA de commit.
- **Directorio de ejecución único y aislamiento de npm**: Todo artefacto (`candidate`, `rollback`, `npm-cache`, `.npmrc` vacío) reside en un único directorio generado con `fs.mkdtempSync`. Se anula la lectura de configuraciones o credenciales globales del usuario mediante `NPM_CONFIG_USERCONFIG` y `NPM_CONFIG_CACHE`.
- **Entorno hijo de lista blanca estricta (`buildSafeChildEnv`)**: Los procesos secundarios solo heredan variables de sistema esenciales (`PATH`, `SYSTEMROOT`, `TEMP`, etc.) y configuraciones mock seguras (`NODE_ENV=test`, `DATABASE_URL` simulada, `MAPBOX_PUBLIC_TOKEN` mock). Ningún secreto preexistente del padre (ej. `SECRET_SENTINEL`, claves de producción) se propaga al proceso hijo.
- **Drenaje seguro de flujos y detección de errores de spawn/salida prematura**: Se capturan y drenan los flujos de stdio para evitar bloqueos por saturación del buffer del sistema operativo; si el proceso emite un evento `error` al arrancar o termina prematuramente antes de responder a las sondas, el runner falla de inmediato reportando el código de salida, señal y stderr capturado.
- **Redacción de secretos**: Todos los logs, variables de entorno y trazas de error enmascaran automáticamente contraseñas en URLs de base de datos (`postgres://user:[REDACTED]@...`), cabeceras `Authorization: Bearer [REDACTED]` y tokens de métricas.
- **Puertos efímeros**: Asignación dinámica de puertos TCP libres en loopback (`127.0.0.1`), señalando el riesgo inherente de condición de carrera hasta el enlace (`listen`) efectivo del servidor.
- **Separación de timeouts**: `--timeout` (por defecto 15s) acotado estrictamente a las sondas HTTP y boot del servidor; `--command-timeout` (por defecto 300s = 5 minutos) acotado a la ejecución de comandos pesados de `npm ci` y compilación.

### 1.4 Opciones de la CLI
| Opción | Descripción | Valor por Defecto |
| :--- | :--- | :--- |
| `--candidate <ref>` | Referencia git del release candidato | `HEAD` |
| `--previous <ref>` | Referencia git de la revisión previa conocida | `HEAD~1` |
| `--dry-run` | Validación estructural sin levantar servidores ni crear residuos | `false` |
| `--timeout <ms>` | Tiempo límite para verificación de endpoints en ms (500–300000) | `15000` |
| `--command-timeout <ms>` | Tiempo límite para `npm ci` y build en ms (1000–1800000) | `300000` |
| `--port <num>` | Puerto TCP explícito (en lugar de efímero) | Dinámico (`0`) |
| `--skip-install` | Omite pasos de `npm ci` en frontend y backend | `false` |
| `--skip-build` | Omite paso de `npm run build` en frontend | `false` |
| `--keep-temp` | Conservar directorios temporales tras ejecución (debug) | `false` |
| `--verbose`, `-v` | Salida detallada paso a paso | `false` |
| `--help`, `-h` | Muestra la ayuda de la CLI | — |

---

## 2. Endpoints Verificados en el Ensayo

Tanto en la revisión **candidata** como en la revisión de **rollback**, se sondean obligatoriamente los tres siguientes endpoints:

1. **Salud del Backend (`/api/health`)**:
   - Código HTTP `200`.
   - El cuerpo de la respuesta debe contener `{ "status": "ok" }`.
   - No expone métricas internas ni claves confidenciales.

2. **Configuración de Runtime (`/runtime-config.js`)**:
   - Código HTTP `200`.
   - Content-Type `application/javascript` con cabecera `Cache-Control: no-store`.
   - El contenido debe inicializar el objeto `window.__SIVOY_CONFIG__`.

3. **Activos Estáticos Frontend (`/index.html`)**:
   - Código HTTP `200` confirmando la entrega del frontend compilado.

---

## 3. Procedimiento de Rollback Operativo en Staging

Si durante un ensayo o despliegue en el entorno de **staging** se detecta una degradación del servicio, se aplicará el siguiente procedimiento de reversión:

### 3.1 Criterios de Disparo de Rollback
- `/api/health` responde códigos `5xx` o no responde dentro del timeout de observabilidad.
- Incremento anómalo en la tasa de errores de endpoints críticos (`/api/get-upcoming-routes`, `/api/locations`).
- Falla en la carga de assets estáticos o discrepancia en `runtime-config.js`.
- Registro de excepciones graves en `server_startup_failed` o `db_pool_failed`.

### 3.2 Pasos de Reversión en Staging
1. **Identificar la revisión estable previa**:
   Localizar el hash del último commit o tag verificado con éxito en staging.
2. **Restaurar el servicio con la revisión previa**:
   En el host de staging, detener el proceso o servicio del candidato defectuoso y levantar la revisión previa verificada en su puerto asignado.
3. **Verificar el arranque de la revisión restaurada**:
   Ejecutar las sondas de verificación en loopback:
   ```bash
   curl -i http://127.0.0.1:<PORT>/api/health
   curl -i http://127.0.0.1:<PORT>/runtime-config.js
   curl -i http://127.0.0.1:<PORT>/index.html
   ```
4. **Gestión en el control de versiones**:
   Si el candidato ha sido descartado formalmente por el equipo, preparar el ajuste o reversión en la rama correspondiente de staging de forma atómica y revisada.

---

## 4. Limitaciones Actuales y Siguientes Pasos (Hacia T36 completo)

- **PostgreSQL Efímero**: El script T36a y el dry-run no ejecutan migraciones reales de base de datos porque el baseline estructural legacy (T35c) sigue pendiente.
- **Rutas de Negocio**: Las rutas que requieren datos de empresas, agencias y rutas no se ejercitan en este ensayo de release/rollback para mantenerlo hermético, reproducible y sin dependencias de red externa.
- **Cierre de T36**: El cierre de T36 requiere:
  1. Aprobación y verificación de T35c (migraciones en PostgreSQL efímero).
  2. Rotación de credenciales históricas (T00).
  3. Ensayo integrado en entorno de staging con base de datos real.
  4. Autorización formal y explícita del usuario/propietario del producto.
