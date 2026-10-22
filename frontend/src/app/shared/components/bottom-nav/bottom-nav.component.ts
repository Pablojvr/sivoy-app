import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styleUrl: './bottom-nav.component.css',
  template: `
    <nav class="persistent-bottom-nav" aria-label="Navegación principal">
      <div class="persistent-nav-track">
        <a class="nav-item" [class.active]="activeTab === 'puntos'" routerLink="/admin" [attr.aria-current]="activeTab === 'puntos' ? 'page' : null">
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="3"></rect><path d="M8 9h8M8 13h5"></path></svg>
          </span>
          <span>Panel</span>
        </a>

        <a class="nav-item nav-home" [class.active]="activeTab === 'inicio'" routerLink="/" [attr.aria-current]="activeTab === 'inicio' ? 'page' : null">
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m3 11 9-8 9 8"></path><path d="M5 10v10h14V10"></path><path d="M9 20v-6h6v6"></path></svg>
          </span>
          <span>Inicio</span>
        </a>

        <a class="nav-item" [class.active]="activeTab === 'guardados'" routerLink="/enviar" [queryParams]="{ tab: 'guardados' }" [attr.aria-current]="activeTab === 'guardados' ? 'page' : null">
          <span class="nav-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-3.8L6 21V4.8Z"></path></svg>
          </span>
          <span>Guardados</span>
        </a>
      </div>
    </nav>
  `
})
export class BottomNavComponent {
  @Input() activeTab: 'inicio' | 'puntos' | 'guardados' | 'registro' = 'inicio';
}
