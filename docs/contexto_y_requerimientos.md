# DOCUMENTO DE CONTEXTO Y REQUERIMIENTOS (PRD & ARCHITECTURE)
## Proyecto: Motor de Enrutamiento Logístico (MVP)
## Fase Actual: Modelado de Datos y Lógica de Negocio (Backend)

### 1. Visión General del Producto
El sistema es un motor de cálculo y agregación logística diseñado para vendedores independientes. Resuelve el problema de la información fragmentada en el envío de encomiendas. 
* **Objetivo MVP:** Calcular el Día Estimado de Llegada (ETA) exacto de un paquete basado en el momento físico en que el vendedor lo entrega en una agencia, cruzando los horarios operativos de las sucursales con las reglas estrictas de despacho de cada destino.
* **Exclusiones del MVP:** No se procesan costos de envíos, devoluciones, reenvíos, ni entregas condicionadas a "mismo día".

### 2. Lógica de Dominio: El Modelo de "Caja Negra"
El sistema no calcula el tránsito físico intermedio (Hubs), asumiendo que los procesos logísticos nocturnos de la empresa son una "caja negra". El ETA depende de dos evaluaciones secuenciales:

* **Evaluación 1 (Origen - Ingreso Oficial):** El reloj inicia solo si el paquete se entrega antes de la `hora_cierre` del origen en el momento de la consulta. Si entra tarde, el ingreso oficial se desplaza al siguiente día hábil del origen.
* **Evaluación 2 (Destino - ETA):** El lugar de destino dicta el contrato. El destino tiene rutas programadas (`dia_entrega`) condicionadas a un (`dia_corte_maximo`). El sistema evalúa si el "Ingreso Oficial" (Evaluación 1) es MENOR o IGUAL al `dia_corte_maximo` para asignar esa fecha de entrega.

### 3. Modelo de Entidades de Datos
El sistema debe estructurarse en una base de datos relacional (sintaxis requerida: Oracle SQL). Las entidades deben normalizar el comportamiento de agencias de atención diaria, así como puntos fijos con atención semanal simple o compleja.

**Entidad 1: DESTINOS**
* `id_destino` (PK, VARCHAR2)
* `nombre_destino` (VARCHAR2)
* `tipo` (ENUM/VARCHAR2: 'Agencia' o 'Punto Fijo')
* `departamento` (VARCHAR2)
* `municipio` (VARCHAR2)
* `direccion_referencia` (VARCHAR2)

**Entidad 2: HORARIOS_OPERATIVOS**
* `id_horario` (PK)
* `id_destino` (FK)
* `dia_semana` (VARCHAR2: Lunes a Domingo)
* `hora_apertura` (Formato 24h / VARCHAR2 o TIME)
* `hora_cierre` (Formato 24h / VARCHAR2 o TIME)

**Entidad 3: REGLAS_ENTREGA**
* `id_regla` (PK)
* `id_destino` (FK)
* `dia_entrega` (VARCHAR2: Día exacto de llegada o 'Diario')
* `dia_corte_maximo` (VARCHAR2: Día máximo en que el paquete debe entrar al sistema)

### 4. Estado Actual del Sistema (Fase 2 Completada)
La arquitectura descrita en este documento ya ha sido implementada exitosamente.

* **Modelado DDL & DML:** Los scripts de creación de tablas en Oracle SQL y los comandos `INSERT ALL` masivos a partir de las extracciones de JSON se encuentran generados y listos para producción en el archivo `inserts_logistica_v2.sql`.
* **Diccionario y Consultas SQL:** El detalle de las tablas y las 3 consultas fundacionales (Cálculo de ETA, Planificación Inversa y Cobertura Total) están documentadas en `modelado_logistica.md`.
* **Próximos Pasos (Fase 3):** Las futuras iteraciones de desarrollo deberán centrarse en la creación de las APIs del Backend (Python/Node.js) que consuman estas consultas SQL, así como la construcción del frontend logístico. Cualquier modificación a las reglas de negocio deberá actualizar el script consolidado de base de datos.

### 5. Estructura del Origen de Datos (JSON Normalizado)
Los scripts de la Fase 2 consumen datos de entrada provenientes de un proceso OCR, el cual ha sido estandarizado y normalizado en archivos JSON (`norm_raw_*.json`) con el siguiente formato base por cada destino:

```json
[
  {
    "id_destino": "AG_SAN_MIGUEL_01",
    "nombre_destino": "Agencia San Miguel",
    "tipo": "Agencia",
    "ubicacion": {
      "departamento": "San Miguel",
      "municipio": "San Miguel",
      "direccion_referencia": "Plaza Minerva local #7..."
    },
    "horarios_operativos": [
      {
        "dia_semana": "Lunes",
        "hora_apertura": "09:00",
        "hora_cierre": "16:00"
      }
    ],
    "reglas_entrega": [
      {
        "dia_entrega": "Diario",
        "dia_corte_maximo": "Día anterior"
      }
    ]
  }
]
```

**Diccionario de Atributos del JSON:**
* `id_destino`: Identificador único y alfanumérico generado en base al nombre y tipo de localidad.
* `nombre_destino`: Nombre comercial o geográfico del destino u oficina logística.
* `tipo`: Clasifica si el destino es una `Agencia` (oficina propia/formal) o un `Punto Fijo` (punto de recolección en aliados comerciales).
* `ubicacion`: Objeto anidado que desglosa la geografía física.
  * `departamento`: Provincia o estado (ej. San Salvador, San Miguel).
  * `municipio`: Ciudad o distrito de la agencia.
  * `direccion_referencia`: Texto literal capturado desde el documento original con la indicación exacta del local.
* `horarios_operativos`: Arreglo que desglosa explícitamente los días en que el destino presta servicio para despachar o recibir clientes.
  * `dia_semana`: Día textual en que se abre (ej. Lunes).
  * `hora_apertura` / `hora_cierre`: Horas límite obligatorias normalizadas al formato militar de 24h. Son determinantes para el cálculo de la "Evaluación 1".
* `reglas_entrega`: Arreglo de objetos que define la promesa de entrega y los tiempos de ruta.
  * `dia_entrega`: El día específico (o "Diario") en que la ruta llega al destino para entregar paquetes.
  * `dia_corte_maximo`: El día límite (o "Día anterior") en que el paquete debió ingresar al origen para lograr el viaje a tiempo. Son determinantes para el cálculo de la "Evaluación 2".
