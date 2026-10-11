import { test, expect, type Page } from '@playwright/test';

async function enterGuest(page: Page) {
  await page.addInitScript(() => localStorage.setItem('sakagis-overview-dismissed', '1'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByText('Saya bersaksi telah membaca').click();
  await page.getByRole('button', { name: 'Mulai Sesi (5 Menit)' }).click();
  await expect(page.locator('.map-instrument-bar')).toBeVisible();
}

test('one active coordinate system with complete dismissible details', async ({ page }) => {
  await enterGuest(page);
  const dock = page.locator('.map-instrument-dock');
  const selector = dock.getByLabel('Sistem koordinat');
  await expect(selector).toHaveValue('wgs84');
  await selector.selectOption('utm');
  await expect(dock.getByTestId('active-coordinate')).toContainText(/E .*N .*m/);
  await selector.selectOption('tm3');
  await expect(dock.getByTestId('active-coordinate')).toContainText(/X .*Y .*m/);
  const trigger = dock.getByRole('button', { name: 'Detail peta', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const details = page.getByRole('dialog', { name: 'Detail peta' });
  await expect(details).toBeVisible();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(details).toContainText('WGS84 DMS');
  await expect(details).toContainText('0 layer');
  await page.keyboard.press('Escape');
  await expect(details).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(400, 300);
  await expect(details).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test('TM-3 outside configured longitude coverage is unavailable, not zero', async ({ page }) => {
  await enterGuest(page);
  const search = page.getByPlaceholder('Cari alamat atau koordinat...');
  await search.fill('-10.177611, 73.959840');
  await search.press('Enter');
  // Search uses the public map flyTo; sample the cursor after its animation.
  await page.waitForTimeout(1800);
  await page.mouse.move(710, 350);
  await page.locator('.map-instrument-dock').getByLabel('Sistem koordinat').selectOption('tm3');
  await expect(page.getByTestId('active-coordinate')).toContainText('Tidak tersedia');
  await page.getByRole('button', { name: 'Detail peta', exact: true }).click();
  const details = page.getByRole('dialog', { name: 'Detail peta' });
  await expect(details).toContainText('Di luar cakupan TM-3');
  await expect(details).not.toContainText('X 0.00');
});

for (const width of [1440, 1280, 768, 390, 360]) {
  test(`dock at ${width}px: reachable controls without overflow or collisions`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: width < 640 ? 844 : 900 });
    await enterGuest(page);
    const dock = page.locator('.map-instrument-bar');
    const rect = await dock.boundingBox();
    expect(rect!.width).toBeLessThanOrEqual(960);
    expect(await dock.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const selector of ['.map-action-controls', '.leaflet-control-zoom', '.leaflet-control-attribution', '.mobile-bottom-nav']) {
      const item = page.locator(selector).first();
      if (await item.isVisible()) {
        const b = (await item.boundingBox())!;
        expect(rect!.x < b.x + b.width && rect!.x + rect!.width > b.x && rect!.y < b.y + b.height && rect!.y + rect!.height > b.y, selector).toBe(false);
      }
    }
    for (const name of ['Snap ke vertex', 'Ukur jarak', 'Ukur luas', 'Detail peta']) {
      const button = dock.getByRole('button', { name, exact: true });
      await expect(button).toBeVisible();
      await button.click({ trial: true });
      if (width < 1024) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await dock.getByLabel('Sistem koordinat').selectOption('utm');
    await expect(page.getByTestId('active-coordinate')).toContainText(' m');
    await dock.getByLabel('Sistem koordinat').selectOption('wgs84');
    await page.screenshot({ path: testInfo.outputPath(`dock-${width}.png`) });
    await dock.getByRole('button', { name: 'Detail peta', exact: true }).click();
    const details = page.getByRole('dialog', { name: 'Detail peta' });
    await expect(details).toContainText('Workspace');
    await expect(details).toContainText('Skala / Zoom');
    await details.evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));
    const detailBox = (await details.boundingBox())!;
    expect(detailBox.y).toBeGreaterThan(150);
    expect(await details.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`details-${width}.png`) });
    await details.getByRole('button', { name: 'Terapkan zoom' }).scrollIntoViewIfNeeded();
    await details.getByRole('button', { name: 'Terapkan zoom' }).click({ trial: true });
    await details.getByRole('button', { name: 'Terapkan skala' }).click({ trial: true });
    await page.keyboard.press('Escape');
    await expect(dock.getByRole('button', { name: 'Detail peta', exact: true })).toBeFocused();
  });
}

