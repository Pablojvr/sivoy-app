import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import { UbicacionesService } from '../../core/services/ubicaciones.service';
import { AdminComponent } from './admin.component';
import { AdminPageComponent } from './admin-page.component';
import { BottomNavComponent } from '../../shared/components/bottom-nav/bottom-nav.component';

@Component({
  selector: 'app-admin',
  standalone: true,
  template: ''
})
class AdminStubComponent {
  @Input() locations: unknown[] = [];
  @Output() locationUpdated = new EventEmitter<void>();
  @Output() previewImageEvent = new EventEmitter<string>();
}

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  template: ''
})
class BottomNavStubComponent {
  @Input() activeTab = 'inicio';
}

describe('AdminPageComponent (T29b)', () => {
  let fixture: ComponentFixture<AdminPageComponent>;
  let firstLocations: Subject<unknown[]>;
  let secondLocations: Subject<unknown[]>;
  let getLocations: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    firstLocations = new Subject<unknown[]>();
    secondLocations = new Subject<unknown[]>();
    getLocations = vi.fn()
      .mockReturnValueOnce(firstLocations)
      .mockReturnValueOnce(secondLocations);

    await TestBed.configureTestingModule({
      imports: [AdminPageComponent],
      providers: [
        provideRouter([]),
        { provide: UbicacionesService, useValue: { getLocations } }
      ]
    })
      .overrideComponent(AdminPageComponent, {
        remove: { imports: [AdminComponent, BottomNavComponent] },
        add: { imports: [AdminStubComponent, BottomNavStubComponent] }
      })
      .compileComponents();

    fixture = TestBed.createComponent(AdminPageComponent);
    fixture.detectChanges();
  });

  const renderAdmin = (locations: unknown[] = []): AdminStubComponent => {
    firstLocations.next(locations);
    fixture.detectChanges();
    return fixture.debugElement.query(By.directive(AdminStubComponent)).componentInstance as AdminStubComponent;
  };

  it('waits for the initial locations result before mounting the admin view', () => {
    expect(fixture.debugElement.query(By.directive(AdminStubComponent))).toBeNull();

    const admin = renderAdmin();

    expect(admin).toBeDefined();
  });

  it('loads locations and hands them to the admin view', () => {
    const points = [{ id: 'point-1', nombre_destino: 'Agencia Centro' }];
    const admin = renderAdmin(points);
    expect(getLocations).toHaveBeenCalledTimes(1);
    expect(admin.locations).toBe(points);
  });

  it('replaces locations after the admin view reports an update', () => {
    const admin = renderAdmin([{ id: 'old' }]);

    admin.locationUpdated.emit();
    const refreshed = [{ id: 'new' }];
    secondLocations.next(refreshed);
    fixture.detectChanges();

    expect(getLocations).toHaveBeenCalledTimes(2);
    expect(admin.locations).toBe(refreshed);
  });

  it('cancels an active locations load when destroyed', () => {
    expect(firstLocations.observed).toBe(true);

    fixture.destroy();

    expect(firstLocations.observed).toBe(false);
  });

  it('opens the image dialog and closes it with Escape', () => {
    const admin = renderAdmin();
    admin.previewImageEvent.emit('/uploads/reference.jpg');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="dialog"] img').getAttribute('src'))
      .toContain('/uploads/reference.jpg');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps the dialog open for image clicks and closes it from the backdrop', () => {
    const admin = renderAdmin();
    admin.previewImageEvent.emit('/uploads/reference.jpg');
    fixture.detectChanges();

    const image = fixture.nativeElement.querySelector('[role="dialog"] img') as HTMLElement;
    image.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).not.toBeNull();

    const backdrop = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    backdrop.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('marks Panel as the active bottom navigation item', () => {
    const bottomNav = fixture.debugElement.query(By.directive(BottomNavStubComponent)).componentInstance as BottomNavStubComponent;
    expect(bottomNav.activeTab).toBe('puntos');
  });
});
