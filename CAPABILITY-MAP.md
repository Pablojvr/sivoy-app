# Capability Map: reinvención arquitectónica de SiVoy

Estado: aprobado como baseline arquitectónico para ejecución incremental. Este
documento no autoriza por sí solo cambios observables ni despliegues.

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

## Iniciativa: perfiles públicos de empresa

Estado: mapa aprobado para especificación el 27 de octubre de 2026. Esta
iniciativa construye una experiencia de consulta para usuarios; la edición y
administración pertenecen a un panel externo y quedan fuera de este alcance.

| Módulo | Responsabilidad | Depende de |
|---|---|---|
| `public-company-data` | Contrato público de solo lectura para directorio, perfil y presencia digital de empresas | `location-catalog`, `domain-contracts` |
| `company-directory` | Directorio público buscable con acceso explícito al perfil | `public-company-data`, `design-system`, `app-shell` |
| `company-point-browser` | Exploración buscable de puntos de una empresa en lista y mapa | `public-company-data`, `location-catalog`, `map-resource`, `design-system` |
| `company-profile` | Perfil público que compone identidad, presencia digital, cobertura y explorador de puntos | `public-company-data`, `company-point-browser`, `design-system`, `app-shell` |

Orden de construcción:

`public-company-data` → (`company-directory`, `company-point-browser`) →
`company-profile`.

La adopción escalonada de skills de interfaz, accesibilidad, movimiento,
seguridad y revisión se define en
[`docs/UI_SKILLS_ADOPTION_PLAN.md`](docs/UI_SKILLS_ADOPTION_PLAN.md). Los skills
no sustituyen los contratos ni la dirección visual vigente.

Decisiones de frontera de la iniciativa:

- Ningún módulo permite crear, editar o eliminar empresas, redes o puntos.
- La identidad y las relaciones usan `companyId`; el nombre nunca funciona como
  clave de navegación o filtrado.
- Los endpoints legacy de administración no se amplían ni se exponen como
  contratos públicos.
- Los datos de presencia digital son opcionales y las superficies omiten las
  secciones vacías.
- El panel externo de administración tendrá contratos separados y no forma
  parte de esta iniciativa.
- Las vistas viven en rutas públicas fuera de `/admin`; `/admin` y `/partner`
  no se amplían ni se convierten en proveedores de datos para esta iniciativa.

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
