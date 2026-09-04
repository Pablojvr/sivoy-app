# SiVoy Signal — identidad visual 2026

Esta propuesta toma las imágenes compartidas únicamente como referencias visuales. Mantiene intactos el motor ETA, los servicios, los contratos HTTP y los eventos existentes del frontend.

## Principios extraídos

1. **El mapa es el lienzo.** La interfaz se apoya sobre el mapa con pocas superficies flotantes y una lectura espacial inmediata.
2. **Una intención por superficie.** La isla superior responde primero a “¿Adónde deseas enviar?”; el origen aparece después, cuando la persona lo solicita desde un resultado.
3. **Jerarquía de alto contraste.** Títulos grafito, texto secundario verde-gris y coral reservado para rutas, selección y estados importantes.
4. **Geometría amable.** Tarjetas de 20–28 px de radio, controles circulares y navegación tipo píldora. Los bordes son sutiles y las sombras amplias, no pesadas.
5. **Navegación como dock.** La barra inferior oscura funciona como ancla visual; el elemento activo usa una cápsula clara con el acento coral.
6. **Información logística escaneable.** Etiquetas cortas, chips de estado, iconos lineales consistentes y tarjetas con separación clara entre empresa, punto y acción.
7. **Movimiento funcional.** Transiciones de 180–280 ms en color, opacidad y altura; se respeta `prefers-reduced-motion` y se eliminan animaciones decorativas infinitas.
8. **Color con significado.** El grafito ancla navegación y acciones; el coral representa movimiento; lima, azul y ámbar identifican estados y categorías, nunca decoración arbitraria.

## Tokens de la dirección

- Tinta: `#1D1E1C`
- Coral de ruta: `#F45B78`
- Coral oscuro: `#D94262`
- Lima operativo: `#B8EE4A`
- Azul informativo: `#A9DDF5`
- Ámbar de atención: `#FFD18A`
- Fondo mineral: `#F2F4F2`
- Superficie: `#FFFFFF`
- Texto secundario: `#626760`
- Borde: `rgba(29, 30, 28, 0.10)`
- Tipografía: `Manrope`, con fallback a `system-ui`
- Radio de tarjeta: `24px`
- Radio de control: `999px`

## Panel de resultados

El panel usa Pointer Events y tres puntos de encaje:

- `collapsed`: resumen de 104 px.
- `half`: exploración al 52% del viewport.
- `expanded`: lectura al 76% del viewport.

Durante el gesto, la altura sigue al puntero sin transición. Al soltar, la distancia y velocidad determinan el siguiente estado. El encabezado captura el puntero para evitar perder el gesto fuera del asa; la lista conserva su desplazamiento vertical independiente.

El asa también es un botón real con foco visible, etiqueta accesible y soporte de teclado.

## Alcance implementado

- Rediseño de la isla de búsqueda de destino.
- Rediseño del selector progresivo destino/origen.
- Nueva navegación inferior oscura y accesible.
- Slider continuo del bottom sheet con soporte para touch, mouse y stylus.
- Sistema coherente para controles de mapa, listas, tarjetas, chips, estados, buscadores y paginadores.
- Tarjetas de datos con tintes semánticos coral, lima y azul.
- Sin cambios en TypeScript de negocio, endpoints, base de datos ni algoritmo ETA.

## Próximas fases sugeridas

- Extraer los estilos inline de las tarjetas de ruta a componentes de presentación.
- Aplicar los estados visuales semánticos a cada respuesta real del proveedor.
- Unificar los paneles de detalle en un componente reutilizable.
- Validar el sistema en 375, 768, 1024 y 1440 px y añadir pruebas visuales.
