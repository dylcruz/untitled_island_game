import { expect, test } from '@playwright/test';

test('pauses for decisions, shows results, and completes the shortened slice', async ({ page }) => {
  test.setTimeout(20_000);
  await page.goto('/?mode=slice');
  await expect(page.getByText('Milestone 1 technical slice')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: /Health/ })).toHaveCount(1);
  await page.getByRole('button', { name: 'Begin' }).click();
  await page.getByRole('button', { name: '8x' }).click();

  for (let eventNumber = 0; eventNumber < 3; eventNumber += 1) {
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const pausedTime = await page.getByTestId('time-status').textContent();
    await page.waitForTimeout(200);
    await expect(page.getByTestId('time-status')).toHaveText(pausedTime ?? '');
    await dialog.getByRole('button').first().click();
    await expect(page.getByRole('heading', { name: 'Decision result' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
  }

  await expect(page.getByRole('heading', { name: 'Rescue has arrived' })).toBeVisible();
  await expect(page.getByTestId('time-status')).toContainText('Day 3 · 6:00 AM');
  await expect(page.getByTestId('time-status')).toContainText('0 minutes to rescue');
  await expect(page.getByTestId('time-status')).not.toContainText(/\b(step|ticks?)\b/i);
  const ending = page.getByRole('dialog');
  const acknowledgement = page.getByTestId('acknowledge-ending');
  await expect(ending).toBeVisible();
  await expect(acknowledgement).toBeFocused();
  await acknowledgement.press('Shift+Tab');
  await expect(ending.getByRole('button', { name: 'Restart with randomized seed' })).toBeFocused();
  await acknowledgement.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
