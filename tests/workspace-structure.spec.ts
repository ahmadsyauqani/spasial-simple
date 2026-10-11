import { test, expect, type Page } from '@playwright/test';

// Workspace structure: explicit navigation, contextual layer actions, uniform analysis flow.
test.skip(!process.env.E2E_BASE_URL && !process.env.CI, 'needs running dev server');

async function enterGuest(page: Page) {
  await page.route('**/*.supabase.co/**', route => route.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await page.addInitScript(() => localStorage.setItem('sakagis-overview-dismissed', '1'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByText('Saya bersaksi telah membaca').click();
  await page.getByRole('button', { name: 'Mulai Sesi (5 Menit)' }).click();
  await expect(page.locator('.leaflet-container').first()).toBeVisible();
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('panel never opens on hover; click toggles; one panel at a time', async ({ page }) => {
    await enterGuest(page);
    const panel = page.locator('#workspace-panel');
    const rail = page.locator('.desktop-tool-rail');
    await expect(page.locator('.studio-pointer-bridge')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Pin Panel|Lepas Pin/ })).toHaveCount(0);

    // Hovering the rail must not reveal the panel.
    await rail.hover();
    await page.waitForTimeout(500);
    await expect(panel).toHaveAttribute('data-open', 'false');

    // Click opens, same click closes.
    const data = page.getByRole('button', { name: 'Data dan Layer', exact: true });
    await data.click();
    await expect(panel).toHaveAttribute('data-open', 'true');
    await expect(data).toHaveAttribute('aria-expanded', 'true');
    await data.click();
    await expect(panel).toHaveAttribute('data-open', 'false');

    // Switching tools swaps content in the same panel (no stacking).
    await data.click();
    await page.getByRole('button', { name: 'Analisis Spasial', exact: true }).click();
    await expect(panel).toHaveAttribute('data-open', 'true');
    await expect(page.locator('.workspace-panel')).toHaveCount(1);
    await expect(panel.getByText('Pilih data')).toBeVisible();
    await page.screenshot({ path: 'test-results/ws-analysis-flow.png' });

    // Moving the mouse away must not close it.
    await page.mouse.move(1200, 600);
    await page.waitForTimeout(500);
    await expect(panel).toHaveAttribute('data-open', 'true');
  });

  test('selecting a layer reveals contextual actions and prefills analysis', async ({ page }) => {
    await enterGuest(page);
    await page.getByRole('button', { name: 'Data dan Layer', exact: true }).click();
    // Seed one layer through the upload wizard when the guest workspace is empty.
    if ((await page.locator('[data-selected]').count()) === 0) {
      const geojson = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { NIB: 'T1' }, geometry: { type: 'Polygon', coordinates: [[[112.95, -7.94], [112.9504, -7.94], [112.9504, -7.9396], [112.95, -7.9396], [112.95, -7.94]]] } }] };
      await page.locator('input[type=file][accept*=".geojson"]').first().setInputFiles({ name: 'bidang_uji.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(JSON.stringify(geojson)) });
      const wizard = page.getByRole('dialog').filter({ hasText: 'Upload Data Wizard' });
      await expect(wizard.getByRole('button', { name: 'Lanjut' })).toBeEnabled();
      await wizard.getByRole('button', { name: 'Lanjut' }).click();
      await wizard.getByRole('button', { name: 'Lanjut' }).click();
      await wizard.getByRole('button', { name: 'Simpan Layer' }).click();
      await expect.poll(async () => (await wizard.count()) === 0 || (await wizard.getByText('Proses selesai').count()) > 0, { timeout: 20000 }).toBe(true);
      if (await wizard.count()) await page.keyboard.press('Escape');
      await page.waitForTimeout(800);
    }
    const cards = page.locator('[data-selected]');
    await expect(cards.first()).toBeVisible();
    const first = cards.first();
    const firstName = (await first.locator('.layer-card-main').innerText()).split(/\s{2,}|[\r\n]+/).map(t => t.trim()).filter(Boolean)[0];
    await first.click();
    await expect(first).toHaveAttribute('data-selected', 'true');
    const actions = page.getByTestId('layer-context-actions');
    await expect(actions).toBeVisible();
    await expect(actions.getByRole('button', { name: /tabel atribut/i })).toBeVisible();
    await page.screenshot({ path: 'test-results/ws-layer-context.png' });

    // "Analisis" jumps to the analysis view with the layer in focus.
    await actions.getByRole('button', { name: /Buka analisis/ }).click();
    await expect(page.getByTestId('analysis-focus')).toHaveClass(/is-set/);
    await expect(page.getByTestId('analysis-focus')).toContainText(firstName.slice(0, 12));

    // Opening a tool pre-selects that layer.
    await page.getByTitle('Validasi Topologi').click();
    const dlg = page.getByRole('dialog');
    const selected = await dlg.locator('select').first().inputValue();
    expect(selected).not.toBe('');
    const label = await dlg.locator('select').first().locator('option:checked').innerText();
    expect(label).toContain(firstName.slice(0, 12));
    await page.screenshot({ path: 'test-results/ws-analysis-prefill.png' });

    // Clicking a parcel gives a spatial selection cue; blank map clears it.
    await page.keyboard.press('Escape');
    await page.getByTitle('Tutup Panel',{exact:true}).click();
    const parcel = page.locator('path[data-feature-id="T1"]');
    await expect(parcel).toBeVisible();
    await parcel.click();
    await expect(parcel).toHaveClass(/parcel-selected/);
    await page.locator('.leaflet-container').click({ position: { x: 90, y: 180 } });
    await expect(parcel).not.toHaveClass(/parcel-selected/);
  });
});

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('bottom nav toggles a single sheet', async ({ page }) => {
    await enterGuest(page);
    const panel = page.locator('#workspace-panel');
    const btn = page.getByRole('button', { name: 'Buka menu dataset' });
    await btn.click();
    await expect(panel).toHaveAttribute('data-open', 'true');
    await btn.click();
    await expect(panel).toHaveAttribute('data-open', 'false');
    await page.screenshot({ path: 'test-results/ws-mobile.png' });
  });
});
