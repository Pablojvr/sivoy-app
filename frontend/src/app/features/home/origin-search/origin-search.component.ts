import { Component, Input, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MunicipalityOption } from '../destination-search/destination-search.component';

export interface OriginPointOption {
  nombre_destino: string;
  empresa: string;
  ubicacion?: {
    municipio: string;
    departamento?: string;
  };
}

export interface PlaceSuggestionOption {
  mainText: string;
  secondaryText: string;
  placeId?: string;
}

@Component({
  selector: 'app-origin-search',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './origin-search.component.html',
  encapsulation: ViewEncapsulation.None
})
export class OriginSearchComponent {
  @Input() visibleValue: string = '';
  @Input() destinationName: string = '';
  @Input() userLocationAvailable: boolean = false;
  @Input() userMunicipalityName: string = '';
  @Input() isListVisible: boolean = false;
  @Input() municipalities: MunicipalityOption[] = [];
  @Input() agencyPoints: OriginPointOption[] = [];
  @Input() agencySectionLabel: string = 'Agencias';
  @Input() showPlaceHelper: boolean = false;
  @Input() placeSearchQuery: string = '';
  @Input() placeSuggestions: PlaceSuggestionOption[] = [];
  @Input() placeSearchLoading: boolean = false;
  @Input() placeSearchError: string = '';

  @Output() queryChange = new EventEmitter<string>();
  @Output() inputFocus = new EventEmitter<void>();
  @Output() clearIntent = new EventEmitter<void>();
  @Output() myLocationSelected = new EventEmitter<void>();
  @Output() municipalitySelected = new EventEmitter<MunicipalityOption>();
  @Output() locationSelected = new EventEmitter<OriginPointOption>();
  @Output() togglePlaceHelper = new EventEmitter<void>();
  @Output() placeQueryChange = new EventEmitter<string>();
  @Output() clearPlaceHelper = new EventEmitter<void>();
  @Output() placeSuggestionSelected = new EventEmitter<PlaceSuggestionOption>();

  onInput(event: Event): void {
    this.queryChange.emit((event.target as HTMLInputElement).value);
  }

  onFocus(): void {
    this.inputFocus.emit();
  }

  onClear(event: Event): void {
    event.stopPropagation();
    this.clearIntent.emit();
  }

  onTogglePlaceHelper(): void {
    this.togglePlaceHelper.emit();
  }

  onPlaceSearchInput(event: Event): void {
    this.placeQueryChange.emit((event.target as HTMLInputElement).value);
  }

  onClearPlaceSearch(): void {
    this.clearPlaceHelper.emit();
  }

  onSelectPlaceSuggestion(suggestion: PlaceSuggestionOption): void {
    this.placeSuggestionSelected.emit(suggestion);
  }

  onSelectUserLocation(): void {
    this.myLocationSelected.emit();
  }

  onSelectMunicipality(mun: MunicipalityOption): void {
    this.municipalitySelected.emit(mun);
  }

  onSelectLocation(loc: OriginPointOption): void {
    this.locationSelected.emit(loc);
  }
}
