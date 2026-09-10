export function createMapMarkerElement(
  documentRef: Document,
  type: 'origin' | 'destination' | 'nearby' | 'user' | 'preview',
  label = '',
  selected = false
): HTMLButtonElement {
  const element = documentRef.createElement('button');
  element.type = 'button';
  element.className = `sivoy-map-marker is-${type}${selected ? ' is-selected' : ''}`;
  element.setAttribute('aria-label', label || 'Punto en el mapa');
  element.innerHTML = type === 'user'
    ? '<span class="sivoy-user-dot"><i></i></span>'
    : `<span class="sivoy-pin-core"><i>${type === 'origin' ? 'O' : type === 'nearby' ? '' : 'D'}</i></span>`;
  return element;
}
