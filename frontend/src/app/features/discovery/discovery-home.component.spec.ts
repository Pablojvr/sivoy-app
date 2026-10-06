import { describe, it, expect, beforeEach } from 'vitest';
import { SimpleChange } from '@angular/core';
import { DiscoveryHomeComponent, MunicipalitySummary } from './discovery-home.component';
import { DeliveryPoint } from '../../core/models/location.models';

function createDeliveryPoint(
  overrides: Partial<Omit<DeliveryPoint, 'id' | 'id_destino'>> & {
    id?: string | number;
    id_destino?: string | number;
  } = {}
): DeliveryPoint {
  const baseIdentity = overrides.id_destino !== undefined
    ? { id_destino: overrides.id_destino, ...(overrides.id !== undefined ? { id: overrides.id } : {}) }
    : { id: overrides.id ?? 'point-default' };

  return {
    ...baseIdentity,
    nombre_destino: overrides.nombre_destino ?? 'Punto Predeterminado',
    ubicacion: overrides.ubicacion ?? {},
    horarios_operativos: overrides.horarios_operativos ?? [],
    reglas_entrega: overrides.reglas_entrega ?? [],
    empresa: overrides.empresa,
    tipo: overrides.tipo,
    maps_url: overrides.maps_url,
    imagen_referencia: overrides.imagen_referencia,
    imagen_url: overrides.imagen_url,
    distance: overrides.distance
  };
}

