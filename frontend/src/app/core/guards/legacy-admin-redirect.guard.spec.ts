import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  provideRouter,
  RedirectCommand,
  Router,
  RouterStateSnapshot
} from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { legacyAdminRedirectGuard } from './legacy-admin-redirect.guard';

describe('legacyAdminRedirectGuard', () => {
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideRouter([])]
    }).compileComponents();

    router = TestBed.inject(Router);
  });

  function runGuard(queryParams: Record<string, string>): ReturnType<typeof legacyAdminRedirectGuard> {
    const route = new ActivatedRouteSnapshot();
    route.queryParams = queryParams;
    const state = router.routerState.snapshot;

    return TestBed.runInInjectionContext(() => legacyAdminRedirectGuard(route, state));
  }

  it('redirecciona hacia /admin usando RedirectCommand con replaceUrl cuando tab=puntos', () => {
    const result = runGuard({ tab: 'puntos' });

    expect(result).toBeInstanceOf(RedirectCommand);
    const redirect = result as RedirectCommand;
    expect(redirect.redirectTo.toString()).toBe('/admin');
    expect(redirect.navigationBehaviorOptions).toEqual({ replaceUrl: true });
  });

  it('redirecciona hacia /admin con replaceUrl cuando tab=puntos coexiste con otros queryParams', () => {
    const result = runGuard({ tab: 'puntos', filter: 'active', page: '2' });

    expect(result).toBeInstanceOf(RedirectCommand);
    const redirect = result as RedirectCommand;
    expect(redirect.redirectTo.toString()).toBe('/admin');
    expect(redirect.navigationBehaviorOptions).toEqual({ replaceUrl: true });
  });

  it('permite la navegación (retorna true) cuando tab=perfil', () => {
    const result = runGuard({ tab: 'perfil' });

    expect(result).toBe(true);
  });

  it('permite la navegación (retorna true) cuando buscar=destino', () => {
    const result = runGuard({ buscar: 'destino' });

    expect(result).toBe(true);
  });

  it('permite la navegación (retorna true) sin queryParams', () => {
    const result = runGuard({});

    expect(result).toBe(true);
  });

  it('permite la navegación (retorna true) con otros queryParams arbitrarios o pestañas distintas', () => {
    const resultInicio = runGuard({ tab: 'inicio' });
    const resultOtro = runGuard({ origen: 'centro', vista: 'lista' });

    expect(resultInicio).toBe(true);
    expect(resultOtro).toBe(true);
  });
});
