import { inject } from '@angular/core';
import { CanActivateFn, RedirectCommand, Router } from '@angular/router';

export const legacyAdminRedirectGuard: CanActivateFn = (route) => {
  if (route.queryParams['tab'] === 'puntos') {
    const router = inject(Router);
    return new RedirectCommand(router.createUrlTree(['/admin']), { replaceUrl: true });
  }

  return true;
};
