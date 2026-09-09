import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ScheduleDisplayComponent } from './schedule-display.component';
import { By } from '@angular/platform-browser';

describe('ScheduleDisplayComponent', () => {
  let component: ScheduleDisplayComponent;
  let fixture: ComponentFixture<ScheduleDisplayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScheduleDisplayComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(ScheduleDisplayComponent);
    component = fixture.componentInstance;
  });

  it('renders zero rows for empty, null, or undefined schedules', () => {
    // 1. null
    fixture.componentRef.setInput('schedules', null);
    fixture.detectChanges();
    let rows = fixture.debugElement.queryAll(By.css('div'));
    expect(rows.length).toBe(0);

    // 2. undefined
    fixture.componentRef.setInput('schedules', undefined);
    fixture.detectChanges();
    rows = fixture.debugElement.queryAll(By.css('div'));
    expect(rows.length).toBe(0);

    // 3. empty array
    fixture.componentRef.setInput('schedules', []);
    fixture.detectChanges();
    rows = fixture.debugElement.queryAll(By.css('div'));
    expect(rows.length).toBe(0);
  });

  it('computes grouped labels and time text when input changes', () => {
    fixture.componentRef.setInput('schedules', [
      { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' },
      { dia_semana: 'Martes', hora_apertura: '08:00', hora_cierre: '17:00' }
    ]);
    fixture.detectChanges();
    
    const rows = fixture.debugElement.queryAll(By.css('div'));
    expect(rows.length).toBe(1);
    
    const spans = rows[0].queryAll(By.css('span'));
    const strongs = rows[0].queryAll(By.css('strong'));
    
    expect(spans[0].nativeElement.textContent.trim()).toBe('Lunes y Martes');
    expect(strongs[0].nativeElement.textContent).toContain('08:00 AM');
    expect(strongs[0].nativeElement.textContent).toContain('05:00 PM');
  });

  it('replaces old rows and renders new ones when input is replaced with a different array', () => {
    // First array
    fixture.componentRef.setInput('schedules', [
      { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' }
    ]);
    fixture.detectChanges();
    
    let rows = fixture.debugElement.queryAll(By.css('div'));
    expect(rows.length).toBe(1);
    expect(rows[0].query(By.css('span')).nativeElement.textContent.trim()).toBe('Lunes');
    
    // Replace with a new array
    fixture.componentRef.setInput('schedules', [
      { dia_semana: 'Miércoles', hora_apertura: '09:00', hora_cierre: '12:00' },
      { dia_semana: 'Viernes', hora_apertura: '09:00', hora_cierre: '12:00' }
    ]);
    fixture.detectChanges();
    
    rows = fixture.debugElement.queryAll(By.css('div'));
    expect(rows.length).toBe(1); 
    expect(rows[0].query(By.css('span')).nativeElement.textContent.trim()).toBe('Miércoles, Viernes');
    expect(rows[0].query(By.css('strong')).nativeElement.textContent).toContain('09:00 AM');
    expect(rows[0].query(By.css('strong')).nativeElement.textContent).toContain('12:00 PM');
  });

  it('emits DOM with direct div row children (no wrapper)', () => {
    fixture.componentRef.setInput('schedules', [
      { dia_semana: 'Lunes', hora_apertura: '08:00', hora_cierre: '17:00' },
      { dia_semana: 'Sábado', hora_apertura: '09:00', hora_cierre: '12:00' }
    ]);
    fixture.detectChanges();
    
    const hostElement = fixture.nativeElement as HTMLElement;
    expect(hostElement.children.length).toBe(2);
    expect(hostElement.children[0].tagName.toLowerCase()).toBe('div');
    expect(hostElement.children[1].tagName.toLowerCase()).toBe('div');
  });
});
