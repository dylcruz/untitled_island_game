import { expect, test } from '@playwright/test';

test('shows the three-survivor production loop and pauses for its first decision', async ({
  page,
}) => {
  test.setTimeout(14_000);
  await page.goto('/');

  await expect(page.getByText('Milestone 2 · production experience')).toBeVisible();
  await expect(page.getByTestId('survivor-card')).toHaveCount(3);
  await expect(page.getByTestId('time-status')).toContainText('Day 1');
  await expect(page.getByText(/14 days/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Camp priority' })).toBeVisible();

  await page.getByRole('button', { name: 'Begin', exact: true }).click();
  await page.getByTestId('priority-water').click();
  await expect(page.getByTestId('active-priority')).toHaveText('Secure water');
  await expect(page.getByText(/One priority change remains available today/)).toHaveCount(0);
  await expect(page.getByText(/Today's change is used/)).toBeVisible();
  await expect(page.getByTestId('priority-food')).toBeDisabled();

  await page.getByRole('button', { name: '8x', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 4_000 });
  await expect(dialog.getByText('Survivors involved:')).toBeVisible();

  await dialog.getByRole('button').first().click();
  await expect(page.getByRole('heading', { name: 'Decision result' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('keeps the production controls usable at a 360px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');

  const scrollWidth = await page.evaluate('document.documentElement.scrollWidth');
  expect(scrollWidth).toBeLessThanOrEqual(360);
  await expect(page.locator('section[aria-label="Source availability"] > dl')).toHaveCount(1);
  await expect(page.locator('section[aria-label="Source availability"] dl dl')).toHaveCount(0);
  await page.getByRole('button', { name: 'Begin', exact: true }).focus();
  await expect(page.getByRole('button', { name: 'Begin', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Running', { exact: true })).toBeVisible();
  await expect(page.getByTestId('survivor-card')).toHaveCount(3);
});
