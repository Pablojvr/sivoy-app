# T44 — Contratos HTTP públicos y evolución compatible

## Objetivo

Hacer explícitas las respuestas y errores que consume el MVP antes de diseñar
un envelope uniforme. La búsqueda y el cálculo ETA no deben cambiar por una
normalización de formato. Partner y las escrituras operativas quedan fuera del
cutover actual; solo se inventaría su frontera.

## T44a — Inventario del contrato vigente

- Archivos del paquete (máximo 3): `docs/contracts/public-http-current.md`,
  este spec y `tasks/todo.md`.
- Criterios:
  1. Inventariar método/ruta, forma de éxito/error, estado HTTP, IDs y fechas
     de los endpoints públicos de empresas, ubicaciones, rutas, mapas y salud.
     Distinguir evidencia de pruebas HTTP, código y comportamiento aún no
     verificado; no inferir un contrato de la base de datos ausente.
  2. Vincular cada ruta con su consumidor frontend conocido o indicar que no
     existe consumidor localizado. Documentar la frontera de las cuatro
     escrituras operativas deshabilitadas en producción sin detallar Partner.
  3. Identificar incompatibilidades de forma que requieren una versión o
     adaptador, sin elegir todavía el formato objetivo ni modificar respuestas.
- Validación: cotejo manual contra routers, controllers, servicios frontend y
  `backend/test/rutas-contract.test.js`; `git diff --check` y `git status`.
- Rollback: revertir el commit documental T44a. No hay efecto en runtime.

## Paquetes posteriores sujetos a revisión

- T44b: proponer el contrato objetivo y el plan de compatibilidad para cada
  consumidor; la forma nueva, status y versionado requieren aprobación humana.
- T44c: pruebas de contrato antes de introducir adaptadores HTTP, sin reemplazar
  respuestas legacy ni tocar el motor ETA en el mismo corte.
- T44d: migrar consumidores de forma progresiva y retirar legado solo tras
  equivalencia funcional, E2E y ventana de deprecación aprobada.

## Límites

- Sin cambios de SQL, ETA, rutas, controladores, servicios, CORS, dependencias,
  Partner, despliegue ni contratos observables durante T44a.
- Un documento de inventario derivado del código no demuestra que producción
  responda igual; se registra la fuerza de cada evidencia.
