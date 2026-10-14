# Capability Map: SiVoy Native Rebrand

## Product intent

Convertir SiVoy en una experiencia web móvil con lenguaje visual nativo tipo iOS: rápida para buscar, fácil de escanear y centrada en compartir dónde y cuándo puede retirarse un paquete. Las referencias visuales se usan como evidencia de jerarquía, densidad e interacción; no se copiarán marcas, textos ni composiciones propietarias.

## Assumptions to approve

1. SiVoy seguirá siendo una aplicación web responsive, no una aplicación iOS nativa.
2. El mapa será un recurso secundario abierto bajo demanda, no el lienzo principal del recorrido.
3. No se modificarán reglas ETA, datos, contratos HTTP ni lógica de disponibilidad durante el rebranding.
4. El flujo principal será: buscar destino → comparar puntos → revisar punto → elegir origen → ver ruta/compartir.
5. La tipografía usará una pila nativa (`-apple-system`, `BlinkMacSystemFont`, `Inter`, `system-ui`) para acercarse a iOS sin distribuir SF Pro ni depender de una fuente propietaria.
6. Se mantienen el coral de SiVoy y el grafito como identidad; lima, azul y ámbar se convierten en tintes semánticos suaves, no en fondos dominantes.
7. Partner, autenticación y registro de empresas permanecen fuera de alcance.

## Modules

| Module id | Responsibility | Depends on | Independently verifiable outcome |
|---|---|---|---|
| `native-visual-foundation` | Tokens de color, tipografía, radios, espaciado, elevación, iconos y movimiento | — | Una guía y primitives coherentes reemplazan valores visuales dispersos |
| `native-app-shell` | Fondo, encabezados, navegación inferior, safe areas y transiciones entre vistas | `native-visual-foundation` | La app se percibe como una sola superficie móvil estable en todos los recorridos |
| `destination-discovery` | Inicio, comando de búsqueda, overlay de sugerencias, recientes y selección de municipio/punto | `native-visual-foundation`, `native-app-shell` | Buscar no obliga a “saltar” a una pantalla desconectada y mantiene contexto/retroceso claro |
| `point-results` | Lista por municipio, cards de punto, filtros mínimos y estados loading/empty/error | `destination-discovery` | Se comparan varios puntos con baja densidad, acciones claras y expansión predecible |
| `point-detail` | Tarjeta/ficha individual, horarios prominentes, imagen, compartir y mapa secundario | `point-results` | El usuario entiende dónde retirar, cuándo está disponible y qué puede compartir |
| `shipment-continuation` | Selección de origen, resumen punto a punto y regreso a pasos anteriores | `point-detail` | El recorrido completo conserva estado, permite corregir selección y termina en una vista compartible |

## Build order

`native-visual-foundation` → `native-app-shell` + `destination-discovery` → `point-results` → `point-detail` → `shipment-continuation`

El shell y la búsqueda pueden implementarse en paralelo una vez aprobada la base visual. Resultados, detalle y continuación se construyen secuencialmente porque cada uno consume la jerarquía y los estados del anterior.

## Reference synthesis

- **De las referencias 1, 3, 10, 11 y 12:** navegación compacta, superficies blancas sobre fondos neutros, acciones primarias de alto contraste y mapa subordinado a una ficha.
- **De las referencias 4, 5, 6, 8 y 9:** tarjetas comparativas con un dato dominante, pares origen/destino y lectura horizontal rápida.
- **De las referencias 2 y 3:** sheets con asa, fondo atenuado y una sola acción principal por estado.
- **Patrones rechazados:** exceso de gradientes, mini-tipografía, tres botones con igual peso, colores alternados por tarjeta, mapa siempre visible y bordes redondeados idénticos en cada nivel.

## Proposed visual contract

- **Type:** pila nativa; títulos 24/28, sección 20/24, tarjeta 17/22, cuerpo 15/22, metadato mínimo 13/18.
- **Spacing:** cuadrícula de 4 pt; márgenes de pantalla 16; gaps 8/12/16/24.
- **Radii:** controles 12, contenido 16, tarjetas 22, sheets 28; píldora solo para chips y botones que lo requieren.
- **Color:** fondo mineral cálido, superficie blanca, tinta grafito, coral reservado para progreso/selección/CTA; estados con icono + texto + tinte suave.
- **Icons:** una sola familia lineal SVG, 20–22 px, trazo óptico consistente; nunca emojis.
- **Motion:** 180 ms para feedback, 240 ms para expansión, 320 ms para sheets; solo `transform`/`opacity` y respeto a `prefers-reduced-motion`.
- **Touch:** objetivos mínimos 44 × 44 px, 8 px entre acciones y `touch-action: manipulation`.

## Initiative boundaries

- **Always:** conservar rutas compartibles, eventos existentes y semántica accesible; validar 320, 386, 768, 1024 y 1440 px; probar teclado y reduced motion.
- **Ask first:** cambiar comportamiento de negocio, añadir dependencias, reemplazar navegación URL o modificar datos/contratos.
- **Never:** copiar branding de referencias, ocultar información esencial por estética, convertir el mapa en paso obligatorio, tocar Partner o desplegar producción sin orden explícita.

## Approval gate

La aprobación de este mapa autoriza redactar la especificación detallada de `native-visual-foundation` y su plan técnico. No autoriza todavía implementar todos los módulos en un solo cambio.
