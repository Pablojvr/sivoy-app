const test = require('node:test');
const assert = require('node:assert/strict');

const { buildAgencyUpdate } = require('../src/domains/ubicaciones/ubicaciones.repository');

test('buildAgencyUpdate keeps allowed columns and values in matching order', () => {
  assert.deepEqual(buildAgencyUpdate(42, {
    nombre_destino: 'Agencia nueva',
    empresa: 'Empresa',
    tipo: 'agencia',
    maps_url: null,
    departamento: 'San Salvador',
    municipio: 'San Salvador',
    direccion_referencia: 'Centro',
    lat: 0,
    lng: -89.2,
    imagen_referencia: 'https://example.test/a.png'
  }), {
    text: 'UPDATE agencias SET nombre_destino = $1, empresa = $2, tipo = $3, maps_url = $4, departamento = $5, municipio = $6, direccion_referencia = $7, lat = $8, lng = $9, imagen_referencia = $10 WHERE id = $11',
    values: ['Agencia nueva', 'Empresa', 'agencia', null, 'San Salvador', 'San Salvador', 'Centro', 0, -89.2, 'https://example.test/a.png', 42]
  });
  assert.equal(buildAgencyUpdate(42, {}), null);
});

test('buildAgencyUpdate never interpolates caller-supplied keys or values into SQL', () => {
  const hostileValue = "x'; DROP TABLE agencias; --";
  assert.deepEqual(buildAgencyUpdate(7, { nombre_destino: hostileValue }), {
    text: 'UPDATE agencias SET nombre_destino = $1 WHERE id = $2',
    values: [hostileValue, 7]
  });
  assert.throws(
    () => buildAgencyUpdate(7, { 'nombre_destino = null; DROP TABLE agencias; --': 'x' }),
    /Unsupported agency update field/
  );
  assert.throws(() => buildAgencyUpdate(7, { empresa_id: 99 }), /Unsupported agency update field/);
});
