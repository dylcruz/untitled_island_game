import { expect, test } from '@playwright/test';

test('presents the authored island, distinct survivor portraits, and production history', async ({
  page,
}) => {
  test.setTimeout(14_000);
  await page.goto('/');
  await page.getByTestId('start-expedition').click();

  await expect(page.getByText('Milestone 4 · expedition dashboard')).toBeVisible();
  const canvas = page.locator('canvas.island-canvas');
  await expect(canvas).toHaveAttribute('data-cosmetic-variant', /[0-3]/);
  await expect(canvas).toHaveAttribute('data-phase', /dawn|daylight|dusk|night/);
  await expect(page.getByText(/Fixed gameplay geometry:/)).toBeVisible();
  await expect(page.getByText(/Cosmetic scenery:/)).toBeVisible();

  await expect(page.getByTestId('survivor-card')).toHaveCount(3);
  await expect(page.getByTestId('survivor-portrait')).toHaveCount(3);
  await expect(page.locator('meter[aria-label^="Hunger: "]')).toHaveCount(3);
  await expect(page.locator('meter[aria-label^="Thirst: "]')).toHaveCount(3);
  expect(
    await page
      .locator('meter[aria-label^="Hunger: "]')
      .evaluateAll((meters) => meters.every((meter) => Number(meter.getAttribute('value')) >= 80)),
  ).toBe(true);
  expect(
    await page
      .locator('meter[aria-label^="Thirst: "]')
      .evaluateAll((meters) => meters.every((meter) => Number(meter.getAttribute('value')) >= 80)),
  ).toBe(true);
  await expect(page.getByTestId('time-status')).toContainText(/AM|PM/);
  await expect(page.getByTestId('time-status')).not.toContainText(/\b(step|ticks?)\b/i);
  const portraitVariants = await page
    .getByTestId('survivor-portrait')
    .evaluateAll((portraits) =>
      portraits.map((portrait) => portrait.getAttribute('data-portrait-variant')),
    );
  expect(new Set(portraitVariants).size).toBe(3);
  await expect(page.getByTestId('survivor-status')).toHaveCount(3);
  await expect(page.locator('meter')).toHaveCount(16);
  await expect(page.getByText('Recent history', { exact: true })).toBeVisible();
  await expect(page.getByText(/Color|Variant/)).toHaveCount(0);

  await page.getByRole('button', { name: '8x', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId('production-history').locator('.history-entry')).toHaveCount(8);
  await expect(dialog.getByTestId('event-choice-card')).toHaveCount(2);
  await expect(dialog.getByText(/risk/i).first()).toBeVisible();
  await expect(dialog.getByText(/\d+%/).first()).toBeVisible();
  await expect(dialog.getByText(/No supply cost|Supply cost/).first()).toBeVisible();

  const firstChoice = dialog.getByTestId('event-choice-card').first();
  const firstChoiceButton = firstChoice.getByRole('button');
  const lastChoiceButton = dialog.getByTestId('event-choice-card').last().getByRole('button');
  await expect(firstChoiceButton).toBeFocused();
  await firstChoiceButton.press('Tab');
  await expect(lastChoiceButton).toBeFocused();
  await lastChoiceButton.press('Tab');
  await expect(firstChoiceButton).toBeFocused();
  const decisionTitle = await dialog.locator('h2').innerText();
  await firstChoiceButton.click();
  await expect(page.getByRole('heading', { name: 'Decision result' })).toBeVisible();
  await expect(page.getByTestId('source-event')).toContainText(decisionTitle);
  await expect(page.getByTestId('selected-choice')).toContainText('Selected choice:');
  await expect(page.getByTestId('result-details')).toContainText('Immediate impact');
  await expect(dialog.getByText('Survivors involved:')).toBeVisible();
  const continueButton = dialog.getByRole('button', { name: 'Continue', exact: true });
  await expect(continueButton).toBeFocused();
  await continueButton.press('Tab');
  await expect(continueButton).toBeFocused();
  await continueButton.press('Shift+Tab');
  await expect(continueButton).toBeFocused();
});

test('keeps M3 presentation readable and keyboard-usable at 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await page.getByTestId('start-expedition').click();

  await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 360);
  await expect(page.getByTestId('survivor-card')).toHaveCount(3);
  await expect(page.getByTestId('production-history')).toBeVisible();
  const running = page.getByRole('button', { name: 'Running', exact: true });
  await expect(running).toBeDisabled();
  const pause = page.getByRole('button', { name: '0x', exact: true });
  await pause.focus();
  await expect(pause).toBeFocused();
  await page.keyboard.press('Enter');
  const begin = page.getByRole('button', { name: 'Resume', exact: true });
  await begin.focus();
  await expect(begin).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Running', exact: true })).toBeDisabled();
  await expect(page.locator('canvas.island-canvas')).toBeVisible();
  await page.getByRole('button', { name: '8x', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  const dialogButtons = dialog.getByRole('button');
  const firstDialogButton = dialogButtons.first();
  const lastDialogButton = dialogButtons.last();
  await firstDialogButton.focus();
  await firstDialogButton.press('Shift+Tab');
  await expect(lastDialogButton).toBeFocused();
  await lastDialogButton.press('Tab');
  await expect(firstDialogButton).toBeFocused();
});
