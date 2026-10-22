# T48c Limpieza del ciclo de vida del shell y Home

## Objetivo

Impedir que respuestas HTTP y temporizadores pendientes modifiquen estado, creen intervalos o invoquen recursos visuales después de destruir los componentes públicos.

## Alcance incremental

### T48c1 — carga inicial del shell

- La suscripción a `UbicacionesService.getLocations()` debe quedar bajo propiedad explícita de `MobileAppComponent`.
- `ngOnDestroy()` debe cancelarla antes de liberar mapa, observadores e intervalos.
- Una respuesta tardía no debe actualizar ubicaciones ni crear el intervalo de estados.

### T48c2 — búsquedas y temporizadores de Home

- Las búsquedas y resoluciones de lugares deben cancelarse al destruir `HomeComponent`.
- Los temporizadores de intención inicial y desplazamiento al pin seleccionado deben quedar identificados y cancelarse al destruir el componente.
- Ningún callback tardío debe modificar la interfaz ni mostrar notificaciones después del teardown.

## Criterios de aceptación

1. Cada regresión se demuestra primero con una prueba roja enfocada.
2. Las pruebas verifican cancelación observable, no solamente ausencia de excepciones.
3. El conjunto completo de pruebas frontend y el build de producción permanecen verdes.
4. No cambia ningún contrato HTTP, algoritmo ETA, navegación pública ni comportamiento visible vigente.

## Rollback

Revertir cada subfase como commit independiente. La retirada de T48c1 restaura únicamente la propiedad previa de la suscripción inicial; la retirada de T48c2 restaura únicamente la propiedad previa de búsquedas y temporizadores de Home.
