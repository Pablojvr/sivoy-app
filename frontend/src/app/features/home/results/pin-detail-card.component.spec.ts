import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { PinDetailCardComponent, PinDetailViewModel } from './pin-detail-card.component';

@Component({
  template: `
    <article
      siPinDetailCard
      class="pin-details-card pin-point-card slide-up"
      [class.is-collapsed]="!isExpanded"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-point-title"
      [pin]="pin"
      [expanded]="isExpanded"
      [activeTab]="activeTab"
      [heroImageUrl]="heroImageUrl"
      [routeSelectionBlocked]="routeSelectionBlocked"
      [hasOrigin]="hasOrigin"
      [hasDestination]="hasDestination"
      (toggle)="onToggle()"
      (touchStart)="onTouchStart($event)"
      (touchEnd)="onTouchEnd($event)"
      (preview)="onPreview($event)"
      (share)="onShare($event)"
      (close)="onClose()"
      (tabChange)="onTabChange($event)"
      (copy)="onCopy()"
      (openMap)="onOpenMap()"
      (selectOrigin)="onSelectOrigin()"
      (selectDestination)="onSelectDestination()">
    </article>
  `,
  standalone: true,
  imports: [PinDetailCardComponent]
})
class TestHostComponent {
  pin: PinDetailViewModel = {
    empresa: 'Test Agency',
    nombre_destino: 'Santa Ana Centro',
    markerType: 'destination',
    imagen_referencia: 'test.jpg'
  };
  isExpanded = false;
  activeTab: 'info' | 'horarios' = 'info';
  heroImageUrl = 'resolved.jpg';
  routeSelectionBlocked = false;
  hasOrigin = false;
  hasDestination = false;

  onToggle() { this.isExpanded = !this.isExpanded; }
  onTouchStart(e: TouchEvent) {}
  onTouchEnd(e: TouchEvent) {}
  onPreview(img: string) {}
  onShare(p: PinDetailViewModel) {}
  onClose() {}
  onTabChange(tab: 'info' | 'horarios') { this.activeTab = tab; }
  onCopy() {}
  onOpenMap() {}
  onSelectOrigin() {}
  onSelectDestination() {}
}

