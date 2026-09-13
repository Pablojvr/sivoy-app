import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HomeComponent } from './home.component';
import { MapasService } from '../../core/services/mapas.service';
import { ToastService } from '../../core/services/toast.service';
import { ShipmentSearchFacade } from './shipment-search.facade';
import { PointShareService } from './results/point-share.service';
import { signal } from '@angular/core';
import { of } from 'rxjs';

describe('HomeComponent (T31d)', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let mapasServiceMock: { searchPlaces: Mock; resolvePlace: Mock };
  let facadeMock: Record<string, unknown>;
  let toastMock: Record<string, unknown>;
  let shareMock: Record<string, unknown>;

  beforeEach(async () => {
    mapasServiceMock = {
      searchPlaces: vi.fn().mockReturnValue(of({ suggestions: [] })),
      resolvePlace: vi.fn().mockReturnValue(of({}))
    };

    facadeMock = {
      state: signal({ mode: 'idle', status: 'initial', results: [] }),
      setOrigin: vi.fn(),
      setDestination: vi.fn()
    };

    toastMock = {
      showInfo: vi.fn()
    };
    shareMock = {
      share: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        { provide: MapasService, useValue: mapasServiceMock },
        { provide: ShipmentSearchFacade, useValue: facadeMock },
        { provide: ToastService, useValue: toastMock },
        { provide: PointShareService, useValue: shareMock }
      ]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (fixture && !fixture.componentRef?.hostView?.destroyed) {
      fixture.destroy();
    }
  });

  it('should not call MapasService.searchPlaces for pending placeSearchTimer after component destruction', () => {
    vi.useFakeTimers();
    // Trigger place search, which sets a timeout for 350ms
    component.onPlaceSearchInput('San Salvador');

    // Destroy component before timeout completes
    fixture.destroy();

    // Fast-forward time
    vi.advanceTimersByTime(400);

    // searchPlaces should NOT have been called
    expect(mapasServiceMock.searchPlaces).not.toHaveBeenCalled();
  });
});
