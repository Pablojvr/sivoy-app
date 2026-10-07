import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SiButtonDirective, SiChipComponent, SiCardDirective } from '../../../shared/ui/ui-primitives';
import { CatalogPoint } from '../../../core/models/catalog.models';

export type { CatalogPoint } from '../../../core/models/catalog.models';

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
