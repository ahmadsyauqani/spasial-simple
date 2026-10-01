import { test, expect } from '@playwright/test';

async function enterGuest(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Guest', exact: true }).click();
  await page.getByText('Saya bersaksi telah membaca').click();
  await page.getByRole('button', { name: 'Mulai Sesi (5 Menit)' }).click();
}

test('explore terrain in 3D and return to the intact 2D workspace', async ({ page }) => {
  await enterGuest(page);
  await page.getByRole('button', { name: 'Buka explorer 3D' }).click();
  const explorer = page.getByRole('dialog', { name: 'Explorer 3D' });
  await expect(explorer).toBeVisible();
  await expect(explorer.getByText('Scene siap', { exact: true })).toBeVisible({ timeout: 60000 });
  await explorer.getByRole('button', { name: 'Bromo', exact: true }).click();
  await expect(explorer.getByRole('button', { name: 'Bromo', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await explorer.getByLabel('Kemiringan kamera').fill('35');
  await expect(explorer.getByLabel('Kemiringan kamera')).toHaveValue('35');
  await explorer.getByRole('button', { name: 'Kembali ke peta 2D' }).click();
  await expect(explorer).not.toBeVisible();
  await expect(page.locator('.leaflet-container').first()).toBeVisible();
});
