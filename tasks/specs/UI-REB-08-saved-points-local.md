# UI-REB-08 — puntos guardados locales

## Supuestos a aprobar

1. `Guardados` reemplazará la pestaña pública `Perfil`, que actualmente no
   ofrece una función útil para el MVP.
2. Los puntos se conservarán únicamente en el navegador actual; no habrá
   cuenta, sincronización entre dispositivos ni almacenamiento en PostgreSQL.
3. Se guardará una instantánea pública del punto para abrir y compartir con
   rapidez aun cuando la red falle. Cada registro conservará `pointId`, datos
   visibles del punto, `savedAt` y una versión de esquema.
4. El límite será de 50 puntos por dispositivo para mantener acotados el
   almacenamiento, el renderizado y las operaciones.
5. La acción de compartir reutilizará `PointShareService`; no se creará un
   segundo formato de mensaje.

## Objetivo

Permitir que una persona guarde puntos de encomienda sin iniciar sesión y los
encuentre desde la navegación principal para compartirlos rápidamente con sus
clientes. El flujo debe ser privado al dispositivo, reversible y explícito
sobre su alcance local.

Historias principales:

- Como usuario puedo guardar o quitar un punto desde sus tarjetas públicas.
- Como usuario puedo abrir `Guardados` desde el dock inferior.
- Como usuario puedo compartir, abrir en mapa o revisar un punto guardado.
- Como usuario entiendo que los datos viven solo en este navegador.
- Como usuario puedo buscar inmediatamente entre mis puntos guardados por sus
  datos públicos, sin enviar ni conservar mi consulta.
- Como usuario puedo revisar la foto, dirección completa y datos públicos de un
  punto guardado sin salir de la lista ni hacer más densas sus tarjetas.

## Stack y comandos

- Angular 21, TypeScript y señales/observables ya disponibles en el proyecto.
- Persistencia mediante `localStorage`; sin dependencias nuevas.
- Pruebas: `npm run test:ci -- --include=<spec>` desde `frontend/`.
- Contrato visual: `npm run check:css-colors` desde `frontend/`.
- Compilación: `npm run build` desde `frontend/`.

## Estructura propuesta

- `frontend/src/app/core/saved-points/saved-points.service.ts`: lectura,
  validación, límite, alta/baja y notificación reactiva.
- `frontend/src/app/core/saved-points/saved-points.models.ts`: contrato local
  versionado y normalización de instantáneas públicas.
- `frontend/src/app/features/saved-points/`: pantalla, estados vacío/lista y
  pruebas de interacción.
- `frontend/src/app/shared/components/bottom-nav/`: sustituir Perfil por
  Guardados y mantener semántica de navegación.
- Tarjetas de descubrimiento, resultado y detalle: una única acción Guardar o
  Quitar, reutilizando el servicio canónico.

## Contrato local y estilo de código

```ts
interface SavedPointRecordV1 {
  version: 1;
  pointId: string;
  savedAt: string;
  snapshot: SavedPointSnapshot;
}

const STORAGE_KEY = 'sivoy.saved-points.v1';
```

- El parser tratará `localStorage` como entrada no confiable y validará tipos,
  versión, identificador y longitudes antes de exponer registros.
- La identidad será `pointId`; guardar dos veces será idempotente.
- La lista se ordenará por `savedAt` descendente.
- Una carga corrupta producirá un estado recuperable, nunca una excepción que
  rompa la aplicación.
- Se escuchará el evento `storage` para mantener coherencia entre pestañas del
  mismo navegador.

## Flujo e interfaz

1. Las tarjetas muestran `Guardar` con icono de marcador; al activarlo cambia a
   `Guardado` sin recargar la búsqueda, presenta una notificación de éxito con
   `role="status"` y anima brevemente el botón. Con movimiento reducido la
   confirmación conserva el mensaje, pero elimina la animación no esencial.
2. El tercer elemento del dock pasa de `Perfil` a `Guardados` y usa
   `#/enviar?tab=guardados`.
3. La pantalla Guardados muestra nombre, empresa, municipio, fecha de guardado
   y acciones principales `Compartir` y `Ver punto`; mapa y quitar son
   secundarias.
4. El estado vacío explica cómo guardar el primer punto e incluye un acceso a
   Inicio.
5. Un aviso discreto indica `Guardados en este dispositivo` y evita prometer
   sincronización o respaldo.
6. Cuando existe al menos un punto, un buscador local filtra de inmediato por
   nombre, empresa, municipio, departamento o dirección. La comparación ignora
   mayúsculas y diacríticos, conserva el total en el encabezado y muestra
   `N de M guardados` mientras la consulta está activa.
7. Si no hay coincidencias, se muestra un estado específico con la consulta y
   una acción para limpiarla. Este estado no sustituye el vacío original cuando
   todavía no existen puntos guardados.
8. Cada tarjeta conserva su resumen compacto y ofrece `Vista previa`. La acción
   abre un único `<dialog>` modal: hoja inferior en móvil y modal centrado desde
   768 px. El detalle muestra foto 16:9 o el fallback `Sin fotografía de
   referencia`, nombre, empresa, municipio/departamento, fecha, dirección y las
   acciones existentes, sin coordenadas ni identificadores técnicos. Un fallo
   de imagen también sustituye la miniatura compacta para no dejar imágenes rotas.
