import { Routes } from '@angular/router';
import { DiscoveryPageComponent } from './features/discovery/discovery-page.component';

export const routes: Routes = [
  { path: '', component: DiscoveryPageComponent, pathMatch: 'full' },
  {
    path: 'enviar',
    loadComponent: () => import('./mobile-app.component').then(module => module.MobileAppComponent)
  },
  { 
    path: 'partner', 
    loadComponent: () => import('./features/partner/partner.component').then(m => m.PartnerComponent) 
  },
  { path: '**', redirectTo: '' }
];
