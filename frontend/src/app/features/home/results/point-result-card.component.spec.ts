import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PointResultCardComponent, PointResultViewModel } from './point-result-card.component';
import { By } from '@angular/platform-browser';
import { Component } from '@angular/core';
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

@Component({
  standalone: true,
  imports: [PointResultCardComponent],
  template: `
    <article siPointResultCard class="point-result-card"
      [point]="mockPoint"
      [computedId]="computedId"
      [expanded]="expanded"
      [originDiscoveryMode]="originMode"
      [imageAvailable]="hasImg"
      [imageUrl]="imgUrl"
      [scheduleCount]="sCount"
      (toggle)="onToggle($event)"
      (use)="onUse($event)"
      (share)="onShare($event)"
      (map)="onMap($event)"
      (copyImage)="onCopy($event)"
      (previewImage)="onPreview($event)"
      (imageUnavailable)="onImgError($event)">
    </article>
  `
})
class TestHostComponent {
  mockPoint: PointResultViewModel = {
    id: 123,
    id_destino: 'dest-456',
    empresa: 'Test Express',
    destino_nombre: 'Central Test',
    distance: 1.5,
    ubicacion: { municipio: 'Test City', departamento: 'Test Dept' },
    _status: { color: 'green', mainText: 'Abierto', timeText: 'hasta 18:00' },
    horarios_operativos: [
      { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' }
    ]
  };
  computedId: string | number = 123;
  expanded = false;
  originMode = false;
  hasImg = false;
  imgUrl = 'http://test.com/img.jpg';
  sCount = 1;

  onToggle(p: PointResultViewModel) {}
  onUse(p: PointResultViewModel) {}
  onShare(p: PointResultViewModel) {}
  onMap(p: PointResultViewModel) {}
  onCopy(p: PointResultViewModel) {}
  onPreview(url: string) {}
  onImgError(p: PointResultViewModel) {}
}

describe('PointResultCardComponent', () => {
  let host: TestHostComponent;
  let fixture: ComponentFixture<TestHostComponent>;
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

  it('host element is an ARTICLE and preserves the point-result-card class', () => {
    fixture.detectChanges();
    const cardDebug = fixture.debugElement.query(By.directive(PointResultCardComponent));
    expect(cardDebug.nativeElement.tagName.toUpperCase()).toBe('ARTICLE');
    expect(cardDebug.nativeElement.classList.contains('point-result-card')).toBe(true);
  });

  it('renders provider and destination names without origin-distance language', () => {
    fixture.detectChanges();
    const cardDebug = fixture.debugElement.query(By.directive(PointResultCardComponent));
    const providerHeader = cardDebug.query(By.css('.point-result-provider strong'));
    expect(providerHeader.nativeElement.textContent.trim()).toBe('Test Express');

    const mainBtn = cardDebug.query(By.css('.point-result-main strong'));
    expect(mainBtn.nativeElement.textContent.trim()).toBe('Central Test');

    expect(cardDebug.query(By.css('.point-distance'))).toBeNull();
  });

  it('shows the measured straight-line distance only for a reference-place result', () => {
    host.mockPoint = { ...host.mockPoint, referenceDistanceKm: 0.84 };
    fixture.detectChanges();

    const distance = fixture.debugElement.query(By.css('.point-reference-distance'));
    expect(distance.nativeElement.textContent.trim()).toBe('A 840 m en línea recta');
  });

  it('does not imply proximity when a reference-place result has no valid coordinates', () => {
    host.mockPoint = { ...host.mockPoint, referenceDistanceKm: null };
    fixture.detectChanges();

    const distance = fixture.debugElement.query(By.css('.point-reference-distance'));
    expect(distance.nativeElement.textContent.trim()).toBe('Distancia no disponible');
  });

  it('binds aria-expanded to false and checks aria-controls when collapsed', () => {
    fixture.detectChanges();
    const cardDebug = fixture.debugElement.query(By.directive(PointResultCardComponent));
    const btn = cardDebug.query(By.css('.point-result-summary'));
    
    expect(btn.nativeElement.getAttribute('aria-expanded')).toBe('false');
    expect(btn.nativeElement.getAttribute('aria-controls')).toBe('point-details-123');
    expect(cardDebug.query(By.css('#point-details-123'))).toBeFalsy();
    expect(btn.nativeElement.textContent).toContain('Ver detalles');
  });

  it('binds aria-expanded to true when expanded', () => {
    host.expanded = true;
    fixture.detectChanges();
    const cardDebug = fixture.debugElement.query(By.directive(PointResultCardComponent));
    const btn = cardDebug.query(By.css('.point-result-summary'));
    expect(btn.nativeElement.getAttribute('aria-expanded')).toBe('true');
    expect(cardDebug.query(By.css('#point-details-123'))).toBeTruthy();
    expect(btn.nativeElement.textContent).toContain('Ocultar detalles');
  });

  it('keeps the collapsed card compact by hiding image, schedules, and map', () => {
    host.expanded = false;
    host.hasImg = true;
    fixture.detectChanges();
    
    const cardDebug = fixture.debugElement.query(By.directive(PointResultCardComponent));
    const img = cardDebug.query(By.css('figure img'));
    expect(img).toBeFalsy();
    
    const scheduleDisplay = cardDebug.query(By.css('app-schedule-display'));
    expect(scheduleDisplay).toBeFalsy();
    
    const emptyText = cardDebug.query(By.css('.point-hours-empty'));
    expect(emptyText).toBeFalsy();

    const mapAction = cardDebug.query(By.css('.point-map-action'));
    expect(mapAction).toBeFalsy();

    const compactActions = cardDebug.queryAll(By.css('.point-result-actions button'));
    expect(compactActions).toHaveLength(2);
    expect(compactActions[0].nativeElement.classList).toContain('point-use-action');
    expect(compactActions[1].nativeElement.classList).toContain('point-share-action');
  });

  it('renders grouped schedules when expanded', () => {
    host.expanded = true;
    fixture.detectChanges();
    
    const cardDebug = fixture.debugElement.query(By.directive(PointResultCardComponent));
    const scheduleDisplay = cardDebug.query(By.css('app-schedule-display'));
    expect(scheduleDisplay).toBeTruthy();
    
    const emptyText = cardDebug.query(By.css('.point-hours-empty'));
    expect(emptyText).toBeFalsy();

    const mapAction = cardDebug.query(By.css('.point-map-action'));
    expect(mapAction).toBeTruthy();
  });

  it('uses an explicit primary action label for destination discovery', () => {
    fixture.detectChanges();
    const cardDebug = fixture.debugElement.query(By.directive(PointResultCardComponent));
    expect(cardDebug.query(By.css('.point-use-action')).nativeElement.textContent.trim()).toBe('Elegir desde dónde enviar');
  });

  it('uses an explicit primary action label for origin discovery', () => {
    host.originMode = true;
    fixture.detectChanges();
    const cardDebug = fixture.debugElement.query(By.directive(PointResultCardComponent));
    expect(cardDebug.query(By.css('.point-use-action')).nativeElement.textContent.trim()).toBe('Usar como origen');
  });

  it('renders empty text when expanded but no schedules', () => {
    host.expanded = true;
    host.mockPoint = { ...host.mockPoint, horarios_operativos: [] };
    fixture.detectChanges();
    
    const cardDebug = fixture.debugElement.query(By.directive(PointResultCardComponent));
    const scheduleDisplay = cardDebug.query(By.css('app-schedule-display'));
    expect(scheduleDisplay).toBeFalsy();
    
    const emptyText = cardDebug.query(By.css('.point-hours-empty'));
    expect(emptyText).toBeTruthy();
  });
  
  it('shows image when expanded and imageAvailable is true', () => {
    host.expanded = true;
    host.hasImg = true;
    fixture.detectChanges();
    
    const cardDebug = fixture.debugElement.query(By.directive(PointResultCardComponent));
    const img = cardDebug.query(By.css('figure img'));
    expect(img).toBeTruthy();
    expect(img.nativeElement.src).toContain('img.jpg');
  });

  it('toggles one accessible saved state without adding a third primary action', () => {
    fixture.detectChanges();
    const cardDebug = fixture.debugElement.query(By.directive(PointResultCardComponent));
    const saveButton = cardDebug.query(By.css('.point-result-save'));

    expect(saveButton.nativeElement.getAttribute('aria-pressed')).toBe('false');
    expect(saveButton.nativeElement.getAttribute('aria-label')).toContain('Guardar');
    saveButton.nativeElement.click();
    fixture.detectChanges();

    expect(savedPoints.save).toHaveBeenCalledWith(expect.objectContaining({
      pointId: 'dest-456',
      name: 'Central Test'
    }));
    expect(saveButton.nativeElement.getAttribute('aria-pressed')).toBe('true');
    expect(saveButton.nativeElement.classList).toContain('is-save-confirmed');
    expect(toast.showSuccess).toHaveBeenCalledWith(
      'Central Test ya está disponible en Guardados.',
      'Punto guardado'
    );
    expect(cardDebug.queryAll(By.css('.point-result-actions button'))).toHaveLength(2);

    saveButton.nativeElement.click();
    fixture.detectChanges();
    expect(savedPoints.remove).toHaveBeenCalledWith('dest-456');
    expect(saveButton.nativeElement.getAttribute('aria-pressed')).toBe('false');
    expect(saveButton.nativeElement.classList).not.toContain('is-save-confirmed');
    expect(toast.showSuccess).toHaveBeenCalledTimes(1);
  });

  it('explains when the local saved-point limit is reached', () => {
    savedPoints.saveOutcome = 'limit-reached';
    fixture.detectChanges();

    fixture.debugElement.query(By.css('.point-result-save')).nativeElement.click();

    expect(toast.showError).toHaveBeenCalledWith(
      'Puedes guardar hasta 50 puntos en este dispositivo.',
      'Límite alcanzado'
    );
  });

  it('announces the photo from the collapsed disclosure when an image is available', () => {
    host.hasImg = true;
    fixture.detectChanges();

    const cardDebug = fixture.debugElement.query(By.directive(PointResultCardComponent));
    const disclosure = cardDebug.query(By.css('.point-result-disclosure-label'));

    expect(disclosure.nativeElement.textContent.trim()).toBe('Ver foto');
  });

  it('opens the available reference image from a dedicated one-click preview', () => {
    let previewUrl: string | null = null;
    host.onPreview = (url) => { previewUrl = url; };
    host.expanded = true;
    host.hasImg = true;
    fixture.detectChanges();

    const cardDebug = fixture.debugElement.query(By.directive(PointResultCardComponent));
    const previewButton = cardDebug.query(By.css('.point-reference-preview'));

    expect(previewButton).toBeTruthy();
    expect(previewButton.nativeElement.getAttribute('aria-label')).toContain('Central Test');
    previewButton.triggerEventHandler('click', null);
    expect(previewUrl).toBe(host.imgUrl);
  });

  it('emits all point actions exactly once with the exact payload', () => {
    let togglePayload: PointResultViewModel | null = null;
    let toggleCount = 0;
    host.onToggle = (p) => { togglePayload = p; toggleCount++; };
    
    let usePayload: PointResultViewModel | null = null;
    let useCount = 0;
    host.onUse = (p) => { usePayload = p; useCount++; };
    
    let sharePayload: PointResultViewModel | null = null;
    let shareCount = 0;
    host.onShare = (p) => { sharePayload = p; shareCount++; };
    
    let mapPayload: PointResultViewModel | null = null;
    let mapCount = 0;
    host.onMap = (p) => { mapPayload = p; mapCount++; };
    
    let copyPayload: PointResultViewModel | null = null;
    let copyCount = 0;
    host.onCopy = (p) => { copyPayload = p; copyCount++; };
    
    let imgErrorPayload: PointResultViewModel | null = null;
    let imgErrorCount = 0;
    host.onImgError = (p) => { imgErrorPayload = p; imgErrorCount++; };

    let previewUrl: string | null = null;
    let previewCount = 0;
    host.onPreview = (url) => { previewUrl = url; previewCount++; };

    host.expanded = true;
    host.hasImg = true;
    fixture.detectChanges();

    const cardDebug = fixture.debugElement.query(By.directive(PointResultCardComponent));
    
    cardDebug.query(By.css('.point-result-summary')).triggerEventHandler('click', null);
    cardDebug.query(By.css('.point-use-action')).triggerEventHandler('click', null);
    cardDebug.query(By.css('.point-share-action')).triggerEventHandler('click', null);
    cardDebug.query(By.css('.point-map-action')).triggerEventHandler('click', null);
    cardDebug.query(By.css('.point-reference-preview')).triggerEventHandler('click', null);
    
    const copyBtn = cardDebug.query(By.css('.point-copy-image-action'));
    copyBtn.triggerEventHandler('click', { stopPropagation: () => {} });
    
    const img = cardDebug.query(By.css('figure img'));
    img.triggerEventHandler('error', null);
    
    expect(toggleCount).toBe(1);
    expect(togglePayload).toBe(host.mockPoint);
    
    expect(useCount).toBe(1);
    expect(usePayload).toBe(host.mockPoint);
    
    expect(shareCount).toBe(1);
    expect(sharePayload).toBe(host.mockPoint);
    
    expect(mapCount).toBe(1);
    expect(mapPayload).toBe(host.mockPoint);
    
    expect(copyCount).toBe(1);
    expect(copyPayload).toBe(host.mockPoint);
    
    expect(imgErrorCount).toBe(1);
    expect(imgErrorPayload).toBe(host.mockPoint);

    expect(previewCount).toBe(1);
    expect(previewUrl).toBe(host.imgUrl);
  });
});
