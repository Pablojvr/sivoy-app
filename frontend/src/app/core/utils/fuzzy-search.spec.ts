import { describe, expect, it } from 'vitest';
import { fuzzySearch, normalizeSearchText } from './fuzzy-search';

interface SearchItem {
  name: string;
  municipality: string;
}

const items: SearchItem[] = [
  { name: 'AGENCIA SAN SEBASTIÁN', municipality: 'San Sebastián' },
  { name: 'BODEGA SAN SALVADOR', municipality: 'San Salvador' },
  { name: 'AGENCIA SANTA ANA CENTRO', municipality: 'Santa Ana' }
];

const search = (query: string) => fuzzySearch(items, query, {
  fields: item => [item.name, item.municipality]
});

describe('fuzzySearch', () => {
  it('normaliza acentos, mayusculas y espacios repetidos', () => {
    expect(normalizeSearchText('  San  Sebastián  ')).toBe('san sebastian');
  });

  it('encuentra por palabras incompletas sin exigir el texto completo', () => {
    expect(search('san salv').map(item => item.name)).toEqual(['BODEGA SAN SALVADOR']);
  });

  it('tolera una transposicion tipografica en consultas suficientemente largas', () => {
    expect(search('sebastain').map(item => item.name)).toEqual(['AGENCIA SAN SEBASTIÁN']);
  });

  it('ordena coincidencias exactas y por prefijo antes que coincidencias difusas', () => {
    expect(search('santa ana').map(item => item.name)[0]).toBe('AGENCIA SANTA ANA CENTRO');
  });

  it('no aplica tolerancia tipografica agresiva a consultas de dos caracteres', () => {
    expect(search('zz')).toEqual([]);
  });

  it('respeta el limite sin mutar el arreglo de entrada', () => {
    const before = [...items];
    const result = fuzzySearch(items, 'san', {
      fields: item => [item.name, item.municipality],
      limit: 1
    });

    expect(result).toHaveLength(1);
    expect(items).toEqual(before);
  });
});
