import { expect, test } from '@playwright/test';

test.describe('Admin Route Boundary & Legacy Redirection', () => {
  test('acceso directo a /admin carga AdminPageComponent en modo list-first con puntos de fixture y sin canvas WebGL inicial', async ({ page }) => {
    await page.goto('/#/admin');

    await expect(page).toHaveURL(/.*\/#\/admin$/);
    const tabContent = page.locator('.admin-tab-content');
    await expect(tabContent).toBeVisible();
    await expect(page.locator('.app-container.mobile-first-layout')).not.toBeAttached();

    // Layout de contenedor: padding lateral y superior de 20px, y espacio inferior de 80px para navegación persistente
    await expect(tabContent).toHaveCSS('padding-left', '20px');
    await expect(tabContent).toHaveCSS('padding-right', '20px');
    await expect(tabContent).toHaveCSS('padding-top', '20px');
    await expect(tabContent).toHaveCSS('padding-bottom', '80px');

    const headerTitle = page.getByRole('heading', { name: 'Panel de Administración' });
    await expect(headerTitle).toBeVisible();
    const headerBox = await headerTitle.boundingBox();
    expect(headerBox?.x).toBeGreaterThanOrEqual(20);

    // List-first: el mapa WebGL no debe inicializarse en el arranque inicial
    await expect(page.locator('#admin-map')).not.toHaveClass(/is-active/);
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.locator('#admin-map canvas')).toHaveCount(0);

    // Lista real de puntos provista por la fixture API
    await expect(page.getByRole('heading', { name: 'Agencia Centro' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Agencia Norte' })).toBeVisible();

    // Pestaña de navegación Panel activa
    const panelTab = page.getByRole('link', { name: 'Panel' });
    await expect(panelTab).toHaveClass(/active/);
  });

  test('redirección legacy /enviar?tab=puntos redirige a /admin y no atrapa el historial al presionar Atrás', async ({ page }) => {
    // 1. Iniciar en la raíz pública (Discovery)
    await page.goto('/#/');
    await expect(page.getByRole('heading', { name: 'Envía sin complicarte.' })).toBeVisible();

    // 2. Navegar a la URL legada
    await page.goto('/#/enviar?tab=puntos');

    // 3. Debe redirigir automáticamente a /admin
    await expect(page).toHaveURL(/.*\/#\/admin$/);
    await expect(page.locator('.admin-page-container')).toBeVisible();
    await expect(page.locator('.app-container.mobile-first-layout')).not.toBeAttached();
    await expect(page.getByRole('heading', { name: 'Agencia Centro' })).toBeVisible();

    // 4. Presionar "Atrás" en el navegador debe regresar a la pantalla previa sin bucle
    await page.goBack();

    await expect(page).toHaveURL(/.*\/#\/$/);
    await expect(page.getByRole('heading', { name: 'Envía sin complicarte.' })).toBeVisible();
    await expect(page.locator('.admin-page-container')).not.toBeAttached();
  });

  test('/enviar sin parámetros carga MobileAppComponent', async ({ page }) => {
    await page.goto('/#/enviar');

    await expect(page).toHaveURL(/.*\/#\/enviar$/);
    await expect(page.locator('.app-container.mobile-first-layout')).toBeVisible();
    await expect(page.locator('.admin-page-container')).not.toBeAttached();
    await expect(page.getByRole('button', { name: 'Buscar municipio de destino' })).toBeVisible();
  });

  test('/enviar?tab=perfil carga MobileAppComponent con pestaña de perfil activa', async ({ page }) => {
    await page.goto('/#/enviar?tab=perfil');

    await expect(page).toHaveURL(/.*\/#\/enviar\?tab=perfil$/);
    await expect(page.locator('.app-container.mobile-first-layout')).toBeVisible();
    await expect(page.locator('.admin-page-container')).not.toBeAttached();
    await expect(page.locator('app-perfil')).toBeAttached();

    const perfilTab = page.getByRole('link', { name: 'Perfil' });
    await expect(perfilTab).toHaveClass(/active/);
  });

  test('/enviar?buscar=destino carga MobileAppComponent y abre el selector de destino sin redirigir a /admin', async ({ page }) => {
    await page.goto('/#/enviar?buscar=destino');

    await expect(page).toHaveURL(/.*\/#\/enviar\?buscar=destino$/);
    await expect(page.locator('.app-container.mobile-first-layout')).toBeVisible();
    await expect(page.locator('.admin-page-container')).not.toBeAttached();

    // MobileAppComponent procesa el intent de búsqueda de destino abriendo el diálogo modal
    await expect(page.getByRole('dialog', { name: '¿Adónde deseas enviar?' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Municipio de destino' })).toBeVisible();
  });
});
