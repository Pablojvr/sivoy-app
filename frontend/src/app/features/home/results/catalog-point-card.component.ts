import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SiButtonDirective, SiChipComponent, SiCardDirective } from '../../../shared/ui/ui-primitives';

export interface CatalogPointCompany {
  companyId: string;
  name: string;
  logoUrl: string | null;
}

export interface CatalogPointLocation {
  department: string;
  municipality: string;
  address: string | null;
  coordinates: { lat: number | null; lng: number | null };
}

export interface CatalogPointMedia {
  imageUrl: string | null;
  mapsUrl: string | null;
}

export interface CatalogPointAvailability {
  status: 'OPEN' | 'CLOSED';
  closesAt: string | null;
  nextOpeningAt: string | null;
  evaluatedAt: string;
  timeZone: string;
}

export interface CatalogPointSchedulePreview {
  daysLabel: string;
  opensAt: string;
  closesAt: string;
}

export interface CatalogPoint {
  pointId: string;
  company: CatalogPointCompany;
  name: string;
  pointType: string;
  location: CatalogPointLocation;
  media: CatalogPointMedia;
  availability: CatalogPointAvailability;
  schedulePreview: CatalogPointSchedulePreview[];
}

@Component({
  selector: 'app-catalog-point-card',
  standalone: true,
  imports: [CommonModule, SiButtonDirective, SiChipComponent, SiCardDirective],
  templateUrl: './catalog-point-card.component.html',
  styleUrls: ['./catalog-point-card.component.css']
})
export class CatalogPointCardComponent {
  @Input({ required: true }) point!: CatalogPoint;
  @Input() expanded = false;

  @Output() toggle = new EventEmitter<CatalogPoint>();
  @Output() use = new EventEmitter<CatalogPoint>();
  @Output() share = new EventEmitter<CatalogPoint>();
  @Output() map = new EventEmitter<CatalogPoint>();
}
