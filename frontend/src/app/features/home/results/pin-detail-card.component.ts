import { Component, Input, Output, EventEmitter, HostBinding, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RawSchedule } from './schedule-utils';
import { ScheduleDisplayComponent } from './schedule-display.component';
import { SiButtonDirective, SiIconButtonDirective, SiChipComponent } from '../../../shared/ui/ui-primitives';
import { legacyLocationToSavedSnapshot } from '../../../core/saved-points/saved-point-snapshot.adapter';
import { SavedPointsService } from '../../../core/saved-points/saved-points.service';
import { ToastService } from '../../../core/services/toast.service';

export interface PinStatusViewModel {
  color: string;
  iconType?: 'clock' | 'calendar' | 'close';
  mainText: string;
  timeText?: string;
}

export interface PinLocationViewModel {
  municipio?: string;
  departamento?: string;
  lat?: number | string;
  lng?: number | string;
  direccion_referencia?: string;
}

export interface PinDetailViewModel {
  id?: string | number;
  id_destino?: string | number;
  id_origen?: string | number;
  companyId?: string;
  tipo?: string;
  imagen_referencia?: string;
  maps_url?: string;
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
  templateUrl: './pin-detail-card.component.html',
  styleUrls: ['./pin-detail-card.component.css']
})
export class PinDetailCardComponent implements OnDestroy {
  private readonly dragThreshold = 56;
  private activePointerId: number | null = null;
  private dragStartY = 0;
  private suppressClickUntil = 0;
  private saveFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  readonly justSaved = signal(false);

  @HostBinding('class.is-dragging') isDragging = false;
  @HostBinding('style.--pin-card-drag-y') dragOffset = '0px';

  @Input({ required: true }) pin!: PinDetailViewModel;
  @Input() expanded = false;
  @Input() activeTab: 'info' | 'horarios' = 'info';
  @Input() heroImageUrl = '';
  @Input() routeSelectionBlocked = false;
  @Input() hasOrigin = false;
  @Input() hasDestination = false;

  @Output() toggle = new EventEmitter<void>();
  @Output() preview = new EventEmitter<string>();
  @Output() share = new EventEmitter<PinDetailViewModel>();
  @Output() close = new EventEmitter<void>();
  @Output() tabChange = new EventEmitter<'info' | 'horarios'>();
  @Output() copy = new EventEmitter<void>();
  @Output() openMap = new EventEmitter<void>();
  @Output() selectOrigin = new EventEmitter<void>();
  @Output() selectDestination = new EventEmitter<void>();

  constructor(
    readonly savedPoints: SavedPointsService,
    private readonly toast: ToastService
  ) {}

  get savedPointId(): string {
    return String(this.pin.id_destino ?? this.pin.id_origen ?? this.pin.id ?? '');
  }

  toggleSaved(event: Event): void {
    event.stopPropagation();
    if (!this.savedPointId) return;
    if (this.savedPoints.isSaved(this.savedPointId)) {
      if (!this.savedPoints.remove(this.savedPointId)) {
        this.toast.showError('No pudimos quitar este punto. Intenta de nuevo.', 'No se pudo actualizar');
      }
      this.clearSaveFeedback();
      return;
    }
    const snapshot = legacyLocationToSavedSnapshot(this.pin);
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

  onSheetPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    this.activePointerId = event.pointerId;
    this.dragStartY = event.clientY;
    this.dragOffset = '0px';
    this.isDragging = true;
    event.stopPropagation();
    (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  }

  private showSaveFeedback(): void {
    this.clearSaveFeedback();
    this.justSaved.set(true);
    const pointName = this.pin.nombre_destino || this.pin.destino_nombre || 'El punto';
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

  onSheetPointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId) {
      return;
    }

    const rawOffset = event.clientY - this.dragStartY;
    const directionalOffset = this.expanded
      ? Math.max(0, rawOffset)
      : Math.min(0, rawOffset);
    this.dragOffset = `${directionalOffset}px`;

    if (Math.abs(directionalOffset) >= 4) {
      event.preventDefault();
    }
  }

  onSheetPointerEnd(event: PointerEvent): void {
    if (event.pointerId !== this.activePointerId) {
      return;
    }

    const offset = Number.parseFloat(this.dragOffset) || 0;
    const shouldToggle = this.expanded
      ? offset >= this.dragThreshold
      : offset <= -this.dragThreshold;
    const wasDrag = Math.abs(offset) >= 4;

    this.releasePointer(event);
    if (wasDrag) {
      this.suppressClickUntil = performance.now() + 250;
    }
    if (shouldToggle) {
      this.toggle.emit();
    }
  }

  onSheetPointerCancel(event: PointerEvent): void {
    if (event.pointerId === this.activePointerId) {
      this.releasePointer(event);
    }
  }

  private releasePointer(event: PointerEvent): void {
    const target = event.currentTarget as HTMLElement | null;
    if (target?.hasPointerCapture?.(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
    this.activePointerId = null;
    this.isDragging = false;
    this.dragOffset = '0px';
  }

  onPreview(): void {
    if (this.pin.imagen_referencia) {
      this.preview.emit(this.pin.imagen_referencia);
    }
  }

  onToggle(event: Event): void {
    event.stopPropagation();
    if (performance.now() < this.suppressClickUntil) {
      event.preventDefault();
      return;
    }
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

  onTabKeydown(event: KeyboardEvent): void {
    const supportedKeys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!supportedKeys.includes(event.key)) {
      return;
    }

    event.preventDefault();
    const tabs = Array.from(
      (event.currentTarget as HTMLElement | null)?.parentElement?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []
    );
    const currentIndex = Math.max(0, tabs.indexOf(event.currentTarget as HTMLElement));
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : event.key === 'ArrowRight'
          ? (currentIndex + 1) % tabs.length
          : (currentIndex - 1 + tabs.length) % tabs.length;
    const nextTab: 'info' | 'horarios' = nextIndex === 0 ? 'info' : 'horarios';

    this.onTabChange(nextTab);
    tabs[nextIndex]?.focus();
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
