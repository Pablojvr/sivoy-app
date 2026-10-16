import { expect, Page, test } from '@playwright/test';

type IntervalDiagnosticsWindow = Window & {
  __sivoyActiveIntervals?: Map<number, number>;
};

type RouteRequestBody = {
  origen?: string[];
  destino?: string[];
};

const countActiveIntervalsByDelay = (delay: number) =>
  window.__sivoyActiveIntervals
    ? [...window.__sivoyActiveIntervals.values()].filter(activeDelay => activeDelay === delay).length
    : 0;

declare global {
  interface Window {
    __sivoyActiveIntervals?: Map<number, number>;
  }
}

function observeLegacyCatalogRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/locations') requests.push(request.url());
  });
  return requests;
}

async function chooseMunicipality(
  page: Page,
  query: string,
  accessibleName: string,
): Promise<void> {
  const search = page.getByRole('searchbox', { name: 'Buscar municipio o punto de entrega' });
  await search.fill(query);
  await expect(page).toHaveURL(/.*\/#\/$/);
  await page.getByRole('button', { name: accessibleName, exact: true }).click();
  await expect(page).toHaveURL(/.*\/#\/enviar\?/);
}

async function chooseSanSalvadorDestination(page: Page): Promise<void> {
  await chooseMunicipality(page, 'san salvador', 'San Salvador San Salvador 1 punto');
  await expect(page.getByRole('heading', { name: '1 Resultado en San Salvador' })).toBeVisible();
}

async function expandPointDetails(page: Page): Promise<void> {
  const summary = page.locator('#card-POINT_AGENCIA_CENTRO button.point-result-summary');
  await summary.click();
  await expect(summary).toHaveAttribute('aria-expanded', 'true');
}

async function assertNoLegacyCatalogRequests(requests: string[]): Promise<void> {
  expect(requests, 'the public flow must not download the legacy global catalog').toEqual([]);
}

test('destino, detalle, compartir, origen y ruta usan el catálogo canónico', async ({ page }) => {
  const legacyRequests = observeLegacyCatalogRequests(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (payload: ShareData) => {
        (window as Window & { __sharedPayload?: ShareData }).__sharedPayload = payload;
      },
    });
  });

  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: 'Envía sin complicarte.' })).toBeVisible();
  await chooseSanSalvadorDestination(page);

  const pointCard = page.locator('#card-POINT_AGENCIA_CENTRO');
  await expect(pointCard).toBeVisible();
  const detailResponse = page.waitForResponse(response =>
    response.request().method() === 'GET' &&
    new URL(response.url()).pathname === '/api/catalog/points/POINT_AGENCIA_CENTRO',
  );
  await pointCard.locator('button.point-result-summary').click();
  expect((await detailResponse).status()).toBe(200);
  const expandedDetails = pointCard.locator('#point-details-POINT_AGENCIA_CENTRO');
  await expect(expandedDetails).toContainText('Lunes a Viernes');
  await expect(expandedDetails).toContainText('08:00 AM – 05:00 PM');

  await page.getByRole('button', { name: 'Compartir Agencia Centro' }).click();
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { __sharedPayload?: ShareData }).__sharedPayload,
  )).toMatchObject({
    title: 'Agencia Centro',
    text: expect.stringContaining('Empresa de prueba'),
    url: expect.stringContaining('google.com/maps'),
  });

  await page.getByRole('button', { name: 'Elegir desde dónde enviar hacia este punto' }).click();
  await expect(page.getByRole('heading', { name: 'Tipo de origen' })).toBeVisible();

  const routeRequestPromise = page.waitForRequest(request =>
    request.method() === 'POST' && new URL(request.url()).pathname === '/api/get-upcoming-routes',
  );
  await page.getByRole('button', { name: 'Agencia Norte Santa Tecla, La Libertad' }).click();
  const routeRequest = await routeRequestPromise;
  const body = routeRequest.postDataJSON() as RouteRequestBody;
  expect(body.origen).toEqual(['POINT_AGENCIA_NORTE']);
  expect(body.destino).toEqual(['POINT_AGENCIA_CENTRO']);

  await expect(page.getByRole('heading', { name: '1 ruta disponible' })).toBeVisible();
  await page.getByRole('button', {
    name: 'Ver detalles de la ruta de Agencia Norte a Agencia Centro',
  }).click();
  await expect(page.getByText('Día para entregar en origen')).toBeVisible();
  await expect(page.getByText('Horario de prueba').first()).toBeVisible();

  await expect(page).toHaveScreenshot('public-route.png', {
    animations: 'disabled',
    caret: 'hide',
    mask: [
      page.locator('.route-card-eta strong'),
      page.locator('.route-date-selector select'),
      page.locator('.route-data-grid > div:first-child strong'),
    ],
    maskColor: '#d9dde3',
    maxDiffPixelRatio: 0.02,
  });
  await assertNoLegacyCatalogRequests(legacyRequests);
});