describe('DiscoveryHomeComponent (caracterizacion de contrato y logica)', () => {
  let component: DiscoveryHomeComponent;

  beforeEach(() => {
    component = new DiscoveryHomeComponent();
  });

  function applyLocations(points: readonly DeliveryPoint[]): void {
    component.locations = points;
    component.ngOnChanges({
      locations: new SimpleChange(undefined, points, true)
    });
  }

  describe('estado inicial y getters', () => {
    it('inicia en estado isLoading=true cuando no hay ubicaciones', () => {
      expect(component.locations).toEqual([]);
      expect(component.isLoading).toBe(true);
      expect(component.pointCount).toBe(0);
      expect(component.companyCount).toBe(0);
      expect(component.totalMunicipalities).toBe(0);
      expect(component.companies).toEqual([]);
      expect(component.municipalities).toEqual([]);
      expect(component.featuredPoints).toEqual([]);
    });

    it('actualiza getters isLoading, pointCount y companyCount tras recibir datos', () => {
      const points: readonly DeliveryPoint[] = [
        createDeliveryPoint({ id: 'P1', empresa: 'Urbano Express' }),
        createDeliveryPoint({ id: 'P2', empresa: 'DHL Express' })
      ];
      applyLocations(points);

      expect(component.isLoading).toBe(false);
      expect(component.pointCount).toBe(2);
      expect(component.companyCount).toBe(2);
    });
  });

  describe('agrupacion de empresas', () => {
    it('agrupa por empresa calculando puntos, municipios unicos, monograma y color de acento', () => {
      const points: readonly DeliveryPoint[] = [
        createDeliveryPoint({
          id: 'P1',
          empresa: 'Cargo Expreso',
          ubicacion: { municipio: 'San Salvador', departamento: 'San Salvador' }
        }),
        createDeliveryPoint({
          id: 'P2',
          empresa: 'Cargo Expreso',
          ubicacion: { municipio: 'San Salvador', departamento: 'San Salvador' }
        }),
        createDeliveryPoint({
          id: 'P3',
          empresa: 'Cargo Expreso',
          ubicacion: { municipio: 'Soyapango', departamento: 'San Salvador' }
        }),
        createDeliveryPoint({
          id: 'P4',
          empresa: 'DHL Logistics',
          ubicacion: { municipio: 'Santa Tecla', departamento: 'La Libertad' }
        })
      ];

      applyLocations(points);

      expect(component.companies.length).toBe(2);

      const firstCompany = component.companies[0];
      expect(firstCompany.name).toBe('Cargo Expreso');
      expect(firstCompany.pointCount).toBe(3);
      expect(firstCompany.municipalityCount).toBe(2);
      expect(firstCompany.monogram).toBe('CE');
      expect(firstCompany.accent).toBe('#F45B78');

      const secondCompany = component.companies[1];
      expect(secondCompany.name).toBe('DHL Logistics');
      expect(secondCompany.pointCount).toBe(1);
      expect(secondCompany.municipalityCount).toBe(1);
      expect(secondCompany.monogram).toBe('DL');
      expect(secondCompany.accent).toBe('#B8EE4A');
    });

    it('aplica fallback "Empresa logística" cuando la empresa esta ausente', () => {
      const points: readonly DeliveryPoint[] = [
        createDeliveryPoint({ id: 'P1', empresa: undefined })
      ];

      applyLocations(points);

      expect(component.companies[0].name).toBe('Empresa logística');
      expect(component.companies[0].monogram).toBe('EL');
    });

    it('ordena empresas descendentemente por pointCount y secundariamente por nombre alfabetico en es', () => {
      const points: readonly DeliveryPoint[] = [
        createDeliveryPoint({ id: 'P1', empresa: 'Zeta Express' }),
        createDeliveryPoint({ id: 'P2', empresa: 'Alfa Express' }),
        createDeliveryPoint({ id: 'P3', empresa: 'Beta Logistics' }),
        createDeliveryPoint({ id: 'P4', empresa: 'Beta Logistics' })
      ];

      applyLocations(points);

      expect(component.companies.map(c => c.name)).toEqual([
        'Beta Logistics',
        'Alfa Express',
        'Zeta Express'
      ]);
    });
  });

  describe('agrupacion de municipios', () => {
    it('agrupa municipios con conteo de puntos y registra totalMunicipalities', () => {
      const points: readonly DeliveryPoint[] = [
        createDeliveryPoint({ id: 'P1', ubicacion: { municipio: 'Santa Tecla', departamento: 'La Libertad' } }),
        createDeliveryPoint({ id: 'P2', ubicacion: { municipio: 'Santa Tecla', departamento: 'La Libertad' } }),
        createDeliveryPoint({ id: 'P3', ubicacion: { municipio: 'Antiguo Cuscatlán', departamento: 'La Libertad' } })
      ];

      applyLocations(points);

      expect(component.totalMunicipalities).toBe(2);
      expect(component.municipalities.length).toBe(2);
      expect(component.municipalities[0]).toEqual({
        municipio: 'Santa Tecla',
        departamento: 'La Libertad',
        pointCount: 2
      });
      expect(component.municipalities[1]).toEqual({
        municipio: 'Antiguo Cuscatlán',
        departamento: 'La Libertad',
        pointCount: 1
      });
    });

    it('limita a un maximo de cinco municipios preservando totalMunicipalities y orden', () => {
      const points: readonly DeliveryPoint[] = [
        createDeliveryPoint({ id: 'P1', ubicacion: { municipio: 'M1', departamento: 'D' } }),
        createDeliveryPoint({ id: 'P2', ubicacion: { municipio: 'M1', departamento: 'D' } }),
        createDeliveryPoint({ id: 'P3', ubicacion: { municipio: 'M2', departamento: 'D' } }),
        createDeliveryPoint({ id: 'P4', ubicacion: { municipio: 'M2', departamento: 'D' } }),
        createDeliveryPoint({ id: 'P5', ubicacion: { municipio: 'M3', departamento: 'D' } }),
        createDeliveryPoint({ id: 'P6', ubicacion: { municipio: 'M4', departamento: 'D' } }),
        createDeliveryPoint({ id: 'P7', ubicacion: { municipio: 'M5', departamento: 'D' } }),
        createDeliveryPoint({ id: 'P8', ubicacion: { municipio: 'M6', departamento: 'D' } }),
        createDeliveryPoint({ id: 'P9', ubicacion: { municipio: 'M7', departamento: 'D' } })
      ];

      applyLocations(points);

      expect(component.totalMunicipalities).toBe(7);
      expect(component.municipalities.length).toBe(5);
      expect(component.municipalities.map(m => m.municipio)).toEqual(['M1', 'M2', 'M3', 'M4', 'M5']);
    });

    it('omite ubicaciones sin municipio definido', () => {
      const points: readonly DeliveryPoint[] = [
        createDeliveryPoint({ id: 'P1', ubicacion: { municipio: undefined, departamento: 'San Salvador' } }),
        createDeliveryPoint({ id: 'P2', ubicacion: { municipio: '', departamento: 'San Salvador' } })
      ];

      applyLocations(points);

      expect(component.totalMunicipalities).toBe(0);
      expect(component.municipalities).toEqual([]);
    });
  });

  describe('busqueda de destino en contexto', () => {
    const santaAna: MunicipalitySummary = {
      municipio: 'Santa Ana',
      departamento: 'Santa Ana',
      pointCount: 1
    };

    beforeEach(() => {
      applyLocations([
        createDeliveryPoint({
          id: 'P1',
          nombre_destino: 'AGENCIA SANTA ANA CENTRO',
          empresa: 'Pedidos Express',
          ubicacion: { municipio: 'Santa Ana', departamento: 'Santa Ana' }
        }),
        createDeliveryPoint({
          id: 'P2',
          nombre_destino: 'AGENCIA SAN SEBASTIÁN',
          empresa: 'Pedidos Express',
          ubicacion: { municipio: 'San Sebastián', departamento: 'San Vicente' }
        })
      ]);
    });

    it('activa el buscador sin emitir una navegacion', () => {
      component.activateDestinationSearch();

      expect(component.isDestinationSearchActive).toBe(true);
      expect(component.destinationSearchQuery).toBe('');
    });

    it('filtra municipios y puntos en la misma pantalla tolerando acentos y una transposicion', () => {
      component.updateDestinationSearch('sebastain');

      expect(component.filteredMunicipalities.map(item => item.municipio)).toEqual(['San Sebastián']);
      expect(component.filteredPoints.map(item => item.nombre_destino)).toEqual(['AGENCIA SAN SEBASTIÁN']);
    });

    it('selecciona un municipio solo despues de elegir una sugerencia y cierra el buscador', () => {
      let selected: MunicipalitySummary | undefined;
      component.municipalitySelected.subscribe(value => selected = value);
      component.activateDestinationSearch();

      component.selectMunicipalitySuggestion(santaAna);

      expect(selected).toBe(santaAna);
      expect(component.isDestinationSearchActive).toBe(false);
      expect(component.destinationSearchQuery).toBe('');
    });

    it('abre el punto solo despues de elegir una sugerencia especifica', () => {
      let selected: DeliveryPoint | undefined;
      component.pointPreview.subscribe(value => selected = value);
      component.updateDestinationSearch('santa ana centro');

      component.selectPointSuggestion(component.filteredPoints[0]);

      expect(selected?.id).toBe('P1');
      expect(component.isDestinationSearchActive).toBe(false);
      expect(component.filteredPoints).toEqual([]);
    });

    it('limpia el texto sin navegar y conserva el foco de busqueda activo', () => {
      component.updateDestinationSearch('santa');

      component.clearDestinationSearch();

      expect(component.destinationSearchQuery).toBe('');
      expect(component.isDestinationSearchActive).toBe(true);
      expect(component.filteredMunicipalities).toEqual([]);
      expect(component.filteredPoints).toEqual([]);
    });
  });

  describe('puntos destacados (featuredPoints)', () => {
    it('selecciona un unico punto destacado por municipio priorizando imagen y menor distancia', () => {
      const pointWithImageFar = createDeliveryPoint({
        id: 'P1',
        nombre_destino: 'Agencia Con Imagen Lejana',
        imagen_referencia: 'https://img.example.com/p1.jpg',
        distance: 15,
        ubicacion: { municipio: 'San Salvador', departamento: 'San Salvador' }
      });
      const pointWithoutImageNear = createDeliveryPoint({
        id: 'P2',
        nombre_destino: 'Agencia Sin Imagen Cercana',
        distance: 1,
        ubicacion: { municipio: 'San Salvador', departamento: 'San Salvador' }
      });
      const pointOtherCity = createDeliveryPoint({
        id: 'P3',
        nombre_destino: 'Agencia Santa Tecla',
        distance: 5,
        ubicacion: { municipio: 'Santa Tecla', departamento: 'La Libertad' }
      });

      const points: readonly DeliveryPoint[] = [pointWithoutImageNear, pointWithImageFar, pointOtherCity];
      applyLocations(points);

      expect(component.featuredPoints.length).toBe(2);
      expect(component.featuredPoints[0].id).toBe('P1');
      expect(component.featuredPoints[1].id).toBe('P3');
    });

    it('desempata por menor distancia y luego por id numerico descendente', () => {
      const pointSameDistLowId = createDeliveryPoint({
        id: 10,
        nombre_destino: 'Bajo ID',
        distance: 10,
        ubicacion: { municipio: 'Soyapango', departamento: 'San Salvador' }
      });
      const pointSameDistHighId = createDeliveryPoint({
        id: 50,
        nombre_destino: 'Alto ID',
        distance: 10,
        ubicacion: { municipio: 'Soyapango', departamento: 'San Salvador' }
      });

      const points: readonly DeliveryPoint[] = [pointSameDistLowId, pointSameDistHighId];
      applyLocations(points);

      expect(component.featuredPoints.length).toBe(1);
      expect(component.featuredPoints[0].id).toBe(50);
    });

    it('limita los puntos destacados a un maximo de cinco', () => {
      const points: readonly DeliveryPoint[] = [
        createDeliveryPoint({ id: 1, ubicacion: { municipio: 'Mun1', departamento: 'Dep' } }),
        createDeliveryPoint({ id: 2, ubicacion: { municipio: 'Mun2', departamento: 'Dep' } }),
        createDeliveryPoint({ id: 3, ubicacion: { municipio: 'Mun3', departamento: 'Dep' } }),
        createDeliveryPoint({ id: 4, ubicacion: { municipio: 'Mun4', departamento: 'Dep' } }),
        createDeliveryPoint({ id: 5, ubicacion: { municipio: 'Mun5', departamento: 'Dep' } }),
        createDeliveryPoint({ id: 6, ubicacion: { municipio: 'Mun6', departamento: 'Dep' } })
      ];

      applyLocations(points);

      expect(component.featuredPoints.length).toBe(5);
    });
  });

  describe('helpers de presentacion y trackBy', () => {
    it('pointName remueve prefijo "AGENCIA " insensible a mayusculas o usa fallback', () => {
      const p1 = createDeliveryPoint({ nombre_destino: 'AGENCIA Central San Salvador' });
      const p2 = createDeliveryPoint({ nombre_destino: 'agencia Santa Tecla Centro' });
      const p3 = createDeliveryPoint({ nombre_destino: 'Sucursal Escalón' });
      const p4 = createDeliveryPoint({ nombre_destino: '' });

      expect(component.pointName(p1)).toBe('Central San Salvador');
      expect(component.pointName(p2)).toBe('Santa Tecla Centro');
      expect(component.pointName(p3)).toBe('Sucursal Escalón');
      expect(component.pointName(p4)).toBe('Punto de entrega');
    });

    it('locationLabel concatena municipio y departamento filtrando vacios', () => {
      const full = createDeliveryPoint({ ubicacion: { municipio: 'Santa Tecla', departamento: 'La Libertad' } });
      const onlyMun = createDeliveryPoint({ ubicacion: { municipio: 'Apopa' } });
      const onlyDep = createDeliveryPoint({ ubicacion: { departamento: 'San Salvador' } });
      const empty = createDeliveryPoint({ ubicacion: {} });

      expect(component.locationLabel(full)).toBe('Santa Tecla, La Libertad');
      expect(component.locationLabel(onlyMun)).toBe('Apopa');
      expect(component.locationLabel(onlyDep)).toBe('San Salvador');
      expect(component.locationLabel(empty)).toBe('');
    });

    it('trackCompany retorna el nombre de la empresa', () => {
      const company = {
        name: 'DHL Express',
        pointCount: 3,
        municipalityCount: 2,
        monogram: 'DE',
        accent: '#F45B78'
      };
      expect(component.trackCompany(0, company)).toBe('DHL Express');
    });

    it('trackMunicipality combina municipio y departamento con guion', () => {
      const summary: MunicipalitySummary = {
        municipio: 'Santa Tecla',
        departamento: 'La Libertad',
        pointCount: 5
      };
      expect(component.trackMunicipality(0, summary)).toBe('Santa Tecla-La Libertad');
    });

    it('trackPoint utiliza id_destino, id o nombre_destino en cascada', () => {
      const p1 = createDeliveryPoint({ id_destino: 'DEST-1', id: 'ID-1', nombre_destino: 'Nom 1' });
      const p2 = createDeliveryPoint({ id_destino: '', id: 'ID-2', nombre_destino: 'Nom 2' });
      const p3 = createDeliveryPoint({ id_destino: '', id: '', nombre_destino: 'Nom 3' });

      expect(component.trackPoint(0, p1)).toBe('DEST-1');
      expect(component.trackPoint(0, p2)).toBe('ID-2');
      expect(component.trackPoint(0, p3)).toBe('Nom 3');
    });
  });

  describe('inmutabilidad', () => {
    it('no muta el arreglo de entrada ni los objetos al construir datos de discovery', () => {
      const originalPoints: readonly DeliveryPoint[] = Object.freeze([
        Object.freeze(createDeliveryPoint({
          id: 'P1',
          nombre_destino: 'Punto 1',
          empresa: 'Empresa A',
          ubicacion: Object.freeze({ municipio: 'San Salvador', departamento: 'San Salvador' })
        })),
        Object.freeze(createDeliveryPoint({
          id: 'P2',
          nombre_destino: 'Punto 2',
          empresa: 'Empresa B',
          ubicacion: Object.freeze({ municipio: 'Santa Tecla', departamento: 'La Libertad' })
        }))
      ]);

      const serializedBefore = JSON.stringify(originalPoints);

      component.locations = originalPoints;
      expect(() => {
        component.ngOnChanges({
          locations: new SimpleChange(undefined, originalPoints, true)
        });
      }).not.toThrow();

      expect(JSON.stringify(originalPoints)).toBe(serializedBefore);
      expect(component.locations).toBe(originalPoints);
    });

  });
});
