# Auditoría de Seguridad de Dependencias y Supply Chain — SiVoy App

**Fecha de auditoría:** 1 de octubre de 2026  
**Alcance:** Fronteras de dependencias `frontend/`, `backend/`, flujos de integración continua en `.github/workflows/ci.yml` y políticas de control de scripts e integridad criptográfica.  
**Estado general:** Remediación completa de las vulnerabilidades de dependencias
reportadas; 0 vulnerabilidades en los dos `npm audit`; pipeline endurecido con
guard determinista y scripts aislados. El checkpoint global de seguridad
**permanece abierto** por bloqueos conocidos (T00, T45c, T35c).

---

## 1. Límites del Sistema y Activos Protegidos

* **Límites de confianza (Trust Boundaries):**
  * Superficie HTTP pública expuesta por el servidor Express.
  * Conexión a base de datos PostgreSQL y motor SQLite local.
  * Funcionalidades de carga y escritura desactivadas en producción.
  * Conexiones de salida hacia APIs externas: URLs de mapas (MapLibre/Mapbox), Google Places y Cloudinary.
  * Mecanismo de autenticación de métricas e inspección operativa protegido por `METRICS_TOKEN`.
* **Activos protegidos:**
  * Datos y esquema relacional de la base de datos.
  * Credenciales de acceso a infraestructura y servicios.
  * Tokens de proveedores externos (Places, Cloudinary).
  * Métricas de observabilidad y telemetría de rutas.

---

## 2. Estado Previo a la Remediación (`npm audit` Inicial)

La auditoría del 1 de octubre de 2026 detectó advisories de seguridad en dependencias transitivas:

* **Backend (3 vulnerabilidades: 2 High, 1 Moderate):**
  * `brace-expansion`: vulnerabilidad de denegación de servicio / regex.
  * `undici`: vulnerabilidades en cliente HTTP transitivo.
  * `multer`: versiones previas a 2.4.0 afectadas por escrituras huérfanas al
    abortar uploads, con impacto de denegación de servicio.
* **Frontend (6 vulnerabilidades: 3 High, 3 Moderate):**
  * `@angular/router`: vulnerabilidades en el enrutador.
  * `@angular/build` / `undici`: paquete HTTP de soporte en build.
  * `brace-expansion`: transitivo en utilidades de glob.
  * `fast-uri`: parsing de URIs.
  * `ip-address`: validación y parsing de direcciones IP.

---

## 3. Estrategia de Mitigación y Resolución de Dependencias

Se ejecutó una remediación conservadora sin introducir saltos de versiones mayores (*major bumps*) que pudieran comprometer los contratos del motor ETA o la UI:

1. **Backend:**
   * El rango compatible existente de `multer` (`^2.3.0`) resuelve ahora
     exactamente `2.4.0`, la versión corregida.
   * Resolución de subdependencias transitivas en versiones parcheadas.
2. **Frontend:**
   * Actualización del framework Angular a `21.2.25` (`@angular/common`, `@angular/compiler`, `@angular/core`, `@angular/forms`, `@angular/platform-browser`, `@angular/router`).
   * Actualización de `@angular/build` y `@angular/cli` a `21.2.24`, y de
     `@angular/compiler-cli` a `21.2.25`.
   * Transitivos (`undici`, `brace-expansion`, `fast-uri`, `ip-address`) resueltos en versiones corregidas.
   * El advisory crítico de `piscina` publicado durante la auditoría
     (GHSA-67c8-pqhq-4rmx) afectó la versión 5.2.0 fijada por
     `@angular/build@21.2.24`. Se añadió un `override` acotado a `5.3.2`, la
     versión oficial corregida, sin cambiar la versión mayor de Angular.
3. **Regeneración de Lockfiles:**
   * El lockfile anterior de frontend presentaba restricciones estrictas de peer dependencies que impedían actualizar paquetes aislados.
   * Se evaluó un intento de mitigación con `--legacy-peer-deps`, el cual fue **RECHAZADO** formalmente al provocar que `npm ci` fallara en entornos estándar sin banderas permisivas.
   * Se regeneró limpiamente `frontend/package-lock.json` bajo formato v3; la
     instalación pasa con `npm ci` estándar sin flags de peers. La regeneración
     también resolvió versiones compatibles más recientes dentro de rangos ya
     declarados (incluidos Mapbox/MapLibre); build y E2E cubren esa ampliación.

