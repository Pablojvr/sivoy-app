# 🤖 Onboarding para Agentes de IA (ChatGPT / Codex)

Este documento contiene el contexto esencial, la arquitectura y las reglas de negocio del proyecto **SiVoy App**. Está diseñado para ser copiado y pegado como *System Prompt* o como primer mensaje de contexto al iniciar una sesión con otro agente de IA (como ChatGPT, GitHub Copilot, o Codex), para que entienda rápidamente en qué estás trabajando.

---

## 📋 CÓMO USAR ESTE DOCUMENTO

**Instrucciones para el Usuario (Tú):**
Cuando abras un nuevo chat con ChatGPT o Codex, inicia la conversación enviando el siguiente mensaje:

> *"Actúa como un Desarrollador Full-Stack Senior. A continuación te presento el contexto completo, la arquitectura y las reglas de negocio de mi aplicación llamada 'SiVoy App'. Por favor, lee detenidamente este contexto. Cuando termines, responde únicamente con 'Contexto asimilado. ¿En qué te ayudo hoy?'."*
>
> *(Copia y pega todo el contenido desde la sección "--- INICIO DEL CONTEXTO ---" en adelante).*

---

## --- INICIO DEL CONTEXTO ---

### 1. Visión General del Producto (SiVoy App)
SiVoy App es un **motor de cálculo y agregación logística** diseñado para vendedores independientes y emprendedores.
Resuelve el problema de la fragmentación de información en los envíos de encomiendas. Su MVP se enfoca en **calcular el Día Estimado de Llegada (ETA) exacto** de un paquete, basándose en:
1. El momento físico (día y hora) en que el vendedor entrega el paquete en una agencia.
2. Los horarios operativos de esa agencia.
3. Las reglas estrictas de despacho y corte hacia el destino final.

### 2. Stack Tecnológico y Arquitectura
El proyecto sigue una arquitectura Cliente-Servidor clásica, dividida en dos aplicaciones principales:

**Frontend (SPA - Single Page Application):**
* **Framework:** Angular (v21).
* **Mapas:** Integración actual con `leaflet` (Mapas interactivos).
* **Estructura:** Código modular bajo `frontend/src/app/`. Contiene componentes de visualización y formularios para la administración e interacción logística.
* **Estilos:** CSS puro / Modular.

**Backend (REST API):**
* **Entorno:** Node.js puro utilizando Express.
* **Base de Datos:** PostgreSQL (con el paquete `pg`).
* **Estructura:** Arquitectura basada en dominios (`src/domains/`) que incluye: `empresas`, `ubicaciones`, `rutas`, `mapas`.
* **Despliegue:** Preparado para correr en conjunto, sirviendo los estáticos de Angular a través de las rutas catch-all de Express.

### 3. Modelo de Datos y Lógica de Negocio Central (El Motor ETA)
El cálculo del ETA funciona como una "Caja Negra" mediante consultas SQL complejas, basándose en dos entidades principales `HORARIOS_OPERATIVOS` y `REGLAS_ENTREGA`, conectadas a los `DESTINOS`.

**Evaluaciones de Negocio:**
1. **Evaluación 1 (Ingreso Oficial - Origen):** Si un paquete se deposita ANTES de la `hora_cierre` del origen, su fecha oficial de ingreso es hoy. Si se deposita DESPUÉS, el sistema asume que ingresa el siguiente día hábil del origen.
2. **Evaluación 2 (Tránsito hacia Destino):** Cada destino tiene programados días de entrega (`dia_entrega`) condicionados por un límite (`dia_corte_maximo`). El motor SQL evalúa si el "Ingreso Oficial" es menor o igual al día de corte para validar el viaje.

### 4. Ideas a Futuro (Roadmap Tecnológico)
Durante el desarrollo hemos planteado evoluciones clave para las que podrías ayudar a codificar:
* **Migración del Sistema de Mapas:** Actualmente dependemos de `leaflet` (OpenStreetMap). A futuro queremos migrar a una solución más robusta como **Google Maps API** o **Mapbox**, para tener geocodificación nativa, auto-completado de direcciones más potente y rutas renderizadas en mapa nativo.
* **Módulo de Costos:** El MVP no calcula tarifas, pero se preparará la estructura para soportar precios dinámicos según volumen, peso y proveedor logístico.
* **Microservicios (Opcional):** Si la lógica del motor ETA escala, se contempla separar el cálculo logístico en un microservicio independiente (posiblemente en Python o Go) mientras Node sigue operando el CRUD.

### 5. Estructura de Carpetas del Repositorio
* `/backend/` -> Contiene el servidor Express, configuración de PG, y controladores por dominio.
* `/frontend/` -> Proyecto de Angular v21.
* `/docs/` -> Documentación histórica, requerimientos iniciales (PRDs) y modelado logístico.
* `/data/` -> Scripts de migración y datos en crudo (JSON).

--- FIN DEL CONTEXTO ---
