# T25 — Resultados, horarios y compartir

T25 se ejecuta en cortes pequeños para no trasladar el monolito de Home a otro
componente.

## T25a1 — Dominio puro de horarios

Archivos de implementación (máximo tres):

1. `frontend/src/app/features/home/results/schedule-utils.ts` (nuevo)
2. `frontend/src/app/features/home/results/schedule-utils.spec.ts` (nuevo)
3. `frontend/src/app/features/home/home.component.ts`

Extraer `formatTime` y el algoritmo de agrupación a funciones puras con tipos para
la entrada cruda y los grupos. Home conserva su `WeakMap` y sus métodos públicos
como adaptadores para no cambiar el template ni recalcular grupos en cada ciclo.

Criterios:

1. Misma salida para rangos consecutivos, pares, días aislados y varios horarios.
2. Entradas vacías o inválidas se ignoran sin excepción y el arreglo original no
   se muta.
3. Pruebas, build y diff verdes sin cambios visuales o de red.

## T25a2 — Presentación reutilizable de horarios

Extraer en un corte posterior el markup duplicado del pin y las tarjetas de punto,
con DOM/clases compatibles y estados vacío/compacto explícitos.

## T25b — Tarjeta de punto

Extraer una tarjeta presentacional controlada por Home. La expansión sigue siendo
exclusiva en el padre; seleccionar origen, compartir, copiar imagen y ver mapa son
eventos tipados sin efectos dentro del hijo.

## T25c — Rutas, detalle y compartir

Separar tarjetas de ruta y detalle de pin. La API Web Share, generación de imagen
y fallback de portapapeles se moverán a un servicio probado; Home conservará
intents, búsqueda y navegación hasta T26.

## Límites comunes

- Sin cambios de estilos ni rediseño durante la extracción.
- Sin dependencias de mapa, servicios HTTP o fachada en componentes de resultado.
- Mantener tarjetas colapsables, identidad activa y selección repetible de origen.
- Partners queda fuera de alcance.
