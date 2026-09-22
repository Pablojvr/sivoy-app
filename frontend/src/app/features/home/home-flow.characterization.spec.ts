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
  });
});
