import { expect, test } from '@playwright/test';

test('renders the authored island and three accessible survivor placeholders', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('img', { name: 'Authored island map with three moving survivor placeholders' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Begin' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Survivors' })).toBeVisible();
  await expect(page.getByRole('listitem')).toHaveCount(3);
});

test('begin and accelerated speed advance the fixed-step clock', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.getByRole('button', { name: '8x' }).click();
  const timeStatus = page.getByTestId('time-status');
  await expect(timeStatus).not.toHaveText(/step 0 of/);
  await expect(page.getByRole('button', { name: '0x' })).toHaveAttribute('aria-pressed', 'false');
});
