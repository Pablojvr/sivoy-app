import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Component } from '@angular/core';
import { CatalogPointCardComponent, CatalogPoint } from './catalog-point-card.component';
import { SiChipComponent } from '../../../shared/ui/ui-primitives';

@Component({
  standalone: true,
  imports: [CatalogPointCardComponent],
  template: `
    <app-catalog-point-card
      [point]="mockPoint"
      [expanded]="expanded"
      (toggle)="onToggle($event)"
      (use)="onUse($event)"
      (share)="onShare($event)"
      (map)="onMap($event)">
    </app-catalog-point-card>
  `
})
class TestHostComponent {
  mockPoint: CatalogPoint = {
    pointId: 'test-1',
    company: { companyId: 'c-1', name: 'Test Company', logoUrl: null },
    name: 'Agencia Test',
    pointType: 'AGENCIA',
    location: { department: 'San Salvador', municipality: 'San Salvador', address: 'Calle Test', coordinates: { lat: null, lng: null } },
    media: { imageUrl: null, mapsUrl: null },
    availability: { status: 'OPEN', closesAt: '17:00', nextOpeningAt: null, evaluatedAt: '2026-10-06', timeZone: 'America/El_Salvador' },
    schedulePreview: [
      { daysLabel: 'Lunes a Viernes', opensAt: '08:00', closesAt: '17:00' },
      { daysLabel: 'Sábado', opensAt: '08:00', closesAt: '12:00' },
      { daysLabel: 'Domingo', opensAt: '08:00', closesAt: '12:00' }
    ]
  };
  expanded = false;

  onToggle(p: CatalogPoint) {}
  onUse(p: CatalogPoint) {}
  onShare(p: CatalogPoint) {}
  onMap(p: CatalogPoint) {}
}

describe('CatalogPointCardComponent', () => {
  let host: TestHostComponent;
  let fixture: ComponentFixture<TestHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    host = fixture.componentInstance;
  });

  it('should render the open status correctly', () => {
    fixture.detectChanges();
    const chipElement = fixture.debugElement.query(By.directive(SiChipComponent));
    expect(chipElement.nativeElement.textContent).toContain('Abierto');
    // For signals, componentInstance.tone() is a function
    expect(chipElement.componentInstance.tone()).toBe('success');
  });

  it('should render the closed status correctly', () => {
    host.mockPoint = { ...host.mockPoint, availability: { ...host.mockPoint.availability, status: 'CLOSED' } };
    fixture.detectChanges();
    const chipElement = fixture.debugElement.query(By.directive(SiChipComponent));
    expect(chipElement.nativeElement.textContent).toContain('Cerrado');
    expect(chipElement.componentInstance.tone()).toBe('neutral');
  });

  it('should not render schedules when collapsed', () => {
    fixture.detectChanges();
    const summary = fixture.debugElement.query(By.css('.schedule-summary'));
    expect(summary).toBeNull();
  });

  it('should render a maximum of 2 schedules when expanded even if 3 are provided', () => {
    host.expanded = true;
    fixture.detectChanges();
    const lines = fixture.debugElement.queryAll(By.css('.schedule-line'));
    expect(lines.length).toBe(2);
    expect(lines[0].nativeElement.textContent).toContain('Lunes a Viernes');
    expect(lines[1].nativeElement.textContent).toContain('Sábado');
  });

  it('should render no schedules message when empty and expanded', () => {
    host.mockPoint = { ...host.mockPoint, schedulePreview: [] };
    host.expanded = true;
    fixture.detectChanges();
    const line = fixture.debugElement.query(By.css('.schedule-line.empty')).nativeElement;
    expect(line.textContent).toContain('Sin horarios registrados');
  });

  it('should set aria-expanded to false and link aria-controls correctly when collapsed', () => {
    fixture.detectChanges();
    const button = fixture.debugElement.query(By.css('button.card-status')).nativeElement;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-controls')).toBe('schedule-content-test-1');
  });

  it('should set aria-expanded to true and link aria-controls with panel id correctly when expanded', () => {
    host.expanded = true;
    fixture.detectChanges();
    const button = fixture.debugElement.query(By.css('button.card-status')).nativeElement;
    const panel = fixture.debugElement.query(By.css('.schedule-summary')).nativeElement;

    expect(button.getAttribute('aria-expanded')).toBe('true');
    const expectedId = 'schedule-content-test-1';
    expect(button.getAttribute('aria-controls')).toBe(expectedId);
    expect(panel.getAttribute('id')).toBe(expectedId);
  });

  it('should not contain div or p elements inside button.card-status to maintain valid HTML', () => {
    host.expanded = true;
    fixture.detectChanges();
    const button = fixture.debugElement.query(By.css('button.card-status')).nativeElement;
    const divs = button.querySelectorAll('div');
    const ps = button.querySelectorAll('p');
    expect(divs.length).toBe(0);
    expect(ps.length).toBe(0);
  });

  it('should emit exact outputs when triggered', () => {
    let togglePayload: CatalogPoint | null = null;
    let usePayload: CatalogPoint | null = null;
    let sharePayload: CatalogPoint | null = null;
    let mapPayload: CatalogPoint | null = null;

    host.onToggle = (p) => { togglePayload = p; };
    host.onUse = (p) => { usePayload = p; };
    host.onShare = (p) => { sharePayload = p; };
    host.onMap = (p) => { mapPayload = p; };

    fixture.detectChanges();
    const cardDebug = fixture.debugElement.query(By.directive(CatalogPointCardComponent));

    const statusBtn = cardDebug.query(By.css('button.card-status'));
    statusBtn.triggerEventHandler('click', new Event('click'));

    const actionButtons = cardDebug.queryAll(By.css('.card-actions button'));
    actionButtons[0].triggerEventHandler('click', new Event('click')); // Desde dónde enviar
    actionButtons[1].triggerEventHandler('click', new Event('click')); // Compartir
    actionButtons[2].triggerEventHandler('click', new Event('click')); // Ver mapa

    expect(togglePayload).toBe(host.mockPoint);
    expect(usePayload).toBe(host.mockPoint);
    expect(sharePayload).toBe(host.mockPoint);
    expect(mapPayload).toBe(host.mockPoint);
  });
});
