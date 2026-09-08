# Capability Map: reinvención arquitectónica de SiVoy

Estado: propuesta pendiente de aprobación humana.

| Módulo | Responsabilidad | Depende de |
|---|---|---|
| `quality-foundation` | Pruebas, contratos, lint, métricas y Definition of Done | — |
| `domain-contracts` | Modelos compartidos, DTOs y validación de fronteras | `quality-foundation` |
| `eta-core` | Motor ETA puro, determinista y sin infraestructura | `domain-contracts` |
| `location-catalog` | Empresas, puntos, municipios y horarios | `domain-contracts` |
| `shipment-search` | Flujo destino → origen → rutas → compartir | `eta-core`, `location-catalog` |
| `map-resource` | Adaptador Mapbox/MapLibre y visualización opcional | `location-catalog` |
| `company-operations` | Registro y administración de empresas y puntos | `location-catalog` |
| `design-system` | Tokens, primitivas visuales, accesibilidad y movimiento | `quality-foundation` |
| `app-shell` | Router, layout, navegación y overlays globales | `design-system` |
| `async-capabilities` | Eventos internos, imports y recursos compartibles | `shipment-search` |
| `delivery-platform` | CI/CD, observabilidad, seguridad y rollback | todos los anteriores |

Orden recomendado:

`quality-foundation` → `domain-contracts` → (`eta-core`, `location-catalog`,
`design-system`) → (`shipment-search`, `map-resource`, `company-operations`) →
`app-shell` → `async-capabilities` → `delivery-platform`.

## Decisiones de frontera

- La arquitectura objetivo inicial es un monolito modular.
- Los módulos se comunican mediante contratos, no importando infraestructura ajena.
- Los eventos empiezan dentro del proceso; no se introduce un broker durante el MVP.
- Los mapas son un adaptador opcional, no el núcleo del flujo de búsqueda.
- `eta-core` es el único candidato inicial a microservicio futuro, sujeto a métricas.
- No habrá login en el MVP; el diseño no debe introducir autenticación implícitamente.

