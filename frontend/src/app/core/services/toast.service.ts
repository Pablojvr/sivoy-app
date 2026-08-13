import { Injectable, NgZone } from '@angular/core';
import { Subject } from 'rxjs';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title?: string;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private toastsSubject = new Subject<ToastMessage>();
  toasts$ = this.toastsSubject.asObservable();

  constructor(private ngZone: NgZone) {}

  showSuccess(message: string, title: string = 'Éxito') {
    this.addToast({ type: 'success', title, message, id: this.generateId() });
  }

  showError(message: string, title: string = 'Error') {
    this.addToast({ type: 'error', title, message, id: this.generateId() });
  }

  showInfo(message: string, title: string = 'Información') {
    this.addToast({ type: 'info', title, message, id: this.generateId() });
  }

  private addToast(toast: ToastMessage) {
    this.ngZone.run(() => {
      this.toastsSubject.next(toast);
    });
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
}
