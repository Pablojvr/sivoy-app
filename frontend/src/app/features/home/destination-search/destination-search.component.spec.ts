import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DestinationSearchComponent, MunicipalityOption } from './destination-search.component';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';

describe('DestinationSearchComponent', () => {
  let component: DestinationSearchComponent;
  let fixture: ComponentFixture<DestinationSearchComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DestinationSearchComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DestinationSearchComponent);
    component = fixture.componentInstance;
  });

  it('renderiza valor, contador y opciones tipadas', () => {
    component.visibleValue = 'San';
    component.isListVisible = true;
    component.options = [
      { municipio: 'San Salvador', departamento: 'San Salvador', pointCount: 5 },
      { municipio: 'San Miguel', departamento: 'San Miguel', pointCount: 2 }
    ];
    fixture.detectChanges();

    const input = fixture.debugElement.query(By.css('input')).nativeElement;
    expect(input.value).toBe('San');

    const count = fixture.debugElement.query(By.css('.destination-results-heading span:nth-child(2)')).nativeElement;
    expect(count.textContent.trim()).toBe('2');

    const options = fixture.debugElement.queryAll(By.css('.destination-option'));
    expect(options.length).toBe(2);
    expect(options[0].nativeElement.textContent).toContain('San Salvador');
  });

  it('emite texto y limpiar sin mutar sus inputs', () => {
    vi.spyOn(component.queryChange, 'emit');
    vi.spyOn(component.clearIntent, 'emit');

    component.visibleValue = 'San';
    fixture.detectChanges();

    const input = fixture.debugElement.query(By.css('input'));
    input.nativeElement.value = 'San M';
    input.triggerEventHandler('input', { target: input.nativeElement });

    expect(component.queryChange.emit).toHaveBeenCalledWith('San M');
    expect(component.visibleValue).toBe('San');

    const clearBtn = fixture.debugElement.query(By.css('.input-clear-btn'));
    clearBtn.triggerEventHandler('click', new Event('click'));

    expect(component.clearIntent.emit).toHaveBeenCalled();
  });

  it('click y Enter emiten exactamente la opción esperada, y Enter sin opciones no emite selección', () => {
    vi.spyOn(component.municipalitySelected, 'emit');

    const option: MunicipalityOption = { municipio: 'San Salvador', departamento: 'San Salvador', pointCount: 5 };
    component.options = [option];
    component.isListVisible = true;
    fixture.detectChanges();

    const btn = fixture.debugElement.query(By.css('.destination-option'));
    btn.triggerEventHandler('click', null);
    expect(component.municipalitySelected.emit).toHaveBeenCalledWith(option);

    const input = fixture.debugElement.query(By.css('input'));
    input.triggerEventHandler('keydown.enter', null);
    expect(component.municipalitySelected.emit).toHaveBeenCalledWith(option);
    expect(component.municipalitySelected.emit).toHaveBeenCalledTimes(2);

    component.options = [];
    fixture.detectChanges();
    input.triggerEventHandler('keydown.enter', null);
    expect(component.municipalitySelected.emit).toHaveBeenCalledTimes(2);
  });
});
