import { Routes } from '@angular/router';
import { MobileAppComponent } from './mobile-app.component';

export const routes: Routes = [
  { path: '', component: MobileAppComponent },
  { 
    path: 'partner', 
    loadComponent: () => import('./features/partner/partner.component').then(m => m.PartnerComponent) 
  },
  { path: '**', redirectTo: '' }
];