9. El diálogo usa la modalidad nativa para dejar el fondo inactivo, cierra por
   botón, Escape o backdrop y restaura el foco al disparador. Su movimiento dura
   240 ms mediante tokens y se elimina con `prefers-reduced-motion`.
10. El shell conserva la reserva principal del dock mediante
    `--si-shell-content-inset-bottom`, que ya incorpora
    `--si-safe-area-bottom`. La lista añade solo una separación final moderada
    `max(--si-space-10, --si-safe-area-bottom)` para que la última acción quede
    completamente visible sin duplicar el inset completo.

## Estrategia de pruebas

- Servicio: esquema válido, datos corruptos, idempotencia, límite de 50,
  eliminación y evento entre pestañas.
- Navegación: `guardados` se resuelve correctamente y `perfil` mantiene una
  redirección compatible durante la transición.
- Componentes: estados Guardar/Guardado, lista, vacío, quitar y compartir.
- Buscador: visibilidad solo con datos, todos los campos públicos, normalización
  de mayúsculas y diacríticos, total/resultado, cero coincidencias y limpieza.
- Vista previa: apertura sin navegación, contenido público, foto y fallo de
  carga, fallback sin foto, acciones existentes, cierre por botón/Escape/
  backdrop, foco restaurado y eliminación segura del registro seleccionado.
- Accesibilidad: botones con nombre, foco visible, estado `aria-pressed`, aviso
  de éxito anunciado, movimiento reducido, dock con `aria-current` y objetivos
  táctiles mínimos de 44 px.
- Responsive: 386×912, 768, 1024 y 1440 px; sin contenido bajo el dock.
- Dock: con cuatro o más registros, desplazar al final y comprobar que la última
  acción queda por encima de la navegación inferior.

## Límites

- **Siempre:** reutilizar tipos, tarjetas, iconos, tokens y servicio de
  compartir; validar todo contenido recuperado del navegador.
- **Pedir aprobación:** cambiar el límite, sincronizar con backend, añadir una
  cuenta o modificar contratos HTTP.
- **Nunca:** guardar ubicación del usuario, credenciales, historial de búsqueda
  ni información privada; tocar Partner, ETA, SQL o migraciones.

## Criterios de aceptación

- [x] Guardar y quitar funciona sin login y persiste tras recargar.
- [x] Guardar confirma el éxito con notificación accesible y animación breve.
- [x] `Guardados` reemplaza visual y funcionalmente a `Perfil`.
- [x] Se puede compartir un punto guardado con el formato existente.
- [x] El estado se refleja en todas las tarjetas abiertas y entre pestañas.
- [x] Datos inválidos de `localStorage` no rompen ni contaminan la interfaz.
- [x] No se añaden dependencias, endpoints ni cambios de base de datos.
- [x] Pruebas focalizadas, contrato de colores y build quedan verdes.
- [x] El buscador aparece solo con puntos guardados y filtra localmente por
  nombre, empresa, municipio, departamento y dirección.
- [x] La búsqueda ignora mayúsculas y diacríticos, no usa red, no persiste la
  consulta y mantiene las acciones de las tarjetas filtradas.
- [x] Una consulta activa muestra `N de M guardados`; el contador circular
  conserva el total y el estado sin resultados permite limpiar la búsqueda.
- [x] El control tiene etiqueta accesible, limpieza por teclado, foco visible y
  objetivos táctiles mínimos de 44 px.
- [x] Una acción compacta abre una sola vista detallada sin navegar, recargar ni
  añadir la dirección completa a las tarjetas.
- [x] La hoja muestra foto protagonista 16:9 o fallback estable, datos públicos
  y acciones canónicas, sin coordenadas ni códigos internos.
- [x] El diálogo bloquea el fondo, cierra por botón, Escape y backdrop, conserva
  interacciones internas y devuelve el foco al disparador.
- [x] El diálogo responde como bottom sheet móvil y modal centrado desde 768 px,
  usa tokens, objetivos de 44 px y elimina animación con movimiento reducido.
- [x] Si se elimina el registro seleccionado, el diálogo se cierra sin dejar
  contenido obsoleto.
- [x] La última tarjeta puede desplazarse completamente sobre el dock usando la
  reserva del shell más una separación local, sin ocultar contenido ni duplicar
  el inset completo.

## Rollback

Revertir los commits del servicio, pantalla y enlaces del dock restaura Perfil.
La clave local puede quedar ignorada sin afectar el producto; no existe
migración de servidor que revertir.

Para revertir únicamente el incremento del buscador, se eliminan sus cambios en
`saved-points.component.ts`, `.html`, `.css`, `.spec.ts` y esta especificación.
Guardados vuelve a mostrar la lista completa; no hay migración ni consulta
persistida que limpiar.

Para revertir únicamente la vista previa detallada y la separación final, se
eliminan sus cambios en los cuatro archivos del componente y esta especificación.
Las tarjetas vuelven a sus acciones anteriores y el buscador permanece intacto;
no hay migración, servicio ni dato nuevo que revertir.

## Aprobación

Alcance aprobado por el usuario el 2026-10-18.
