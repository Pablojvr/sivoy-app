# T26 Data Access Centralization

## Architecture Decision Record

### Context
El flujo público ("Enviar") usa llamadas directas a `RutasService` y `MapasService`, mezclando responsabilidad UI y acceso a datos en `HomeComponent`. Además, `RutasService` retorna `Observable<any>`, lo cual corrompe la seguridad de tipos.

### Decision
Migrar el acceso a datos hacia interfaces estrictamente tipadas (T26a), sin alterar componentes UI ni runtime behavior.
- No index signatures ni `any`.
- Respuestas modeladas exactamente como el backend.
- Soporte a polimorfismo en `getUpcomingRoutes` (escalares vs arrays).
- Soporte a coordenadas numéricas/string.
- Uso de `HttpClient` generics y tests de transporte.

### Status
Accepted. T26a-T26c2 were verified independently in tests, production build and the local public flow.

### Tabla de Endpoints y Contratos

| Endpoint | Payload DTO | Success DTO | Failure DTO | Polimorfismo |
| :--- | :--- | :--- | :--- | :--- |
| `/search-flights` | `SearchFlightsPayload` | `results: SearchFlightsResultDto[]` | `RouteErrorBodyDto` (HTTP 500) | Ninguno (siempre array) |
| `/search-routes-by-municipality` | `SearchRoutesByMunicipalityPayload` | `results: MunicipalityRouteItemDto[]` | `results: []` y `origen_msg` | Unión basada en `success` booleano |
| `/get-upcoming-routes` | `GetUpcomingRoutesPayload` | `results[]` o Escalar destapado | Escalar con `origen_msg` | Array si origen es array, escalar si no |

**Nota sobre Validación:** Las respuestas se han modelado exactamente según lo que devuelve el backend. Es importante aclarar que los generics de `HttpClient` proporcionan verificación estática en tiempo de diseño y compilación, NO validación en tiempo de ejecución (runtime validation). El servicio se limita a transportar la red.

### T26b: orquestación del flujo

- El facade cancela búsquedas obsoletas con `switchMap`, incluso entre modos distintos.
- Los adaptadores validan el JSON en runtime y separan respuestas vacías de respuestas inválidas.
- El modelo de ruta normalizado conserva empresa, puntos, coordenadas, horarios y opciones; el estado visual se mantiene en una estructura separada.
- Los errores se exponen mediante códigos y mensajes seguros, sin propagar detalles técnicos del backend.
- La lógica dependiente del reloj local permanece fuera del facade y se integrará como función pura en T26c.

### T26c1: reglas temporales y estado de presentación

- El filtro de horarios cerrados replica el patrón legacy con una fecha inyectada y sin mutar resultados.
- La selección conserva la identidad de la opción cuando cambia su índice tras el filtrado.
- La expansión y selección de opciones se actualizan de forma inmutable desde el facade.

### T26c2: integración en Home

- `HomeComponent` despacha búsquedas municipales y punto-a-punto mediante el facade; ya no se suscribe directamente a `RutasService`.
- Un presentador aislado mantiene el contrato plano requerido temporalmente por la tarjeta y el adaptador de mapa.
- Los estados `loading`, `empty` y `error` limpian resultados y marcadores obsoletos de forma coherente.
- La selección visible conserva su índice de origen después de filtrar horarios cerrados.
- La auditoría local cubrió búsqueda, cálculo real, expansión, cambio de opción y visualización cartográfica.
