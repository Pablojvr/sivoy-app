# UI-REB-10 — búsqueda de destinos por lugar de referencia

Estado: implementación y certificación completadas el 2026-10-22.

Evidencia final: 500/500 pruebas frontend, 586/586 backend, 100/100 recorridos
E2E seriales en cuatro viewports, build, fronteras y colores verdes; auditorías
npm de ambos proyectos con 0 vulnerabilidades. La búsqueda conserva catálogo
local, confirmación explícita, contexto durable y degradación segura de Places.

## Objetivo

Permitir que una persona busque un lugar reconocible de El Salvador —por
ejemplo `Parque San Martín`, un hospital, centro comercial, colonia o
edificio— aunque ese nombre no corresponda a un punto de entrega registrado.

La aplicación debe priorizar siempre el catálogo propio. Cuando no exista una
coincidencia local suficientemente fuerte, consultará automáticamente el
servicio de lugares, identificará el municipio y departamento del lugar
seleccionado y ofrecerá puntos registrados del mismo municipio, ordenados por
distancia real respecto al lugar buscado.

La funcionalidad no interpreta frases conversacionales, no convierte un lugar
externo en punto de entrega y no altera rutas, ETA, catálogo ni datos
administrativos.

## Decisiones aprobadas por producto

- La consulta externa se ejecuta automáticamente cuando la búsqueda local no
  produce una coincidencia fuerte y la entrada es válida.
- Las alternativas pertenecen exclusivamente al mismo municipio identificado.
- Cuando existen coordenadas válidas, los puntos se ordenan por distancia
  geodésica respecto al lugar de referencia.
- Si el municipio no contiene puntos, el estado final dice:
  `No existe cobertura cercana o similar`.
- No se sugieren municipios alternativos ni se inventa proximidad fuera del
  municipio identificado.

## Experiencia de usuario

### Flujo principal

1. El usuario escribe en el buscador principal; el catálogo ofrece sugerencias
   desde el primer carácter.
2. El sistema consulta primero puntos y municipios del catálogo. La búsqueda
   externa exige al menos tres caracteres.
3. Una coincidencia local exacta o fuerte se muestra antes que cualquier lugar
   externo.
4. Si no hay coincidencia local fuerte, después de una espera breve el sistema
   consulta automáticamente lugares limitados a El Salvador.
5. La lista incorpora una sección `Lugares en El Salvador` sin ocultar las
   coincidencias locales débiles que todavía puedan ser útiles.
6. El usuario selecciona explícitamente uno de los lugares externos. Nunca se
   elige automáticamente la primera sugerencia.
7. El sistema resuelve nombre, dirección, coordenadas, municipio y
   departamento; después valida municipio y departamento contra el catálogo.
8. Si existe cobertura, se muestra una confirmación contextual y la acción
   `Ver puntos de {municipio}`.
9. Los resultados del municipio se presentan con el contexto
   `Opciones cerca de {lugar}` y se ordenan por distancia real cuando esa
   distancia sea verificable.

### Copia inicial

- Etiqueta accesible: `Buscar municipio, punto o lugar de referencia`.
- Placeholder: `Busca un municipio, punto o lugar`.
- Ayuda opcional: `Ej. Parque San Martín, Santa Tecla`.
- Secciones: `Puntos de entrega`, `Municipios` y `Lugares en El Salvador`.
- Sin punto exacto: `No encontramos un punto con ese nombre.`
- Lugar reconocido: `Encontramos {lugar} en {municipio}.`
- Explicación: `Estas opciones están registradas en el mismo municipio.`
- Acción: `Ver puntos de {municipio}`.
- Sin cobertura municipal: `No existe cobertura cercana o similar`.
- Servicio externo no disponible: `No pudimos buscar lugares en este momento.`

### Estados y accesibilidad

- El buscador conserva resultados anteriores mientras carga una consulta más
  reciente, pero comunica el nuevo estado con `aria-live` sin anunciar cada
  pulsación.
- El teclado recorre primero coincidencias locales y después lugares externos.
- Escape cierra sugerencias; limpiar cancela consultas pendientes, borra
  estados externos y devuelve el foco al campo.
- Carga, vacío, error y selección tienen mensajes distintos y no dependen solo
  de color.
- Objetivos táctiles de al menos 44 px, foco visible y movimiento reducido.

## Reglas de coincidencia y distancia

### Prioridad del catálogo

La clasificación local es determinista:

1. nombre exacto normalizado;
2. nombre que comienza con la consulta;
3. coincidencia completa de palabras del nombre;
4. municipio exacto o por prefijo;
5. otras coincidencias devueltas por el catálogo.

