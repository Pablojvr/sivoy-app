import { Component, Input, Output, EventEmitter, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RawSchedule } from './schedule-utils';
import { ScheduleDisplayComponent } from './schedule-display.component';
import { SiButtonDirective, SiChipComponent } from '../../../shared/ui/ui-primitives';

export interface PointResultStatus {
  color?: string;
  mainText?: string;
  timeText?: string;
}

export interface PointResultUbicacion {
  municipio?: string;
  departamento?: string;
}

export interface PointResultViewModel {
  id?: string | number;
  id_destino?: string | number;
  id_origen?: string | number;
  empresa?: string;
  distance?: number;
  destino_nombre?: string;
  nombre_destino?: string;
  ubicacion?: PointResultUbicacion;
  imagen_referencia?: string;
  _status?: PointResultStatus;
  horarios_operativos?: RawSchedule[];
}

@Component({
  selector: 'article[siPointResultCard]',
  standalone: true,
  imports: [CommonModule, ScheduleDisplayComponent, SiButtonDirective, SiChipComponent],
  templateUrl: './point-result-card.component.html',
  encapsulation: ViewEncapsulation.None
})
export class PointResultCardComponent {
  @Input({ required: true }) point!: PointResultViewModel;
  @Input({ required: true }) computedId!: string | number;
  @Input() expanded = false;
  @Input() originDiscoveryMode = false;
  @Input() imageAvailable = false;
  @Input() imageUrl?: string;
  @Input() scheduleCount = 0;

  @Output() toggle = new EventEmitter<PointResultViewModel>();
  @Output() copyImage = new EventEmitter<PointResultViewModel>();
  @Output() imageUnavailable = new EventEmitter<PointResultViewModel>();
  @Output() use = new EventEmitter<PointResultViewModel>();
  @Output() share = new EventEmitter<PointResultViewModel>();
  @Output() map = new EventEmitter<PointResultViewModel>();
}
