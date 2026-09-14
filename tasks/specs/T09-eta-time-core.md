# T09 Extraer fechas y horarios al núcleo ETA puro

**Objetivo:** Consolidar toda la lógica de tiempos y cálculo de ETA en un núcleo puro, basando el tiempo en datos inmutables `{year, month, day}` (fecha civil) y sin depender de la zona horaria del host. No debe introducir nuevas dependencias de paquetes, ni afectar a controladores, TypeScript, el módulo de Partner o la base de datos. Preserva el comportamiento público y las interfaces para los consumidores actuales durante el proceso.

## T09a: Caracterización y contratos del núcleo temporal

*   **Archivos:** `backend/src/core/eta/date.js`, `backend/test/eta-date.test.js` (2 archivos).
*   **Criterios de aceptación:**
    1.  `date.js` debe modelar una fecha civil como datos planos inmutables `{year, month, day}`. Su parseo `YYYY-MM-DD`, `addDays`, `weekday`, `compare` y formateo ISO no deben depender de la zona horaria del host. Puede usar `Date.UTC` internamente solo con getters explícitos UTC (nunca locales).
    2.  Las pruebas deben comprobar salidas iguales cuando procesos de Node separados se ejecutan con `TZ=UTC`, `TZ=America/Los_Angeles` o `TZ=America/El_Salvador`.
    3.  El archivo de prueba no debe invocar recursivamente a `node --test`.
*   **Comandos de prueba:**
    ```powershell
    cd backend
    $env:TZ="UTC"; node --test test/eta-date.test.js
    $env:TZ="America/Los_Angeles"; node --test test/eta-date.test.js
    $env:TZ="America/El_Salvador"; node --test test/eta-date.test.js
    ```
*   **Rollback:** `git revert HEAD` (revertir commit atómico).
*   **Fuera de alcance:** Modificar flujos de Partner, dependencias de paquetes, controladores, TS o DB.

## T09b: Implementación de pureza en adapter logístico

*   **Archivos:** `backend/services/logistics.js`, `backend/test/logistics.test.js` (2 archivos).
*   **Criterios de aceptación:**
    1.  Integrar únicamente los helpers de fecha seguros en `logistics.js`.
    2.  Preservar cada exportación, lista de argumentos, retorno de objetos `Date`, strings localizados y comportamiento HTTP de `logistics.js`.
    3.  Añadir pruebas de paridad en `backend/test/logistics.test.js`.
*   **Comandos de prueba:**
    ```powershell
    cd backend
    node --test test/logistics.test.js
    ```
*   **Rollback:** `git revert HEAD` (revertir commit atómico).
*   **Fuera de alcance:** Extraer lógica estructurada, dependencias de paquetes, TS, controladores, Partner, DB.

## T09c: Extracción de cálculo de ingreso oficial

*   **Archivos:** `backend/src/core/eta/official-entry.js`, `backend/test/official-entry.test.js`, `backend/services/logistics.js` (3 archivos).
*   **Criterios de aceptación:**
    1.  Extraer el cálculo estructurado de ingreso oficial a `backend/src/core/eta/official-entry.js`.
    2.  Añadir y pasar pruebas exhaustivas en su suite dedicada para el cálculo estructurado.
    3.  Mantener a `logistics.js` como un adaptador legado localizado que consume la nueva función sin alterar las salidas.
*   **Comandos de prueba:**
    ```powershell
    cd backend
    node --test test/official-entry.test.js test/logistics.test.js
    ```
*   **Rollback:** `git revert HEAD` (revertir commit atómico).
*   **Fuera de alcance:** Cambios en rutas públicas, dependencias de paquetes, controladores, TS, Partner o DB.

## T09d: Extracción de reglas de proyección de rutas

*   **Archivos:** `backend/src/core/eta/route-projection.js`, `backend/test/route-projection.test.js`, `backend/services/logistics.js` (3 archivos).
*   **Criterios de aceptación:**
    1.  Extraer el cálculo estructurado de proyección de rutas y reglas a `backend/src/core/eta/route-projection.js`.
    2.  Implementar y validar las pruebas de la proyección de rutas en su archivo de pruebas dedicado.
    3.  Asegurar que el adaptador `logistics.js` siga preservando la salida esperada al utilizar el nuevo cálculo.
*   **Comandos de prueba:**
    ```powershell
    cd backend
    node --test test/route-projection.test.js test/logistics.test.js
    ```
*   **Rollback:** `git revert HEAD` (revertir commit atómico).
*   **Fuera de alcance:** Modificar endpoints de Partner, dependencias de paquetes, controladores, TS o DB.

## T09e: Cutover y aislamiento final

*   **Archivos:** `backend/services/logistics.js` (1 archivo).
*   **Criterios de aceptación:**
    1.  Ejecutar el cutover internamente solo sobre `backend/services/logistics.js`.
    2.  Dejar inalterado `backend/src/domains/rutas/rutas.service.js` porque su contrato queda preservado por el adaptador.
    3.  Asegurar que pasen todas las pruebas completas del backend y chequeos de sintaxis sin alertas en dependencias NPM de producción.
*   **Comandos de prueba:**
    ```powershell
    cd backend
    node --test
    npm audit --omit=dev
    node -c services/logistics.js
    ```
*   **Rollback:** `git revert HEAD` (revertir commit atómico).
*   **Fuera de alcance:** Cambios en `rutas.service.js`, dependencias de paquetes, controladores, TS, Partner o DB.
