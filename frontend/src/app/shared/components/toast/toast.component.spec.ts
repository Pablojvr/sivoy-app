import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastMessage, ToastService } from '../../../core/services/toast.service';
import { ToastComponent } from './toast.component';

describe('ToastComponent', () => {
  let fixture: ComponentFixture<ToastComponent> | undefined;
  let messages: Subject<ToastMessage>;

  beforeEach(async () => {
    vi.useFakeTimers();
    messages = new Subject<ToastMessage>();

    await TestBed.configureTestingModule({
      imports: [ToastComponent],
      providers: [
        {
          provide: ToastService,
          useValue: { toasts$: messages.asObservable() }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ToastComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
    messages.complete();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('announces informational notifications through an atomic polite status', () => {
    messages.next({ id: 'info-1', type: 'info', title: 'Información', message: 'Mensaje de prueba' });
    fixture!.detectChanges();

    const container = fixture!.debugElement.query(By.css('.toast-container')).nativeElement as HTMLElement;
    const card = fixture!.debugElement.query(By.css('.toast-card')).nativeElement as HTMLElement;

    expect(container.hasAttribute('aria-live')).toBe(false);
    expect(card.getAttribute('role')).toBe('status');
    expect(card.getAttribute('aria-live')).toBe('polite');
    expect(card.getAttribute('aria-atomic')).toBe('true');
  });

  it('announces error notifications assertively', () => {
    messages.next({ id: 'error-1', type: 'error', title: 'Error', message: 'No se pudo completar' });
    fixture!.detectChanges();

    const card = fixture!.debugElement.query(By.css('.toast-card')).nativeElement as HTMLElement;

    expect(card.getAttribute('role')).toBe('alert');
    expect(card.getAttribute('aria-live')).toBe('assertive');
  });

  it('hides decorative icons and gives the dismiss button an accessible name', () => {
    messages.next({ id: 'info-1', type: 'info', title: 'Información', message: 'Mensaje de prueba' });
    fixture!.detectChanges();

    const icon = fixture!.debugElement.query(By.css('.toast-icon')).nativeElement as HTMLElement;
    const close = fixture!.debugElement.query(By.css('.toast-close')).nativeElement as HTMLButtonElement;

    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(close.type).toBe('button');
    expect(close.getAttribute('aria-label')).toBe('Cerrar notificación');
  });

  it('cancels pending removal timers when the component is destroyed', () => {
    const timerCountBeforeToast = vi.getTimerCount();
    messages.next({ id: 'success-1', type: 'success', message: 'Guardado' });
    fixture!.detectChanges();

    expect(vi.getTimerCount()).toBeGreaterThan(timerCountBeforeToast);

    fixture!.destroy();
    fixture = undefined;

    expect(vi.getTimerCount()).toBe(timerCountBeforeToast);
  });

  it('cancels the automatic timer when a toast is dismissed early', () => {
    messages.next({ id: 'success-2', type: 'success', message: 'Guardado' });
    fixture!.detectChanges();
    const timerCountBeforeDismiss = vi.getTimerCount();

    fixture!.componentInstance.removeToast('success-2');

    expect(vi.getTimerCount()).toBe(timerCountBeforeDismiss);
  });

  it('cancels a pending leave-animation timer when destroyed', () => {
    const timerCountBeforeToast = vi.getTimerCount();
    messages.next({ id: 'info-2', type: 'info', message: 'Actualizando' });
    fixture!.detectChanges();
    fixture!.componentInstance.removeToast('info-2');

    expect(vi.getTimerCount()).toBeGreaterThan(timerCountBeforeToast);

    fixture!.destroy();
    fixture = undefined;

    expect(vi.getTimerCount()).toBe(timerCountBeforeToast);
  });
});
