import { test, expect, type Page } from '@playwright/test';

async function setup(page: Page) {
  // Isolate this guest fixture from real accounts/cloud data; not a live cloud test.
  await page.route('**/*.supabase.co/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.addInitScript(() => localStorage.setItem('sakagis-overview-dismissed', '1'));
  await page.goto('/');
  const guest = page.getByRole('button', { name: 'Guest', exact: true });
  try {
    await expect(guest).toBeVisible({ timeout: 15_000 });
  } catch {
    // Auth boot can miss the first client render while Next hot-reloads; retry once, not forever.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(guest).toBeVisible({ timeout: 45_000 });
  }
  await guest.click();
  await page.getByText('Saya bersaksi telah membaca').click();
  await page.getByRole('button', { name: 'Mulai Sesi (5 Menit)' }).click();
  await page.getByRole('button', { name: page.viewportSize()!.width < 1024 ? 'Buka menu dataset' : 'Data dan Layer', exact: true }).click();
  await page.getByRole('button', { name: 'Muat contoh data', exact: true }).click();
  await page.getByRole('button', { name: page.viewportSize()!.width < 1024 ? 'Buka tabel atribut' : 'Tabel Atribut', exact: true }).click();
  await page.getByRole('button', { name: 'Calculate Geometry', exact: true }).click();
  return page.getByRole('dialog', { name: 'Calculate Geometry', exact: true });
}

async function localFeatures(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve,reject) => { const r=indexedDB.open('SAKAGIS_DB'); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); });
    return new Promise<any[]>((resolve,reject) => { const r=database.transaction('layers').objectStore('layers').get('local-demo-parcels'); r.onsuccess=()=>{database.close();resolve(r.result.geojson.features);}; r.onerror=()=>reject(r.error); });
  });
}

test('calculate all areas into numeric attribute and confirm overwriting; local readback preserves geometry', async ({ page }, info) => {
  const writes: string[] = [];
  page.on('request', r => { if (r.url().includes('.supabase.co') && ['POST','PATCH','DELETE'].includes(r.method())) writes.push(r.url()); });
  const dialog = await setup(page);
  const original = await localFeatures(page);
  await dialog.getByLabel('Nama kolom tujuan').fill('luas_ha');
  await dialog.getByLabel('Satuan hasil').selectOption('ha');
  await dialog.getByRole('button', { name: 'Hitung pratinjau', exact: true }).click();
  await expect(dialog.getByTestId('geometry-preview-summary')).toContainText('3 dihitung');
  await dialog.getByRole('button', { name: 'Simpan ke atribut', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('3 fitur tersimpan');
  const saved = await localFeatures(page);
  expect(saved.every(f=>typeof f.properties.luas_ha === 'number' && f.properties.luas_ha > 0)).toBe(true);
  expect(saved.map(f=>f.geometry)).toEqual(original.map(f=>f.geometry));
  expect(saved.map(f=>f.properties.NIB)).toEqual(original.map(f=>f.properties.NIB));
  await dialog.getByRole('button', { name: 'Hitung pratinjau', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Simpan ke atribut', exact: true })).toBeDisabled();
  await dialog.getByLabel('Saya setuju menimpa nilai kolom yang sudah ada').check();
  await expect(dialog.getByRole('button', { name: 'Simpan ke atribut', exact: true })).toBeEnabled();
  await page.screenshot({ path: info.outputPath('geometry-calculator-desktop.png') });
  await dialog.getByRole('button', { name: 'Tutup', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: 'luas_ha', exact: false })).toBeVisible();
  expect(writes).toEqual([]);
});

test('selected and filtered scopes keep original indices and leave other attributes untouched', async ({ page }) => {
  const dialog = await setup(page);
  await dialog.getByRole('button',{name:'Tutup',exact:true}).click();
  const table = page.locator('.attribute-table-window');
  await table.getByRole('checkbox',{name:'Pilih fitur 2',exact:true}).check();
  await table.getByRole('button',{name:'Calculate Geometry',exact:true}).click();
  await dialog.getByLabel('Cakupan fitur').selectOption('selected');
  await dialog.getByLabel('Jenis perhitungan').selectOption('perimeter');
  await dialog.getByLabel('Nama kolom tujuan').fill('keliling_m');
  await dialog.getByRole('button',{name:'Hitung pratinjau',exact:true}).click();
  await expect(dialog.getByTestId('geometry-preview-summary')).toContainText('1 dihitung');
  await dialog.getByRole('button',{name:'Simpan ke atribut',exact:true}).click();
  await expect(dialog.getByRole('status')).toContainText('1 fitur tersimpan');
  let stored = await localFeatures(page);
  expect(stored[0].properties.keliling_m).toBeUndefined();
  expect(stored[1].properties.keliling_m).toBeGreaterThan(0);
  expect(stored[2].properties.keliling_m).toBeUndefined();
  await dialog.getByRole('button',{name:'Tutup',exact:true}).click();
  await table.getByPlaceholder('Cari data...').fill('D-03');
  await table.getByRole('button',{name:'Calculate Geometry',exact:true}).click();
  await dialog.getByLabel('Cakupan fitur').selectOption('filtered');
  await dialog.getByLabel('Nama kolom tujuan').fill('hasil_filter');
  await dialog.getByRole('button',{name:'Hitung pratinjau',exact:true}).click();
  await expect(dialog.getByTestId('geometry-preview-summary')).toContainText('1 dihitung');
  await dialog.getByRole('button',{name:'Simpan ke atribut',exact:true}).click();
  await expect(dialog.getByRole('status')).toContainText('1 fitur tersimpan');
  stored = await localFeatures(page);
  expect(stored[0].properties.hasil_filter).toBeUndefined();
  expect(stored[1].properties.hasil_filter).toBeUndefined();
  expect(stored[2].properties.hasil_filter).toBeGreaterThan(0);
});

test('mobile calculator remains bounded, validates fields and supports keyboard dismissal', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const dialog = await setup(page);
  await dialog.getByLabel('Nama kolom tujuan').fill('db_id');
  await dialog.getByRole('button', { name: 'Hitung pratinjau', exact:true }).click();
  await expect(dialog.getByRole('alert')).toContainText('ID internal');
  await dialog.getByLabel('Nama kolom tujuan').fill('luas_m2');
  await dialog.getByRole('button', { name: 'Hitung pratinjau', exact:true }).click();
  await expect(dialog.getByTestId('geometry-preview-summary')).toContainText('3 dihitung');
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await dialog.getByRole('button',{name:'Simpan ke atribut',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath('geometry-calculator-mobile.png')});
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
