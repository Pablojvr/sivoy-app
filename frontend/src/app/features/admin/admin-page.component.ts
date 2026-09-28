import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { DeliveryPoint } from '../../core/models/location.models';
import { UbicacionesService } from '../../core/services/ubicaciones.service';
import { BottomNavComponent } from '../../shared/components/bottom-nav/bottom-nav.component';
import { AdminComponent } from './admin.component';

@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [CommonModule, AdminComponent, BottomNavComponent],
  templateUrl: './admin-page.component.html',
  styleUrl: './admin-page.component.css'
})
export class AdminPageComponent implements OnInit, OnDestroy {
  locations: DeliveryPoint[] = [];
  locationsLoaded = false;
  previewImageUrl: string | null = null;

  private locationsSubscription?: Subscription;

  constructor(
    private ubicacionesService: UbicacionesService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadLocations();
  }

  ngOnDestroy(): void {
    this.locationsSubscription?.unsubscribe();
  }

  onLocationUpdated(): void {
    this.loadLocations();
  }

  onPreviewImage(url: string): void {
    this.previewImageUrl = url;
  }

  closePreview(): void {
    this.previewImageUrl = null;
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' || event.key === 'Esc') {
      this.closePreview();
    }
  }

  private loadLocations(): void {
    this.locationsSubscription?.unsubscribe();
    this.locationsSubscription = this.ubicacionesService.getLocations().subscribe({
      next: (locations) => {
        this.locations = locations ?? [];
        this.locationsLoaded = true;
        this.cdr.markForCheck();
      },
      error: () => {
        this.locations = [];
        this.locationsLoaded = true;
        this.cdr.markForCheck();
      }
    });
  }
}
