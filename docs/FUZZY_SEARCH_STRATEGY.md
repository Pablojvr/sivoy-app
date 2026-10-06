# Búsqueda tolerante en SiVoy

## Objetivo

Permitir que una persona encuentre un municipio o punto aunque escriba sin
acentos, use palabras incompletas o cometa un error tipográfico corto. La
búsqueda ayuda a elegir; no modifica rutas, reglas ETA ni datos publicados.

## Decisión para el MVP

El catálogo actual tiene 185 puntos, por lo que no se justifica incorporar una
dependencia de búsqueda ni un índice remoto. `core/utils/fuzzy-search.ts` aplica
un ranking determinista en memoria:

1. coincidencia exacta;
2. prefijo;
3. texto contenido;
4. coincidencia por palabras;
5. distancia Damerau-Levenshtein limitada a uno o dos cambios.

Las consultas de uno o dos caracteres no reciben tolerancia tipográfica para
evitar ruido. La normalización elimina acentos, diferencia de mayúsculas,
signos y espacios repetidos. Los empates conservan el orden original, haciendo
el resultado predecible y fácil de probar.

## Superficies identificadas

| Superficie | Estado | Siguiente acción |
| --- | --- | --- |
| Buscador del Inicio | Integrado | Medir términos sin resultado y relevancia percibida. |
| Selector de municipio destino | Coincidencia normalizada literal | Migrar a la utilidad común con pruebas del orden al presionar Enter. |
| Selector de municipio/agencia origen | Coincidencia normalizada literal | Migrar después de destino y respetar compatibilidad por empresa. |
| Filtro de puntos de origen compatibles | Coincidencia normalizada literal | Migrar sin alterar paginación ni exclusión del destino seleccionado. |
| Administración | Coincidencia normalizada literal | Posponer hasta retomar ese flujo. |
| Partner | Fuera de alcance | No modificar durante el MVP público. |
| Ayuda de lugares de Google | Servicio externo | Mantener separado; fuzzy local solo actúa después del municipio resuelto. |

## Límites y evolución

- Mantener el procesamiento local mientras el catálogo siga en cientos o pocos
  miles de registros.
- Medir tiempo de búsqueda antes de introducir índices, Web Workers o búsqueda
  del lado del servidor.
- No corregir silenciosamente el texto del usuario; mostrar resultados
  ordenados y permitir que la persona elija.
- Si el catálogo crece lo suficiente para paginar desde servidor, trasladar el
  mismo contrato de relevancia al backend y conservar la utilidad como fallback.
- Las pruebas deben cubrir acentos salvadoreños, consultas parciales,
  transposiciones, ausencia de resultados y orden estable.
