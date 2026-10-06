import { mapLocationResponse } from './location.mapper';

describe('mapLocationResponse', () => {
  it('returns an empty collection for non-array input', () => {
    expect(mapLocationResponse(null)).toEqual([]);
    expect(mapLocationResponse({})).toEqual([]);
  });

  it('discards invalid entries while mapping valid legacy identities', () => {
    const result = mapLocationResponse([
      null,
      { id: '  17 ', nombre_destino: ' Agencia Centro ' },
      { id_destino: 0, nombre_destino: 'Bodega' },
      { id: '', nombre_destino: 'Sin identidad' },
      { id: 4, nombre_destino: '   ' }
    ]);

    expect(result).toEqual([
      expect.objectContaining({ id: '17', nombre_destino: 'Agencia Centro' }),
      expect.objectContaining({ id_destino: 0, nombre_destino: 'Bodega' })
    ]);
  });

  it('normalizes bounded coordinates, distance and address aliases', () => {
    const [point] = mapLocationResponse([{
      id: 1,
      nombre_destino: 'Punto',
      distance: '12.5',
      ubicacion: {
        lat: '90',
        lng: -180,
        municipio: ' San Salvador ',
        departamento: ' San Salvador ',
        direccion: ' Alias '
      }
    }]);

    expect(point.ubicacion).toEqual({
      lat: 90,
      lng: -180,
      municipio: 'San Salvador',
      departamento: 'San Salvador',
      direccion_referencia: 'Alias'
    });
    expect(point.distance).toBe(12.5);
  });

  it('prefers direccion_referencia and omits invalid numeric values', () => {
    const [point] = mapLocationResponse([{
      id: 1,
      nombre_destino: 'Punto',
      distance: -1,
      ubicacion: {
        lat: 90.01,
        lng: '-180.01',
        direccion_referencia: ' Principal ',
        direccion: 'Alias'
      }
    }]);

    expect(point.ubicacion).toEqual({ direccion_referencia: 'Principal' });
    expect(point.distance).toBeUndefined();
  });

  it('filters incomplete schedules and delivery rules', () => {
    const [point] = mapLocationResponse([{
      id: 1,
      nombre_destino: 'Punto',
      horarios_operativos: [
        { dia_semana: ' Lunes ', hora_apertura: ' 08:00 ', hora_cierre: ' 17:00 ', tipo_accion: ' Ambos ' },
        { dia_semana: 'Martes', hora_apertura: '', hora_cierre: '17:00' },
        'invalid'
      ],
      reglas_entrega: [
        { dia_entrega: ' Viernes ', dia_corte_maximo: ' Día anterior ' },
        { dia_entrega: 'Sábado' },
        null
      ]
    }]);

    expect(point.horarios_operativos).toEqual([{
      dia_semana: 'Lunes',
      hora_apertura: '08:00',
      hora_cierre: '17:00',
      tipo_accion: 'Ambos'
    }]);
    expect(point.reglas_entrega).toEqual([{
      dia_entrega: 'Viernes',
      dia_corte_maximo: 'Día anterior'
    }]);
  });

  it('does not retain mutable aliases from the response', () => {
    const schedule = { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' };
    const input = [{
      id: 1,
      nombre_destino: 'Punto',
      ubicacion: { municipio: 'Apopa' },
      horarios_operativos: [schedule]
    }];
    const [point] = mapLocationResponse(input);

    input[0].nombre_destino = 'Modificado';
    input[0].ubicacion.municipio = 'Otro';
    schedule.hora_apertura = '12:00';

    expect(point.nombre_destino).toBe('Punto');
    expect(point.ubicacion.municipio).toBe('Apopa');
    expect(point.horarios_operativos[0].hora_apertura).toBe('08:00');
  });

  it('reads each top-level getter once', () => {
    let nameReads = 0;
    const input = {
      id: 1,
      get nombre_destino(): string {
        nameReads += 1;
        return 'Punto';
      }
    };

    expect(mapLocationResponse([input])[0].nombre_destino).toBe('Punto');
    expect(nameReads).toBe(1);
  });

  it('discards a record when a getter or proxy throws', () => {
    const getterFailure = {
      id: 1,
      get nombre_destino(): string {
        throw new Error('untrusted getter');
      }
    };
    const proxyFailure = new Proxy<Record<string, unknown>>(
      { id: 2, nombre_destino: 'Proxy' },
      { get: () => { throw new Error('untrusted proxy'); } }
    );

    expect(mapLocationResponse([getterFailure, proxyFailure])).toEqual([]);
  });

  it('returns an empty collection for a revoked response proxy', () => {
    const revocable = Proxy.revocable<unknown[]>([], {});
    revocable.revoke();

    expect(mapLocationResponse(revocable.proxy)).toEqual([]);
  });

  it('accepts frozen response objects and arrays', () => {
    const frozen = Object.freeze([Object.freeze({
      id_destino: 'point-1',
      nombre_destino: 'Punto',
      ubicacion: Object.freeze({ lat: 13.7, lng: -89.2 }),
      horarios_operativos: Object.freeze([])
    })]);

    expect(mapLocationResponse(frozen)).toEqual([expect.objectContaining({
      id_destino: 'point-1',
      nombre_destino: 'Punto'
    })]);
  });
});
