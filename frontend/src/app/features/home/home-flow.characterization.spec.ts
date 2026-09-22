import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HomeComponent } from './home.component';
import { ShipmentSearchFacade } from './shipment-search.facade';
import { RutasService } from '../../core/services/rutas.service';
import { MapasService } from '../../core/services/mapas.service';
import { ToastService } from '../../core/services/toast.service';
import { PointShareService } from './results/point-share.service';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';

const mockLocations = [
  {
    id: 1,
    id_origen: 1,
    id_destino: 1,
    nombre_destino: 'Agencia Centro',
    empresa: 'Empresa A',
    tipo: 'Agencia',
    ubicacion: { municipio: 'San Salvador', departamento: 'San Salvador', lat: 13.69, lng: -89.21 },
  },
  {
    id: 2,
    id_origen: 2,
    id_destino: 2,
    nombre_destino: 'Agencia Norte',
    empresa: 'Empresa A',
    tipo: 'Agencia',
    ubicacion: { municipio: 'Santa Tecla', departamento: 'La Libertad', lat: 13.67, lng: -89.28 },
  },
];

const mockUpcomingRoutesResponse = {
  success: true,
  results: [
    {
      empresa: 'Empresa A',
      origen_nombre: 'Agencia Norte',
      destino_nombre: 'Agencia Centro',
      origen_msg: '',
      opciones_entrega: [
        {
          dropoff_date: '2025-01-01',
          horario_recoleccion: '08:00',
          fecha_llegada: '2025-01-02',
          dropoff_msg: '',
        },
      ],
    },
  ],
};

