import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService, ToastMessage } from '../../../core/services/toast.service';
import { Subscription } from 'rxjs';

export interface InternalToast extends ToastMessage {
  leaving?: boolean;
}

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      <div *ngFor="let toast of toasts" class="toast-card glassmorphism slide-in" [ngClass]="[toast.type, toast.leaving ? 'fade-out' : '']">
        <div class="toast-icon">
          <svg *ngIf="toast.type === 'success'" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <svg *ngIf="toast.type === 'error'" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
          <svg *ngIf="toast.type === 'info'" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
        </div>
        <div class="toast-content">
          <h4 *ngIf="toast.title">{{ toast.title }}</h4>
          <p>{{ toast.message }}</p>
        </div>
        <button class="toast-close" (click)="removeToast(toast.id)">&times;</button>
      </div>
    </div>
  `,
  styleUrls: ['./toast.component.css']
})
export class ToastComponent implements OnInit, OnDestroy {
  toasts: InternalToast[] = [];
  private subscription!: Subscription;

  constructor(private toastService: ToastService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.subscription = this.toastService.toasts$.subscribe(toast => {
      this.toasts.push({ ...toast });
      
      const activeToasts = this.toasts.filter(t => !t.leaving);
      if (activeToasts.length > 3) {
        const oldest = activeToasts[0];
        this.removeToast(oldest.id);
      }

      this.cdr.detectChanges(); // Trigger immediately after push

      setTimeout(() => this.removeToast(toast.id), 5000); // Auto remove after 5s
    });
  }

  removeToast(id: string) {
    const toast = this.toasts.find(t => t.id === id);
    if (toast && !toast.leaving) {
      toast.leaving = true;
      this.cdr.detectChanges(); // Trigger leaving animation
      setTimeout(() => {
        this.toasts = this.toasts.filter(t => t.id !== id);
        this.cdr.detectChanges(); // Trigger DOM removal
      }, 300); // Match animation duration
    }
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }
}
