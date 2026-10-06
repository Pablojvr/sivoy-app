import { Routes } from '@angular/router';
import { DiscoveryPageComponent } from './features/discovery/discovery-page.component';
import { legacyAdminRedirectGuard } from './core/guards/legacy-admin-redirect.guard';

export const routes: Routes = [
  { path: '', component: DiscoveryPageComponent, pathMatch: 'full' },
  {
    path: 'enviar',
    canActivate: [legacyAdminRedirectGuard],
    loadComponent: () => import('./mobile-app.component').then(module => module.MobileAppComponent)
  },
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/admin-page.component').then(module => module.AdminPageComponent)
  },
  { 
    path: 'partner', 
    loadComponent: () => import('./features/partner/partner.component').then(m => m.PartnerComponent) 
  },
  { path: '**', redirectTo: '' }
];
