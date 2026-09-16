# Contratos Legacy de Rutas (v1)

Este documento describe el contrato observable de los endpoints legacy de rutas, separando hechos observables de peculiaridades que deberán ser refactorizadas en el futuro (T44).

## 1. POST /api/get-upcoming-routes

### Request
| Campo | Tipo | Requerido | Default | Notas |
|-------|------|-----------|---------|-------|
| `origen` | string \| string[] | Sí | - | |
| `destino` | string \| string[] | Sí | - | |
| `dropoff_date` | string (YYYY-MM-DD) | No | Día actual UTC * | * Si falta fecha u hora, se calculan ambas. `date` usa `new Date().toISOString().split('T')[0]` (UTC). |
| `dropoff_time` | string (HH:MM) | No | Hora actual local * | * `time` usa `new Date().toTimeString()` (Local). |

### Responses

**200 OK (Éxito - Variantes escalares vs array)**
- **Peculiaridad legacy:** Si `origen` y `destino` son escalares, el resultado exitoso mezcla propiedades a nivel raíz. Si alguno es array, devuelve un sobre con `results: []`.
- **Objetivo futuro:** Homogeneizar bajo una misma estructura paginada o envoltorio de respuesta independientemente de si los parámetros de búsqueda son escalares o múltiples.

*Ejemplo (Ambos escalares):*
```json
{
  "success": true,
  "empresa": "Empresa A",
  "origen_nombre": "Agencia Central",
  "origen_msg": "Ingresa hoy",
  "destino_nombre": "Sucursal Norte",
  "opciones": [
    {
      "fecha_llegada": "Mañana",
      "horario_recoleccion": "Tarde",
      "fecha_llegada_iso": "2026-09-17"
    }
  ],
  "opciones_entrega": [
    {
      "dropoff_date": "2026-09-16",
      "dropoff_msg": "Ingresa hoy",
      "fecha_llegada": "Mañana",
      "horario_recoleccion": "Tarde"
    }
  ]
}
```

*Ejemplo (Algún parámetro como array):*
```json
{
  "success": true,
  "results": [
    {
      "empresa": "Empresa A",
      "origen_nombre": "Agencia Central",
      "origen_msg": "Ingresa hoy",
      "destino_nombre": "Sucursal Norte",
      "opciones": [
        {
          "fecha_llegada": "Mañana",
          "horario_recoleccion": "Tarde",
          "fecha_llegada_iso": "2026-09-17"
        }
      ],
      "opciones_entrega": [
        {
          "dropoff_date": "2026-09-16",
          "dropoff_msg": "Ingresa hoy",
          "fecha_llegada": "Mañana",
          "horario_recoleccion": "Tarde"
        }
      ]
    }
  ]
}
```

**200 OK (Éxito - Array vacío)**
- Si se envían arrays y no hay coincidencias: `{ "success": true, "results": [] }`

**200 OK (Éxito: false - Escalares sin resultados)**
- Si son escalares y no hay resultado: `{ "success": false, "origen_msg": "No hay rutas disponibles o no operan en esa zona/empresa." }`

**Orden de resultados:**
- Itera `origen` y `destino` en el orden recibido.

**400 Bad Request**
- Si falta `origen` o `destino`: `{ "error": "Missing origin or destination" }`

**500 Internal Server Error**
- Ante cualquier otro error: `{ "error": "Database error" }`

---

## 2. POST /api/search-routes-by-municipality

### Request
| Campo | Tipo | Requerido | Default | Notas |
|-------|------|-----------|---------|-------|
| `origen` | string \| string[] | Sí | - | |
| `destinos` | string[] | Sí | - | Validación ocurre en rutas.service.js, no en controller. |
| `dropoff_date` | string (YYYY-MM-DD) | No | Día actual UTC * | * Si falta fecha u hora, se calculan ambas. `date` usa `new Date().toISOString().split('T')[0]` (UTC). |
| `dropoff_time` | string (HH:MM) | No | Hora actual local * | * `time` usa `new Date().toTimeString()` (Local). |
| `arrival_date` | string (YYYY-MM-DD) | No | - | Usado para filtrar `fecha_llegada_iso`. |

### Responses

**200 OK (Éxito - Variantes escalares vs array)**
- **Peculiaridad legacy:** Si `origen` es un escalar, los campos `origen_msg` y `origen_nombre` aparecen en la raíz junto a `results`, y los ítems de `results` no traen `empresa` ni `origen_nombre`. Si `origen` es array, los campos globales no existen en la raíz y cada ítem en `results` incluye `origen_nombre` y `empresa`.

