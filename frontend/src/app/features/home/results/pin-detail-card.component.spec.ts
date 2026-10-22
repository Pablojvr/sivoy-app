import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { PinDetailCardComponent, PinDetailViewModel } from './pin-detail-card.component';
import { SavedPointSnapshot } from '../../../core/saved-points/saved-points.models';
import { SavedPointsService } from '../../../core/saved-points/saved-points.service';
import { ToastService } from '../../../core/services/toast.service';

class SavedPointsStub {
  readonly ids = new Set<string>();
  saveOutcome: 'saved' | 'already-saved' | 'limit-reached' | 'invalid-point' | 'storage-unavailable' = 'saved';
  readonly save = vi.fn((snapshot: SavedPointSnapshot) => {
    if (this.saveOutcome === 'saved') this.ids.add(snapshot.pointId);
    return this.saveOutcome;
  });
  readonly remove = vi.fn((pointId: string) => this.ids.delete(pointId));
  isSaved(pointId: string): boolean { return this.ids.has(pointId); }
}

function pointerEvent(pointerId: number, clientY: number): PointerEvent {
  return {
    pointerId,
    pointerType: 'touch',
    clientY,
    button: 0,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn()
  } as unknown as PointerEvent;
}

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
    id_destino: 'AG_SANTA_ANA',
    empresa: 'Test Agency',
    nombre_destino: 'Santa Ana Centro',
    markerType: 'destination',
    imagen_referencia: 'https://example.com/test.jpg',
    ubicacion: { municipio: 'Santa Ana', departamento: 'Santa Ana' }
  };
  isExpanded = false;
  activeTab: 'info' | 'horarios' = 'info';
  heroImageUrl = 'resolved.jpg';
  routeSelectionBlocked = false;
  hasOrigin = false;
  hasDestination = false;

  onToggle() { this.isExpanded = !this.isExpanded; }
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
  let savedPoints: SavedPointsStub;
  let toast: { showSuccess: ReturnType<typeof vi.fn>; showError: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    savedPoints = new SavedPointsStub();
    toast = { showSuccess: vi.fn(), showError: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
      providers: [
        { provide: SavedPointsService, useValue: savedPoints },
        { provide: ToastService, useValue: toast }
      ]
    }).compileComponents();
    
    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
  });

  it('should render ARTICLE with classes, roles and a semantic hero image', () => {
    fixture.detectChanges();
    const el = fixture.debugElement.query(By.directive(PinDetailCardComponent)).nativeElement;
    
    expect(el.tagName).toBe('ARTICLE');
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.classList.contains('pin-details-card')).toBe(true);
    expect(el.classList.contains('is-collapsed')).toBe(true);
    
    const header = fixture.debugElement.query(By.css('.pin-card-hero')).nativeElement as HTMLElement;
    const image = fixture.debugElement.query(By.css('.pin-card-hero-image')).nativeElement as HTMLImageElement;
    expect(header.getAttribute('style')).toBeNull();
    expect(image.getAttribute('src')).toContain('resolved.jpg');
    expect(image.getAttribute('alt')).toBe('');
  });

  it('should use the tokenized CSS fallback when no heroImageUrl exists', () => {
    host.heroImageUrl = '';
    fixture.detectChanges();
    const header = fixture.debugElement.query(By.css('.pin-card-hero')).nativeElement as HTMLElement;
    expect(header.getAttribute('style')).toBeNull();
    expect(fixture.debugElement.query(By.css('.pin-card-hero-image'))).toBeNull();
  });

  it('communicates the collapsed state with a conventional sheet handle', () => {
    fixture.detectChanges();
    const toggleBtn = fixture.debugElement.query(By.css('.pin-card-sheet-toggle')).nativeElement;
    const content = fixture.debugElement.query(By.css('#pin-card-expanded-content')).nativeElement;

    expect(toggleBtn.getAttribute('aria-label')).toBe('Expandir ficha del punto');
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');
    expect(toggleBtn.querySelector('.pin-card-sheet-handle')).toBeTruthy();
    expect(toggleBtn.querySelector('.pin-card-toggle-label')).toBeNull();
    expect(content.getAttribute('aria-hidden')).toBe('true');
    expect(content.hasAttribute('inert')).toBe(true);
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

  it('follows a downward drag from the handle and collapses after the threshold', () => {
    host.isExpanded = true;
    fixture.detectChanges();
    const card = fixture.debugElement.query(By.directive(PinDetailCardComponent));
    const handle = fixture.debugElement.query(By.css('.pin-card-sheet-toggle'));

    handle.triggerEventHandler('pointerdown', pointerEvent(7, 100));
    handle.triggerEventHandler('pointermove', pointerEvent(7, 180));
    fixture.detectChanges();

    expect(card.nativeElement.classList.contains('is-dragging')).toBe(true);
    expect(card.nativeElement.style.getPropertyValue('--pin-card-drag-y')).toBe('80px');

    handle.triggerEventHandler('pointerup', pointerEvent(7, 180));
    handle.triggerEventHandler('click', { stopPropagation: vi.fn(), preventDefault: vi.fn() });
    fixture.detectChanges();

    expect(host.isExpanded).toBe(false);
    expect(card.nativeElement.classList.contains('is-dragging')).toBe(false);
    expect(card.nativeElement.style.getPropertyValue('--pin-card-drag-y')).toBe('0px');
  });

  it('toggles the saved state from one accessible hero action', () => {
    fixture.detectChanges();
    const saveButton = fixture.debugElement.query(By.css('.pin-save-action'));

    expect(saveButton.nativeElement.getAttribute('aria-pressed')).toBe('false');
    expect(saveButton.nativeElement.getAttribute('aria-label')).toContain('Guardar');
    saveButton.nativeElement.click();
    fixture.detectChanges();

    expect(savedPoints.save).toHaveBeenCalledWith(expect.objectContaining({
      pointId: 'AG_SANTA_ANA',
      name: 'Santa Ana Centro'
    }));
    expect(saveButton.nativeElement.getAttribute('aria-pressed')).toBe('true');
    expect(saveButton.nativeElement.classList).toContain('is-save-confirmed');
    expect(toast.showSuccess).toHaveBeenCalledWith(
      'Santa Ana Centro ya está disponible en Guardados.',
      'Punto guardado'
    );

    saveButton.nativeElement.click();
    fixture.detectChanges();
    expect(savedPoints.remove).toHaveBeenCalledWith('AG_SANTA_ANA');
    expect(saveButton.nativeElement.getAttribute('aria-pressed')).toBe('false');
    expect(saveButton.nativeElement.classList).not.toContain('is-save-confirmed');
    expect(toast.showSuccess).toHaveBeenCalledTimes(1);
  });

  it('explains when the device cannot persist a point', () => {
    savedPoints.saveOutcome = 'storage-unavailable';
    fixture.detectChanges();

    fixture.debugElement.query(By.css('.pin-save-action')).nativeElement.click();

    expect(toast.showError).toHaveBeenCalledWith(
      'El navegador no permitió guardar el punto en este dispositivo.',
      'No se pudo guardar'
    );
  });

  it('returns to the expanded position when a downward drag is too short', () => {
    host.isExpanded = true;
    fixture.detectChanges();
    const card = fixture.debugElement.query(By.directive(PinDetailCardComponent));
    const handle = fixture.debugElement.query(By.css('.pin-card-sheet-toggle'));

    handle.triggerEventHandler('pointerdown', pointerEvent(9, 100));
    handle.triggerEventHandler('pointermove', pointerEvent(9, 132));
    handle.triggerEventHandler('pointerup', pointerEvent(9, 132));
    fixture.detectChanges();

    expect(host.isExpanded).toBe(true);
    expect(card.nativeElement.classList.contains('is-dragging')).toBe(false);
    expect(card.nativeElement.style.getPropertyValue('--pin-card-drag-y')).toBe('0px');
  });

  it('expands the compact sheet with an upward drag from the handle', () => {
    fixture.detectChanges();
    const handle = fixture.debugElement.query(By.css('.pin-card-sheet-toggle'));

    handle.triggerEventHandler('pointerdown', pointerEvent(11, 180));
    handle.triggerEventHandler('pointermove', pointerEvent(11, 110));
    handle.triggerEventHandler('pointerup', pointerEvent(11, 110));
    fixture.detectChanges();

    expect(host.isExpanded).toBe(true);
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

      const toggleBtn = fixture.debugElement.query(By.css('.pin-card-sheet-toggle')).nativeElement;
      expect(toggleBtn.getAttribute('aria-label')).toBe('Minimizar ficha del punto');
      expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');
      expect(content.nativeElement.getAttribute('aria-hidden')).toBe('false');
      expect(content.nativeElement.hasAttribute('inert')).toBe(false);
    });

    it('should emit actions (share, close, copy, openMap, preview) exactly once', () => {
      fixture.detectChanges();
      const shareSpy = vi.spyOn(host, 'onShare');
      const closeSpy = vi.spyOn(host, 'onClose');
      const copySpy = vi.spyOn(host, 'onCopy');
      const mapSpy = vi.spyOn(host, 'onOpenMap');
      const previewSpy = vi.spyOn(host, 'onPreview');
      
      const mockEvent = { stopPropagation: vi.fn() } as unknown as Event;
      
      fixture.debugElement.query(By.css('.pin-card-hero-actions button[aria-label="Compartir información del punto"]')).triggerEventHandler('click', mockEvent);
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
      expect(fixture.debugElement.query(By.css('.pin-map-action')).nativeElement.textContent).toContain('Ver en Google Maps');
      
      fixture.debugElement.query(By.css('.pin-image-preview')).nativeElement.click();
      expect(previewSpy).toHaveBeenCalledTimes(1);
      expect(previewSpy).toHaveBeenCalledWith('https://example.com/test.jpg');
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
      const tabList = fixture.debugElement.query(By.css('.pin-card-tabs')).nativeElement;
      const tabSpy = vi.spyOn(host, 'onTabChange');
      const btns = fixture.debugElement.queryAll(By.css('.pin-card-tabs button'));

      expect(tabList.getAttribute('role')).toBe('tablist');
      expect(btns[0].nativeElement.getAttribute('role')).toBe('tab');
      expect(btns[0].nativeElement.getAttribute('aria-selected')).toBe('true');
      expect(btns[1].nativeElement.getAttribute('aria-selected')).toBe('false');
      
      btns[1].nativeElement.click();
      expect(tabSpy).toHaveBeenCalledTimes(1);
      expect(tabSpy).toHaveBeenCalledWith('horarios');
      expect(host.activeTab).toBe('horarios'); // Mutated by host, not child
      
      fixture.detectChanges();
      const activeBtn = fixture.debugElement.query(By.css('.pin-card-tabs button.active')).nativeElement;
      const indicator = fixture.debugElement.query(By.css('.pin-card-tab-indicator')).nativeElement;
      expect(activeBtn.textContent).toBe('Horarios');
      expect(activeBtn.getAttribute('aria-selected')).toBe('true');
      expect(indicator.classList.contains('is-hours')).toBe(true);
    });

    it('supports arrow, Home, and End keyboard navigation between tabs', () => {
      fixture.detectChanges();
      let btns = fixture.debugElement.queryAll(By.css('.pin-card-tabs button'));

      const right = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
      btns[0].nativeElement.dispatchEvent(right);
      expect(right.defaultPrevented).toBe(true);
      expect(host.activeTab).toBe('horarios');
      expect(document.activeElement).toBe(btns[1].nativeElement);

      fixture.detectChanges();
      btns = fixture.debugElement.queryAll(By.css('.pin-card-tabs button'));
      btns[1].nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
      expect(host.activeTab).toBe('info');
      expect(document.activeElement).toBe(btns[0].nativeElement);

      fixture.detectChanges();
      btns = fixture.debugElement.queryAll(By.css('.pin-card-tabs button'));
      btns[0].nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      expect(host.activeTab).toBe('horarios');
      expect(document.activeElement).toBe(btns[1].nativeElement);

      fixture.detectChanges();
      btns = fixture.debugElement.queryAll(By.css('.pin-card-tabs button'));
      btns[1].nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      expect(host.activeTab).toBe('info');
      expect(document.activeElement).toBe(btns[0].nativeElement);

      fixture.detectChanges();
      btns = fixture.debugElement.queryAll(By.css('.pin-card-tabs button'));
      btns[0].nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      expect(host.activeTab).toBe('horarios');
      expect(document.activeElement).toBe(btns[1].nativeElement);

      fixture.detectChanges();
      btns = fixture.debugElement.queryAll(By.css('.pin-card-tabs button'));
      btns[1].nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(host.activeTab).toBe('info');
      expect(document.activeElement).toBe(btns[0].nativeElement);
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
