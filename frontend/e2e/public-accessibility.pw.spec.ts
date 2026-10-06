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
