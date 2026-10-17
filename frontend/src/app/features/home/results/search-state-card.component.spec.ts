import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SearchStateCardComponent } from './search-state-card.component';

describe('SearchStateCardComponent', () => {
  let fixture: ComponentFixture<SearchStateCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchStateCardComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(SearchStateCardComponent);
  });

  function render(
    state: 'loading' | 'error' | 'empty' | 'initial',
    options: { actionLabel?: string } = {}
  ): HTMLElement {
    fixture.componentRef.setInput('state', state);
    fixture.componentRef.setInput('title', `Titulo ${state}`);
    fixture.componentRef.setInput('message', `Mensaje ${state}`);
    if (options.actionLabel) {
      fixture.componentRef.setInput('actionLabel', options.actionLabel);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('anuncia la carga sin bloquear tecnologias de asistencia', () => {
    const host = render('loading');
    const surface = host.querySelector('.search-state-surface') as HTMLElement;

    expect(surface.getAttribute('role')).toBe('status');
    expect(surface.getAttribute('aria-live')).toBe('polite');
    expect(surface.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('.search-state-spinner')).not.toBeNull();
    expect(host.textContent).toContain('Titulo loading');
    expect(host.textContent).toContain('Mensaje loading');
  });

  it('anuncia el error de forma asertiva y no conserva aria-busy', () => {
    const host = render('error');
    const surface = host.querySelector('.search-state-surface') as HTMLElement;

    expect(surface.getAttribute('role')).toBe('alert');
    expect(surface.getAttribute('aria-live')).toBe('assertive');
    expect(surface.getAttribute('aria-busy')).toBeNull();
    expect(host.querySelector('.search-state-spinner')).toBeNull();
  });

  it('emite la accion de recuperacion desde el estado inicial', () => {
    const action = vi.fn();
    fixture.componentInstance.action.subscribe(action);
    const host = render('initial', { actionLabel: 'Buscar destino' });
    const button = host.querySelector('button[siButton]') as HTMLButtonElement;

    expect(button).not.toBeNull();
    expect(button.classList.contains('si-button--secondary')).toBe(false);
    button.click();
    expect(action).toHaveBeenCalledOnce();
  });

  it('usa una accion secundaria en el estado sin resultados', () => {
    const host = render('empty', { actionLabel: 'Elegir otro destino' });
    const button = host.querySelector('button[siButton]') as HTMLButtonElement;

    expect(button.classList.contains('si-button--secondary')).toBe(true);
  });

  it('mantiene el contrato visual sin literales, estilos inline ni important', () => {
    const host = render('initial');
    const styles = Array.from(document.head.querySelectorAll('style'))
      .map((element) => element.textContent ?? '')
      .find((content) => content.includes('.search-state-surface')) ?? '';

    expect(styles).toContain('var(--si-color-');
    expect(styles).toContain('var(--si-space-');
    expect(styles).toContain('var(--si-radius-card)');
    expect(styles).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*animation:\s*none/);
    expect(styles).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(styles).not.toContain('!important');
    expect(host.querySelector('[style]')).toBeNull();
  });
});
