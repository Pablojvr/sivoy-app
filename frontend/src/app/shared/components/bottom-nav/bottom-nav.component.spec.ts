import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { BottomNavComponent } from './bottom-nav.component';

describe('BottomNavComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BottomNavComponent],
      providers: [provideRouter([])]
    }).compileComponents();
  });

  function render(activeTab: BottomNavComponent['activeTab'] = 'inicio') {
    const fixture = TestBed.createComponent(BottomNavComponent);
    fixture.componentRef.setInput('activeTab', activeTab);
    fixture.detectChanges();
    return fixture;
  }

  it('conserva las rutas publicas y los destinos de la navegacion principal', () => {
    const fixture = render();
    const host = fixture.nativeElement as HTMLElement;
    const links = Array.from(host.querySelectorAll<HTMLAnchorElement>('.nav-item'));

    expect(links.map((link) => link.textContent?.trim())).toEqual(['Panel', 'Inicio', 'Guardados']);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/admin',
      '/',
      '/enviar?tab=guardados'
    ]);
  });

  it('expone un unico destino activo con aria-current', () => {
    const fixture = render('guardados');
    const host = fixture.nativeElement as HTMLElement;
    const activeLinks = host.querySelectorAll<HTMLAnchorElement>(
      '.nav-item[aria-current="page"]'
    );

    expect(activeLinks).toHaveLength(1);
    expect(activeLinks[0].textContent?.trim()).toBe('Guardados');
    expect(activeLinks[0].classList.contains('active')).toBe(true);
  });

  it('usa el contrato visual nativo, tactil y de movimiento reducido', () => {
    render();
    const componentStyles = Array.from(document.head.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .find((styles) => styles.includes('.persistent-bottom-nav'));

    expect(componentStyles).toBeDefined();
    expect(componentStyles).toContain('var(--si-safe-area-bottom)');
    expect(componentStyles).toContain('var(--si-color-surface)');
    expect(componentStyles).toContain('var(--si-focus-ring)');
    expect(componentStyles).toMatch(/\.nav-item[^}]*min-(?:width|height):\s*44px/s);
    expect(componentStyles).toMatch(/\.nav-home[^}]*min-height:\s*72px/s);
    expect(componentStyles).toContain('font-size: 11px');
    expect(componentStyles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition:\s*none/
    );
  });
});
