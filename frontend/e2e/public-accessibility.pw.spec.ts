import { expect, Locator, test } from '@playwright/test';

const interactiveSelector = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"]',
  '[role="option"]',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

async function expectVisibleControlsToHaveNames(root: Locator) {
  const controls = root.locator(interactiveSelector);

  for (let index = 0; index < await controls.count(); index += 1) {
    const control = controls.nth(index);
    if (await control.isVisible()) {
      await expect(control).toHaveAccessibleName(/\S/);
    }
  }
}

async function expandPointDetails(page: import('@playwright/test').Page): Promise<void> {
  const summary = page.locator('#card-POINT_AGENCIA_CENTRO button.point-result-summary');
  await summary.click();
  await expect(summary).toHaveAttribute('aria-expanded', 'true');
}

test('el buscador modal conserva foco, teclado y nombres accesibles', async ({ page }) => {
  await page.goto('/#/enviar');

  const trigger = page.getByRole('button', { name: 'Buscar municipio de destino' });
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: '¿Adónde deseas enviar?' });
  const destinationInput = page.getByRole('combobox', { name: 'Municipio de destino' });
  await expect(dialog).toBeVisible();
  await expect(destinationInput).toBeFocused();
  await expect(page.getByRole('option', { name: 'San Salvador San Salvador 1 punto' })).toBeVisible();
  await expectVisibleControlsToHaveNames(dialog);

  const nativeTabStops = dialog.locator(
    'button:not([disabled]):visible, a[href]:visible, input:not([disabled]):visible, select:not([disabled]):visible, textarea:not([disabled]):visible, [tabindex]:not([tabindex="-1"]):visible'
  );
  const tabStopCount = await nativeTabStops.count();
  expect(tabStopCount).toBeGreaterThan(1);

  const firstTabStop = nativeTabStops.first();
  const lastTabStop = nativeTabStops.last();
  await lastTabStop.focus();
  await page.keyboard.press('Tab');
  await expect(firstTabStop).toBeFocused();

  await firstTabStop.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(lastTabStop).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('el mapa de fondo sale del foco en lista y se reactiva al abrirlo', async ({ page }) => {
  await page.goto('/#/enviar?municipio=San%20Salvador&departamento=San%20Salvador');
  await expect(page.getByRole('heading', { name: /1 punto disponible/i })).toBeVisible();

  const mapWrapper = page.locator('.map-wrapper');
  await expect(mapWrapper).toHaveAttribute('aria-hidden', 'true');
  await expect(mapWrapper).toHaveAttribute('inert', '');

  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press('Tab');
    const focusIsInsideMap = await page.evaluate(() =>
      document.activeElement?.closest('.map-wrapper') !== null,
    );
    expect(focusIsInsideMap).toBe(false);
  }

  await expandPointDetails(page);
  await page.getByRole('button', { name: 'Ver Agencia Centro en el mapa' }).click();
  await expect(mapWrapper).toHaveAttribute('aria-hidden', 'false');
  await expect(mapWrapper).not.toHaveAttribute('inert', '');
});

test('las primitivas eliminan transiciones con movimiento reducido', async ({ page }) => {
  await page.goto('/#/enviar?municipio=San%20Salvador&departamento=San%20Salvador');
  await expect(page.getByRole('heading', { name: /1 punto disponible/i })).toBeVisible();

  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  const transitionDurations = await page.locator('.si-button:visible').first().evaluate(element =>
    getComputedStyle(element).transitionDuration.split(',').map(value => value.trim()),
  );
  expect(transitionDurations.every(duration => duration === '0s')).toBe(true);
});

test('el contenido refluye sin desbordarse al equivalente de zoom 200%', async ({ page }) => {
  // Un viewport CSS de 720 x 450 reproduce el espacio disponible al ampliar
  // una ventana de 1440 x 900 al 200%, sin depender del zoom del navegador.
  await page.setViewportSize({ width: 720, height: 450 });

  for (const route of [
    '/#/',
    '/#/enviar?municipio=San%20Salvador&departamento=San%20Salvador',
  ]) {
    await page.goto(route);
    await expect(page.locator('app-root')).toBeVisible();

    const dimensions = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));

    expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
    expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
  }

  await expect(page.getByRole('heading', { name: /1 punto disponible/i })).toBeVisible();
});
