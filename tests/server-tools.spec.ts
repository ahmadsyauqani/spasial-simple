import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Requires: dev server on :3000 + python-service on :8000. Run: E2E_BASE_URL=http://localhost:3000 npx playwright test tests/server-tools.spec.ts
test.skip(!process.env.E2E_BASE_URL && !process.env.CI, 'needs running dev + python backend');
test.use({ viewport: { width: 1440, height: 900 } });

// Two small parcel snapshots near Bromo (lon,lat). Old: A,B,C,D. New: A same, B shifted, C removed, E added.
function sq(x: number, y: number, s = 0.0004) {
  return [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]];
}
const fc = (features: any[]) => ({ type: 'FeatureCollection', features });
const f = (nib: string, coords: any, extra: any = {}) => ({ type: 'Feature', properties: { NIB: nib, ...extra }, geometry: { type: 'Polygon', coordinates: coords } });
const X = 112.95, Y = -7.94;
const oldFc = fc([f('A', sq(X, Y)), f('B', sq(X + 0.0005, Y)), f('C', sq(X + 0.001, Y)), f('D', sq(X, Y + 0.0005), { pemilik: 'Budi' })]);
const newFc = fc([f('A', sq(X, Y)), f('B', sq(X + 0.0007, Y)), f('E', sq(X + 0.002, Y)), f('D', sq(X, Y + 0.0005), { pemilik: 'Siti' })]);
// Overlapping + sliver layer for autofix: P1, P2 overlapping P1 by half, plus a tiny sliver.
const fixFc = fc([f('P1', sq(X, Y, 0.0004)), f('P2', sq(X + 0.0002, Y, 0.0004)), f('S', sq(X + 0.0010, Y, 0.000003))]);

const tmp = path.join(process.env.TMPDIR || process.env.TEMP || '.', 'sakagis-e2e');
fs.mkdirSync(tmp, { recursive: true });
const oldPath = path.join(tmp, 'bidang_lama.geojson');
const newPath = path.join(tmp, 'bidang_baru.geojson');
const fixPath = path.join(tmp, 'bidang_rusak.geojson');
fs.writeFileSync(oldPath, JSON.stringify(oldFc));
fs.writeFileSync(newPath, JSON.stringify(newFc));
fs.writeFileSync(fixPath, JSON.stringify(fixFc));

async function guest(page: import('@playwright/test').Page) {
  await page.addInitScript(() => localStorage.setItem('sakagis-overview-dismissed', '1'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByText('Saya bersaksi telah membaca').click();
  await page.getByRole('button', { name: 'Mulai Sesi (5 Menit)' }).click();
}

async function pick(sel: import('@playwright/test').Locator, re: RegExp) {
  const labels = await sel.locator('option').allTextContents();
  const label = labels.find(l => re.test(l));
  if (!label) throw new Error(`option ${re} not in ${JSON.stringify(labels)}`);
  await sel.selectOption({ label });
}

async function uploadLayer(page: import('@playwright/test').Page, file: string) {
  await page.getByRole('button', { name: 'Data dan Layer' }).click();
  // Make sure no stale wizard is open from a previous upload.
  const anyWizard = page.getByRole('dialog').filter({ hasText: 'Upload Data Wizard' });
  if (await anyWizard.count()) { await page.keyboard.press('Escape'); await expect(anyWizard).toBeHidden(); }
  const input = page.locator('input[type=file][accept*=".geojson"]').first();
  await input.setInputFiles(file);
  const wizard = page.getByRole('dialog').filter({ hasText: path.basename(file) });
  await expect(wizard).toBeVisible();
  await expect(wizard.getByRole('button', { name: 'Lanjut' })).toBeEnabled();
  await wizard.getByRole('button', { name: 'Lanjut' }).click();
  await wizard.getByRole('button', { name: 'Lanjut' }).click();
  await wizard.getByRole('button', { name: 'Simpan Layer' }).click();
  await expect.poll(async () => (await anyWizard.count()) === 0 || (await anyWizard.getByText('Proses selesai').count()) > 0, { timeout: 20000 }).toBe(true);
  if (await anyWizard.count()) { await page.keyboard.press('Escape'); await expect(anyWizard).toBeHidden(); }
  await page.waitForTimeout(1200);
}

test('server analyses: change detection + autofix via UI against local backend', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error' && !/cartocdn|DevTools/.test(m.text())) errors.push(m.text()); });
  await guest(page);
  // Guest layers persist in IndexedDB across runs; only upload what is missing.
  const have = async (name: string) => (await page.getByText(name, { exact: false }).count()) > 0;
  await page.getByRole('button', { name: 'Data dan Layer' }).click();
  await page.waitForTimeout(800);
  for (const p of [oldPath, newPath, fixPath]) if (!(await have(path.basename(p)))) await uploadLayer(page, p);
  await page.screenshot({ path: 'test-results/srv-layers.png' });

  // Open Analisis tab and find our new tools.
  await page.getByRole('button', { name: 'Analisis Spasial' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/srv-analysis-menu.png' });

  // --- Change detection ---
  await page.getByTitle('Deteksi Perubahan Bidang').click();
  const dlg = page.getByRole('dialog');
  await expect(dlg).toBeVisible();
  const selects = dlg.locator('select');
  await pick(selects.nth(0), /bidang_lama/);
  await pick(selects.nth(1), /bidang_baru/);
  await page.screenshot({ path: 'test-results/srv-change-form.png' });
  await dlg.getByRole('button', { name: /Jalankan|Deteksi/ }).first().click();
  await expect(dlg.getByText(/Bertambah/).first()).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/srv-change-result.png' });
  const txt = await dlg.innerText();
  console.log('CHANGE_RESULT_SNIPPET', txt.replace(/\s+/g, ' ').slice(0, 600));
  await dlg.getByRole('button', { name: 'Tutup' }).click();
  await expect(dlg).toBeHidden();

  // --- Autofix ---
  await page.getByTitle('Auto-fix Topologi').click();
  const dlg2 = page.getByRole('dialog');
  await expect(dlg2).toBeVisible();
  await pick(dlg2.locator('select').first(), /bidang_rusak/);
  await dlg2.getByRole('button', { name: /Jalankan Auto-fix/ }).click();
  await expect(dlg2.getByText('Fitur masuk → keluar')).toBeVisible({ timeout: 90000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/srv-autofix-result.png' });
  console.log('AUTOFIX_RESULT_SNIPPET', (await dlg2.innerText()).replace(/\s+/g, ' ').slice(0, 600));
  await dlg2.getByRole('button', { name: 'Tutup' }).click();
  await expect(dlg2).toBeHidden();

  // --- CRS inspect ---
  await page.getByTitle('Reproyeksi & Cek CRS').click();
  const dlg3 = page.getByRole('dialog');
  await expect(dlg3).toBeVisible();
  await pick(dlg3.locator('select').first(), /bidang_lama/);
  await dlg3.getByRole('button', { name: /Periksa CRS/ }).click();
  await expect(dlg3.getByText('CRS Terdeteksi', { exact: false }).first()).toBeVisible({ timeout: 60000 });
  await page.screenshot({ path: 'test-results/srv-crs-result.png' });
  console.log('CRS_RESULT_SNIPPET', (await dlg3.innerText()).replace(/\s+/g, ' ').slice(0, 500));

  console.log('CONSOLE_ERRORS', JSON.stringify(errors.slice(0, 10)));
});
