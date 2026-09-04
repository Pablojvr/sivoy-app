import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [CommonModule],
  template: `
    <nav class="floating-bottom-nav" aria-label="Navegación principal">
      <button type="button" class="nav-item" [class.active]="activeTab === 'inicio'" (click)="selectTab('inicio')" [attr.aria-current]="activeTab === 'inicio' ? 'page' : null">
        <span class="nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor" *ngIf="activeTab === 'inicio'"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" *ngIf="activeTab !== 'inicio'"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
        </span>
        <span>Inicio</span>
      </button>
      <button type="button" class="nav-item" [class.active]="activeTab === 'puntos'" (click)="selectTab('puntos')" [attr.aria-current]="activeTab === 'puntos' ? 'page' : null">
        <span class="nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>
        </span>
        <span>Panel</span>
      </button>
      <button type="button" class="nav-item" [class.active]="activeTab === 'perfil'" (click)="selectTab('perfil')" [attr.aria-current]="activeTab === 'perfil' ? 'page' : null">
        <span class="nav-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
        </span>
        <span>Perfil</span>
      </button>
    </nav>
  `
})
export class BottomNavComponent {
  @Input() activeTab: 'inicio' | 'puntos' | 'perfil' | 'registro' = 'inicio';
  @Output() tabChange = new EventEmitter<'inicio' | 'puntos' | 'perfil'>();

  selectTab(tab: 'inicio' | 'puntos' | 'perfil') {
    this.tabChange.emit(tab);
  }
}