describe('Home Flow Characterization (T05a)', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let rutasServiceMock: { searchFlights: Mock; getUpcomingRoutes: Mock };
  let shareServiceMock: { sharePoint: Mock };

  beforeEach(async () => {
    rutasServiceMock = {
      searchFlights: vi.fn().mockReturnValue(of({ success: true, results: [] })),
      getUpcomingRoutes: vi.fn().mockReturnValue(of(mockUpcomingRoutesResponse)),
    };

    shareServiceMock = {
      sharePoint: vi.fn().mockResolvedValue(true),
    };

    const mapasServiceMock = {
      searchPlaces: vi.fn().mockReturnValue(of({ suggestions: [] })),
      resolvePlace: vi.fn().mockReturnValue(of({})),
    };

    const toastMock = { showInfo: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        ShipmentSearchFacade,
        { provide: RutasService, useValue: rutasServiceMock },
        { provide: MapasService, useValue: mapasServiceMock },
        { provide: ToastService, useValue: toastMock },
        { provide: PointShareService, useValue: shareServiceMock },
      ],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    component.locations = mockLocations;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.clearAllMocks();
  });

  it('caracteriza destino, compartir, origen y resultado dentro del componente', async () => {
    // 1. Iniciar búsqueda de destino
    const destTrigger = fixture.debugElement.query(By.css('.destination-search-trigger'));
    expect(destTrigger).toBeTruthy();
    destTrigger.nativeElement.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isSearchExpanded).toBe(true);
    expect(fixture.debugElement.query(By.css('app-destination-search'))).toBeTruthy();

    // 2. Buscar y seleccionar municipio destino (San Salvador)
    const destInput = fixture.debugElement.query(
      By.css('app-destination-search input'),
    ).nativeElement;
    destInput.value = 'San Salvador';
    destInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();

    const destOptions = fixture.debugElement.queryAll(
      By.css('app-destination-search .destination-option'),
    );
    expect(destOptions.length).toBeGreaterThan(0);
    destOptions[0].nativeElement.click();
    fixture.detectChanges();
    await fixture.whenStable();

    // 3. Verificar estado post-destino (Discovery Mode)
    expect(component.isSearchExpanded).toBe(false);
    expect(component.destino).toContain('San Salvador');
    expect(component.displayedResults.length).toBeGreaterThan(0);

    // 4. Intención de compartir el punto de destino
    const pointCards = fixture.debugElement.queryAll(By.css('article.point-result-card'));
    expect(pointCards.length).toBeGreaterThan(0);

    const shareBtn = pointCards[0].query(By.css('.point-share-action'));
    expect(shareBtn).toBeTruthy();
    shareBtn.nativeElement.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(shareServiceMock.sharePoint).toHaveBeenCalledWith(
      expect.objectContaining({ nombre_destino: 'Agencia Centro' }),
      undefined,
    );

    // 5. Iniciar selección de origen desde el punto destino
    const useBtn = pointCards[0].query(By.css('.point-use-action'));
    expect(useBtn).toBeTruthy();
    useBtn.nativeElement.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.isOriginChoiceMode).toBe(true);

    component.dropoffDate = '2025-01-01';
    component.dropoffTime = '08:00';

    // 6. Seleccionar origen compatible (Santa Tecla / Agencia Norte)
    const compatiblePoints = fixture.debugElement.queryAll(By.css('.compatible-point-card'));
    expect(compatiblePoints.length).toBeGreaterThan(0);
    compatiblePoints[0].nativeElement.click();
    fixture.detectChanges();
    await fixture.whenStable();

    // RutasService debió ser llamado para buscar rutas
    expect(rutasServiceMock.getUpcomingRoutes).toHaveBeenCalled();

    // 7. Verificar que se muestren las rutas (resultados)
    const routeCards = fixture.debugElement.queryAll(By.css('article.sivoy-route-card'));
    expect(routeCards.length).toBe(1);
    expect(component.flightResults.length).toBe(1);

    // 8. T48b2: Destruir y recrear Home con el mismo facade y mismo initialIntent municipal
    expect(rutasServiceMock.getUpcomingRoutes).toHaveBeenCalledTimes(1);

    fixture.destroy();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('locations', mockLocations);
    fixture.componentRef.setInput('initialIntent', { municipio: 'San Salvador' });
    fixture.detectChanges();
    await fixture.whenStable();

    // Probar que no ocurre una segunda búsqueda HTTP
    expect(rutasServiceMock.getUpcomingRoutes).toHaveBeenCalledTimes(1);

    // Probar que la ruta se restaura sin pérdida
    expect(component.flightResults.length).toBe(1);
    const restoredRouteCards = fixture.debugElement.queryAll(By.css('article.sivoy-route-card'));
    expect(restoredRouteCards.length).toBe(1);

    // Probar que el origen y destino seleccionados exactos se restauran
    expect(component.selectedOriginPoint).toEqual(mockLocations[1]);
    expect(component.selectedDestinationPoint).toEqual(mockLocations[0]);
    expect(component.origen).toBe('Agencia Norte');
    expect(component.destino).toBe('Agencia Centro');
    expect(component.origenInputValue).toBe('Agencia Norte');
    expect(component.destinoInputValue).toBe('Agencia Centro');

    // Probar que los filtros se restauran
    expect(component.dropoffDate).toBe('2025-01-01');
    expect(component.dropoffTime).toBe('08:00');
  });

  it('restaura estado de ruta y conserva municipios si un punto ya no existe en el catalogo', async () => {
    // 1. Iniciar búsqueda de destino y seleccionar San Salvador
    fixture.debugElement.query(By.css('.destination-search-trigger')).nativeElement.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const destInput = fixture.debugElement.query(By.css('app-destination-search input')).nativeElement;
    destInput.value = 'San Salvador';
    destInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.debugElement.queryAll(By.css('app-destination-search .destination-option'))[0].nativeElement.click();
    fixture.detectChanges();
    await fixture.whenStable();

    // 2. Seleccionar punto destino y luego origen compatible
    fixture.debugElement.query(By.css('article.point-result-card .point-use-action')).nativeElement.click();
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.debugElement.queryAll(By.css('.compatible-point-card'))[0].nativeElement.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(rutasServiceMock.getUpcomingRoutes).toHaveBeenCalledTimes(1);
    expect(component.flightResults.length).toBe(1);

    // 3. Recrear Home con catálogo donde el origen ya no existe
    fixture.destroy();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    // Solo dejamos la agencia destino (id 1); la de origen (id 2) se remueve
    fixture.componentRef.setInput('locations', [mockLocations[0]]);
    fixture.componentRef.setInput('initialIntent', { municipio: 'San Salvador' });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(rutasServiceMock.getUpcomingRoutes).toHaveBeenCalledTimes(1);
    expect(component.flightResults.length).toBe(1);
    expect(component.selectedOriginPoint).toBeNull();
    expect(component.origenMunicipio).toBe('Santa Tecla');
    expect(component.origenDepartamento).toBe('La Libertad');
    expect(component.origen).toBe('Agencia Norte');
    expect(component.selectedDestinationPoint).toEqual(mockLocations[0]);
    expect(component.destinoMunicipio).toBe('San Salvador');
  });

  it('no restaura la ruta activa de San Salvador cuando initialIntent solicita un municipio diferente', async () => {
    // 1. Iniciar búsqueda de destino y seleccionar San Salvador
    fixture.debugElement.query(By.css('.destination-search-trigger')).nativeElement.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const destInput = fixture.debugElement.query(By.css('app-destination-search input')).nativeElement;
    destInput.value = 'San Salvador';
    destInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.debugElement.queryAll(By.css('app-destination-search .destination-option'))[0].nativeElement.click();
    fixture.detectChanges();
    await fixture.whenStable();

    // 2. Seleccionar punto destino y luego origen compatible
    fixture.debugElement.query(By.css('article.point-result-card .point-use-action')).nativeElement.click();
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.debugElement.queryAll(By.css('.compatible-point-card'))[0].nativeElement.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(rutasServiceMock.getUpcomingRoutes).toHaveBeenCalledTimes(1);
    expect(component.flightResults.length).toBe(1);
    expect(component.destinoMunicipio).toBe('San Salvador');

    // 3. Recrear Home con initialIntent solicitando un municipio diferente (Santa Tecla)
    fixture.destroy();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('locations', mockLocations);
    fixture.componentRef.setInput('initialIntent', { municipio: 'Santa Tecla', departamento: 'La Libertad' });
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();

    // Probar que la ruta activa previa de San Salvador NO sobreescribe el intent
    expect(component.destinoMunicipio).toBe('Santa Tecla');
    expect(component.destino).toBe('Santa Tecla');
    expect(component.selectedDestinationPoint).toBeNull();
    expect(component.selectedOriginPoint).toBeNull();
    expect(component.flightResults.length).toBe(0);
    expect(fixture.debugElement.queryAll(By.css('article.sivoy-route-card')).length).toBe(0);

    // Probar que entra en modo descubrimiento para el nuevo municipio
    expect(component.isDiscoveryMode).toBe(true);
    expect(component.displayedResults.length).toBe(1);
    expect(component.displayedResults[0].nombre_destino).toBe('Agencia Norte');
    expect(fixture.debugElement.queryAll(By.css('article.point-result-card')).length).toBe(1);
  });

  it('respeta una acción explícita de punto en vez de restaurar la ruta activa', async () => {
    fixture.debugElement.query(By.css('.destination-search-trigger')).nativeElement.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const destInput = fixture.debugElement.query(By.css('app-destination-search input')).nativeElement;
    destInput.value = 'San Salvador';
    destInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();

    fixture.debugElement.queryAll(By.css('app-destination-search .destination-option'))[0].nativeElement.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.debugElement.query(By.css('article.point-result-card .point-use-action')).nativeElement.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.debugElement.queryAll(By.css('.compatible-point-card'))[0].nativeElement.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(rutasServiceMock.getUpcomingRoutes).toHaveBeenCalledTimes(1);
    expect(component.flightResults.length).toBe(1);

    fixture.destroy();
    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('locations', mockLocations);
    fixture.componentRef.setInput('initialIntent', { punto: '1', accion: 'preview' });
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();

    expect(rutasServiceMock.getUpcomingRoutes).toHaveBeenCalledTimes(1);
    expect(component.flightResults).toEqual([]);
    expect(component.isDiscoveryMode).toBe(true);
    expect(component.expandedResultCard).toEqual(
      expect.objectContaining({ nombre_destino: 'Agencia Centro' }),
    );
  });
});
