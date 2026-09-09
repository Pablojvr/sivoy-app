import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PointResultCardComponent, PointResultViewModel } from './point-result-card.component';
import { By } from '@angular/platform-browser';
import { Component } from '@angular/core';

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
  onImgError(p: PointResultViewModel) {}
}

describe('PointResultCardComponent', () => {
  let host: TestHostComponent;
  let fixture: ComponentFixture<TestHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent]
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

  it('renders provider name, distance, and destination name', () => {
    fixture.detectChanges();
    const cardDebug = fixture.debugElement.query(By.directive(PointResultCardComponent));
    const providerHeader = cardDebug.query(By.css('.point-result-provider strong'));
    expect(providerHeader.nativeElement.textContent.trim()).toBe('Test Express');

    const mainBtn = cardDebug.query(By.css('.point-result-main strong'));
    expect(mainBtn.nativeElement.textContent.trim()).toBe('Central Test');

    const distanceSpan = cardDebug.query(By.css('.point-distance'));
    expect(distanceSpan.nativeElement.textContent.trim()).toBe('1.5 km');
  });

  it('binds aria-expanded to false and checks aria-controls when collapsed', () => {
    fixture.detectChanges();
    const cardDebug = fixture.debugElement.query(By.directive(PointResultCardComponent));
    const btn = cardDebug.query(By.css('.point-result-summary'));
    const panel = cardDebug.query(By.css('.point-hours-panel'));
    
    expect(btn.nativeElement.getAttribute('aria-expanded')).toBe('false');
    expect(btn.nativeElement.getAttribute('aria-controls')).toBe('point-details-123');
    expect(panel.nativeElement.getAttribute('id')).toBe('point-details-123');
  });

  it('binds aria-expanded to true when expanded', () => {
    host.expanded = true;
    fixture.detectChanges();
    const cardDebug = fixture.debugElement.query(By.directive(PointResultCardComponent));
    const btn = cardDebug.query(By.css('.point-result-summary'));
    expect(btn.nativeElement.getAttribute('aria-expanded')).toBe('true');
  });

  it('does not render image or schedules when collapsed', () => {
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
  });

  it('renders grouped schedules when expanded', () => {
    host.expanded = true;
    fixture.detectChanges();
    
    const cardDebug = fixture.debugElement.query(By.directive(PointResultCardComponent));
    const scheduleDisplay = cardDebug.query(By.css('app-schedule-display'));
    expect(scheduleDisplay).toBeTruthy();
    
    const emptyText = cardDebug.query(By.css('.point-hours-empty'));
    expect(emptyText).toBeFalsy();
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

  it('emits all 6 outputs exactly once with the exact payload', () => {
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

    host.expanded = true;
    host.hasImg = true;
    fixture.detectChanges();

    const cardDebug = fixture.debugElement.query(By.directive(PointResultCardComponent));
    
    cardDebug.query(By.css('.point-result-summary')).triggerEventHandler('click', null);
    cardDebug.query(By.css('.point-use-action')).triggerEventHandler('click', null);
    cardDebug.query(By.css('.point-share-action')).triggerEventHandler('click', null);
    cardDebug.query(By.css('.point-map-action')).triggerEventHandler('click', null);
    
    const copyBtn = cardDebug.query(By.css('figure button'));
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
  });
});
