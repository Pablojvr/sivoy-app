import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RawSchedule } from './schedule-utils';
import { ScheduleDisplayComponent } from './schedule-display.component';
import { SiButtonDirective, SiIconButtonDirective, SiChipComponent } from '../../../shared/ui/ui-primitives';

export interface PinStatusViewModel {
  color: string;
  iconType?: 'clock' | 'calendar' | 'close';
  mainText: string;
  timeText?: string;
}

export interface PinLocationViewModel {
  municipio?: string;
  departamento?: string;
}

export interface PinDetailViewModel {
  imagen_referencia?: string;
  empresa?: string;
  nombre_destino?: string;
  destino_nombre?: string;
  ubicacion?: PinLocationViewModel;
  markerType?: 'origin' | 'destination';
  direccion_referencia?: string;
  horarios_operativos?: RawSchedule[];
  _status?: PinStatusViewModel;
}

@Component({
  selector: 'article[siPinDetailCard]',
  standalone: true,
  imports: [CommonModule, ScheduleDisplayComponent, SiButtonDirective, SiIconButtonDirective, SiChipComponent],
  templateUrl: './pin-detail-card.component.html'
})
export class PinDetailCardComponent {
  @Input({ required: true }) pin!: PinDetailViewModel;
  @Input() expanded = false;
  @Input() activeTab: 'info' | 'horarios' = 'info';
  @Input() heroImageUrl = '';
  @Input() routeSelectionBlocked = false;
  @Input() hasOrigin = false;
  @Input() hasDestination = false;

  @Output() toggle = new EventEmitter<void>();
  @Output() touchStart = new EventEmitter<TouchEvent>();
  @Output() touchEnd = new EventEmitter<TouchEvent>();
  @Output() preview = new EventEmitter<string>();
  @Output() share = new EventEmitter<PinDetailViewModel>();
  @Output() close = new EventEmitter<void>();
  @Output() tabChange = new EventEmitter<'info' | 'horarios'>();
  @Output() copy = new EventEmitter<void>();
  @Output() openMap = new EventEmitter<void>();
  @Output() selectOrigin = new EventEmitter<void>();
  @Output() selectDestination = new EventEmitter<void>();

  onTouchStart(event: TouchEvent): void {
    this.touchStart.emit(event);
  }

  onTouchEnd(event: TouchEvent): void {
    this.touchEnd.emit(event);
  }

  onPreview(): void {
    if (this.pin.imagen_referencia) {
      this.preview.emit(this.pin.imagen_referencia);
    }
  }

  onToggle(event: Event): void {
    event.stopPropagation();
    this.toggle.emit();
  }

  onShare(event: Event): void {
    event.stopPropagation();
    this.share.emit(this.pin);
  }

  onClose(event: Event): void {
    event.stopPropagation();
    this.close.emit();
  }

  onTabChange(tab: 'info' | 'horarios'): void {
    this.tabChange.emit(tab);
  }

  onCopy(): void {
    this.copy.emit();
  }

  onOpenMap(): void {
    this.openMap.emit();
  }

  onSelectOrigin(): void {
    this.selectOrigin.emit();
  }

  onSelectDestination(): void {
    this.selectDestination.emit();
  }
}
