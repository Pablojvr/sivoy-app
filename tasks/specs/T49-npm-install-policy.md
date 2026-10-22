# T49 — Política reproducible de instalación npm

## Objetivo

Reducir la superficie de supply chain de los dos árboles npm, remediar los
advisories vigentes sin saltos mayores y preservar el comportamiento de la
aplicación. CI debe usar la versión de npm declarada por cada proyecto,
verificar el lockfile antes de ejecutar código de terceros y permitir únicamente
los scripts de instalación que el árbol actual necesita.

## Alcance

- `frontend/package.json` y `backend/package.json`: declarar
  `packageManager: npm@11.11.0` y resolver Playwright desde el script local.
- `frontend/playwright.config.ts`: iniciar el servidor E2E con el mismo npm
  fijado por Corepack.
- `scripts/check-install-scripts.cjs`: comprobar ambos lockfiles antes de la
  instalación.
- `scripts/check-install-scripts.test.cjs`: caracterizar la política y sus
  rechazos.
- `.github/workflows/ci.yml`: usar `corepack npm`, instalar con scripts
  desactivados, verificar firmas antes de cualquier lifecycle script y
  reconstruir solo la allowlist.
- `backend/package-lock.json`: resolver Multer 2.4.0 y transitivos corregidos.
- `frontend/package.json` y `frontend/package-lock.json`: alinear Angular
  framework 21.2.25 y build/CLI 21.2.24, resolver transitivos corregidos y
  fijar `piscina@5.3.2` mediante `overrides` mientras Angular 21.2.24 mantiene
  una referencia exacta vulnerable a 5.2.0.
- `.gitignore`: excluir archivos de entorno y material criptográfico local,
  preservando los ejemplos versionados.

El lockfile frontend se regenera desde el manifiesto porque el anterior fijaba
peers Angular 21.2.22 incompatibles con el parche. Se rechaza el lock alternativo
generado con `legacy-peer-deps` porque un `npm ci` normal detectó entradas
faltantes. No se toca Partner, ETA, SQL, migraciones, contratos HTTP, secretos ni
despliegues.

## Política aprobada por este slice

| Proyecto | Paquete con script | Versión | Tratamiento en CI |
| --- | --- | --- | --- |
| backend | `sqlite3` | `6.0.1` | reconstrucción explícita |
| frontend | `@parcel/watcher` | `2.6.0` | reconstrucción explícita |
| frontend | `esbuild` | `0.28.1` | reconstrucción explícita |
| frontend | `lmdb` | `3.5.1` | reconstrucción explícita |
| frontend | `msgpackr-extract` | `3.0.4` | reconstrucción explícita |
| frontend | `fsevents` | `2.3.3` | permitida en lock; no aplica al runner Linux |

El guard falla si aparece, desaparece o cambia de versión una entrada
`hasInstallScript`, si el lockfile deja de ser v3, si un artefacto resuelto no
proviene exactamente de `https://registry.npmjs.org/`, contiene credenciales o
puerto personalizado, carece de origen verificable o no tiene integridad SHA-512.
Cualquier cambio del grafo exige una revisión explícita de esta tabla.

## Criterios de aceptación

1. Los dos manifests declaran exactamente `npm@11.11.0` y CI invoca npm por
   medio de Corepack.
2. La política del lockfile se valida antes de `npm ci`.
3. `npm ci --ignore-scripts` no ejecuta lifecycle scripts implícitos y, con el
   árbol ya materializado, sus firmas se validan antes de cualquier rebuild.
4. Solo la allowlist necesaria se reconstruye con
   `npm rebuild --ignore-scripts=false`.
5. Playwright se invoca desde `node_modules/.bin` mediante un script npm local,
   sin resolución dinámica del paquete mediante `npx`.
6. Pruebas del guard, suites completas, auditorías, build y smoke E2E permanecen
   verdes.
7. `npm audit` final informa cero vulnerabilidades en ambos árboles y `npm ci`
   funciona sin `--force` ni opciones de peers heredados.

## Verificación

```powershell
node --test scripts/check-install-scripts.test.cjs
node scripts/check-install-scripts.cjs backend/package-lock.json backend
node scripts/check-install-scripts.cjs frontend/package-lock.json frontend

cd backend
corepack npm ci --ignore-scripts
corepack npm audit signatures
corepack npm rebuild sqlite3 --ignore-scripts=false
corepack npm audit --omit=dev --audit-level=high
corepack npm test

cd ../frontend
corepack npm ci --ignore-scripts
corepack npm audit signatures
corepack npm rebuild @parcel/watcher esbuild lmdb msgpackr-extract --ignore-scripts=false
corepack npm audit --audit-level=high
corepack npm run test:ci
corepack npm run build -- --configuration production
corepack npm run e2e -- --ignore-snapshots
```

## Rollback

Revertir en un único commit este spec, el guard y su prueba, los manifests,
lockfiles, `.gitignore`, configuración E2E y los pasos de política añadidos al
workflow. Después, restaurar los árboles con `npm ci` usando los lockfiles
revertidos.

## Fuentes oficiales

- npm 11 `npm ci`: `ignore-scripts` impide ejecutar scripts declarados por
  dependencias: https://docs.npmjs.com/cli/v11/commands/npm-ci/
- npm 11 `npm rebuild`: reconstruye los lifecycle scripts suprimidos durante la
  instalación: https://docs.npmjs.com/cli/v11/commands/npm-rebuild/
- Corepack: `packageManager` y `corepack <binary>` fuerzan una versión concreta:
  https://github.com/nodejs/corepack/blob/main/README.md
- `actions/setup-node`: no instala una versión de npm y recomienda lockfiles:
  https://github.com/actions/setup-node/blob/main/README.md
- Multer GHSA-3pph-fpjx-jg34: 2.4.0 es la versión corregida:
  https://github.com/expressjs/multer/security/advisories/GHSA-3pph-fpjx-jg34
- Piscina GHSA-67c8-pqhq-4rmx: 5.3.2 corrige el gadget de prototype pollution
  con impacto potencial de ejecución de código:
  https://github.com/advisories/GHSA-67c8-pqhq-4rmx
