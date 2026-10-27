import { expect, Page, test } from '@playwright/test';
import { Buffer } from 'node:buffer';

type IntervalDiagnosticsWindow = Window & {
  __sivoyActiveIntervals?: Map<number, number>;
};

type RouteRequestBody = {
  origen?: string[];
  destino?: string[];
};

const TRANSPARENT_MAP_TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

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
  const search = page.getByRole('searchbox', { name: /Buscar municipio.*punto/i });
  await search.fill(query);
  await expect(page).toHaveURL(/.*\/#\/$/);
  await page.getByRole('button', { name: accessibleName, exact: true }).click();
  await expect(page).toHaveURL(/.*\/#\/enviar\?/);
}

async function chooseSanSalvadorDestination(page: Page): Promise<void> {
  await chooseMunicipality(page, 'san salvador', 'San Salvador San Salvador 1 punto');
  await expect(page.getByRole('heading', { name: /1 punto disponible/i })).toBeVisible();
}

async function mockPlaceLookup(
  page: Page,
  place: {
    placeId: string;
    name: string;
    municipality: string;
    department: string;
    latitude: number;
    longitude: number;
  },
): Promise<void> {
  await page.route('**/api/places/autocomplete', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        suggestions: [{
          placeId: place.placeId,
          text: `${place.name}, ${place.municipality}`,
          mainText: place.name,
          secondaryText: `${place.municipality}, ${place.department}`,
        }],
      }),
    });
  });
  await page.route('**/api/places/resolve', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        place: {
          placeId: place.placeId,
          name: place.name,
          formattedAddress: `${place.municipality}, ${place.department}, El Salvador`,
          addressComponents: [
            { longText: place.municipality, shortText: place.municipality, types: ['locality'] },
            { longText: place.department, shortText: place.department, types: ['administrative_area_level_1'] },
            { longText: 'El Salvador', shortText: 'SV', types: ['country'] },
          ],
          location: { latitude: place.latitude, longitude: place.longitude },
        },
      }),
    });
  });
}

async function expandPointDetails(page: Page): Promise<void> {
  const summary = page.locator('#card-POINT_AGENCIA_CENTRO button.point-result-summary');
  await summary.click();
  await expect(summary).toHaveAttribute('aria-expanded', 'true');
}

async function assertNoLegacyCatalogRequests(requests: string[]): Promise<void> {
  expect(requests, 'the public flow must not download the legacy global catalog').toEqual([]);
}

test('el estado inicial refluye, conserva accion y no queda bajo la navegacion', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Explorar puntos en el mapa' }).click();
  await expect(page).toHaveURL(/.*\/#\/enviar\?vista=mapa$/);

  const sheetHandle = page.getByRole('button', { name: 'Cambiar altura del panel' });
  await sheetHandle.click();
  await expect(sheetHandle).toHaveAttribute('aria-expanded', 'true');

  const stateCard = page.locator('si-search-state-card');
  const surface = stateCard.locator('.search-state-surface');
  const action = stateCard.getByRole('button', { name: 'Buscar destino' });
  await expect(surface).toHaveAttribute('data-state', 'initial');
  await expect(stateCard.getByRole('heading', { name: 'Elige un destino' })).toBeVisible();
  await expect(action).toBeVisible();

  const regularLayout = await stateCard.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const button = element.querySelector('button')?.getBoundingClientRect();
    return {
      cardLeft: rect.left,
      cardRight: rect.right,
      buttonHeight: button?.height ?? 0,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  expect(regularLayout.cardLeft).toBeGreaterThanOrEqual(0);
  expect(regularLayout.cardRight).toBeLessThanOrEqual(regularLayout.viewportWidth);
  expect(regularLayout.buttonHeight).toBeGreaterThanOrEqual(44);
  expect(regularLayout.documentWidth).toBeLessThanOrEqual(regularLayout.viewportWidth);

  await page.setViewportSize({ width: 320, height: 568 });
  await action.scrollIntoViewIfNeeded();
  await expect(action).toBeVisible();

  const [compactCard, compactAction, navigation, scrollState] = await Promise.all([
    stateCard.boundingBox(),
    action.boundingBox(),
    page.getByRole('navigation', { name: 'Navegación principal' }).boundingBox(),
    page.locator('.bottom-sheet .sheet-content').evaluate(element => {
      const styles = getComputedStyle(element);
      return {
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflowY: styles.overflowY,
        documentWidth: document.documentElement.scrollWidth,
      };
    }),
  ]);
  expect(compactCard).not.toBeNull();
  expect(compactAction).not.toBeNull();
  expect(navigation).not.toBeNull();
  expect(compactCard!.x).toBeGreaterThanOrEqual(0);
  expect(compactCard!.x + compactCard!.width).toBeLessThanOrEqual(320);
  expect(compactAction!.height).toBeGreaterThanOrEqual(44);
  expect(compactAction!.y + compactAction!.height).toBeLessThanOrEqual(navigation!.y);
  expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);
  expect(scrollState.overflowY).toBe('auto');
  expect(scrollState.documentWidth).toBeLessThanOrEqual(320);

  await action.click();
  await expect(page.getByRole('dialog', { name: '¿Adónde deseas enviar?' })).toBeVisible();
});

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
      page.locator('.route-selection-result > div:first-child strong'),
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

