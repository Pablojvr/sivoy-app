import { expect, test } from '@playwright/test';

test('destino, compartir, origen y ruta permanecen operativos', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (payload: ShareData) => {
        (window as Window & { __sharedPayload?: ShareData }).__sharedPayload = payload;
      }
    });
  });

  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: 'Envía sin complicarte.' })).toBeVisible();

  await page.getByRole('button', { name: 'Buscar destino' }).click();
  await page.getByRole('option', { name: 'San Salvador San Salvador 1 punto' }).click();
  await expect(page.getByRole('heading', { name: '1 Resultado en San Salvador' })).toBeVisible();

  await page.getByRole('button', { name: 'Compartir Agencia Centro' }).click();
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { __sharedPayload?: ShareData }).__sharedPayload
  )).toMatchObject({
    title: 'Agencia Centro',
    text: expect.stringContaining('Empresa de prueba'),
    url: expect.stringContaining('google.com/maps')
  });

  await page.getByRole('button', { name: 'Elegir desde dónde enviar hacia este punto' }).click();
  await expect(page.getByRole('heading', { name: '¿Desde dónde enviarás?' })).toBeVisible();
  await page.getByRole('button', { name: 'Agencia Norte Santa Tecla, La Libertad' }).click();

  await expect(page.getByRole('heading', { name: '1 ruta disponible' })).toBeVisible();
  await page.getByRole('button', { name: 'Ver detalles de la ruta de Agencia Norte a Agencia Centro' }).click();
  await expect(page.getByText('Día para entregar en origen')).toBeVisible();
  await expect(page.getByText('Horario de prueba').first()).toBeVisible();

  await expect(page).toHaveScreenshot('public-route.png', {
    animations: 'disabled',
    caret: 'hide',
    mask: [
      page.locator('.route-card-eta strong'),
      page.locator('.route-date-selector select'),
      page.locator('.route-data-grid > div:first-child strong')
    ],
    maskColor: '#d9dde3',
    maxDiffPixelRatio: 0.02
  });
});

test('buscar y compartir siguen disponibles sin WebGL2', async ({ page }) => {
  await page.addInitScript(() => {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;

    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value(contextId: string, ...args: unknown[]) {
        if (contextId === 'webgl2') {
          return null;
        }

        return Reflect.apply(originalGetContext, this, [contextId, ...args]);
      }
    });

    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (payload: ShareData) => {
        (window as Window & { __sharedPayload?: ShareData }).__sharedPayload = payload;
      }
    });
  });

  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: 'Envía sin complicarte.' })).toBeVisible();

  const mapFallback = page.getByRole('status').filter({ hasText: 'Mapa no disponible' });
  await page.getByRole('button', { name: 'Buscar destino' }).click();
  await page.getByRole('option', { name: 'San Salvador San Salvador 1 punto' }).click();

  const resultsHeading = page.getByRole('heading', { name: '1 Resultado en San Salvador' });
  await expect(resultsHeading).toBeVisible();
  await expect(mapFallback).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await expect(mapFallback).toBeHidden();

  await page.getByRole('button', { name: 'Ver Agencia Centro en el mapa' }).click();
  await expect(mapFallback).toBeVisible();
  await expect(resultsHeading).toBeVisible();

  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await page.getByRole('button', { name: 'Compartir Agencia Centro' }).click();
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { __sharedPayload?: ShareData }).__sharedPayload
  )).toMatchObject({
    title: 'Agencia Centro',
    text: expect.stringContaining('Empresa de prueba'),
    url: expect.stringContaining('google.com/maps')
  });
});
