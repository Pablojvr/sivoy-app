# Capability Map: reinvención arquitectónica de SiVoy

Estado: propuesta pendiente de aprobación humana.

| Módulo | Responsabilidad | Depende de |
|---|---|---|
| `quality-foundation` | Pruebas, contratos, lint, métricas y Definition of Done | — |
| `domain-contracts` | Modelos compartidos, DTOs y validación de fronteras | `quality-foundation` |
| `data-foundation` | Migraciones, integridad, calendarios y persistencia transaccional | `domain-contracts` |
| `eta-core` | Motor ETA puro, determinista y sin infraestructura | `domain-contracts` |
| `rule-catalog` | Promesas publicadas, alcance, precedencia y excepciones por empresa/punto | `data-foundation` |
| `location-catalog` | Empresas, puntos, municipios y calendarios operativos | `data-foundation` |
| `shipment-search` | Flujo destino → origen → rutas → compartir | `eta-core`, `rule-catalog`, `location-catalog` |
| `map-resource` | Adaptador Mapbox/MapLibre y visualización opcional | `location-catalog` |
| `company-operations` | Registro y administración de empresas y puntos | `location-catalog` |
| `design-system` | Tokens, primitivas visuales, accesibilidad y movimiento | `quality-foundation` |
| `app-shell` | Router, layout, navegación y overlays globales | `design-system` |
| `async-capabilities` | Eventos internos, imports y recursos compartibles | `shipment-search` |
| `delivery-platform` | CI/CD, observabilidad, seguridad y rollback | todos los anteriores |

Orden recomendado:

`quality-foundation` → `domain-contracts` → `data-foundation` → (`eta-core`,
`rule-catalog`, `location-catalog`, `design-system`) → (`shipment-search`, `map-resource`, `company-operations`) →
`app-shell` → `async-capabilities` → `delivery-platform`.

## Decisiones de frontera

- La arquitectura objetivo inicial es un monolito modular.
- Los módulos se comunican mediante contratos, no importando infraestructura ajena.
- Los eventos empiezan dentro del proceso; no se introduce un broker durante el MVP.
- Los mapas son un adaptador opcional, no el núcleo del flujo de búsqueda.
- `eta-core` es el único candidato inicial a microservicio futuro, sujeto a métricas.
- El ETA relaciona el ingreso del vendedor con la disponibilidad prometida en
  destino, sin modelar procesos internos del transportista.
- Las excepciones se modelan como datos versionados y reglas con precedencia, no
  como condicionales específicos de empresas dentro del código.
- No habrá login en el MVP; el diseño no debe introducir autenticación implícitamente.