test('un lugar de referencia abre puntos del mismo municipio con contexto y distancia durable', async ({ page }) => {
  await mockPlaceLookup(page, {
    placeId: 'place-parque-san-martin',
    name: 'Parque San Martín',
    municipality: 'Santa Tecla',
    department: 'La Libertad',
    latitude: 13.6769,
    longitude: -89.2797,
  });
  await page.goto('/#/');

  const search = page.getByRole('searchbox', { name: /Buscar municipio.*punto/i });
  await search.fill('parque san martin');
  await expect(page.getByRole('heading', { name: 'Lugares en El Salvador' })).toBeVisible();
  await page.getByRole('button', { name: /Parque San Martín.*Santa Tecla/i }).click();
  await page.getByRole('button', { name: 'Ver puntos de Santa Tecla' }).click();

  await expect(page).toHaveURL(/municipio=Santa(?:%20|\+)Tecla/);
  await expect(page).toHaveURL(/referencia=Parque(?:%20|\+)San(?:%20|\+)Mart/);
  await expect(page.getByText('Opciones cerca de Parque San Martín')).toBeVisible();
  await expect(page.getByText('Distancia aproximada en línea recta; no indica tiempo de viaje.')).toBeVisible();
  await expect(page.locator('.point-reference-distance').first()).toContainText(/en línea recta/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const primaryAction = page.getByRole('button', { name: /Elegir desde dónde enviar hacia/i }).first();
  expect((await primaryAction.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);

  const resultsUrl = page.url();
  await page.reload();
  await expect(page).toHaveURL(resultsUrl);
  await expect(page.getByText('Opciones cerca de Parque San Martín')).toBeVisible();
});

test('un lugar reconocido sin cobertura no inventa municipios alternativos', async ({ page }) => {
  await mockPlaceLookup(page, {
    placeId: 'place-parque-libertad',
    name: 'Lugar de prueba sin cobertura',
    municipality: 'Municipio Sin Cobertura',
    department: 'Departamento Sin Cobertura',
    latitude: 13.9867,
    longitude: -89.6817,
  });
  await page.goto('/#/');

  await page.getByRole('searchbox', { name: /Buscar municipio.*punto/i }).fill('lugar sin cobertura');
  await page.getByRole('button', { name: /Lugar de prueba sin cobertura.*Municipio Sin Cobertura/i }).click();

  await expect(page.getByText('No existe cobertura cercana o similar').first()).toBeVisible();
  await expect(page).toHaveURL(/.*\/#\/$/);
  await expect(page.locator('article.point-result-card')).toHaveCount(0);
});

test('un fallo del proveedor externo conserva utilizable la búsqueda del catálogo', async ({ page }) => {
  await page.route('**/api/places/autocomplete', async route => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'provider details must stay hidden' }),
    });
  });
  await page.goto('/#/');

  const search = page.getByRole('searchbox', { name: /Buscar municipio.*punto/i });
  await search.fill('lugar inexistente');
  await expect(page.getByText('No pudimos consultar lugares')).toBeVisible();
  await expect(page.getByText('provider details must stay hidden')).toHaveCount(0);

  await search.fill('san salvador');
  await page.getByRole('button', { name: /San Salvador San Salvador \d+ puntos?/i }).click();
  await expect(page.getByRole('heading', { name: /\d+ puntos? disponibles?/i })).toBeVisible();
});

test('una coincidencia local fuerte evita una consulta externa innecesaria', async ({ page }) => {
  let externalRequests = 0;
  await page.route('**/api/places/autocomplete', async route => {
    externalRequests += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"success":true,"suggestions":[]}' });
  });
  await page.goto('/#/');

  await page.getByRole('searchbox', { name: /Buscar municipio.*punto/i }).fill('san salvador');
  await expect(page.getByRole('button', { name: /San Salvador San Salvador \d+ puntos?/i })).toBeVisible();
  await page.waitForTimeout(600);

  expect(externalRequests).toBe(0);
});

