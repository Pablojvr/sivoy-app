# UI-REB-11 — búsqueda de lugares con sesgo de ubicación

Estado: propuesta de producto pendiente de aprobación e implementación.

## Objetivo

Extender UI-REB-10 con un patrón similar al buscador de movilidad: una consulta
genérica como `gasolinera uno` conserva primero los puntos y municipios del
catálogo; si activa Places, ordena las sugerencias usando la ubicación precisa
del usuario únicamente cuando esa ubicación ya fue concedida. Sin ubicación
precisa, la búsqueda continúa limitada a El Salvador y no afirma cercanía.

## Reglas propuestas

- El catálogo propio conserva prioridad y no cambia su orden por este sesgo.
- La ubicación solo influye en sugerencias externas; nunca amplía cobertura ni
  convierte un lugar externo en punto de entrega.
- No se solicita permiso de GPS exclusivamente para escribir en el buscador.
  Se reutiliza una ubicación precisa ya concedida durante la sesión.
- Con ubicación precisa: Places recibe un sesgo geográfico acotado y la UI puede
  explicar `Resultados priorizados desde tu ubicación`.
- Sin ubicación precisa: Places mantiene `regionCode: SV` y restricción nacional;
  la UI usa `Lugares en El Salvador`, sin `cerca de ti` ni distancia.
- El usuario siempre selecciona explícitamente una sugerencia.
- La búsqueda por lugar de destino sigue mostrando únicamente puntos registrados
  del mismo municipio validado, como define UI-REB-10.
- Coordenadas, consulta y token no se persisten en `localStorage` ni se incluyen
  en logs de aplicación.

## Cambios que requerirían aprobación

Este incremento cambia el contrato de `POST /api/places/autocomplete`: añadiría
un campo opcional de ubicación, validado en frontend y backend, y lo traduciría
a `locationBias` del proveedor. Por las reglas del repositorio requiere un spec
de backend aprobado, pruebas focalizadas, rate limiting vigente y rollback al
contrato actual sin ubicación.

## Criterios de aceptación propuestos

- [ ] Una coincidencia local fuerte continúa evitando Places.
- [ ] Ubicación precisa ya concedida sesga resultados externos sin filtrar las
  coordenadas al cliente, logs o almacenamiento persistente.
- [ ] Ubicación denegada, ausente o inválida conserva búsqueda nacional en SV.
- [ ] La UI nunca afirma cercanía cuando el proveedor no puede verificarla.
- [ ] Consulta posterior cancela la anterior y rota el token de sesión.
- [ ] Pruebas cubren ubicación válida, denegada, manipulada, fuera de El Salvador,
  proveedor no configurado y respuesta tardía.
- [ ] No cambia ETA, SQL, catálogo, datos administrativos ni permisos.

## Rollback

Eliminar el campo opcional de ubicación del request y dejar el cuerpo actual
`{ query, sessionToken }`; Places vuelve a ordenar dentro de El Salvador sin
sesgo. No hay migraciones ni datos persistidos que revertir.
