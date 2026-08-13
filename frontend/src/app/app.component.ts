import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastComponent } from './shared/components/toast/toast.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastComponent],
  template: `
    <router-outlet></router-outlet>
    <app-toast></app-toast>
  `,
  styles: [
    `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    `
  ]
})
export class AppComponent {
}
