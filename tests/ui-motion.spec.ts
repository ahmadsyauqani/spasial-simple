import { test, expect, type Page } from '@playwright/test';

async function enterGuest(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByText('Saya bersaksi telah membaca').click();
  await page.getByRole('button', { name: 'Mulai Sesi (5 Menit)' }).click();
  await expect(page.locator('.leaflet-container').first()).toBeVisible();
}

for (const mobile of [false, true]) {
  test.describe(mobile ? 'mobile' : 'desktop', () => {
    test.use({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
    test('workspace reveals only on intent and keeps hidden controls out of keyboard navigation', async ({ page }, testInfo) => {
      await enterGuest(page);
      await page.screenshot({ path: testInfo.outputPath('workspace-before.png') });
      const panel = page.locator('.workspace-panel');
      await expect(panel).toHaveAttribute('inert', '');
      const trigger = page.getByRole('button', { name: mobile ? 'Buka menu dataset' : 'Data dan Layer', exact: true });
      await trigger.focus();
      await page.keyboard.press('Enter');
      await expect(panel).not.toHaveAttribute('inert', '');
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await expect(panel).toHaveCSS('transition-property', 'opacity, transform, visibility');
      await page.getByRole('button', { name: 'Tutup Panel', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(panel).toHaveAttribute('inert', '');
      await expect(trigger).toBeFocused();
      await expect(trigger).toHaveCSS('outline-style', 'solid');
      await page.screenshot({ path: testInfo.outputPath('workspace.png') });
    });
    test('spatial branding and accessible basemap picker preserve the map', async ({ page }, testInfo) => {
      await enterGuest(page);
      const logo = page.locator('.desktop-tool-rail img[alt="SAKAGIS"]');
      await expect(logo).toHaveAttribute('src', '/sakagis-mark.svg');
      const picker = page.getByRole('button', { name: 'Pilih peta dasar', exact: true });
      await picker.click();
      await expect(picker).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('region', { name: 'Ringkasan workspace' })).not.toBeVisible({ timeout: 500 });
      const gallery = page.getByRole('region', { name: 'Peta dasar' });
      await expect(gallery).toBeVisible();
      await expect(gallery.locator('button[aria-pressed="true"]')).toHaveCount(1);
      await page.screenshot({ path: testInfo.outputPath('basemap-gallery.png') });
      const choice = gallery.locator('button[aria-pressed="false"]').first();
      const name = await choice.locator('strong').innerText();
      await choice.click();
      await expect(gallery).not.toBeVisible();
      await picker.click();
      await expect(gallery.locator('button[aria-pressed="true"] strong')).toHaveText(name);
      await gallery.locator('button').first().focus();
      await page.keyboard.press('Escape');
      await expect(gallery).not.toBeVisible();
      await expect(picker).toBeFocused();
      await expect(page.locator('.leaflet-control-attribution')).toBeVisible();
      await expect(page.locator('.leaflet-container').first()).toHaveCSS('filter', 'none');
    });

    test('reduced motion removes interface movement while tools and dialogs remain usable', async ({ page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await enterGuest(page);
      const trigger = page.getByRole('button', { name: mobile ? 'Buka menu dataset' : 'Data dan Layer', exact: true });
      await trigger.focus();
      await page.keyboard.press('Enter');
      const panel = page.locator('.workspace-panel');
      await expect(panel).toHaveCSS('transition-duration', '0s');
      await page.getByRole('button', { name: 'Tutup Panel', exact: true }).focus();
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      await expect(panel).toHaveAttribute('inert', '');
      await expect(page.getByRole('button', { name: 'Buka explorer 3D', exact: true })).toBeVisible();
      await expect(page.locator('.studio-overview-fab')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.studio-overview-fab')).toHaveCSS('animation-name', 'none');
      await page.keyboard.press('Control+k');
      const dialog = page.locator('[data-slot="dialog-content"]');
      await expect(dialog).toBeVisible();
      await expect(dialog).toHaveCSS('animation-name', 'none');
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('reduced-motion.png') });
    });

    test('idle decorations stay quiet and tool icons provide bounded feedback', async ({ page }, testInfo) => {
      await enterGuest(page);
      const dot = page.locator('.studio-status-dot');
      await expect(dot).toHaveCSS('animation-name', 'none');
      const trigger = page.getByRole('button', { name: mobile ? 'Buka menu dataset' : 'Data dan Layer', exact: true });
      await expect(trigger.locator('svg')).toHaveCSS('transition-property', 'transform');
      await trigger.click();
      await expect(page.locator('.workspace-panel')).toHaveCSS('transition-duration', '0.24s');
      await page.screenshot({ path: testInfo.outputPath('dataset-panel.png') });
      await page.getByRole('button', { name: 'Tutup Panel', exact: true }).click();
      await expect(page.locator('.studio-overview-fab')).toBeVisible({ timeout: 10000 });
      const box = await page.locator('.studio-overview-fab').boundingBox();
      expect(box!.height).toBeLessThanOrEqual(48);
      const dock = page.locator('.map-instrument-bar');
      await expect(dock).toBeVisible();
      const zoomBox = await page.locator('.leaflet-control-zoom').boundingBox();
      const dockBox = await dock.boundingBox();
      const actionsBox = await page.locator('.map-action-controls').boundingBox();
      const intersects = (a: NonNullable<typeof dockBox>, b: NonNullable<typeof dockBox>) =>
        a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      expect(intersects(dockBox!, zoomBox!)).toBe(false);
      expect(intersects(dockBox!, actionsBox!)).toBe(false);
      await page.screenshot({ path: testInfo.outputPath('map-resting.png') });
    });
  });
}
