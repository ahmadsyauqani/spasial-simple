import { test, expect, type Page } from '@playwright/test';
import {
  ATTRIBUTE_TABLE_OVERSCAN,
  ATTRIBUTE_TABLE_ROW_HEIGHT,
  getVirtualWindow,
  indexAndFilterFeatures,
} from '@/components/attributeTableVirtualization';

function makeFeatures(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    type: 'Feature',
    properties: { code: `R-${index}`, parity: index % 2 ? 'odd' : 'even', db_id: `synthetic-not-a-cloud-id-${index}` },
    geometry: null,
  }));
}

test.describe('attribute table windowing helpers', () => {
  test('keeps a 10k row window bounded and uses original indices', () => {
    const features = makeFeatures(10_000);
    const window = getVirtualWindow(features.length, 0, 320);

    expect(window.startIndex).toBe(0);
    expect(window.endIndex - window.startIndex).toBeLessThanOrEqual(
      Math.ceil(320 / ATTRIBUTE_TABLE_ROW_HEIGHT) + ATTRIBUTE_TABLE_OVERSCAN * 2,
    );
    expect(window.bottomSpacerHeight).toBeGreaterThan(9_000 * ATTRIBUTE_TABLE_ROW_HEIGHT);

    const filtered = indexAndFilterFeatures(features, 'R-9999');
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.originalIndex).toBe(9_999);
    expect(filtered[0]?.feature.properties?.code).toBe('R-9999');
  });

  test('anchors a scrolled window to the same source row after filtering', () => {
    const features = makeFeatures(10_000);
    const filtered = indexAndFilterFeatures(features, 'odd');
    const window = getVirtualWindow(filtered.length, 4_000 * ATTRIBUTE_TABLE_ROW_HEIGHT, 320);
    const visible = filtered.slice(window.startIndex, window.endIndex);

    expect(visible[0].originalIndex).toBeGreaterThanOrEqual(1);
    expect(visible.every(({ originalIndex }) => originalIndex % 2 === 1)).toBe(true);
    expect(filtered[4_000].originalIndex).toBe(8_001);
  });
});

async function enterGuest(page: Page) {
  await page.route('**/*.supabase.co/**', route => route.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await page.addInitScript(() => localStorage.setItem('sakagis-overview-dismissed', '1'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByText('Saya bersaksi telah membaca').click();
  await page.getByRole('button', { name: 'Mulai Sesi (5 Menit)' }).click();
}

test('10k uploaded fixture renders bounded rows and edits the filtered source feature', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', request => { if (request.url().includes('.supabase.co') && ['POST','PATCH','DELETE'].includes(request.method())) writes.push(request.url()); });
  await enterGuest(page);
  await expect(page.locator('.map-instrument-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Data dan Layer', exact: true }).click();

  const fixture = {
    type: 'FeatureCollection',
    features: makeFeatures(10_000),
  };
  await page.locator('input[type="file"]').setInputFiles({
    name: 'attribute-table-virtual-fixture.geojson',
    mimeType: 'application/geo+json',
    buffer: Buffer.from(JSON.stringify(fixture)),
  });

  const wizard = page.getByRole('dialog', { name: 'Upload Data Wizard' });
  await expect(wizard).toContainText('10.000');
  await wizard.getByRole('button', { name: 'Lanjut' }).click();
  await wizard.getByRole('button', { name: 'Lanjut' }).click();
  await wizard.getByRole('button', { name: 'Simpan Layer' }).click();
  await expect(wizard).not.toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Tabel Atribut', exact: true }).click();
  const tableWindow = page.locator('.attribute-table-window');
  await expect(tableWindow).toBeVisible();
  await expect(tableWindow.getByText('10.000 fitur')).toBeVisible();

  const rows = tableWindow.locator('tbody tr');
  expect(await rows.count()).toBeLessThan(40);

  const search = tableWindow.getByPlaceholder('Cari data...');
  await search.fill('R-9999');
  const targetRow = tableWindow.locator('tbody tr').filter({ hasText: 'R-9999' });
  await expect(targetRow).toHaveCount(1);
  await expect(targetRow).toContainText('10000');

  await targetRow.getByText('R-9999', { exact: true }).dblclick();
  const input = tableWindow.locator('tbody input[type="text"]');
  await input.fill('edited-9999');
  await input.press('Enter');
  await search.fill('edited-9999');
  await expect(tableWindow.locator('tbody tr').filter({hasText:'edited-9999'})).toContainText('10000');

  await search.fill('R-0');
  await expect(tableWindow.locator('tbody tr').filter({ hasText: 'edited-9999' })).toHaveCount(0);
  expect(writes).toEqual([]);
});