---

## 4. Estado Final de Dependencias y Firmas Criptográficas

Ambos proyectos operan con `lockfileVersion: 3`, gobernados por el mismo motor de paquetes:

* **Backend (`backend/package.json` y `package-lock.json`):**
  * `packageManager`: `"npm@11.11.0"`
  * `npm audit --omit=dev`: **0 vulnerabilidades**.
  * `npm audit signatures`: **231 firmas verificadas**, **15 atestaciones** criptográficas Sigstore.
* **Frontend (`frontend/package.json` y `package-lock.json`):**
  * `packageManager`: `"npm@11.11.0"`
  * `npm audit`: **0 vulnerabilidades**.
  * `npm audit signatures`: **493 firmas verificadas**, **158 atestaciones** criptográficas Sigstore.

---

## 5. Política de Scripts de Instalación (`hasInstallScript`) y Allowlist

Para prevenir la ejecución de código malicioso durante la instalación de paquetes, se estableció una política estricta de aislamiento:

1. **Aislamiento por defecto:** Todas las instalaciones en CI se ejecutan con `npm ci --ignore-scripts`.
2. **Allowlist explícita fijada:**
   * **Backend:**
     * `sqlite3@6.0.1` (producción): requiere scripts para cargar o compilar bindings nativos C/C++.
   * **Frontend:**
     * `@parcel/watcher@2.6.0` (desarrollo, opcional): watcher nativo para compilación de estilos.
     * `esbuild@0.28.1` (desarrollo): binario del compilador para `@angular/build` y `vite`.
     * `fsevents@2.3.3` (desarrollo, opcional/darwin): eventos de filesystem exclusivos de macOS (no se reconstruye en runners Linux).
     * `lmdb@3.5.1` (desarrollo, opcional): base de datos de memoria para caché de build.
     * `msgpackr-extract@3.0.4` (desarrollo, opcional): acelerador C++ de serialización.
3. **Reconstrucción controlada:** Únicamente los paquetes de la allowlist indispensables para el entorno son reconstruidos explícitamente (`npm rebuild sqlite3` en backend; `npm rebuild esbuild ...` en frontend) tras la validación de firmas.

---

## 6. Secuencia Verificada del Pipeline de CI

El flujo validado para la integración continua opera en el siguiente orden secuencial estricto:

```text
1. Setup Node.js 22 (actions/setup-node@v4 con cache 'npm')
2. Invocación explícita `corepack npm` (usa npm 11.11.0 declarado en ambos proyectos)
3. Ejecución del Lockfile Guard estático:
   - Valida que resolved provenga exclusivamente de https://registry.npmjs.org/
   - Valida que integrity use algoritmo sha512-
   - Valida ausencia de puertos, credenciales embebidas u orígenes vacíos
   - Valida que hasInstallScript contenga exactamente la allowlist fijada (falla si hay desvíos)
4. Instalación inerte: npm ci --ignore-scripts
5. Verificación de atestaciones: npm audit signatures (sobre archivos inertes en node_modules)
6. Rebuild selectivo de paquetes en allowlist
7. Auditoría de vulnerabilidades: npm audit
8. Validación de sintaxis, pruebas unitarias, contratos de boundaries y colores, build de producción y smoke E2E
9. Playwright: resolución y ejecución mediante script local en package.json (sin npx dinámico)
```

---

## 7. Higiene del Repositorio (.gitignore)

Se reforzó la regla de exclusión de artefactos sensibles en la raíz del repositorio:
* Bloqueo estricto de `.env.*` (variables de entorno locales o de staging).
* Bloqueo de material criptográfico: `*.pem`, `*.key`, `*.p12`, `*.pfx`.
* Preservación explícita de plantillas públicas sin secretos (`.env.example`).

---

## 8. Evidencia de Validación en Aislamiento

Todas las verificaciones se ejecutaron en limpio, con salida verde y sin regresiones funcionales:

* **Lockfile Guard:** 5/5 pruebas unitarias del validador pasadas, incluyendo
  mutaciones negativas equivalentes en frontend y backend.
* **Carga de SQLite3:** el addon nativo carga limpiamente en el entorno local
  Node 24.14.1. El workflow apunta a Node 22, pero su ejecución remota aún no se
  usa como evidencia hasta completar T35c.
