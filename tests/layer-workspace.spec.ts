import { test, expect, type Page } from '@playwright/test';
import { createDemoGeojson } from '../src/components/layer-workspace-data';

// Dedicated regression coverage for the compact layer workspace. Guest-only and local data.
test.skip(!process.env.E2E_BASE_URL && !process.env.CI, 'needs running dev server');

test('demo parcel fixture is deterministic, closed, and contains three unique features', () => {
  const sample = createDemoGeojson();
  expect(sample).toEqual(createDemoGeojson());
  expect(sample.features).toHaveLength(3);
  expect(new Set(sample.features.map((feature) => feature.properties.NIB)).size).toBe(3);
  for (const feature of sample.features) {
    expect(feature.geometry.type).toBe('Polygon');
    expect(feature.geometry.coordinates[0][0]).toEqual(feature.geometry.coordinates[0].at(-1));
    expect(feature.properties.sumber).toMatch(/edukasi/);
  }
});

test.describe('layer workspace', () => {
  test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });

  test.beforeEach(async ({ page }) => {
    await page.route('**/*.supabase.co/**', async (route) => {
      const request = route.request();
      // Empty fixtures isolate this suite from real user data, including cloud reads.
      if (request.method() !== 'GET' && request.method() !== 'OPTIONS') {
        await route.abort();
        throw new Error(`Unexpected cloud mutation: ${request.method()} ${new URL(request.url()).pathname}`);
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.addInitScript(() => localStorage.setItem('sakagis-overview-dismissed', '1'));
  });

  async function enterGuest(page: Page) {
    await page.goto('/');
    await page.getByRole('button', { name: 'Guest', exact: true }).click();
    await page.getByText('Saya bersaksi telah membaca').click();
    await page.getByRole('button', { name: 'Mulai Sesi (5 Menit)' }).click();
    await expect(page.getByText('Syarat Masuk Guest')).toBeHidden();
    await expect(page.locator('.leaflet-container').first()).toBeVisible();
  }

  async function openData(page: Page) {
    const data = page.viewportSize()!.width < 1024
      ? page.getByRole('button', { name: 'Buka menu dataset' })
      : page.getByRole('button', { name: 'Data dan Layer', exact: true });
    if (await page.locator('#workspace-panel').getAttribute('data-open') !== 'true') await data.click();
    await expect(page.locator('#workspace-panel')).toHaveAttribute('data-open', 'true');
  }

  async function addDemoLayer(page: Page) {
    await expect(page.getByRole('button', { name: 'Muat contoh data', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Muat contoh data', exact: true }).click();
    await expect(page.getByTestId('layer-selection-button').filter({ hasText: 'Contoh bidang (demo)' })).toBeVisible();
    await expect(page.getByTestId('layer-selection-button')).toContainText('3 fitur');
  }

  test('selects a layer by keyboard without nesting interactive controls', async ({ page }) => {
    await enterGuest(page);
    await openData(page);
    await addDemoLayer(page);

    const selection = page.getByTestId('layer-selection-button').filter({ hasText: 'Contoh bidang (demo)' });
    await expect(selection.locator('[role="button"]')).toHaveCount(0);
    await selection.focus();
    await page.keyboard.press('Enter');
    await expect(selection).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('layer-context-actions')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom layer Contoh bidang (demo)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Buka tabel atribut Contoh bidang (demo)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mulai digitasi Contoh bidang (demo)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Buka analisis Contoh bidang (demo)' })).toBeVisible();
  });

  test('keeps advanced style, visibility, export, and delete actions reachable', async ({ page }) => {
    await enterGuest(page);
    await openData(page);
    await addDemoLayer(page);

    const selection = page.getByTestId('layer-selection-button').filter({ hasText: 'Contoh bidang (demo)' });
    await selection.click();
    await page.getByRole('button', { name: 'Lainnya untuk Contoh bidang (demo)' }).click();
    const menu = page.getByTestId('layer-more-menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByLabel('Warna layer')).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Ekspor layer Contoh bidang (demo)' })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Naikkan urutan layer' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sembunyikan layer Contoh bidang (demo)' })).toBeVisible();
    await menu.getByLabel('Opasitas isi', { exact: true }).focus();
    await page.keyboard.press('Home');
    await expect(menu.getByLabel('Opasitas isi', { exact: true })).toHaveValue('0');
    const downloadPromise = page.waitForEvent('download');
    await menu.getByRole('button', { name: 'Ekspor layer Contoh bidang (demo)' }).click();
    expect((await downloadPromise).suggestedFilename()).toBe('Contoh_bidang_demo_.geojson');
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.getByRole('button', { name: 'Lainnya untuk Contoh bidang (demo)' })).toBeFocused();
    await page.getByRole('button', { name: 'Sembunyikan layer Contoh bidang (demo)' }).click();
    await expect(page.getByRole('button', { name: 'Tampilkan layer Contoh bidang (demo)' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('searches, favorites, persists, and receives a focused analysis event', async ({ page }) => {
    await enterGuest(page);
    await openData(page);
    await addDemoLayer(page);
    await page.getByTestId('layer-selection-button').filter({ hasText: 'Contoh bidang (demo)' }).click();
    await page.getByRole('button', { name: 'Buka analisis Contoh bidang (demo)' }).click();

    await expect(page.getByText('Favorit')).toBeVisible();
    await expect(page.getByText('Terakhir dipakai')).toBeVisible();
    const search = page.getByPlaceholder('Cari tool analisis...');
    await expect(page.locator('.layer-workspace-analysis-card')).toHaveCount(12);
    await search.fill('Spatial Join');
    await expect(page.getByTestId('analysis-tool-join')).toBeVisible();
    await page.getByRole('button', { name: 'Tambah Spatial Join ke favorit' }).click();
    await expect(page.getByRole('button', { name: 'Hapus Spatial Join dari favorit' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sakagis-layer-analysis-favorites-v1'))).toContain('join');

    // One layer cannot launch Join and must not pollute recent history.
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('sakagis:run-analysis', { detail: { toolKey: 'join' } })));
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('sakagis-layer-analysis-recent-v1'))).toBeNull();
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('sakagis:run-analysis', { detail: { toolKey: 'buffer' } })));
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button',{name:'Jalankan Buffer'})).toBeEnabled();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sakagis-layer-analysis-recent-v1'))).toContain('buffer');
    await page.keyboard.press('Escape');
    await enterGuest(page);
    await page.getByRole('button', { name: 'Analisis Spasial', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Hapus Spatial Join dari favorit' })).toBeVisible();
    await expect(page.locator('.layer-workspace-shortcuts').getByRole('button', { name: 'Buffer', exact: true })).toBeVisible();
  });

  test('offers useful local empty actions and stays inside the mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await enterGuest(page);
    await openData(page);
    await expect(page.getByRole('button', { name: 'Impor data' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Buka digitasi' })).toBeVisible();
    await addDemoLayer(page);

    const panel = page.locator('#workspace-panel');
    await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
    const row = page.getByTestId('layer-selection-button').filter({ hasText: 'Contoh bidang (demo)' });
    const box = await row.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(391);
    expect(await panel.evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(await panel.evaluate((element) => element.clientWidth + 1));
  });
});
