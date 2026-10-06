import { createMapMarkerElement } from './map-marker-element';
import { describe, it, expect } from 'vitest';

describe('createMapMarkerElement', () => {
  it('creates an origin marker button with correct classes and markup', () => {
    const el = createMapMarkerElement(document, 'origin', 'Origen Label');
    expect(el.tagName).toBe('BUTTON');
    expect(el.type).toBe('button');
    expect(el.className).toBe('sivoy-map-marker is-origin');
    expect(el.getAttribute('aria-label')).toBe('Origen Label');
    expect(el.innerHTML).toContain('O');
  });

  it('creates a selected destination marker', () => {
    const el = createMapMarkerElement(document, 'destination', '', true);
    expect(el.className).toBe('sivoy-map-marker is-destination is-selected');
    expect(el.getAttribute('aria-label')).toBe('Punto en el mapa');
    expect(el.innerHTML).toContain('D');
  });

  it('creates a user marker with specific dot markup', () => {
    const el = createMapMarkerElement(document, 'user');
    expect(el.className).toBe('sivoy-map-marker is-user');
    expect(el.innerHTML).toContain('sivoy-user-dot');
    expect(el.innerHTML).not.toContain('O');
  });

  it('creates a nearby marker with no inner text', () => {
    const el = createMapMarkerElement(document, 'nearby');
    expect(el.className).toBe('sivoy-map-marker is-nearby');
    expect(el.innerHTML).toContain('<span class="sivoy-pin-core"><i></i></span>');
  });
});
