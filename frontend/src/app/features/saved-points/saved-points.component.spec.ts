import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import {
  SAVED_POINTS_BROWSER,
  SavedPointsBrowser,
  SavedPointsService
} from '../../core/saved-points/saved-points.service';
import { SavedPointSnapshot } from '../../core/saved-points/saved-points.models';
import { PointShareService } from '../../core/services/point-share.service';
import { ToastService } from '../../shared/services/toast.service';
import { SavedPointsComponent } from './saved-points.component';

class MemoryBrowser implements SavedPointsBrowser {
  private value: string | null = null;

  getItem(): string | null { return this.value; }
  setItem(_key: string, value: string): void { this.value = value; }
  addStorageListener(): () => void { return () => undefined; }
  nowIso(): string { return '2026-10-18T12:00:00.000Z'; }
}

class ShareServiceStub {
  sharePoint = vi.fn().mockResolvedValue(undefined);
}

const savedPoint: SavedPointSnapshot = {
  pointId: 'AG_01',
  name: 'Agencia Centro',
  company: { companyId: 'PE', name: 'Pedidos Express', logoUrl: null },
  pointType: 'AGENCY',
  location: {
    department: 'San Salvador',
    municipality: 'San Salvador',
    address: 'Centro Histórico',
    coordinates: { lat: 13.6929, lng: -89.2182 }
  },
  media: { imageUrl: 'https://example.com/agencia.webp', mapsUrl: null }
};

const accentedSavedPoint: SavedPointSnapshot = {
  pointId: 'AG_02',
  name: 'Sucursal Águila',
  company: { companyId: 'CU', name: 'Cargo Útil', logoUrl: null },
  pointType: 'AGENCY',
  location: {
    department: 'La Unión',
    municipality: 'Santa Ana',
    address: 'Calle José Martí',
    coordinates: { lat: 13.9942, lng: -89.5597 }
  },
  media: { imageUrl: null, mapsUrl: null }
};

function prepareNativeDialog(host: HTMLElement): {
  dialog: HTMLDialogElement;
  showModal: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  const dialog = host.querySelector<HTMLDialogElement>('[data-testid="saved-preview-dialog"]');
  if (!dialog) throw new Error('Expected the saved point preview dialog to exist');

  const showModal = vi.fn(() => dialog.setAttribute('open', ''));
  const close = vi.fn(() => {
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new Event('close'));
  });
  Object.defineProperty(dialog, 'showModal', { configurable: true, value: showModal });
  Object.defineProperty(dialog, 'close', { configurable: true, value: close });
  return { dialog, showModal, close };
}

