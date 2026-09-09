import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface RouteDeliveryOption {
  fecha_llegada?: string;
  horario_recoleccion?: string;
  dropoff_date?: string;
  dropoff_msg?: string;
}

export interface RouteResultViewModel {
  empresa?: string;
  origen_nombre: string;
  origen_tipo?: string;
  destino_nombre_destino?: string;
  destino_nombre?: string;
  destino_tipo?: string;
  opciones_entrega?: RouteDeliveryOption[];
  opciones?: RouteDeliveryOption[];
  selected_opcion_idx?: number;
  fecha_llegada?: string;
  horario_recoleccion?: string;
  isExpanded?: boolean;
  hasClosedAlert?: boolean;
  origen_msg?: string;
}

export interface RouteDeliveryDayChange {
  route: RouteResultViewModel;
  index: number;
}

export function formatLocationName(name?: string | null, type?: string | null): string {
  if (!name) return '';
  const upperName = name.toUpperCase();
  
  if (type === 'Agencia' || upperName.includes('AGENCIA')) {
    return upperName.includes('AGENCIA') ? upperName : `AGENCIA ${upperName}`;
  }
  
  if (type === 'Cobertura Domicilio' || upperName.includes('DOMICILIO')) {
    return upperName.includes('DOMICILIO') ? upperName : `DOMICILIO ${upperName}`;
  }
  
  if (!upperName.includes('PUNTO FIJO') && !upperName.includes('PUNTO')) {
    return `PUNTO FIJO ${upperName}`;
  }
  
  return upperName;
}

export function formatFriendlyDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  let date = new Date(dateStr);
  if (parts.length === 3) {
    date = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }
  
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const diaNombre = dias[date.getDay()];
  
  const today = new Date();
  const isToday = today.getDate() === date.getDate() && today.getMonth() === date.getMonth() && today.getFullYear() === date.getFullYear();
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = tomorrow.getDate() === date.getDate() && tomorrow.getMonth() === date.getMonth() && tomorrow.getFullYear() === date.getFullYear();
  
  let suffix = '';
  if (isToday) suffix = ' (Hoy)';
  else if (isTomorrow) suffix = ' (Mañana)';
  
  return `${diaNombre} ${date.getDate()}${suffix}`;
}

@Component({
  selector: 'article[siRouteResultCard]',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './route-result-card.component.html'
})
export class RouteResultCardComponent {
  @Input({ required: true }) route!: RouteResultViewModel;
  @Input() routeNumber = 1;
  @Input() destinationFallback = '';

  @Output() toggle = new EventEmitter<RouteResultViewModel>();
  @Output() deliveryDayChange = new EventEmitter<RouteDeliveryDayChange>();
  @Output() restartOrigin = new EventEmitter<void>();
  @Output() viewMap = new EventEmitter<RouteResultViewModel>();

  formatLocationName = formatLocationName;
  formatFriendlyDate = formatFriendlyDate;

  get selectedOptionIndex(): number {
    return this.route.selected_opcion_idx || 0;
  }

  get fallbackOrDestName(): string {
    return this.route.destino_nombre_destino || this.route.destino_nombre || this.destinationFallback;
  }

  onToggle(): void {
    this.toggle.emit(this.route);
  }

  onDayChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const index = parseInt(select.value, 10);
    this.deliveryDayChange.emit({ route: this.route, index });
  }

  onRestartOrigin(): void {
    this.restartOrigin.emit();
  }

  onViewMap(): void {
    this.viewMap.emit(this.route);
  }
}
