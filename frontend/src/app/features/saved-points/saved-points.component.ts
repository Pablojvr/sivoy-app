import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, computed, effect, ElementRef, inject, signal, ViewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { SavedPointRecordV1 } from '../../core/saved-points/saved-points.models';
import { SavedPointsService } from '../../core/saved-points/saved-points.service';
import { PointShareService, ShareablePoint } from '../../core/services/point-share.service';
import { ToastService } from '../../shared/services/toast.service';
import { SiModalDirective } from '../../shared/ui/ui-primitives';

@Component({
  selector: 'app-saved-points',
  standalone: true,
  imports: [CommonModule, RouterLink, SiModalDirective],
  templateUrl: './saved-points.component.html',
  styleUrl: './saved-points.component.css'
})
export class SavedPointsComponent {
  @ViewChild('previewDialog') private previewDialogRef?: ElementRef<HTMLDialogElement>;
  @ViewChild('previewCloseButton') private previewCloseButtonRef?: ElementRef<HTMLButtonElement>;

  private readonly router = inject(Router);
  private readonly pointShare = inject(PointShareService);
  private readonly toast = inject(ToastService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private previewTrigger: HTMLElement | null = null;
  readonly savedPointsStore = inject(SavedPointsService);
  readonly searchQuery = signal('');
  readonly selectedPoint = signal<SavedPointRecordV1 | null>(null);
  readonly previewImageUnavailable = signal(false);
  readonly unavailableThumbnailUrls = signal<ReadonlySet<string>>(new Set());
  readonly normalizedSearchQuery = computed(() => this.normalizeSearchText(this.searchQuery().trim()));
  readonly isSearchActive = computed(() => this.normalizedSearchQuery().length > 0);
  readonly filteredSavedPoints = computed(() => {
    const query = this.normalizedSearchQuery();
    const records = this.savedPointsStore.savedPoints();
    if (!query) return records;

    return records.filter(record => {
      const snapshot = record.snapshot;
      const searchableText = [
        snapshot.name,
        snapshot.company.name,
        snapshot.location.municipality,
        snapshot.location.department,
        snapshot.location.address ?? ''
      ].join(' ');
      return this.normalizeSearchText(searchableText).includes(query);
    });
  });

  constructor() {
    effect(() => {
      const selected = this.selectedPoint();
      if (!selected || this.savedPointsStore.savedPoints().some(record => record.pointId === selected.pointId)) return;
      this.closePreview();
      if (!this.previewDialogRef?.nativeElement.open) this.handlePreviewClosed();
    });
  }

  updateSearchQuery(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  clearSearch(): void {
    this.searchQuery.set('');
  }

  openPreview(record: SavedPointRecordV1, event: Event): void {
    this.selectedPoint.set(record);
    this.previewImageUnavailable.set(false);
    this.previewTrigger = event.currentTarget as HTMLElement;
    this.changeDetector.detectChanges();
    const dialog = this.previewDialogRef?.nativeElement;
    if (dialog && !dialog.open) dialog.showModal();
    this.previewCloseButtonRef?.nativeElement.focus();
  }

  closePreview(): void {
    const dialog = this.previewDialogRef?.nativeElement;
    if (dialog?.open) dialog.close();
  }

  handlePreviewCancel(event: Event): void {
    event.preventDefault();
    this.closePreview();
  }

  handlePreviewBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.closePreview();
  }

  handlePreviewClosed(): void {
    if (this.previewDialogRef?.nativeElement.open) return;
    const trigger = this.previewTrigger;
    this.selectedPoint.set(null);
    this.previewImageUnavailable.set(false);
    this.previewTrigger = null;
    trigger?.focus();
  }

  markPreviewImageUnavailable(): void {
    this.previewImageUnavailable.set(true);
  }

  markThumbnailUnavailable(imageUrl: string): void {
    this.unavailableThumbnailUrls.update(urls => new Set(urls).add(imageUrl));
  }

  openPoint(record: SavedPointRecordV1): void {
    if (this.selectedPoint()?.pointId === record.pointId) this.closePreview();
    void this.router.navigate(['/enviar'], {
      queryParams: { punto: record.pointId, accion: 'preview' }
    });
  }

  sharePoint(record: SavedPointRecordV1): Promise<void> {
    return this.pointShare.sharePoint(
      this.toShareablePoint(record),
      record.snapshot.media.imageUrl ?? undefined
    );
  }

  removePoint(record: SavedPointRecordV1): void {
    if (!this.savedPointsStore.remove(record.pointId)) {
      this.toast.showError('No pudimos quitar este punto. Intenta de nuevo.', 'No se pudo actualizar');
      return;
    }
    if (this.selectedPoint()?.pointId === record.pointId) this.closePreview();
  }

  googleMapsUrl(record: SavedPointRecordV1): string {
    if (record.snapshot.media.mapsUrl) return record.snapshot.media.mapsUrl;
    const { lat, lng } = record.snapshot.location.coordinates;
    const query = lat !== null && lng !== null
      ? `${lat},${lng}`
      : `${record.snapshot.name} ${record.snapshot.location.municipality} El Salvador`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }

  trackPoint(_index: number, record: SavedPointRecordV1): string {
    return record.pointId;
  }

  private normalizeSearchText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es');
  }

  private toShareablePoint(record: SavedPointRecordV1): ShareablePoint {
    const snapshot = record.snapshot;
    return {
      nombre_destino: snapshot.name,
      empresa: snapshot.company.name,
      direccion_referencia: snapshot.location.address ?? undefined,
      maps_url: snapshot.media.mapsUrl ?? this.googleMapsUrl(record),
      ubicacion: {
        municipio: snapshot.location.municipality,
        departamento: snapshot.location.department,
        lat: snapshot.location.coordinates.lat ?? undefined,
        lng: snapshot.location.coordinates.lng ?? undefined
      }
    };
  }
}
