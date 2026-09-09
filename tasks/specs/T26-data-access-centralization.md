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
T26a accepted after independent audit; T26b-T26c remain in progress.

### Tabla de Endpoints y Contratos

| Endpoint | Payload DTO | Success DTO | Failure DTO | Polimorfismo |
| :--- | :--- | :--- | :--- | :--- |
| `/search-flights` | `SearchFlightsPayload` | `results: SearchFlightsResultDto[]` | `RouteErrorBodyDto` (HTTP 500) | Ninguno (siempre array) |
| `/search-routes-by-municipality` | `SearchRoutesByMunicipalityPayload` | `results: MunicipalityRouteItemDto[]` | `results: []` y `origen_msg` | Unión basada en `success` booleano |
| `/get-upcoming-routes` | `GetUpcomingRoutesPayload` | `results[]` o Escalar destapado | Escalar con `origen_msg` | Array si origen es array, escalar si no |

**Nota sobre Validación:** Las respuestas se han modelado exactamente según lo que devuelve el backend. Es importante aclarar que los generics de `HttpClient` proporcionan verificación estática en tiempo de diseño y compilación, NO validación en tiempo de ejecución (runtime validation). El servicio se limita a transportar la red.
