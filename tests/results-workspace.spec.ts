import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Results-workspace acceptance coverage. The fixtures are intentionally tiny and
 * named so these tests never depend on production data or a cloud workspace.
 */
test.skip(!process.env.E2E_BASE_URL && !process.env.CI, 'needs the integrated workspace and optional local python service');
test.use({ viewport: { width: 1440, height: 900 } });

type GeoJson = { type: 'FeatureCollection'; features: any[] };
const square = (x: number, y: number, size = 0.0004) => [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]];
const bufferFixture: GeoJson = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { NIB: 'RESULTS-BUFFER-001' }, geometry: { type: 'Polygon', coordinates: square(112.95, -7.94) } }],
};
const validationFixture: GeoJson = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { NIB: 'RESULTS-INVALID-001' }, geometry: { type: 'Polygon', coordinates: [[[112.95, -7.94], [112.951, -7.94], [112.9505, -7.9395], [112.951, -7.939], [112.95, -7.939], [112.9505, -7.9395], [112.95, -7.94]]] } }],
};

const outputDir = path.resolve('artifacts/results-workspace');
fs.mkdirSync(outputDir, { recursive: true });

async function enterGuest(page: Page) {
  await page.route('**/*.supabase.co/**', route => route.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await page.addInitScript(() => localStorage.setItem('sakagis-overview-dismissed', '1'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByText('Saya bersaksi telah membaca').click();
  await page.getByRole('button', { name: 'Mulai Sesi (5 Menit)' }).click();
  await expect(page.locator('.leaflet-container').first()).toBeVisible();
}

async function uploadFixture(page: Page, name: string, geojson: GeoJson) {
  await page.getByRole('button', { name: 'Data dan Layer', exact: true }).click();
  const input = page.locator('input[type=file][accept*=".geojson"]').first();
  await input.setInputFiles({ name, mimeType: 'application/geo+json', buffer: Buffer.from(JSON.stringify(geojson)) });
  const wizard = page.getByRole('dialog').filter({ hasText: 'Upload Data Wizard' });
  await expect(wizard.getByRole('button', { name: 'Lanjut' })).toBeEnabled();
  await wizard.getByRole('button', { name: 'Lanjut' }).click();
  await wizard.getByRole('button', { name: 'Lanjut' }).click();
  await wizard.getByRole('button', { name: 'Simpan Layer' }).click();
  await expect.poll(async () => (await wizard.count()) === 0 || (await wizard.getByText('Proses selesai').count()) > 0, { timeout: 20_000 }).toBe(true);
  if (await wizard.count()) await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}

async function openResults(page: Page) {
  const trigger = page.getByRole('button', { name: /Hasil analisis/i }).first();
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByRole('complementary', { name: /hasil/i })).toBeVisible();
}

test('buffer result -> preview -> discard/save locally -> session history', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', request => { if (request.url().includes('.supabase.co') && ['POST','PATCH','DELETE'].includes(request.method())) writes.push(request.url()); });
  await enterGuest(page);
  await uploadFixture(page, 'fixture-results-buffer.geojson', bufferFixture);
  await page.getByRole('button', { name: 'Analisis Spasial', exact: true }).click();
  await page.getByTitle('Buffer Analysis').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', {name:'fixture-results-buffer.geojson',exact:true}).click();
  await dialog.getByRole('button', { name: /Jalankan Buffer/ }).click();
  await expect(dialog).toBeHidden();

  await openResults(page);
  const drawer = page.getByRole('complementary', { name: /hasil/i });
  await expect(drawer).toContainText('Buffer');
  await drawer.getByRole('button', {name: /^Buffer/}).click();
  await drawer.getByRole('button', { name: /Pratinjau|Preview/ }).click();
  await expect(page.locator('.analysis-preview-controls')).toBeVisible();
  await expect(drawer).toHaveCount(0);
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(2);
  await page.screenshot({path:'artifacts/ux-desktop-preview.png'});
  await page.locator('.analysis-preview-controls').getByRole('button', { name: 'Buang', exact:true }).click();
  await expect(page.locator('.analysis-preview-controls')).toHaveCount(0);

  await openResults(page);
  await drawer.getByRole('button', { name: /Simpan.*layer|Simpan lokal/ }).click();
  await page.getByRole('button',{name:'Data dan Layer',exact:true}).click();
  await expect(page.getByTestId('layer-selection-button').filter({hasText:'Buffer (hasil)'})).toBeVisible();
  expect(writes).toEqual([]);
  const saved = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve,reject) => { const request=indexedDB.open('SAKAGIS_DB'); request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error); });
    return await new Promise<any[]>((resolve,reject) => {const request=db.transaction('layers').objectStore('layers').getAll(); request.onsuccess=()=>{db.close();resolve(request.result)};request.onerror=()=>reject(request.error);});
  });
  expect(saved.some(layer=>layer.id.startsWith('local-') && layer.name==='Buffer (hasil)' && layer.geojson.features.length===1)).toBe(true);
  await page.getByRole('button',{name:/Hasil analisis/}).click();
  await expect(drawer).toContainText('Buffer');
  await drawer.getByRole('button',{name:'Jalankan ulang'}).click();
  await expect(page.getByRole('dialog')).toContainText('Buffer Analysis');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: path.join(outputDir, 'buffer-history.png') });
});

test('validation report is retained as a readable history result', async ({ page }) => {
  await enterGuest(page);
  await uploadFixture(page, 'fixture-results-validation.geojson', validationFixture);
  await page.getByRole('button', { name: 'Analisis Spasial', exact: true }).click();
  await page.getByTitle('Validasi Topologi').click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('select').first().selectOption({ index: 1 });
  await dialog.getByRole('button', { name: /Jalankan Validasi/ }).click();
  await expect(dialog).toContainText(/1 temuan ditemukan/, { timeout: 20_000 });
  await page.keyboard.press('Escape');
  await openResults(page);
  await expect(page.getByRole('complementary', { name: /hasil/i })).toContainText(/Validasi Topologi|report/i);
  await page.screenshot({ path: path.join(outputDir, 'validation-report-history.png') });
});

for (const fixture of [
  { name: 'server-success', status: 'done' as const, expected: /selesai|completed/i },
  { name: 'server-error', status: 'error' as const, expected: /gagal|error/i },
]) {
  test(`server ${fixture.name} fixture publishes history status`, async ({ page }) => {
    let polls = 0;
    await page.route('**/topology/autofix', async route => {
      await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ job_id: `fixture-${fixture.name}` }) });
    });
    await page.route(`**/jobs/fixture-${fixture.name}`, async route => {
      polls += 1;
      const body = fixture.status === 'done'
        ? { status: 'done', progress: 100, message: 'Selesai', result: { geojson: { type: 'FeatureCollection', features: [] }, report: { fixture: fixture.name } } }
        : { status: 'error', progress: 100, message: 'Gagal', error: 'fixture server failure' };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(polls === 1 && fixture.status === 'done' ? { status: 'running', progress: 35, message: 'Fixture running' } : body) });
    });
    await enterGuest(page);
    await uploadFixture(page, `fixture-${fixture.name}.geojson`, bufferFixture);
    await page.getByRole('button', { name: 'Analisis Spasial', exact: true }).click();
    await page.getByTitle('Auto-fix Topologi').click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('select').first().selectOption({ index: 1 });
    await dialog.getByRole('button', { name: /Jalankan Auto-fix/ }).click();
    await expect(dialog).toContainText(fixture.expected, {timeout:20000});
    await page.keyboard.press('Escape');
    await openResults(page);
    await expect(page.getByRole('complementary', { name: /hasil/i })).toContainText(fixture.expected);
  });
}
