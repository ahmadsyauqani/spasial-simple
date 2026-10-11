import { test, expect, type Page } from '@playwright/test';
import * as turf from '@turf/turf';
import { createDemoGeojson } from '../src/components/layer-workspace-data';

async function guest(page: Page) {
  await page.route('**/*.supabase.co/**', route => route.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await page.addInitScript(() => localStorage.setItem('sakagis-overview-dismissed','1'));
  await page.goto('/');
  await page.getByRole('button', {name:'Guest', exact:true}).click();
  await page.getByText('Saya bersaksi telah membaca').click();
  await page.getByRole('button',{name:'Mulai Sesi (5 Menit)'}).click();
  await expect(page.locator('.leaflet-container').first()).toBeVisible();
}
async function demo(page: Page) {
  await guest(page);
  await page.getByRole('button',{name: page.viewportSize()!.width < 1024 ? 'Buka menu dataset' : 'Data dan Layer', exact:true}).click();
  await page.getByRole('button',{name:'Muat contoh data',exact:true}).click();
  await page.getByTestId('layer-selection-button').filter({hasText:'Contoh bidang (demo)'}).click();
  await page.getByRole('button',{name:'Zoom layer Contoh bidang (demo)'}).click();
  await page.getByTitle('Tutup Panel', {exact:true}).click();
}

test('inspector selects, reselects, safely clears and restores parcel style', async ({page}) => {
  await demo(page);
  const first = page.locator('path[data-feature-id="D-01"]');
  const second = page.locator('path[data-feature-id="D-02"]');
  await expect(first).toBeVisible();
  const style = await first.getAttribute('stroke');
  const geometry = await first.getAttribute('d');
  await first.click();
  const inspector = page.getByRole('complementary',{name:'Inspektur fitur'});
  await expect(inspector).toContainText('D-01');
  await expect(inspector).toContainText('Geodesik');
  const source = createDemoGeojson().features[0];
  expect(Number(await page.getByTestId('feature-area').getAttribute('data-value'))).toBeCloseTo(turf.area(source as any), 5);
  expect(Number(await page.getByTestId('feature-length').getAttribute('data-value'))).toBeCloseTo(turf.length(turf.polygonToLine(source as any),{units:'meters'}), 5);
  await page.screenshot({path:'artifacts/ux-desktop-inspector.png'});
  await expect(page.locator('.leaflet-popup')).toHaveCount(0);
  await expect(first).toHaveClass(/parcel-selected/);
  await second.click();
  await expect(inspector).toContainText('D-02');
  await expect(first).toHaveAttribute('stroke',style!);
  await expect(first).toHaveAttribute('d',geometry!);
  await page.keyboard.press('Escape');
  await expect(inspector).toHaveCount(0);
  await expect(page.locator('.parcel-selected')).toHaveCount(0);
  await first.click();
  await page.locator('.leaflet-container').first().click({position:{x:500,y:150}});
  await expect(inspector).toHaveCount(0);
});

test('inspector action routes, drawer exclusivity and keyboard guards', async ({page, context}) => {
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await demo(page);
  await page.locator('path[data-feature-id="D-01"]').click();
  const inspector = page.getByRole('complementary',{name:'Inspektur fitur'});
  await inspector.getByRole('button',{name:'Copy ID'}).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('D-01');
  await inspector.getByRole('button',{name:'Export',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText(/Ekspor|Export/);
  await page.keyboard.press('Escape');
  await page.keyboard.press('f');
  await expect(inspector).toBeVisible();
  await inspector.getByRole('button',{name:'Edit',exact:true}).click();
  await expect(page.locator('#workspace-panel')).toHaveAttribute('data-open','true');
  await expect(inspector).toHaveCount(0);
  await expect(page.locator('#workspace-panel')).toContainText(/Attribute Inspector/);
  await page.getByTitle('Tutup Panel', {exact:true}).click();
  await page.getByRole('button',{name:'Hasil analisis',exact:true}).click();
  await expect(page.getByRole('complementary',{name:'Hasil analisis'})).toBeVisible();
  await page.locator('path[data-feature-id="D-01"]').click();
  await expect(inspector).toBeVisible();
  await expect(page.getByRole('complementary',{name:'Hasil analisis'})).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.keyboard.press('m');
  await expect(page.getByRole('button',{name:'Ukur jarak',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('Escape');
  const search=page.getByRole('textbox',{name:'Cari alamat atau koordinat...'});
  await search.fill('fm');
  await search.press('m');
  await expect(page.getByRole('button',{name:'Ukur jarak',exact:true})).toHaveAttribute('aria-pressed','false');
  await search.fill('');
  await search.blur();
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('m');
  await expect(page.locator('button[aria-label="Ukur jarak"]')).toHaveAttribute('aria-pressed','false');
  await page.keyboard.press('Escape');
});

test('mobile inspector is bounded and switches to one results drawer', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  await demo(page);
  await page.locator('path[data-feature-id="D-01"]').click();
  const inspector = page.getByRole('complementary',{name:'Inspektur fitur'});
  await expect(inspector).toBeVisible();
  const box = await inspector.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x+box!.width).toBeLessThanOrEqual(390);
  expect(box!.height).toBeLessThan(423);
  expect(await page.locator('.parcel-selected').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  await page.screenshot({path:'artifacts/ux-mobile-inspector.png'});
  await page.getByRole('button',{name:'Hasil analisis',exact:true}).click();
  await expect(inspector).toHaveCount(0);
  await expect(page.locator('#workspace-panel')).toHaveAttribute('data-open','false');
  await expect(page.getByRole('complementary',{name:'Hasil analisis'})).toBeVisible();
  await page.screenshot({path:'artifacts/ux-mobile-results.png'});
});

test('selection clears on layer hide/delete and edit remains inside mobile sheet', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await demo(page);
  await page.locator('path[data-feature-id="D-01"]').click();
  await page.getByRole('complementary',{name:'Inspektur fitur'}).getByRole('button',{name:'Edit',exact:true}).click();
  const editor = page.getByRole('region',{name:'Edit atribut fitur'});
  await expect(editor).toBeVisible();
  const box = await editor.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x+box!.width).toBeLessThanOrEqual(390);
  await editor.getByRole('textbox',{name:'nama',exact:true}).fill('Parcel edited locally');
  await editor.getByRole('button',{name:'Simpan Perubahan'}).click();
  await page.getByTitle('Tutup Panel',{exact:true}).click();
  await page.locator('path[data-feature-id="D-01"]').click();
  await expect(page.getByRole('complementary',{name:'Inspektur fitur'})).toContainText('Parcel edited locally');
  await page.getByRole('button',{name:'Buka menu dataset',exact:true}).click();
  await page.getByRole('button',{name:'Sembunyikan layer Contoh bidang (demo)'}).click();
  await expect(page.locator('.parcel-selected')).toHaveCount(0);
  await page.getByRole('button',{name:'Tampilkan layer Contoh bidang (demo)'}).click();
  await page.getByTitle('Tutup Panel',{exact:true}).click();
  await page.locator('path[data-feature-id="D-01"]').click();
  await page.getByRole('button',{name:'Buka menu dataset',exact:true}).click();
  await page.getByRole('button',{name:'Lainnya untuk Contoh bidang (demo)'}).click();
  page.once('dialog', dialog=>dialog.accept());
  await page.getByRole('button',{name:'Hapus layer',exact:true}).click();
  await page.getByRole('button',{name:'Ya, hapus layer',exact:true}).click();
  await expect(page.locator('path[data-feature-id="D-01"]')).toHaveCount(0);
  await expect(page.locator('.parcel-selected')).toHaveCount(0);
});

test('uploaded hostile attributes render as text without HTML execution', async ({page}) => {
  await guest(page);
  await page.getByRole('button',{name:'Data dan Layer',exact:true}).click();
  const source=createDemoGeojson();
  const fixture={type:'FeatureCollection',features:[{...source.features[0],properties:{NIB:'SAFE-UPLOAD',note:'<img src=x onerror="window.__injected=true">'}}]};
  await page.locator('input[type=file][accept*=".geojson"]').first().setInputFiles({name:'safe-synthetic.geojson',mimeType:'application/geo+json',buffer:Buffer.from(JSON.stringify(fixture))});
  const wizard=page.getByRole('dialog');
  await wizard.getByRole('button',{name:'Lanjut'}).click();
  await wizard.getByRole('button',{name:'Lanjut'}).click();
  await wizard.getByRole('button',{name:'Simpan Layer'}).click();
  await expect(wizard).toBeHidden();
  await page.getByTitle('Tutup Panel',{exact:true}).click();
  await page.locator('path[data-feature-id="SAFE-UPLOAD"]').click();
  const inspector=page.getByRole('complementary',{name:'Inspektur fitur'});
  await expect(inspector).toContainText('<img src=x');
  await expect(inspector.locator('img')).toHaveCount(0);
  expect(await page.evaluate(()=>('__injected' in window))).toBe(false);
});

test('workspace boots without a missing provider and opens results', async ({ page }) => {
  const response = await page.goto('/');
  if (response?.status() !== 200) console.log((await response!.text()).match(/"err":\{.{0,10000}/)?.[0]);
  expect(response?.status()).toBe(200);
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByText('Saya bersaksi telah membaca').click();
  await page.getByRole('button', { name: 'Mulai Sesi (5 Menit)' }).click();
  await page.getByRole('button', { name: 'Hasil analisis', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Hasil analisis' })).toBeVisible();
});
