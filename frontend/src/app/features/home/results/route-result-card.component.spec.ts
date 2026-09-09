import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { RouteResultCardComponent, RouteResultViewModel, RouteDeliveryDayChange, formatLocationName, formatFriendlyDate } from './route-result-card.component';

@Component({
  template: `<article siRouteResultCard class="sivoy-route-card" [class.is-expanded]="route.isExpanded" [route]="route" [routeNumber]="1" destinationFallback="Default Dest" (toggle)="onToggle($event)" (deliveryDayChange)="onDayChange($event)" (restartOrigin)="onRestart()" (viewMap)="onViewMap($event)"></article>`,
  standalone: true,
  imports: [RouteResultCardComponent]
})
class TestHostComponent {
  route: RouteResultViewModel = {
    empresa: 'Test Logistics',
    origen_nombre: 'San Salvador',
    destino_nombre: 'Santa Ana',
    isExpanded: false,
    sourceRouteIndex: 0
  };
  
  onToggle(r: RouteResultViewModel) {
    r.isExpanded = !r.isExpanded;
  }
  onDayChange(e: RouteDeliveryDayChange) {
    e.route.selected_opcion_idx = e.index;
  }
  onRestart() {}
  onViewMap(r: RouteResultViewModel) {}
}

describe('RouteResultCardComponent', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;
  let component: RouteResultCardComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent]
    }).compileComponents();
    
    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
    component = fixture.debugElement.query(By.directive(RouteResultCardComponent)).componentInstance;
  });

  it('should retain ARTICLE tag and host classes', () => {
    fixture.detectChanges();
    const el = fixture.debugElement.query(By.directive(RouteResultCardComponent)).nativeElement;
    expect(el.tagName).toBe('ARTICLE');
    expect(el.classList.contains('sivoy-route-card')).toBe(true);
    expect(el.classList.contains('is-expanded')).toBe(false);
  });
  
  it('should render summary and ARIA attributes correctly', () => {
    fixture.detectChanges();
    const btn = fixture.debugElement.query(By.css('.route-card-summary')).nativeElement;
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.getAttribute('aria-label')).toContain('Ver detalles de la ruta de San Salvador a Santa Ana');
    
    const empresa = fixture.debugElement.query(By.css('.route-provider strong')).nativeElement;
    expect(empresa.textContent.trim()).toBe('Test Logistics');
  });

  it('should display fallback ETA when no delivery options are present', () => {
    host.route = { ...host.route, fecha_llegada: '2026-10-10', horario_recoleccion: '10:00 - 12:00' };
    fixture.detectChanges();
    
    const strongField = fixture.debugElement.query(By.css('.route-eta-copy strong'));
    const spanField = fixture.debugElement.queryAll(By.css('.route-eta-copy span'))[0];
    expect(strongField.nativeElement.textContent.trim()).toBe('2026-10-10');
    expect(spanField.nativeElement.textContent.trim()).toBe('10:00 - 12:00');
  });

  describe('Integration with host (toggle and select changes)', () => {
    beforeEach(() => {
      host.route = {
        ...host.route,
        isExpanded: false,
        hasClosedAlert: true,
        opciones_entrega: [
          { dropoff_date: '2026-10-10', fecha_llegada: '2026-10-11', horario_recoleccion: 'Morning', sourceOptionIndex: 0 },
          { dropoff_date: '2026-10-11', fecha_llegada: '2026-10-12', horario_recoleccion: 'Afternoon', sourceOptionIndex: 1 }
        ],
        selected_opcion_idx: 0
      };
    });

    it('should mutate route.isExpanded in host and display details after detectChanges', () => {
      fixture.detectChanges();
      const btn = fixture.debugElement.query(By.css('.route-card-summary')).nativeElement;
      const toggleSpy = vi.spyOn(host, 'onToggle');
      
      btn.click();
      
      expect(toggleSpy).toHaveBeenCalledTimes(1);
      expect(host.route.isExpanded).toBe(true);
      
      fixture.detectChanges();
      
      const el = fixture.debugElement.query(By.directive(RouteResultCardComponent)).nativeElement;
      expect(el.classList.contains('is-expanded')).toBe(true);
      
      const grid = fixture.debugElement.query(By.css('.route-data-grid'));
      expect(grid).toBeTruthy();
    });

    it('should update selected option in host and reflect ETA update', () => {
      host.route.isExpanded = true;
      fixture.detectChanges();
      
      const changeSpy = vi.spyOn(host, 'onDayChange');
      const select = fixture.debugElement.query(By.css('.flight-day-select')).nativeElement;
      
      select.value = '1';
      select.dispatchEvent(new Event('change'));
      
      expect(changeSpy).toHaveBeenCalledTimes(1);
      expect(host.route.selected_opcion_idx).toBe(1);
      
      fixture.detectChanges();
      
      const strongField = fixture.debugElement.query(By.css('.route-eta-copy strong'));
      expect(strongField.nativeElement.textContent.trim()).toBe('2026-10-12');
    });
  });

  describe('Formatters (Pure Functions)', () => {
    it('should format location names', () => {
      expect(formatLocationName('Centro', 'Agencia')).toBe('AGENCIA CENTRO');
      expect(formatLocationName('Santa Ana', 'Cobertura Domicilio')).toBe('DOMICILIO SANTA ANA');
      expect(formatLocationName('Metro')).toBe('PUNTO FIJO METRO');
    });

    it('should format friendly dates', () => {
      const today = new Date();
      const ds = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
      expect(formatFriendlyDate(ds)).toContain('(Hoy)');
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const ts = `${tomorrow.getFullYear()}-${tomorrow.getMonth() + 1}-${tomorrow.getDate()}`;
      expect(formatFriendlyDate(ts)).toContain('(Mañana)');
    });
  });
});