describe('SavedPointsComponent', () => {
  let savedPoints: SavedPointsService;
  let shareService: ShareServiceStub;
  let toast: { showError: ReturnType<typeof vi.fn> };
  let router: Router;

  beforeEach(async () => {
    shareService = new ShareServiceStub();
    toast = { showError: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [SavedPointsComponent],
      providers: [
        provideRouter([]),
        { provide: SAVED_POINTS_BROWSER, useClass: MemoryBrowser },
        { provide: PointShareService, useValue: shareService },
        { provide: ToastService, useValue: toast }
      ]
    }).compileComponents();
    savedPoints = TestBed.inject(SavedPointsService);
    router = TestBed.inject(Router);
  });

  it('explains local-only storage and offers a route back to Inicio when empty', () => {
    const fixture = TestBed.createComponent(SavedPointsComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.textContent).toContain('Guardados en este dispositivo');
    expect(host.textContent).toContain('Aún no guardaste puntos');
    expect(host.querySelector<HTMLAnchorElement>('[data-testid="saved-empty-home"]')?.getAttribute('href')).toBe('/');
    expect(host.querySelector('input[aria-label="Buscar en guardados"]')).toBeNull();
  });

  it('filters immediately across every public text field without case or diacritic sensitivity', () => {
    savedPoints.save(savedPoint);
    savedPoints.save(accentedSavedPoint);
    const fixture = TestBed.createComponent(SavedPointsComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Buscar en guardados"]');

    expect(input).not.toBeNull();
    expect(input?.placeholder).toBe('Nombre, empresa o ubicación');

    const expectations: ReadonlyArray<[string, string]> = [
      ['agencia centro', 'AG_01'],
      ['PEDIDOS EXPRESS', 'AG_01'],
      ['san salvador', 'AG_01'],
      ['centro historico', 'AG_01'],
      ['aguila', 'AG_02'],
      ['cargo util', 'AG_02'],
      ['la union', 'AG_02'],
      ['jose marti', 'AG_02']
    ];

    for (const [query, expectedPointId] of expectations) {
      input!.value = query;
      input!.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(host.querySelectorAll('.saved-point-card')).toHaveLength(1);
      expect(host.querySelector(`[data-testid="saved-point-${expectedPointId}"]`)).not.toBeNull();
    }
  });

  it('keeps the header total and shows the filtered count while a query is active', () => {
    savedPoints.save(savedPoint);
    savedPoints.save(accentedSavedPoint);
    const fixture = TestBed.createComponent(SavedPointsComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Buscar en guardados"]')!;

    input.value = 'aguila';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(host.querySelector('.saved-points-count')?.textContent?.trim()).toBe('2');
    expect(host.querySelector('[data-testid="saved-search-count"]')?.textContent?.trim()).toBe('1 de 2 guardados');
  });

  it('shows a query-specific no-results state and clears it from either action', () => {
    savedPoints.save(savedPoint);
    const fixture = TestBed.createComponent(SavedPointsComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Buscar en guardados"]')!;

    input.value = 'zona imposible';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(host.textContent).toContain('No encontramos coincidencias');
    expect(host.textContent).toContain('zona imposible');
    expect(host.textContent).not.toContain('Aún no guardaste puntos');
    expect(host.querySelector('[data-testid="saved-point-AG_01"]')).toBeNull();

    host.querySelector<HTMLButtonElement>('[data-testid="saved-search-empty-clear"]')?.click();
    fixture.detectChanges();

    expect(input.value).toBe('');
    expect(host.querySelector('[data-testid="saved-point-AG_01"]')).not.toBeNull();

    input.value = 'sin resultado';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('button[aria-label="Limpiar búsqueda"]')?.click();
    fixture.detectChanges();

    expect(input.value).toBe('');
    expect(host.querySelector('[data-testid="saved-point-AG_01"]')).not.toBeNull();
  });

  it('renders saved public details and an explicit pressed save state', () => {
    savedPoints.save(savedPoint);
    const fixture = TestBed.createComponent(SavedPointsComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-testid="saved-point-AG_01"]')?.textContent).toContain('Agencia Centro');
    expect(host.textContent).toContain('Pedidos Express');
    expect(host.textContent).toContain('San Salvador');
    expect(host.querySelector('button[aria-label="Quitar Agencia Centro de guardados"]')).not.toBeNull();
  });

  it('opens one native detailed preview without navigating or densifying the card', () => {
    savedPoints.save(savedPoint);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(SavedPointsComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const { dialog, showModal } = prepareNativeDialog(host);
    const card = host.querySelector<HTMLElement>('[data-testid="saved-point-AG_01"]')!;
    const trigger = host.querySelector<HTMLButtonElement>('[data-testid="saved-preview-AG_01"]')!;
    showModal.mockImplementation(() => {
      expect(dialog.textContent).toContain('Agencia Centro');
      dialog.setAttribute('open', '');
    });

    expect(card.textContent).not.toContain('Centro Histórico');
    expect(trigger.textContent).toContain('Vista previa');
    trigger.click();
    fixture.detectChanges();

    expect(showModal).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
    expect(host.querySelectorAll('[data-testid="saved-preview-dialog"]')).toHaveLength(1);
    expect(dialog.textContent).toContain('Agencia Centro');
    expect(dialog.textContent).toContain('Pedidos Express');
    expect(dialog.textContent).toContain('San Salvador, San Salvador');
    expect(dialog.textContent).toContain('Centro Histórico');
    expect(dialog.textContent).toContain('Guardado 18/10/2026');
    expect(dialog.textContent).not.toContain('13.6929');
    expect(dialog.querySelector<HTMLImageElement>('img')?.alt).toBe('Fotografía de referencia de Agencia Centro');
    expect(dialog.querySelector('[data-testid="saved-preview-share-AG_01"]')).not.toBeNull();
    expect(dialog.querySelector('[data-testid="saved-preview-open-AG_01"]')).not.toBeNull();
    expect(dialog.querySelector<HTMLAnchorElement>('[data-testid="saved-preview-map-AG_01"]')?.href)
      .toContain('google.com/maps');
    expect(document.activeElement).toBe(dialog.querySelector('[aria-label="Cerrar vista previa"]'));
  });

  it('uses a sober fallback when the preview has no usable image', () => {
    savedPoints.save(accentedSavedPoint);
    const fixture = TestBed.createComponent(SavedPointsComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const { dialog } = prepareNativeDialog(host);

    host.querySelector<HTMLButtonElement>('[data-testid="saved-preview-AG_02"]')?.click();
    fixture.detectChanges();

    expect(dialog.querySelector('img')).toBeNull();
    expect(dialog.textContent).toContain('Sin fotografía de referencia');

    savedPoints.remove('AG_02');
    savedPoints.save(savedPoint);
    fixture.detectChanges();
    host.querySelector<HTMLButtonElement>('[data-testid="saved-preview-AG_01"]')?.click();
    fixture.detectChanges();
    dialog.querySelector<HTMLImageElement>('img')?.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(dialog.querySelector('img')).toBeNull();
    expect(dialog.textContent).toContain('Sin fotografía de referencia');

    const thumbnailImage = host.querySelector<HTMLImageElement>('[data-testid="saved-preview-thumbnail-AG_01"] img');
    thumbnailImage?.dispatchEvent(new Event('error'));
    fixture.detectChanges();

    expect(host.querySelector('[data-testid="saved-preview-thumbnail-AG_01"] img')).toBeNull();
    expect(host.querySelector('[data-testid="saved-preview-thumbnail-AG_01"] svg')).not.toBeNull();
  });

  it('closes by button, Escape and backdrop while preserving inner interactions and focus', () => {
    savedPoints.save(savedPoint);
    const fixture = TestBed.createComponent(SavedPointsComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const { dialog, close } = prepareNativeDialog(host);
    const trigger = host.querySelector<HTMLButtonElement>('[data-testid="saved-preview-AG_01"]')!;

    trigger.focus();
    trigger.click();
    fixture.detectChanges();
    dialog.querySelector<HTMLButtonElement>('[aria-label="Cerrar vista previa"]')?.click();
    fixture.detectChanges();
    expect(close).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);

    trigger.click();
    fixture.detectChanges();
    const cancelEvent = new Event('cancel', { cancelable: true });
    dialog.dispatchEvent(cancelEvent);
    fixture.detectChanges();
    expect(cancelEvent.defaultPrevented).toBe(true);
    expect(close).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(trigger);

    trigger.click();
    fixture.detectChanges();
    dialog.querySelector<HTMLElement>('.saved-point-preview-sheet')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(close).toHaveBeenCalledTimes(2);
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(close).toHaveBeenCalledTimes(3);
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps a newly reopened preview when a delayed close event arrives', () => {
    savedPoints.save(savedPoint);
    const fixture = TestBed.createComponent(SavedPointsComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const { dialog } = prepareNativeDialog(host);
    const trigger = host.querySelector<HTMLButtonElement>('[data-testid="saved-preview-AG_01"]')!;

    trigger.click();
    fixture.detectChanges();
    dialog.removeAttribute('open');
    trigger.click();
    fixture.detectChanges();
    dialog.dispatchEvent(new Event('close'));
    fixture.detectChanges();

    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.textContent).toContain('Agencia Centro');
  });

  it('closes the selected preview safely if that saved point is removed', () => {
    savedPoints.save(savedPoint);
    const fixture = TestBed.createComponent(SavedPointsComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const { dialog, close } = prepareNativeDialog(host);

    host.querySelector<HTMLButtonElement>('[data-testid="saved-preview-AG_01"]')?.click();
    fixture.detectChanges();
    fixture.componentInstance.removePoint(savedPoints.savedPoints()[0]);
    fixture.detectChanges();

    expect(close).toHaveBeenCalledOnce();
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(savedPoints.isSaved('AG_01')).toBe(false);
    expect(dialog.textContent).not.toContain('Agencia Centro');
  });

  it('closes a stale preview when the saved point disappears outside the component', () => {
    savedPoints.save(savedPoint);
    const fixture = TestBed.createComponent(SavedPointsComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const { dialog, close } = prepareNativeDialog(host);

    host.querySelector<HTMLButtonElement>('[data-testid="saved-preview-AG_01"]')?.click();
    fixture.detectChanges();
    savedPoints.remove('AG_01');
    fixture.detectChanges();

    expect(close).toHaveBeenCalledOnce();
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(fixture.componentInstance.selectedPoint()).toBeNull();
  });

  it('reports a failed removal instead of hiding the point', () => {
    savedPoints.save(savedPoint);
    vi.spyOn(savedPoints, 'remove').mockReturnValue(false);
    const fixture = TestBed.createComponent(SavedPointsComponent);
    fixture.detectChanges();

    fixture.componentInstance.removePoint(savedPoints.savedPoints()[0]);

    expect(toast.showError).toHaveBeenCalledWith(
      'No pudimos quitar este punto. Intenta de nuevo.',
      'No se pudo actualizar'
    );
    expect(savedPoints.isSaved('AG_01')).toBe(true);
  });

  it('shares through the canonical point sharing service', async () => {
    savedPoints.save(savedPoint);
    const fixture = TestBed.createComponent(SavedPointsComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector<HTMLButtonElement>('[data-testid="saved-share-AG_01"]')?.click();
    await fixture.whenStable();

    expect(shareService.sharePoint).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre_destino: 'Agencia Centro',
        empresa: 'Pedidos Express',
        direccion_referencia: 'Centro Histórico'
      }),
      'https://example.com/agencia.webp'
    );
  });

  it('opens the saved point through the existing preview intent', () => {
    savedPoints.save(savedPoint);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(SavedPointsComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector<HTMLButtonElement>('[data-testid="saved-open-AG_01"]')?.click();

    expect(navigate).toHaveBeenCalledWith(['/enviar'], {
      queryParams: { punto: 'AG_01', accion: 'preview' }
    });
  });

  it('removes a point immediately from the rendered list', () => {
    savedPoints.save(savedPoint);
    const fixture = TestBed.createComponent(SavedPointsComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;

    host.querySelector<HTMLButtonElement>('[data-testid="saved-remove-AG_01"]')?.click();
    fixture.detectChanges();

    expect(savedPoints.isSaved('AG_01')).toBe(false);
    expect(host.querySelector('[data-testid="saved-point-AG_01"]')).toBeNull();
  });

  it('uses the native visual, touch and reduced-motion contracts', () => {
    const fixture = TestBed.createComponent(SavedPointsComponent);
    fixture.detectChanges();
    const styles = Array.from(document.head.querySelectorAll('style'))
      .map(style => style.textContent ?? '')
      .find(value => value.includes('.saved-points-page'));

    expect(styles).toBeDefined();
    expect(styles).toContain('var(--si-color-canvas)');
    expect(styles).toContain('var(--si-color-surface)');
    expect(styles).toContain('var(--si-focus-ring)');
    expect(styles).toMatch(/\.saved-point-action[^}]*min-height:\s*44px/s);
    expect(styles).toMatch(/\.saved-point-remove[^}]*min-width:\s*44px/s);
    expect(styles).toMatch(/\.saved-points-list[^}]*padding-bottom:\s*max\(var\(--si-space-10\), var\(--si-safe-area-bottom\)\)/s);
    expect(styles).toMatch(/\.saved-point-preview-close[^}]*min-width:\s*44px/s);
    expect(styles).toMatch(/\.saved-point-preview-media[^}]*aspect-ratio:\s*16\s*\/\s*9/s);
    expect(styles).toMatch(/\.saved-point-preview-media[^{]*img[^}]*object-fit:\s*cover/s);
    expect(styles).toMatch(/\.saved-point-preview-dialog\[open\][^}]*animation:[^;]*var\(--si-motion-standard\)/s);
    expect(styles).toMatch(/@media \(min-width:\s*768px\)/);
    expect(styles).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*animation:\s*none/);
    expect(styles).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});
