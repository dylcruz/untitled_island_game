import { expect, test } from '@playwright/test';

test('presents the authored island, distinct survivor portraits, and production history', async ({
  page,
}) => {
  test.setTimeout(14_000);
  await page.goto('/');

  await expect(page.getByText('Milestone 3 · final presentation')).toBeVisible();
  const canvas = page.locator('canvas.island-canvas');
  await expect(canvas).toHaveAttribute('data-cosmetic-variant', /[0-3]/);
  await expect(canvas).toHaveAttribute('data-phase', /dawn|daylight|dusk|night/);
  await expect(page.getByText(/Fixed gameplay geometry:/)).toBeVisible();
  await expect(page.getByText(/Cosmetic scenery:/)).toBeVisible();

  await expect(page.getByTestId('survivor-card')).toHaveCount(3);
  await expect(page.getByTestId('survivor-portrait')).toHaveCount(3);
  await expect(page.getByTestId('survivor-status')).toHaveCount(3);
  await expect(page.locator('meter')).toHaveCount(16);
  await expect(page.getByText('Recent history', { exact: true })).toBeVisible();
  await expect(page.getByText(/Color|Variant/)).toHaveCount(0);

  await page.getByRole('button', { name: 'Begin', exact: true }).click();
  await page.getByRole('button', { name: '8x', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId('production-history').locator('.history-entry')).toHaveCount(8);
  await expect(dialog.getByTestId('event-choice-card')).toHaveCount(2);
  await expect(dialog.getByText(/risk/i).first()).toBeVisible();
  await expect(dialog.getByText(/\d+%/).first()).toBeVisible();
  await expect(dialog.getByText(/No supply cost|Supply cost/).first()).toBeVisible();

  const firstChoice = dialog.getByTestId('event-choice-card').first();
  await expect(firstChoice.getByRole('button')).toBeFocused();
  await firstChoice.getByRole('button').click();
  await expect(page.getByRole('heading', { name: 'Decision result' })).toBeVisible();
  await expect(page.getByTestId('selected-choice')).toContainText('Selected choice:');
  await expect(page.getByTestId('result-details')).toContainText('Immediate impact');
  await expect(dialog.getByText('Survivors involved:')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeFocused();
});

test('keeps M3 presentation readable and keyboard-usable at 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');

  await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 360);
  await expect(page.getByTestId('survivor-card')).toHaveCount(3);
  await expect(page.getByTestId('production-history')).toBeVisible();
  const begin = page.getByRole('button', { name: 'Begin', exact: true });
  await begin.focus();
  await expect(begin).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Running', { exact: true })).toBeVisible();
  await expect(page.locator('canvas.island-canvas')).toBeVisible();
});