La normalización ignora mayúsculas, espacios repetidos y tildes, pero no debe
transformar una coincidencia débil en una afirmación exacta.

### Activación automática de lugares

- Entrada mínima: 3 caracteres; máxima: 128.
- Espera recomendada: 350 ms desde la última pulsación.
- Solo una consulta externa activa; una consulta nueva cancela o invalida la
  anterior.
- No se consulta Places cuando existe una coincidencia local exacta o fuerte.
- Las sugerencias se restringen a El Salvador y no incluyen predicciones de
  consulta genéricas.
- Cada sesión de búsqueda utiliza un token efímero nuevo; se rota al resolver,
  limpiar o cerrar.

### Validación geográfica

- Municipio y departamento se obtienen de componentes estructurados de la
  dirección y se comparan normalizados contra facetas reales del catálogo.
- El municipio por sí solo no basta cuando existen nombres homónimos; el
  departamento debe desambiguar.
- `formattedAddress` es un respaldo, nunca la única prueba si contradice los
  componentes estructurados.
- Un lugar sin municipio validable no abre resultados y explica que no pudo
  identificarse la cobertura.

### Orden por cercanía

- Solo participan como `cercanos` puntos del mismo municipio validado.
- La distancia se calcula entre las coordenadas resueltas del lugar y las
  coordenadas válidas del punto, mediante una función pura y determinista.
- Los puntos con coordenadas se ordenan de menor a mayor distancia.
- En contexto de referencia se reúnen todas las páginas disponibles del
  municipio antes de ordenar; no se ordena y concatena página por página.
- Los empates preservan el orden del catálogo.
- Los puntos sin coordenadas aparecen después de los puntos medibles, sin
  etiqueta de kilómetros y con `Distancia no disponible` cuando el contexto lo
  requiera.
- Nunca se muestra una distancia ni se usa la palabra `cerca` si las
  coordenadas de cualquiera de los dos extremos son inválidas.
- La distancia es orientativa en línea recta; no promete tiempo de viaje ni
  ruta vial.

## Seguridad, privacidad y resiliencia

- Toda entrada es texto no confiable; Angular la representa como texto y nunca
  mediante `innerHTML`.
- El navegador utiliza únicamente los endpoints propios existentes; la clave
  de Google Places permanece en el servidor.
- El servidor mantiene validación de longitud, región `SV`, token de sesión,
  timeout, códigos de error seguros y rate limiting para mapas.
- La UI no muestra respuestas internas, stack traces, claves, cuotas ni
  detalles del proveedor.
- La consulta externa empieza automáticamente, por lo que la documentación de
  privacidad debe declarar que el texto de una búsqueda sin coincidencia local
  puede enviarse a Google Places para localizar el lugar.
- Fallos, ausencia de configuración o agotamiento de cuota no bloquean la
  búsqueda del catálogo.
- Las respuestas tardías no pueden reemplazar una consulta más reciente.
- No se persisten las consultas ni el lugar externo en `localStorage`.

## Stack y comandos

- Angular 21, TypeScript, RxJS y plantillas/CSS existentes.
- `CatalogService` para puntos y municipios.
- `MapasService.searchPlaces()` y `MapasService.resolvePlace()` existentes.
- Sin dependencias nuevas, cambios de SQL, migraciones ni cambios de ETA.

Comandos de verificación desde `frontend/`:

```text
npx ng test --watch=false --include src/app/features/discovery/discovery-home.component.spec.ts
npm run test:ci
npm run build
npm run check:boundaries
npm run check:css-colors
npm run e2e -- public-shipment-flow.pw.spec.ts public-accessibility.pw.spec.ts
```

Si una implementación posterior necesitara tocar el servidor, también será
obligatorio ejecutar `npm test` desde `backend/`; ese cambio requerirá un spec
de backend aprobado antes de editarlo.

## Estructura propuesta

- `frontend/src/app/features/discovery/discovery-home.component.ts`:
  coordinación local/external, cancelación, selección y emisión del municipio.
- `frontend/src/app/features/discovery/discovery-home.component.html`:
  secciones, mensajes y confirmación del lugar.
- `frontend/src/app/features/discovery/discovery-home.component.css`:
  presentación responsive mediante tokens existentes.
- `frontend/src/app/features/discovery/discovery-home.component.spec.ts`:
  contrato del flujo, concurrencia, errores y accesibilidad estructural.
- `frontend/src/app/core/maps/place-destination-fallback.ts` y `.spec.ts`:
  normalización, coincidencia, coordenadas, Haversine y proyección estable.
- Una función pura de distancia podrá vivir junto al componente o en un
  archivo utilitario focalizado solo si las pruebas demuestran que la extracción
  reduce complejidad; añadir ese quinto archivo requiere conservar el límite de
  alcance delegado.