test('municipio con más de una página agrega 25 puntos sin duplicarlos', async ({ page }) => {
  const legacyRequests = observeLegacyCatalogRequests(page);
  await page.goto('/#/');
  await chooseMunicipality(page, 'soyapango', 'Soyapango San Salvador 25 puntos');

  const cards = page.locator('article.point-result-card');
  await expect(cards).toHaveCount(20);
  await expect(page.getByRole('button', { name: 'Ver más puntos' })).toBeVisible();
  await page.getByRole('button', { name: 'Ver más puntos' }).click();
  await expect(cards).toHaveCount(25);
  await expect(page.getByRole('button', { name: 'Ver más puntos' })).toBeHidden();

  const ids = await cards.evaluateAll(elements => elements.map(element => element.id));
  expect(ids).toHaveLength(25);
  expect(new Set(ids).size).toBe(25);
  expect(ids.every(id => id.startsWith('card-POINT_SOYAPANGO_'))).toBe(true);
  await assertNoLegacyCatalogRequests(legacyRequests);
});

test('buscar y compartir siguen disponibles sin WebGL2', async ({ page }) => {
  const legacyRequests = observeLegacyCatalogRequests(page);
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value(contextId: string, ...args: unknown[]) {
        if (contextId === 'webgl2') return null;
        return Reflect.apply(originalGetContext, this, [contextId, ...args]);
      },
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (payload: ShareData) => {
        (window as Window & { __sharedPayload?: ShareData }).__sharedPayload = payload;
      },
    });
  });

  await page.goto('/#/');
  const mapFallback = page.getByRole('status').filter({ hasText: 'Mapa no disponible' });
  await chooseSanSalvadorDestination(page);
  const resultsHeading = page.getByRole('heading', { name: '1 Resultado en San Salvador' });
  await expect(mapFallback).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar aviso de mapa', exact: true }).click();
  await expect(mapFallback).toBeHidden();

  await expandPointDetails(page);
  await page.getByRole('button', { name: 'Ver Agencia Centro en el mapa' }).click();
  await expect(mapFallback).toBeVisible();
  await expect(resultsHeading).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar aviso de mapa', exact: true }).click();

  await page.getByRole('button', { name: 'Compartir Agencia Centro' }).click();
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { __sharedPayload?: ShareData }).__sharedPayload,
  )).toMatchObject({
    title: 'Agencia Centro',
    text: expect.stringContaining('Empresa de prueba'),
    url: expect.stringContaining('google.com/maps'),
  });
  await assertNoLegacyCatalogRequests(legacyRequests);
});