*Ejemplo (Origen escalar):*
```json
{
  "success": true,
  "origen_msg": "Ingresa hoy",
  "origen_nombre": "Agencia Central",
  "results": [
    {
      "destino_nombre": "Sucursal Norte",
      "fecha_llegada": "Mañana",
      "horario_recoleccion": "Tarde",
      "origen_msg": "Ingresa hoy",
      "opciones": [
        {
          "fecha_llegada": "Mañana",
          "horario_recoleccion": "Tarde",
          "fecha_llegada_iso": "2026-09-17"
        }
      ]
    }
  ]
}
```

*Ejemplo (Origen array):*
```json
{
  "success": true,
  "results": [
    {
      "origen_nombre": "Agencia Central",
      "empresa": "Empresa A",
      "destino_nombre": "Sucursal Norte",
      "fecha_llegada": "Mañana",
      "horario_recoleccion": "Tarde",
      "origen_msg": "Ingresa hoy",
      "opciones": [
        {
          "fecha_llegada": "Mañana",
          "horario_recoleccion": "Tarde",
          "fecha_llegada_iso": "2026-09-17"
        }
      ]
    }
  ]
}
```

**200 OK (Éxito - Origen array vacío)**
- Si el origen es un array y no produce resultados: `{ "success": true, "results": [] }`

**200 OK (`success: false` - origen escalar sin ingreso)**
- Devuelve `{ "success": false, "origen_msg": "<mensaje del cálculo de ingreso>", "results": [] }` cuando es un origen escalar sin ingreso calculable. El texto de `origen_msg` depende de la regla aplicada al punto.

**Orden de resultados:**
- Los resultados se agregan según los loops iterativos de orígenes y destinos.

**400 Bad Request**
- Si faltan parámetros o `destinos` no es array: `{ "error": "Missing parameters or destinos is not an array" }`

**404 Not Found**
- Nota: 404 por `result.success=false/error` existe en el controller, pero el servicio observado lanza una excepción si el origen escalar está ausente.

**500 Internal Server Error**
- Ante cualquier otro error: `{ "error": "<mensaje literal de la excepción>" }`

---

## 3. POST /api/search-flights

### Request
| Campo | Tipo | Requerido | Default | Notas |
|-------|------|-----------|---------|-------|
| `origen_municipio` | string | Sí | - | |
| `origen_departamento` | string | No | - | |
| `destino_municipio` | string | Sí | - | |
| `destino_departamento`| string | No | - | |
| `dropoff_date` | string (YYYY-MM-DD) | No | Día actual UTC * | * Si falta fecha u hora, se calculan ambas. `date` usa `new Date().toISOString().split('T')[0]` (UTC). |
| `dropoff_time` | string (HH:MM) | No | Hora actual local * | * `time` usa `new Date().toTimeString()` (Local). |

### Responses

**200 OK (Éxito)**
- **Peculiaridad legacy:** El campo del nombre de destino es `destino_nombre_destino` en lugar de `destino_nombre`. Además, siempre devuelve un array `results`.

*Ejemplo:*
```json
{
  "success": true,
  "results": [
    {
      "empresa": "Empresa A",
      "origen_nombre": "Agencia Central",
      "origen_tipo": "agencia",
      "origen_lat": 10.0,
      "origen_lng": -10.0,
      "destino_nombre_destino": "Sucursal Norte",
      "destino_tipo": "sucursal",
      "destino_lat": 20.0,
      "destino_lng": -20.0,
      "origen_msg": "Ingresa hoy",
      "fecha_llegada": "Mañana",
      "horario_recoleccion": "Tarde",
      "opciones_entrega": [
        {
          "dropoff_date": "2026-09-16",
          "dropoff_msg": "Ingresa hoy",
          "fecha_llegada": "Mañana",
          "horario_recoleccion": "Tarde"
        }
      ],
      "distance": 0
    }
  ]
}
```

**200 OK (Éxito - Vacío)**
- Si no hay vuelos: `{ "success": true, "results": [] }`

**Orden de resultados:**
- Los resultados se ordenan por empresa usando un sort estable. No hay paginación.

**400 Bad Request**
- Si falta origen o destino municipio: `{ "error": "Missing origin or destination" }`

**500 Internal Server Error**
- Error de DB u otros: `{ "error": "Database error in search-flights" }`

## Incertidumbres Notadas
- Para `getUpcomingRoutes`, si se mandan arrays pero no se encuentra origen ni destino, devuelve `{ "success": true, "results": [] }` pero la estructura difiere del `{ success: false }` si se pasan escalares y no hay resultados.
- Se asume que `opciones` incluye `{ fecha_llegada, horario_recoleccion, fecha_llegada_iso }` según su uso en `arrival_date` en `searchRoutesByMunicipality`, pero el shape completo es inferido.
- La paginación no existe actualmente. Todo el resultado se devuelve en un solo array, o aplanado en la raíz.