`MapasService` y los endpoints existentes se reutilizan sin cambios en el MVP.

## Estilo de código

Estados explícitos y tipados; las respuestas externas se validan antes de
convertirse en estado de presentación:

```ts
type PlaceLookupState =
  | { status: 'idle' }
  | { status: 'loading'; query: string }
  | { status: 'ready'; query: string; suggestions: readonly PlaceSuggestion[] }
  | { status: 'error'; query: string; message: string };
```

- No introducir `any` nuevo, estilos inline, `!important` ni colores literales.
- No ordenar en sitio colecciones del catálogo.
- No ejecutar cálculos costosos desde bindings repetidos de plantilla.
- Reutilizar tokens, SVG y patrones de foco actuales.

## Estrategia de pruebas

### Unitarias

- La coincidencia local exacta evita la consulta externa.
- Una búsqueda sin coincidencia fuerte activa Places automáticamente después
  de tres caracteres y del debounce.
- Tildes, mayúsculas y espacios no alteran la prioridad local.
- Una consulta posterior cancela o invalida resultados externos anteriores.
- La selección explícita resuelve el lugar y nunca se selecciona la primera
  sugerencia automáticamente.
- Municipio y departamento se validan juntos, incluidos homónimos.
- La distancia se calcula solo con coordenadas válidas.
- El orden usa distancia ascendente y preserva orden en empates.
- Los puntos sin coordenadas quedan al final y no reciben kilómetros falsos.
- Un municipio sin puntos muestra exactamente
  `No existe cobertura cercana o similar`.
- Places sin configurar, sin resultados, con timeout o error conserva la
  búsqueda local utilizable.
- Limpiar y destruir el componente cancela temporizadores y suscripciones.

El primer incremento de comportamiento debe seguir RED → GREEN con una prueba
que demuestre la activación automática únicamente después de fallar la
coincidencia local.

### E2E y visual

- Buscar un punto exacto abre el flujo actual sin usar Places.
- Buscar `Parque San Martín`, seleccionar el lugar y abrir puntos de Santa
  Tecla conserva el contexto visible del lugar.
- Un municipio sin cobertura presenta el mensaje aprobado y no ofrece
  municipios inventados.
- Navegación por teclado, foco, Escape, limpieza y `aria-live`.
- 386×912, 768×1024, 1024×768 y 1440×900 sin overflow, solapamientos ni
  resultados ocultos por el dock.

## Límites

- **Siempre:** priorizar el catálogo, validar el lugar contra municipio y
  departamento registrados, cancelar respuestas obsoletas, reutilizar
  servicios/tokens y mantener una salida accesible.
- **Pedir aprobación:** cambiar la activación automática, consultar fuera de El
  Salvador, sugerir otros municipios, persistir consultas, modificar rate
  limits, endpoints o contratos de respuesta.
- **Nunca:** seleccionar automáticamente un lugar externo, tratarlo como punto
  de entrega, afirmar una distancia no calculada, exponer claves, enviar datos
  de Guardados al proveedor, cambiar ETA, SQL, seeds o permisos de edición.

## Criterios de aceptación

- [ ] El buscador acepta municipios, puntos registrados y lugares de referencia.
- [ ] Una coincidencia local fuerte siempre tiene prioridad y evita una llamada
  externa innecesaria.
- [ ] Sin coincidencia fuerte, Places se consulta automáticamente con debounce,
  cancelación, región SV y límites de entrada.
- [ ] El usuario elige explícitamente el lugar correcto.
- [ ] Municipio y departamento quedan validados contra el catálogo.
- [ ] Solo se ofrecen puntos del mismo municipio.
- [ ] Los puntos medibles se ordenan por distancia real al lugar y la interfaz
  no confunde distancia lineal con tiempo de viaje.
- [ ] Un municipio sin puntos muestra
  `No existe cobertura cercana o similar` y ninguna alternativa inventada.
- [ ] Errores externos no rompen la búsqueda local ni filtran detalles internos.
- [ ] Teclado, foco, contraste, 44 px y movimiento reducido quedan verificados.
- [ ] La matriz responsive y todos los comandos aplicables quedan verdes.
- [ ] No hay cambios en ETA, SQL, catálogo, dependencias ni datos persistidos.

## Rollback

Revertir únicamente la integración de Places y la proyección por distancia en
Discovery restaura el buscador de catálogo actual. No existen migraciones,
datos persistidos ni contratos de backend nuevos que revertir.

## Pregunta de aprobación

¿Apruebas esta especificación para preparar en un turno posterior el plan y las
tareas de implementación?
