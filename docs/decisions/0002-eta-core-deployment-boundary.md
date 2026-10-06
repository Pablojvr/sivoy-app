# 0002: ETA Core Deployment Boundary

**Date:** 2026-09-14
**Status:** Accepted

## Context

El sistema de cálculo de tiempos estimados de llegada (ETA) actualmente opera embebido dentro del monolito modular. Existe discusión sobre si se debe extraer este componente a un microservicio independiente (`eta-core`).

SiVoy funciona como un índice de promesas públicas donde registramos `submittedAt` -> `availableFrom/Until`. La plataforma no modela la recolección, el estado físico de los vehículos, ni el tránsito interno; su responsabilidad principal con el ETA es presentar la ventana de disponibilidad al público.

## Evidence

La auditoría factual muestra la siguiente evidencia:
- `backend/services/logistics.js`: Mezcla lógica de cálculo con *copy* formateado (strings localizados), usa `Date` local/global (`now()`) y estructuras de datos legadas. NO realiza persistencia.
- `backend/src/domains/ubicaciones/ubicaciones.repository.js`: Contiene la lógica real de persistencia.
- `backend/src/domains/rutas/rutas.service.js`: Actúa como orquestador, donde ocurren las lecturas de base de datos *antes* (o durante) de invocar el cálculo.
- `render.yaml`: Demuestra un único *deployment* y una base de datos unificada.
- `docs/decisions/0001-internal-events-in-modular-monolith.md`: Confirma que el sistema de eventos carece de un bus real y no provee asincronía garantizada.

## Decision

Mantener el ETA dentro del monolito modular. Primero debe extraerse y refactorizarse como un módulo puro interno (*boundary* lógico) con contratos versionados.

## Consequences

- **Positivas:** El beneficio real es una llamada síncrona local (en memoria), eliminando fallos de red, latencia y *version skew*. Las lecturas de base de datos ocurren antes o en la orquestación. El resultado es requerido de forma síncrona por HTTP, lo que justifica el diseño. No existe transaccionalidad garantizada para el ETA en sí.
- **Negativas:** El mismo proceso comparte CPU, memoria y es vulnerable a fallos de proceso que afectan a todo el monolito. Esto es mitigable mediante *profiling* y límites de entorno. El *boundary* modular debe impedir importaciones inversas.

## Rejected Alternatives

- **Extraer a microservicio inmediatamente:** Se rechaza. La complejidad de archivos o el deseo de reescribir código en otro lenguaje no justifican un microservicio sin evidencia sostenida.

## Staged Extraction Plan

1. **Characterization fixtures:** Crear pruebas que bloqueen el comportamiento de caja negra.
2. **Domain DTOs:** Definir estructuras de entrada y salida aisladas de la red.
3. **Injectable Clock:** Proveer el reloj como dependencia inyectable. `America/El_Salvador` es una zona explícita del dominio; no se inyectará el *timezone* si el contrato no está definido.
4. **Impedir side effects:** Extraer la localización y *side effects* del cálculo puro.
5. **Comparación estructurada:** Comparar los *outputs* estructurados antes de un *dual-run*, evitando comparar *copy* formateado.
6. **Planes futuros:**
   - **Dual-run old/new:** Ejecutar ambas lógicas simultáneamente.
   - **Parity metric:** Medir discrepancias en los resultados estructurados.
   - **Feature flag:** Alternar al nuevo módulo internamente.
   - **Boundary de proceso:** Cambiar a microservicio usando el mismo contrato, solo si los disparadores lo justifican.

## Measurable Triggers and Non-Triggers

Los disparadores para extracción física incluyen métricas de p95/p99, *throughput* y *error rate* atribuibles al módulo. Los umbrales deben ser acordados y versionados *antes* de la decisión. Se requieren **al menos dos señales técnicas u organizativas sostenidas**; una anomalía aislada no es suficiente.

**Triggers válidos:**
- Saturación sostenida demostrable (CPU/Memoria).
- Necesidad ineludible de escalar y hacer *deploy* de forma independiente.
- *Ownership* separado con equipo autónomo dedicado al ETA.
- Requisitos estrictos de *isolation* de errores y SLO independientes.

**Non-triggers:**
- Complejidad de archivos solucionable con diseño.
- Modas arquitectónicas.

## Risks and Failure Modes

Al posponer el microservicio, evitamos introducir ahora latencia y fallos parciales de red, *distributed tracing*, reintentos e idempotencia entre procesos, *version skew* y propiedad fragmentada de la base de datos. Si una futura extracción es aprobada, su diseño deberá resolver explícitamente cada uno de estos riesgos y definir quién posee los datos y el contrato.

## Rollback

Un futuro plan de *rollback* vía *feature flag* reduciría el *blast radius* en caso de regresiones, pero no garantizaría una estabilidad total por sí solo.