test('snap state, measurement finish/reset and scale/zoom remain usable', async ({ page }) => {
  await enterGuest(page);
  const dock = page.locator('.map-instrument-dock');
  const snap = dock.getByRole('button', { name: 'Snap ke vertex' });
  await snap.click();
  await expect(snap).toHaveAttribute('aria-pressed', 'true');
  await dock.getByRole('button', { name: 'Ukur jarak' }).click();
  await expect(dock.getByRole('button', { name: 'Ukur jarak' })).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.click(650, 300);
  await page.mouse.click(720, 320);
  await dock.getByRole('button', { name: 'Selesaikan pengukuran' }).click();
  await expect(dock.getByRole('status')).toContainText('Panjang:');
  await dock.getByRole('button', { name: 'Reset pengukuran' }).click();
  await expect(dock.getByRole('status')).toHaveCount(0);
  await dock.getByRole('button', { name: 'Ukur luas' }).click();
  await page.mouse.click(650, 300);
  await page.mouse.click(720, 320);
  await page.mouse.click(690, 390);
  await dock.getByRole('button', { name: 'Selesaikan pengukuran' }).click();
  await expect(dock.getByRole('status')).toContainText('Luas:');
  await expect(dock.getByRole('status')).toContainText('Keliling:');
  await dock.getByRole('button', { name: 'Reset pengukuran' }).click();
  await dock.getByRole('button', { name: 'Detail peta', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Detail peta' })).toContainText('Aktif · radius 25 px');
  const scale = dock.getByLabel('Penyebut skala');
  await scale.fill('1000000');
  await dock.getByRole('button', { name: 'Terapkan skala' }).click();
  await expect(dock.getByLabel('Level zoom')).not.toHaveValue('13');
  await dock.getByLabel('Level zoom').fill('12');
  await dock.getByRole('button', { name: 'Terapkan zoom' }).click();
  await expect(dock.getByLabel('Level zoom')).toHaveValue('12');
});

test('light mode and reduced motion keep the dock and details readable', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterGuest(page);
  await page.getByRole('button', { name: 'Data dan Layer', exact: true }).click();
  await page.getByTitle('Switch to Light Mode').click();
  await page.getByRole('button', { name: 'Tutup Panel', exact: true }).click();
  const dock = page.locator('.map-instrument-bar');
  await expect(dock).toHaveCSS('background-color', 'rgb(244, 247, 246)');
  await dock.getByRole('button', { name: 'Detail peta', exact: true }).click();
  const details = page.getByRole('dialog', { name: 'Detail peta' });
  await expect(details).toHaveCSS('animation-name', 'none');
  await expect(details).toHaveCSS('background-color', 'rgb(244, 247, 246)');
  await page.screenshot({ path: testInfo.outputPath('dock-light.png') });
  await details.getByRole('button', { name: 'Tutup detail peta' }).click();
  await expect(dock.getByRole('button', { name: 'Detail peta', exact: true })).toBeFocused();
});

test('coordinate lock remains stable until unlocked and double-click finishes measurement', async ({ page }) => {
  await enterGuest(page);
  const dock = page.locator('.map-instrument-dock');
  await page.mouse.move(620, 310);
  await page.mouse.click(620, 310);
  const locked = await page.getByTestId('active-coordinate').innerText();
  await page.mouse.move(730, 410);
  await expect(page.getByTestId('active-coordinate')).toHaveText(locked);
  await dock.getByRole('button', { name: 'Buka kunci koordinat' }).click();
  await page.mouse.move(740, 415);
  await expect(page.getByTestId('active-coordinate')).not.toHaveText(locked);
  await dock.getByRole('button', { name: 'Ukur jarak' }).click();
  await page.mouse.click(650, 310);
  await page.mouse.dblclick(730, 400);
  await expect(dock.getByRole('status')).toContainText('Panjang:');
  await expect(dock.getByRole('button', { name: 'Ukur jarak' })).toHaveAttribute('aria-pressed', 'false');
});
