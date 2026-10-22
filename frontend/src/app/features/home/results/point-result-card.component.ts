import { Component, Input, Output, EventEmitter, OnDestroy, ViewEncapsulation, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RawSchedule } from './schedule-utils';
import { ScheduleDisplayComponent } from './schedule-display.component';
import { SiButtonDirective, SiChipComponent } from '../../../shared/ui/ui-primitives';
import { legacyLocationToSavedSnapshot } from '../../../core/saved-points/saved-point-snapshot.adapter';
import { SavedPointsService } from '../../../core/saved-points/saved-points.service';
import { ToastService } from '../../../core/services/toast.service';

export interface PointResultStatus {
  color?: string;
  mainText?: string;
  timeText?: string;
}

export interface PointResultUbicacion {
  municipio?: string;
  departamento?: string;
  lat?: number | string;
  lng?: number | string;
  direccion_referencia?: string;
}

export interface PointResultViewModel {
  id?: string | number;
  id_destino?: string | number;
  id_origen?: string | number;
  empresa?: string;
  companyId?: string;
  tipo?: string;
  distance?: number;
  referenceDistanceKm?: number | null;
  destino_nombre?: string;
  nombre_destino?: string;
  ubicacion?: PointResultUbicacion;
  imagen_referencia?: string;
  maps_url?: string;
  direccion_referencia?: string;
  _status?: PointResultStatus;
  horarios_operativos?: RawSchedule[];
}

@Component({
  selector: 'article[siPointResultCard]',
  standalone: true,
  imports: [CommonModule, ScheduleDisplayComponent, SiButtonDirective, SiChipComponent],
  templateUrl: './point-result-card.component.html',
  styleUrls: ['./point-result-card.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class PointResultCardComponent implements OnDestroy {
  readonly justSaved = signal(false);
  private saveFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly savedPoints: SavedPointsService,
    private readonly toast: ToastService
  ) {}

  @Input({ required: true }) point!: PointResultViewModel;
  @Input({ required: true }) computedId!: string | number;
  @Input() expanded = false;
  @Input() originDiscoveryMode = false;
  @Input() imageAvailable = false;
  @Input() imageUrl?: string;
  @Input() scheduleCount = 0;

  @Output() toggle = new EventEmitter<PointResultViewModel>();
  @Output() copyImage = new EventEmitter<PointResultViewModel>();
  @Output() previewImage = new EventEmitter<string>();
  @Output() imageUnavailable = new EventEmitter<PointResultViewModel>();
  @Output() use = new EventEmitter<PointResultViewModel>();
  @Output() share = new EventEmitter<PointResultViewModel>();
  @Output() map = new EventEmitter<PointResultViewModel>();

  get savedPointId(): string {
    return String(this.point.id_destino ?? this.point.id_origen ?? this.point.id ?? this.computedId);
  }

  get referenceDistanceLabel(): string | null {
    const distanceKm = this.point.referenceDistanceKm;
    if (distanceKm === undefined) return null;
    if (distanceKm === null || !Number.isFinite(distanceKm) || distanceKm < 0) {
      return 'Distancia no disponible';
    }
    if (distanceKm < 1) return `A ${Math.round(distanceKm * 1000)} m en línea recta`;
    const decimals = distanceKm < 10 ? 1 : 0;
    return `A ${distanceKm.toFixed(decimals)} km en línea recta`;
  }

  toggleSaved(event: Event): void {
    event.stopPropagation();
    if (this.savedPoints.isSaved(this.savedPointId)) {
      if (!this.savedPoints.remove(this.savedPointId)) {
        this.toast.showError('No pudimos quitar este punto. Intenta de nuevo.', 'No se pudo actualizar');
      }
      this.clearSaveFeedback();
      return;
    }
    const snapshot = legacyLocationToSavedSnapshot({
      ...this.point,
      id_destino: this.point.id_destino ?? this.point.id_origen ?? this.point.id ?? this.computedId
    });
    if (!snapshot) {
      this.toast.showError('La información de este punto no se puede guardar.', 'Punto no disponible');
      return;
    }
    const outcome = this.savedPoints.save(snapshot);
    if (outcome === 'saved') {
      this.showSaveFeedback();
    } else if (outcome === 'limit-reached') {
      this.toast.showError('Puedes guardar hasta 50 puntos en este dispositivo.', 'Límite alcanzado');
    } else if (outcome === 'storage-unavailable') {
      this.toast.showError('El navegador no permitió guardar el punto en este dispositivo.', 'No se pudo guardar');
    } else if (outcome === 'invalid-point') {
      this.toast.showError('La información de este punto no se puede guardar.', 'Punto no disponible');
    }
  }

  ngOnDestroy(): void {
    this.clearSaveFeedback();
  }

  onPreviewImage(): void {
    if (this.imageAvailable && this.imageUrl) {
      this.previewImage.emit(this.imageUrl);
    }
  }

  private showSaveFeedback(): void {
    this.clearSaveFeedback();
    this.justSaved.set(true);
    const pointName = this.point.destino_nombre || this.point.nombre_destino || 'El punto';
    this.toast.showSuccess(`${pointName} ya está disponible en Guardados.`, 'Punto guardado');
    this.saveFeedbackTimer = setTimeout(() => {
      this.justSaved.set(false);
      this.saveFeedbackTimer = null;
    }, 520);
  }

  private clearSaveFeedback(): void {
    if (this.saveFeedbackTimer !== null) clearTimeout(this.saveFeedbackTimer);
    this.saveFeedbackTimer = null;
    this.justSaved.set(false);
  }
}