describe('PinDetailCardComponent', () => {
  let fixture: ComponentFixture<TestHostComponent>;
  let host: TestHostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent]
    }).compileComponents();
    
    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
  });

  it('should render ARTICLE with classes, roles and background', () => {
    fixture.detectChanges();
    const el = fixture.debugElement.query(By.directive(PinDetailCardComponent)).nativeElement;
    
    expect(el.tagName).toBe('ARTICLE');
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.classList.contains('pin-details-card')).toBe(true);
    expect(el.classList.contains('is-collapsed')).toBe(true);
    
    const header = fixture.debugElement.query(By.css('.pin-card-hero')).nativeElement;
    expect(header.style.backgroundImage).toContain('url("resolved.jpg")');
  });

  it('should fallback background when no heroImageUrl', () => {
    host.heroImageUrl = '';
    fixture.detectChanges();
    const header = fixture.debugElement.query(By.css('.pin-card-hero')).nativeElement;
    expect(header.style.backgroundImage).toContain('linear-gradient');
  });

  it('should call stopPropagation and emit toggle exactly once but not mutate internally', () => {
    fixture.detectChanges();
    const toggleSpy = vi.spyOn(host, 'onToggle');
    const toggleBtn = fixture.debugElement.query(By.css('.pin-card-sheet-toggle'));
    
    const mockEvent = { stopPropagation: vi.fn() } as unknown as Event;
    toggleBtn.triggerEventHandler('click', mockEvent);
    
    expect(mockEvent.stopPropagation).toHaveBeenCalledTimes(1);
    expect(toggleSpy).toHaveBeenCalledTimes(1);
    expect(host.isExpanded).toBe(true);
  });

  it('should emit touch events with exact payload', () => {
    fixture.detectChanges();
    const startSpy = vi.spyOn(host, 'onTouchStart');
    const endSpy = vi.spyOn(host, 'onTouchEnd');
    const header = fixture.debugElement.query(By.css('.pin-card-hero'));
    
    const touchStartEvent = { touches: [{ clientY: 10 }] } as unknown as TouchEvent;
    const touchEndEvent = { changedTouches: [{ clientY: 20 }] } as unknown as TouchEvent;
    
    header.triggerEventHandler('touchstart', touchStartEvent);
    header.triggerEventHandler('touchend', touchEndEvent);
    
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(startSpy).toHaveBeenCalledWith(touchStartEvent);
    expect(endSpy).toHaveBeenCalledTimes(1);
    expect(endSpy).toHaveBeenCalledWith(touchEndEvent);
  });

  describe('Expanded View (info)', () => {
    beforeEach(() => {
      host.isExpanded = true;
      host.pin = {
        ...host.pin,
        _status: { color: 'text-success', iconType: 'clock', mainText: 'Abierto', timeText: 'hasta las 5pm' },
        direccion_referencia: 'Frente a parque',
        ubicacion: { municipio: 'Santa Ana', departamento: 'Santa Ana' }
      };
    });

    it('should render expanded content, status and address', () => {
      fixture.detectChanges();
      const content = fixture.debugElement.query(By.css('.pin-card-expanded-content'));
      expect(content).toBeTruthy();
      
      const statusDiv = fixture.debugElement.query(By.css('.pin-availability')).nativeElement;
      expect(statusDiv.classList.contains('text-success')).toBe(true);
      expect(statusDiv.textContent).toContain('Abierto');
      expect(statusDiv.textContent).toContain('hasta las 5pm');
      
      const address = fixture.debugElement.query(By.css('.pin-address-copy')).nativeElement;
      expect(address.textContent).toContain('Frente a parque');
      expect(address.textContent).toContain('Santa Ana, Santa Ana');
    });

    it('should emit actions (share, close, copy, openMap, preview) exactly once', () => {
      fixture.detectChanges();
      const shareSpy = vi.spyOn(host, 'onShare');
      const closeSpy = vi.spyOn(host, 'onClose');
      const copySpy = vi.spyOn(host, 'onCopy');
      const mapSpy = vi.spyOn(host, 'onOpenMap');
      const previewSpy = vi.spyOn(host, 'onPreview');
      
      const mockEvent = { stopPropagation: vi.fn() } as unknown as Event;
      
      fixture.debugElement.query(By.css('.pin-card-hero-actions button:first-child')).triggerEventHandler('click', mockEvent);
      expect(mockEvent.stopPropagation).toHaveBeenCalledTimes(1);
      expect(shareSpy).toHaveBeenCalledTimes(1);
      expect(shareSpy).toHaveBeenCalledWith(host.pin);
      
      fixture.debugElement.query(By.css('.pin-card-hero-actions button:last-child')).triggerEventHandler('click', mockEvent);
      expect(mockEvent.stopPropagation).toHaveBeenCalledTimes(2);
      expect(closeSpy).toHaveBeenCalledTimes(1);
      
      fixture.debugElement.query(By.css('.pin-copy-action')).nativeElement.click();
      expect(copySpy).toHaveBeenCalledTimes(1);
      
      fixture.debugElement.query(By.css('.pin-map-action')).nativeElement.click();
      expect(mapSpy).toHaveBeenCalledTimes(1);
      
      fixture.debugElement.query(By.css('.pin-image-preview')).nativeElement.click();
      expect(previewSpy).toHaveBeenCalledTimes(1);
      expect(previewSpy).toHaveBeenCalledWith('test.jpg');
    });

    it('should emit selectOrigin once when marker is origin and test dynamic copy', () => {
      host.routeSelectionBlocked = false;
      host.pin.markerType = 'origin';
      host.hasDestination = false;
      fixture.detectChanges();
      
      const originSpy = vi.spyOn(host, 'onSelectOrigin');
      const btn = fixture.debugElement.query(By.css('.pin-route-action')).nativeElement;
      expect(btn.textContent).toContain('Después eliges el destino');
      expect(btn.textContent).toContain('Usar como origen');
      
      btn.click();
      expect(originSpy).toHaveBeenCalledTimes(1);
      
      // Test dynamic copy
      host.hasDestination = true;
      fixture.detectChanges();
      expect(btn.textContent).toContain('Ruta lista para calcular');
      expect(btn.textContent).toContain('Calcular desde aquí');
    });

    it('should emit selectDestination once when marker is destination and test dynamic copy', () => {
      host.routeSelectionBlocked = false;
      host.pin.markerType = 'destination';
      host.hasOrigin = false;
      fixture.detectChanges();
      
      const destSpy = vi.spyOn(host, 'onSelectDestination');
      const btn = fixture.debugElement.query(By.css('.pin-route-action')).nativeElement;
      expect(btn.textContent).toContain('Después eliges el origen');
      expect(btn.textContent).toContain('Usar como destino');
      
      btn.click();
      expect(destSpy).toHaveBeenCalledTimes(1);
      
      // Test dynamic copy
      host.hasOrigin = true;
      fixture.detectChanges();
      expect(btn.textContent).toContain('Ruta lista para calcular');
      expect(btn.textContent).toContain('Calcular hacia aquí');
    });

    it('should hide selection actions and keep map action when routeSelectionBlocked', () => {
      host.routeSelectionBlocked = true;
      host.pin.markerType = 'origin';
      fixture.detectChanges();
      
      const actions = fixture.debugElement.queryAll(By.css('.pin-card-quick-actions button'));
      expect(actions.length).toBe(1);
      expect(actions[0].nativeElement.classList.contains('pin-map-action')).toBe(true);
    });
  });

  describe('Tabs and Horarios', () => {
    beforeEach(() => {
      host.isExpanded = true;
      host.activeTab = 'info';
    });

    it('should emit tabChange exactly once and not mutate activeTab internally', () => {
      fixture.detectChanges();
      const tabSpy = vi.spyOn(host, 'onTabChange');
      const btns = fixture.debugElement.queryAll(By.css('.pin-card-tabs button'));
      
      btns[1].nativeElement.click();
      expect(tabSpy).toHaveBeenCalledTimes(1);
      expect(tabSpy).toHaveBeenCalledWith('horarios');
      expect(host.activeTab).toBe('horarios'); // Mutated by host, not child
      
      fixture.detectChanges();
      const activeBtn = fixture.debugElement.query(By.css('.pin-card-tabs button.active')).nativeElement;
      expect(activeBtn.textContent).toBe('Horarios');
    });

    it('should show empty hours message', () => {
      host.activeTab = 'horarios';
      host.pin.horarios_operativos = [];
      fixture.detectChanges();
      
      expect(fixture.debugElement.query(By.css('.pin-hours-empty')).nativeElement.textContent).toContain('Horarios no definidos');
    });
    
    it('should render schedule component when hours exist', () => {
      host.activeTab = 'horarios';
      host.pin.horarios_operativos = [{ dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' }];
      fixture.detectChanges();
      
      expect(fixture.debugElement.query(By.css('app-schedule-display'))).toBeTruthy();
    });
  });
});
