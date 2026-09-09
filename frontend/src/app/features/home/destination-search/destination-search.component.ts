import { Component, Input, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface MunicipalityOption {
  municipio: string;
  departamento: string;
  pointCount: number;
}

@Component({
  selector: 'app-destination-search',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './destination-search.component.html',
  encapsulation: ViewEncapsulation.None
})
export class DestinationSearchComponent {
  @Input() visibleValue: string = '';
  @Input() options: MunicipalityOption[] = [];
  @Input() isListVisible: boolean = false;

  @Output() queryChange = new EventEmitter<string>();
  @Output() inputFocus = new EventEmitter<void>();
  @Output() municipalitySelected = new EventEmitter<MunicipalityOption>();
  @Output() clearIntent = new EventEmitter<void>();

  onInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.queryChange.emit(value);
  }

  onFocus() {
    this.inputFocus.emit();
  }

  onEnter() {
    if (this.options && this.options.length > 0) {
      this.municipalitySelected.emit(this.options[0]);
    }
  }

  onClear(event: Event) {
    event.stopPropagation();
    this.clearIntent.emit();
  }

  onSelect(mun: MunicipalityOption) {
    this.municipalitySelected.emit(mun);
  }
}
