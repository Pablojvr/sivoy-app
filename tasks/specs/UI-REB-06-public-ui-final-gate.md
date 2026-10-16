# UI-REB-06 — Gate final de la interfaz pública

Fecha: 2026-10-16

## Objetivo

Cerrar las brechas verificables del recorrido público después de UI-REB-01 a
UI-REB-05, sin tocar Partner, contratos HTTP, lógica ETA, datos ni producción.

## Alcance

- Eliminar colores inline del hero del detalle y usar únicamente tokens `--si-*`.
- Eliminar la excepción `!important` del slot oculto sin desmontar Inicio.
- Servir y configurar localmente el worker ESM de MapLibre antes de crear mapas.
- Probar regreso, avance, recarga y enlace directo del recorrido público.
- Convertir errores de consola, página o solicitudes fallidas en una regresión E2E.

## Fuera de alcance

- Partner y Admin visual.
- Backend, PostgreSQL, contratos HTTP, ETA, rutas o reglas empresariales.
- Dependencias nuevas, secretos, producción, release o migraciones.

## Criterios de aceptación

1. `pin-detail-card` no publica estilos inline ni colores literales; una imagen
   dinámica se representa con `img` decorativa y el fallback proviene del CSS.
2. El shell mantiene Inicio montado al alternar a Perfil y no contiene
   `!important`.
3. MapLibre carga su worker y módulo compartido desde el mismo origen, sin error
   de worker ni degradación del mapa.
4. Inicio -> resultados soporta atrás, adelante y recarga; un enlace directo de
   punto restaura un contexto visible y utilizable.
5. El smoke E2E falla ante errores de consola, `pageerror` o `requestfailed`;
   las teselas remotas se aíslan mediante una respuesta PNG local y el caso
   confirma que el mapa las solicitó.
6. Pruebas, contratos, build, E2E y revisión visual permanecen verdes.

## Verificación

- Pruebas focalizadas de `PinDetailCard`, `MobileApp` y `MapLibreMapAdapter`.
- `npm run test:ci`, `npm run check:css-colors`,
  `npm run check:boundaries`, `npm run build` y `npm run e2e` desde `frontend/`.
- Navegador real con ficha visible, mapa renderizado y consola sin errores.

## Rollback

Revertir el commit del gate. No hay migración, dependencia nueva, cambio de
backend ni dato que recuperar.
