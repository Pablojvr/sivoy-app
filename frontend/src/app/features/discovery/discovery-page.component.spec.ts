import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChangeDetectorRef } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { DiscoveryPageComponent } from './discovery-page.component';
import { UbicacionesService } from '../../core/services/ubicaciones.service';
import { DeliveryPoint } from '../../core/models/location.models';

interface MockUbicacionesService {
  getLocations: ReturnType<typeof vi.fn>;
}

interface MockRouter {
  navigate: ReturnType<typeof vi.fn>;
}

interface MockCdr {
  detectChanges: ReturnType<typeof vi.fn>;
}

const mockDeliveryPoints: DeliveryPoint[] = [
  {
    id: 'point-101',
    nombre_destino: 'Agencia Central San Salvador',
    ubicacion: {},
    horarios_operativos: [],
    reglas_entrega: []
  }
];

function createMockDeliveryPoint(
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
    nombre_destino: overrides.nombre_destino ?? 'Punto de prueba',
    ubicacion: overrides.ubicacion ?? {},
    horarios_operativos: overrides.horarios_operativos ?? [],
    reglas_entrega: overrides.reglas_entrega ?? []
  };
}

describe('DiscoveryPageComponent (architectural slice)', () => {
  let locationsSubject: Subject<DeliveryPoint[]>;
  let mockUbicacionesService: MockUbicacionesService;
  let router: Router;
  let navigateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    locationsSubject = new Subject<DeliveryPoint[]>();
    mockUbicacionesService = {
      getLocations: vi.fn().mockImplementation(() => locationsSubject)
    };

    await TestBed.configureTestingModule({
      imports: [DiscoveryPageComponent],
      providers: [
        provideRouter([]),
        { provide: UbicacionesService, useValue: mockUbicacionesService }
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  describe('servicio de ubicaciones y reactividad', () => {
    it('invoca getLocations exactamente una vez al construirse', () => {
      expect(mockUbicacionesService.getLocations).not.toHaveBeenCalled();
      TestBed.createComponent(DiscoveryPageComponent);
      expect(mockUbicacionesService.getLocations).toHaveBeenCalledTimes(1);
    });

    it('asigna una emision valida sin mutar al arreglo esperado y llama detectChanges', () => {
      const mockCdr: MockCdr = {
        detectChanges: vi.fn()
      };
      const directSubject = new Subject<DeliveryPoint[]>();
      const serviceMock: MockUbicacionesService = {
        getLocations: vi.fn().mockImplementation(() => directSubject)
      };

      const componentInstance = new DiscoveryPageComponent(
        serviceMock as unknown as UbicacionesService,
        router,
        mockCdr as unknown as ChangeDetectorRef
      );

      const incomingLocations: DeliveryPoint[] = [...mockDeliveryPoints];
      const serializedOriginal = JSON.stringify(incomingLocations);

      directSubject.next(incomingLocations);

      expect(componentInstance.locations).toBe(incomingLocations);
      expect(JSON.stringify(incomingLocations)).toBe(serializedOriginal);
      expect(mockCdr.detectChanges).toHaveBeenCalledTimes(1);
    });

    it('conserva locations=[] y llama detectChanges ante un error', () => {
      const mockCdr: MockCdr = {
        detectChanges: vi.fn()
      };
      const directSubject = new Subject<DeliveryPoint[]>();
      const serviceMock: MockUbicacionesService = {
        getLocations: vi.fn().mockImplementation(() => directSubject)
      };

      const componentInstance = new DiscoveryPageComponent(
        serviceMock as unknown as UbicacionesService,
        router,
        mockCdr as unknown as ChangeDetectorRef
      );

      directSubject.error(new Error('Network failure'));

      expect(componentInstance.locations).toEqual([]);
      expect(mockCdr.detectChanges).toHaveBeenCalledTimes(1);
    });
  });

  describe('acciones de navegacion', () => {
    let component: DiscoveryPageComponent;

    beforeEach(() => {
      const fixture: ComponentFixture<DiscoveryPageComponent> = TestBed.createComponent(DiscoveryPageComponent);
      component = fixture.componentInstance;
    });

    it('navega a /enviar con queryParams { buscar: "destino" } en openDestinationSearch', () => {
      component.openDestinationSearch();
      expect(navigateSpy).toHaveBeenCalledWith(['/enviar'], {
        queryParams: { buscar: 'destino' }
      });
    });

    it('navega a /enviar con queryParams { vista: "mapa" } en openMap', () => {
      component.openMap();
      expect(navigateSpy).toHaveBeenCalledWith(['/enviar'], {
        queryParams: { vista: 'mapa' }
      });
    });

    it('navega a /enviar con queryParams { empresa: company } en openCompany', () => {
      component.openCompany('DHL');
      expect(navigateSpy).toHaveBeenCalledWith(['/enviar'], {
        queryParams: { empresa: 'DHL' }
      });
    });

    it('navega a /enviar con queryParams de municipio y departamento en openMunicipality', () => {
      component.openMunicipality({
        municipio: 'Santa Tecla',
        departamento: 'La Libertad',
        pointCount: 1
      });
      expect(navigateSpy).toHaveBeenCalledWith(['/enviar'], {
        queryParams: {
          municipio: 'Santa Tecla',
          departamento: 'La Libertad'
        }
      });
    });

    it('navega a /enviar con accion "select", punto y vista null en openPoint', () => {
      component.openPoint(createMockDeliveryPoint({ id_destino: 'DEST-100', id: 'ID-200' }), 'select');
      expect(navigateSpy).toHaveBeenCalledWith(['/enviar'], {
        queryParams: {
          punto: 'DEST-100',
          accion: 'select',
          vista: null
        }
      });
    });

    it('navega a /enviar con accion "preview", punto y vista null en openPoint', () => {
      component.openPoint(createMockDeliveryPoint({ id_destino: 'DEST-100', id: 'ID-200' }), 'preview');
      expect(navigateSpy).toHaveBeenCalledWith(['/enviar'], {
        queryParams: {
          punto: 'DEST-100',
          accion: 'preview',
          vista: null
        }
      });
    });

    it('navega a /enviar con accion "map", punto y vista "mapa" en openPoint', () => {
      component.openPoint(createMockDeliveryPoint({ id_destino: 'DEST-100', id: 'ID-200' }), 'map');
      expect(navigateSpy).toHaveBeenCalledWith(['/enviar'], {
        queryParams: {
          punto: 'DEST-100',
          accion: 'map',
          vista: 'mapa'
        }
      });
    });

    it('utiliza fallback point.id cuando point.id_destino no esta definido en openPoint', () => {
      component.openPoint(createMockDeliveryPoint({ id: 'FALLBACK-ID-300' }), 'select');
      expect(navigateSpy).toHaveBeenCalledWith(['/enviar'], {
        queryParams: {
          punto: 'FALLBACK-ID-300',
          accion: 'select',
          vista: null
        }
      });
    });

    it('utiliza fallback point.id cuando point.id_destino es falsy en openPoint', () => {
      component.openPoint(createMockDeliveryPoint({ id_destino: '', id: 'FALLBACK-ID-400' }), 'map');
      expect(navigateSpy).toHaveBeenCalledWith(['/enviar'], {
        queryParams: {
          punto: 'FALLBACK-ID-400',
          accion: 'map',
          vista: 'mapa'
        }
      });
    });
  });

});
