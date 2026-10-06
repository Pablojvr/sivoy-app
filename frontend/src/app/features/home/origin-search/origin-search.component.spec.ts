import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OriginSearchComponent, OriginPointOption, PlaceSuggestionOption } from './origin-search.component';
import { MunicipalityOption } from '../destination-search/destination-search.component';
import { By } from '@angular/platform-browser';

describe('OriginSearchComponent', () => {
  let component: OriginSearchComponent;
  let fixture: ComponentFixture<OriginSearchComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OriginSearchComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(OriginSearchComponent);
    component = fixture.componentInstance;
  });

  describe('Rendering context and states', () => {
    it('renders destination context when destinationName is provided', () => {
      component.destinationName = 'San Salvador';
      fixture.detectChanges();
      const context = fixture.debugElement.query(By.css('.selected-destination-context strong'));
      expect(context.nativeElement.textContent.trim()).toBe('San Salvador');
    });

    it('renders loading state when placeSearchLoading is true', () => {
      component.showPlaceHelper = true;
      component.placeSearchLoading = true;
      fixture.detectChanges();
      const loader = fixture.debugElement.query(By.css('.place-helper-loading'));
      expect(loader).toBeTruthy();
    });

    it('renders error message when placeSearchError is provided', () => {
      component.showPlaceHelper = true;
      component.placeSearchError = 'Error fetching places';
      fixture.detectChanges();
      const errorMsg = fixture.debugElement.query(By.css('.place-helper-message'));
      expect(errorMsg.nativeElement.textContent.trim()).toBe('Error fetching places');
    });

    it('hides place helper results when showPlaceHelper is false', () => {
      component.showPlaceHelper = false;
      fixture.detectChanges();
      const helper = fixture.debugElement.query(By.css('.origin-place-helper'));
      expect(helper).toBeFalsy();
    });
  });

  describe('Input and events', () => {
    it('emits queryChange on input without mutating visibleValue', () => {
      vi.spyOn(component.queryChange, 'emit');
      component.visibleValue = 'Santa';
      fixture.detectChanges();
      const input = fixture.debugElement.query(By.css('#origin-location')).nativeElement;
      input.value = 'Santa Ana';
      input.dispatchEvent(new Event('input'));
      expect(component.queryChange.emit).toHaveBeenCalledWith('Santa Ana');
      expect(component.visibleValue).toBe('Santa');
    });

    it('emits inputFocus on focus', () => {
      vi.spyOn(component.inputFocus, 'emit');
      fixture.detectChanges();
      const input = fixture.debugElement.query(By.css('#origin-location')).nativeElement;
      input.dispatchEvent(new Event('focus'));
      expect(component.inputFocus.emit).toHaveBeenCalled();
    });

    it('emits clearIntent on clear button click without mutating visibleValue', () => {
      vi.spyOn(component.clearIntent, 'emit');
      component.visibleValue = 'Texto';
      fixture.detectChanges();
      const btn = fixture.debugElement.query(By.css('.input-clear-btn')).nativeElement;
      btn.dispatchEvent(new Event('click'));
      expect(component.clearIntent.emit).toHaveBeenCalled();
      expect(component.visibleValue).toBe('Texto');
    });

    it('emits togglePlaceHelper when trigger is clicked', () => {
      vi.spyOn(component.togglePlaceHelper, 'emit');
      fixture.detectChanges();
      const btn = fixture.debugElement.query(By.css('.origin-place-helper-trigger')).nativeElement;
      btn.dispatchEvent(new Event('click'));
      expect(component.togglePlaceHelper.emit).toHaveBeenCalled();
    });
  });

  describe('Selectors and payloads', () => {
    beforeEach(() => {
      component.isListVisible = true;
    });

    it('hides options list when isListVisible is false', () => {
      component.isListVisible = false;
      component.userLocationAvailable = true;
      const mun: MunicipalityOption = { municipio: 'Mun', departamento: 'Dep', pointCount: 1 };
      component.municipalities = [mun];
      const loc: OriginPointOption = { nombre_destino: 'Agencia', empresa: 'Empresa' };
      component.agencyPoints = [loc];
      fixture.detectChanges();

      const list = fixture.debugElement.query(By.css('#origin-options'));
      expect(list).toBeFalsy();
    });

    it('renders and emits user location', () => {
      vi.spyOn(component.myLocationSelected, 'emit');
      component.userLocationAvailable = true;
      component.userMunicipalityName = 'Mi Ciudad';
      fixture.detectChanges();
      const btn = fixture.debugElement.query(By.css('.current-location-option')).nativeElement;
      btn.dispatchEvent(new Event('click'));
      expect(component.myLocationSelected.emit).toHaveBeenCalled();
    });

    it('renders and emits municipality option', () => {
      vi.spyOn(component.municipalitySelected, 'emit');
      const mun: MunicipalityOption = { municipio: 'Mun', departamento: 'Dep', pointCount: 1 };
      component.municipalities = [mun];
      fixture.detectChanges();
      const btn = fixture.debugElement.queryAll(By.css('.destination-option'))[0].nativeElement;
      btn.dispatchEvent(new Event('click'));
      expect(component.municipalitySelected.emit).toHaveBeenCalledWith(mun);
    });

    it('renders and emits agency point option', () => {
      vi.spyOn(component.locationSelected, 'emit');
      const loc: OriginPointOption = { nombre_destino: 'Agencia', empresa: 'Empresa' };
      component.agencyPoints = [loc];
      component.agencySectionLabel = 'Puntos Empresa';
      fixture.detectChanges();
      const btn = fixture.debugElement.queryAll(By.css('.destination-option'))[0].nativeElement;
      btn.dispatchEvent(new Event('click'));
      expect(component.locationSelected.emit).toHaveBeenCalledWith(loc);
    });

    it('emits placeSuggestionSelected with exact payload', () => {
      vi.spyOn(component.placeSuggestionSelected, 'emit');
      component.showPlaceHelper = true;
      const sug: PlaceSuggestionOption = { mainText: 'Metro', secondaryText: 'Centro', placeId: '123' };
      component.placeSuggestions = [sug];
      fixture.detectChanges();
      const btn = fixture.debugElement.queryAll(By.css('.place-helper-results button'))[0].nativeElement;
      btn.dispatchEvent(new Event('click'));
      expect(component.placeSuggestionSelected.emit).toHaveBeenCalledWith(sug);
    });

    it('emits placeQueryChange on helper input without mutating placeSearchQuery', () => {
      vi.spyOn(component.placeQueryChange, 'emit');
      component.showPlaceHelper = true;
      component.placeSearchQuery = 'oldQuery';
      fixture.detectChanges();
      const input = fixture.debugElement.query(By.css('.place-helper-search input')).nativeElement;
      input.value = 'query';
      input.dispatchEvent(new Event('input'));
      expect(component.placeQueryChange.emit).toHaveBeenCalledWith('query');
      expect(component.placeSearchQuery).toBe('oldQuery');
    });

    it('emits clearPlaceHelper without mutating placeSearchQuery', () => {
      vi.spyOn(component.clearPlaceHelper, 'emit');
      component.showPlaceHelper = true;
      component.placeSearchQuery = 'query';
      fixture.detectChanges();
      const btn = fixture.debugElement.query(By.css('.place-helper-search button')).nativeElement;
      btn.dispatchEvent(new Event('click'));
      expect(component.clearPlaceHelper.emit).toHaveBeenCalled();
      expect(component.placeSearchQuery).toBe('query');
    });
  });
});