test('el flujo público no mantiene intervalos periódicos innecesarios', async ({ page }) => {
  const legacyRequests = observeLegacyCatalogRequests(page);
  await page.addInitScript(() => {
    const diagnosticsWindow = window as IntervalDiagnosticsWindow;
    const activeIntervals = new Map<number, number>();
    const originalSetInterval = window.setInterval.bind(window);
    const originalClearInterval = window.clearInterval.bind(window);

    diagnosticsWindow.__sivoyActiveIntervals = activeIntervals;
    window.setInterval = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      const intervalId = originalSetInterval(handler, delay, ...args);
      activeIntervals.set(intervalId, delay ?? 0);
      return intervalId;
    }) as typeof window.setInterval;
    window.clearInterval = ((intervalId?: number) => {
      if (typeof intervalId === 'number') activeIntervals.delete(intervalId);
      originalClearInterval(intervalId);
    }) as typeof window.clearInterval;
  });

  await page.goto('/#/');
  await chooseSanSalvadorDestination(page);
  await expect.poll(() => page.evaluate(countActiveIntervalsByDelay, 60_000)).toBe(0);

  await page.getByRole('link', { name: 'Inicio', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Envía sin complicarte.' })).toBeVisible();
  await expect.poll(() => page.evaluate(countActiveIntervalsByDelay, 60_000)).toBe(0);
  await assertNoLegacyCatalogRequests(legacyRequests);
});

test('el detalle del punto refluye sin cubrir la navegación inferior', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/#/');
  await chooseSanSalvadorDestination(page);

  await expandPointDetails(page);
  await page.getByRole('button', { name: 'Ver Agencia Centro en el mapa' }).click();

  const detailCard = page.locator('article.pin-details-card');
  const collapsedToggle = page.getByRole('button', { name: 'Expandir información del punto' });
  await expect(collapsedToggle).toContainText('Ver detalles');
  await collapsedToggle.click();

  const detailToggle = page.getByRole('button', { name: 'Contraer información del punto' });
  const bottomNav = page.getByRole('navigation', { name: 'Navegación principal' });
  await expect(detailToggle).toContainText('Ocultar detalles');

  const infoTab = page.getByRole('tab', { name: 'Información' });
  const hoursTab = page.getByRole('tab', { name: 'Horarios' });
  await infoTab.press('ArrowLeft');
  await expect(hoursTab).toHaveAttribute('aria-selected', 'true');
  await hoursTab.press('ArrowRight');
  await expect(infoTab).toHaveAttribute('aria-selected', 'true');

  const [expandedBox, navBox] = await Promise.all([
    detailCard.boundingBox(),
    bottomNav.boundingBox(),
  ]);
  expect(expandedBox).not.toBeNull();
  expect(navBox).not.toBeNull();
  expect(expandedBox!.y + expandedBox!.height).toBeLessThan(navBox!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  await detailToggle.click();
  await expect(page.getByRole('button', { name: 'Expandir información del punto' })).toContainText('Ver detalles');
  await expect(detailCard.getByText('Agencia Centro', { exact: true })).toBeVisible();
  await expect(detailCard.getByText('San Salvador, San Salvador', { exact: true })).toBeVisible();
});

test('la ruta conserva encabezado y estado visibles en 320 por 568', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/#/');
  await chooseSanSalvadorDestination(page);

  await expandPointDetails(page);
  await page.getByRole('button', { name: 'Ver Agencia Centro en el mapa' }).click();
  await page.getByRole('button', { name: 'Expandir información del punto' }).click();
  await page.getByRole('button', { name: /Usar como destino/ }).click();
  await page.getByRole('button', { name: 'Agencia Norte Santa Tecla, La Libertad' }).click();
  await expect(page.getByRole('heading', { name: '1 ruta disponible' })).toBeVisible();

  const searchPanel = page.locator('.search-panel-container');
  const resultSheet = page.locator('.bottom-sheet');
  const routeCard = page.locator('article.sivoy-route-card');
  const availabilityBadge = routeCard.locator('.route-available-badge');
  const [searchBox, sheetBox, cardBox, badgeBox] = await Promise.all([
    searchPanel.boundingBox(),
    resultSheet.boundingBox(),
    routeCard.boundingBox(),
    availabilityBadge.boundingBox(),
  ]);

  expect(searchBox).not.toBeNull();
  expect(sheetBox).not.toBeNull();
  expect(cardBox).not.toBeNull();
  expect(badgeBox).not.toBeNull();
  expect(sheetBox!.y).toBeGreaterThanOrEqual(searchBox!.y + searchBox!.height);
  expect(badgeBox!.x + badgeBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
