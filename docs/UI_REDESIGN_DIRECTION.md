# Dirección visual — SiVoy App

Esta propuesta toma las imágenes compartidas únicamente como referencias visuales. Mantiene intactos el motor ETA, los servicios, los contratos HTTP y los eventos existentes del frontend.

## Principios extraídos

1. **El mapa es el lienzo.** La interfaz se apoya sobre el mapa con pocas superficies flotantes y una lectura espacial inmediata.
2. **Una intención por superficie.** La isla superior responde primero a “¿Adónde deseas enviar?”; el origen aparece después, cuando la persona lo solicita desde un resultado.
3. **Jerarquía de alto contraste.** Títulos casi negros, texto secundario gris pizarra y coral reservado para destino, selección y estados importantes.
4. **Geometría amable.** Tarjetas de 20–28 px de radio, controles circulares y navegación tipo píldora. Los bordes son sutiles y las sombras amplias, no pesadas.
5. **Navegación como dock.** La barra inferior oscura funciona como ancla visual; el elemento activo usa una cápsula clara con el acento coral.
6. **Información logística escaneable.** Etiquetas cortas, chips de estado, iconos lineales consistentes y tarjetas con separación clara entre empresa, punto y acción.
7. **Movimiento funcional.** Transiciones de 180–280 ms en color, opacidad y desplazamiento; se respeta `prefers-reduced-motion`.

## Tokens de la dirección

- Tinta: `#171717`
- Coral: `#FF654F`
- Coral oscuro: `#E94F3D`
- Fondo cálido: `#F6F3EF`
- Superficie: `#FFFFFF`
- Texto secundario: `#667085`
- Borde: `rgba(23, 23, 23, 0.10)`
- Radio de tarjeta: `24px`
- Radio de control: `999px`

## Alcance de la fase 1

- Rediseño de la isla de búsqueda de destino.
- Rediseño del selector progresivo destino/origen.
- Nueva navegación inferior oscura y accesible.
- Ajuste del bottom sheet, controles de mapa y tarjetas de resultados.
- Sin cambios en TypeScript de negocio, endpoints, base de datos ni algoritmo ETA.

## Próximas fases sugeridas

- Extraer los estilos inline de las tarjetas de ruta a componentes de presentación.
- Crear estados visuales dedicados para selección, tránsito y entrega.
- Unificar los paneles de detalle en un componente reutilizable.
- Validar el sistema en 375, 768, 1024 y 1440 px y añadir pruebas visuales.