* **Backend:** 322/322 pruebas unitarias y de integración pasadas.
* **Frontend:** 342/342 pruebas unitarias Angular pasadas.
* **Límites Arquitectónicos (Boundaries):** 31/31 reglas verificadas en 47 archivos (0 violaciones, 0 excepciones).
* **Contrato de Colores CSS:** 14/14 comprobaciones superadas en 11 archivos CSS (0 violaciones).
* **Compilación Frontend:** Build de producción exitoso con chunks optimizados.
* **Pruebas End-to-End (E2E):** 36/36 recorridos Playwright verdes en la aplicación actualizada sobre cuatro viewports (386×912, 768×1024, 1024×768, 1440×900).
* **Sonda HTTP Local:** Servidor en puerto 4303 responde `HTTP 200 OK`.

---

## 9. Deuda Técnica No Bloqueante

Durante el proceso de instalación y compilación, npm y herramientas asociadas emiten advertencias sobre paquetes deprecados en ramas transitivas profundas.
* **Criterio de auditoría:** Un warning de deprecación **no equivale a una vulnerabilidad de seguridad activa**; `npm audit` confirma 0 vulnerabilidades.
* **Acción:** Estas advertencias se catalogan como deuda técnica evolutiva no bloqueante y se programan para reevaluación en las ventanas de actualización mayor de dependencias.

---

## 10. Bloqueos que Mantienen Abierto el Checkpoint Global de Seguridad

El checkpoint general de seguridad del proyecto **no se da por cerrado**. Permanecen abiertos los siguientes bloqueos estructurales ya identificados en la línea base:

1. **T00 (Rotación de credenciales expuestas e historial):** La credencial PostgreSQL expuesta en versiones históricas requiere revocación real en el proveedor y saneamiento del historial de Git.
2. **T45c (Cuerpo de error 500 genérico en Maps):** La sustitución del mensaje
   crudo de la excepción del resolvedor externo por un error estable permanece
   pendiente de aprobación expresa del usuario.
3. **T35c (Pruebas en PostgreSQL efímero real):** El workflow ya define el
   servicio PostgreSQL, pero falta una ejecución remota verde que lo pruebe. La
   alternativa local sigue bloqueada porque WSL y el daemon Docker no están
   disponibles.
4. **Delimitación de Partner:** El panel Partner incluye la cadena `admin123` en el cliente como compuerta visual meramente estética; **no constituye autenticación ni control de acceso seguro**. El módulo Partner está formalmente fuera del alcance de este release y no debe computarse como mecanismo de protección.

---

## 11. Procedimiento de Rollback

Revertir el commit atómico de T49 completo: workflow, guard y sus pruebas,
manifests, lockfiles, `.gitignore`, configuración E2E, spec, este informe y el
ítem de `tasks/todo.md`. Después restaurar ambos árboles mediante `npm ci` usando
los lockfiles revertidos. No se requiere rollback de datos ni migraciones porque
T49 no modifica PostgreSQL, SQLite ni contratos HTTP.

---

## 12. Fuentes Oficiales Consultadas

* npm CLI — `npm-ci`: [https://docs.npmjs.com/cli/v11/commands/npm-ci/](https://docs.npmjs.com/cli/v11/commands/npm-ci/)
* npm CLI — `npm-rebuild`: [https://docs.npmjs.com/cli/v11/commands/npm-rebuild/](https://docs.npmjs.com/cli/v11/commands/npm-rebuild/)
* Node.js Corepack Specification: [https://github.com/nodejs/corepack/blob/main/README.md](https://github.com/nodejs/corepack/blob/main/README.md)
* GitHub Actions `setup-node`: [https://github.com/actions/setup-node/blob/main/README.md](https://github.com/actions/setup-node/blob/main/README.md)
* Multer GHSA-3pph-fpjx-jg34: [https://github.com/expressjs/multer/security/advisories/GHSA-3pph-fpjx-jg34](https://github.com/expressjs/multer/security/advisories/GHSA-3pph-fpjx-jg34)
* Angular Router GHSA-ff3f-86qr-9cv3: [https://github.com/advisories/GHSA-ff3f-86qr-9cv3](https://github.com/advisories/GHSA-ff3f-86qr-9cv3)
* Piscina GHSA-67c8-pqhq-4rmx: [https://github.com/advisories/GHSA-67c8-pqhq-4rmx](https://github.com/advisories/GHSA-67c8-pqhq-4rmx)