test('una respuesta externa tardía no reemplaza la búsqueda vigente', async ({ page }) => {
  await page.route('**/api/places/autocomplete', async route => {
    const body = route.request().postDataJSON() as { query?: string };
    const oldQuery = body.query === 'parque antiguo';
    if (oldQuery) await new Promise(resolve => setTimeout(resolve, 650));
    const name = oldQuery ? 'Parque Antiguo' : 'Hospital Nuevo';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        suggestions: [{
          placeId: oldQuery ? 'old-place' : 'new-place',
          text: `${name}, Santa Tecla`,
          mainText: name,
          secondaryText: 'Santa Tecla, La Libertad',
        }],
      }),
    });
  });
  await page.goto('/#/');

  const search = page.getByRole('searchbox', { name: /Buscar municipio.*punto/i });
  await search.fill('parque antiguo');
  await page.waitForTimeout(380);
  await search.fill('hospital nuevo');

  await expect(page.getByRole('button', { name: /Hospital Nuevo.*Santa Tecla/i })).toBeVisible();
  await page.waitForTimeout(700);
  await expect(page.getByRole('button', { name: /Parque Antiguo.*Santa Tecla/i })).toHaveCount(0);
});

test('resultados municipales usan página completa, filtros y URL durable', async ({ page }) => {
  await page.goto('/#/enviar?municipio=San%20Salvador&departamento=San%20Salvador');

  const resultsPage = page.locator('.bottom-sheet.point-results-page');
  const cards = page.locator('article.point-result-card');
  await expect(resultsPage).toBeVisible();
  await expect(resultsPage.locator('.drag-handle')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /\d+ puntos? disponibles?/i })).toBeVisible();

  const layout = await resultsPage.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const cardsList = element.querySelector('.cards-list');
    return {
      left: rect.left,
      right: rect.right,
      width: rect.width,
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      columns: cardsList ? getComputedStyle(cardsList).gridTemplateColumns.split(' ').length : 0,
    };
  });
  expect(layout.left).toBe(0);
  expect(layout.right).toBe(layout.viewportWidth);
  expect(layout.width).toBe(layout.viewportWidth);
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.columns).toBe(layout.viewportWidth >= 768 ? 2 : 1);

  const initialCount = await cards.count();
  await expect(page.getByRole('button', { name: 'Con foto' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Más cerca' })).toHaveCount(0);
  const filterDisclosure = page.locator('.point-filter-disclosure');
  await filterDisclosure.locator('summary').click();
  await expect(filterDisclosure).toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Abierto ahora' }).click();
  await expect(page).toHaveURL(/disponibilidad=abierto.*horario=todos/);
  await expect(page.getByRole('button', { name: 'Abierto ahora' })).toHaveAttribute('aria-pressed', 'true');
  expect(await cards.count()).toBeLessThanOrEqual(initialCount);

  await page.getByRole('button', { name: 'Tarde', exact: true }).click();
  await expect(page).toHaveURL(/disponibilidad=abierto.*horario=tarde/);
  expect(page.url()).not.toContain('orden=');
  await expect(page.getByRole('button', { name: 'Tarde', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.goBack();
  await expect(page.getByRole('button', { name: 'Cualquier horario' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Abierto ahora' })).toHaveAttribute('aria-pressed', 'true');
  await page.goForward();
  await expect(page.getByRole('button', { name: 'Tarde', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await page.locator('.point-filter-disclosure summary').click();
  await expect(page.getByRole('button', { name: 'Tarde', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('resultados públicos sobreviven atrás, adelante, recarga y enlace directo', async ({ page }) => {
  await page.goto('/#/');
  await chooseSanSalvadorDestination(page);

  const resultsUrl = page.url();
  await page.goBack();
  await expect(page).toHaveURL(/.*\/#\/$/);
  await expect(page.getByRole('heading', { name: 'Envía sin complicarte.' })).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(resultsUrl);
  await expect(page.getByRole('heading', { name: /1 punto disponible/i })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(resultsUrl);
  await expect(page.getByRole('heading', { name: /1 punto disponible/i })).toBeVisible();

  await page.goto('/#/enviar?punto=POINT_AGENCIA_CENTRO&accion=preview');
  await expect(page).toHaveURL(/.*punto=POINT_AGENCIA_CENTRO&accion=preview$/);
  await expect(page.getByRole('heading', { name: /1 punto disponible/i })).toBeVisible();
  const linkedPointSummary = page.locator('#card-POINT_AGENCIA_CENTRO button.point-result-summary');
  await expect(linkedPointSummary).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#point-details-POINT_AGENCIA_CENTRO')).toBeVisible();
});

test('el recorrido público básico no emite errores de navegador ni solicitudes fallidas', async ({ page, request }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  let mapTileRequests = 0;

  await page.route('https://tile.openstreetmap.org/**', async route => {
    mapTileRequests += 1;
    await route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_MAP_TILE });
  });

  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('requestfailed', request => {
    failedRequests.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });

  const [workerResponse, sharedResponse] = await Promise.all([
    request.get('/vendor/maplibre/maplibre-gl-worker.mjs'),
    request.get('/vendor/maplibre/maplibre-gl-shared.mjs'),
  ]);
  expect(workerResponse.status()).toBe(200);
  expect(sharedResponse.status()).toBe(200);

  await page.goto('/#/');
  await chooseSanSalvadorDestination(page);
  const map = page.locator('#map');
  await expect(map).toHaveAttribute('data-map-state', 'loaded');
  await expect(map).not.toHaveAttribute('data-map-error', /.+/);
  await expect.poll(() => mapTileRequests).toBeGreaterThan(0);

  await expandPointDetails(page);
  await expect(page.locator('#point-details-POINT_AGENCIA_CENTRO')).toBeVisible();

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
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
  const resultsHeading = page.getByRole('heading', { name: /1 punto disponible/i });
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
  const collapsedToggle = page.getByRole('button', { name: 'Expandir ficha del punto' });
  await expect(collapsedToggle).toHaveAttribute('aria-expanded', 'false');
  await collapsedToggle.click();

  const detailToggle = page.getByRole('button', { name: 'Minimizar ficha del punto' });
  const bottomNav = page.getByRole('navigation', { name: 'Navegación principal' });
  await expect(detailToggle).toHaveAttribute('aria-expanded', 'true');

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
  await expect(page.getByRole('button', { name: 'Expandir ficha del punto' })).toHaveAttribute('aria-expanded', 'false');
  await expect(detailCard.getByText('Agencia Centro', { exact: true })).toBeVisible();
  await expect(detailCard.locator('.pin-card-identity p')).toHaveText('San Salvador, San Salvador');
});

test('la ruta compacta conserva recorrido y control visibles en 320 por 568', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/#/');
  await chooseSanSalvadorDestination(page);

  await expandPointDetails(page);
  await page.getByRole('button', { name: 'Ver Agencia Centro en el mapa' }).click();
  await page.getByRole('button', { name: 'Expandir ficha del punto' }).click();
  await page.getByRole('button', { name: /Usar como destino/ }).click();
  await page.getByRole('button', { name: 'Agencia Norte Santa Tecla, La Libertad' }).click();
  await expect(page.getByRole('heading', { name: '1 ruta disponible' })).toBeVisible();

  const searchPanel = page.locator('.search-panel-container');
  const resultSheet = page.locator('.bottom-sheet');
  const routeCard = page.locator('article.sivoy-route-card');
  const routePath = routeCard.locator('.route-card-path');
  const detailControl = routeCard.locator('.route-details-label');
  const [searchBox, sheetBox, cardBox, pathBox, controlBox] = await Promise.all([
    searchPanel.boundingBox(),
    resultSheet.boundingBox(),
    routeCard.boundingBox(),
    routePath.boundingBox(),
    detailControl.boundingBox(),
  ]);

  expect(searchBox).not.toBeNull();
  expect(sheetBox).not.toBeNull();
  expect(cardBox).not.toBeNull();
  expect(pathBox).not.toBeNull();
  expect(controlBox).not.toBeNull();
  expect(sheetBox!.y).toBeGreaterThanOrEqual(searchBox!.y + searchBox!.height);
  expect(cardBox!.height).toBeLessThanOrEqual(220);
  expect(pathBox!.x).toBeGreaterThanOrEqual(cardBox!.x);
  expect(controlBox!.x + controlBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width);
  await expect(routeCard.getByText('Opción 1', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

  await routeCard.getByRole('button', {
    name: 'Ver detalles de la ruta de Agencia Norte a Agencia Centro',
  }).click();
  const sheetContent = resultSheet.locator('.sheet-content');
  const mapAction = routeCard.getByRole('button', { name: 'Ver en mapa' });
  await mapAction.scrollIntoViewIfNeeded();

  const [expandedCardBox, actionBox, navBox, scrollState] = await Promise.all([
    routeCard.boundingBox(),
    mapAction.boundingBox(),
    page.getByRole('navigation', { name: 'Navegación principal' }).boundingBox(),
    sheetContent.evaluate(element => {
      const styles = getComputedStyle(element);
      return {
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        overflowY: styles.overflowY,
      };
    }),
  ]);

  expect(expandedCardBox).not.toBeNull();
  expect(expandedCardBox!.height).toBeGreaterThan(cardBox!.height);
  expect(actionBox).not.toBeNull();
  expect(navBox).not.toBeNull();
  expect(actionBox!.y + actionBox!.height).toBeLessThan(navBox!.y);
  expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);
  expect(scrollState.overflowY).toBe('auto');
  await expect(routeCard.locator('.flight-day-select')).toBeVisible();
  await expect(routeCard.locator('.route-selection-result')).toBeVisible();

  await page.setViewportSize({ width: 1024, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
});
