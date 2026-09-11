import { expect, test } from '@playwright/test';

test('shows the three-survivor production loop and pauses for its first decision', async ({
  page,
}) => {
  test.setTimeout(14_000);
  await page.goto('/');
  await page.getByTestId('start-expedition').click();

  await expect(page.getByText('Milestone 4 · expedition dashboard')).toBeVisible();
  await expect(page.getByTestId('survivor-card')).toHaveCount(3);
  await expect(page.getByTestId('time-status')).toContainText('Day 1');
  await expect(page.getByTestId('time-status')).toContainText(
    /\b\d+ days?(?: \d+ hours?(?: \d+ minutes?)?)? to rescue/,
  );
  await expect(page.getByRole('heading', { name: 'Camp priority' })).toBeVisible();

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
  await page.getByTestId('start-expedition').click();

  const scrollWidth = await page.evaluate('document.documentElement.scrollWidth');
  expect(scrollWidth).toBeLessThanOrEqual(360);
  await expect(page.locator('section[aria-label="Source availability"] > dl')).toHaveCount(1);
  await expect(page.locator('section[aria-label="Source availability"] dl dl')).toHaveCount(0);
  const pause = page.getByRole('button', { name: '0x', exact: true });
  await pause.focus();
  await expect(pause).toBeFocused();
  await page.keyboard.press('Enter');
  const resume = page.getByRole('button', { name: 'Resume', exact: true });
  await resume.focus();
  await expect(resume).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Running', exact: true })).toBeDisabled();
  await expect(page.getByTestId('survivor-card')).toHaveCount(3);
});

test('opens survivor trait explanations with keyboard and touch', async ({ page, isMobile }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await page.getByTestId('seed-input').fill('issue-8-traits');
  await page.getByTestId('start-expedition').click();
  await page.getByRole('button', { name: '0x', exact: true }).click();
  const cards = page.getByTestId('survivor-card');
  await expect(cards).toHaveCount(3);
  for (const card of await cards.all()) {
    const summary = card.locator('.survivor-traits summary');
    const explanations = card.locator('.survivor-traits dl');
    await expect(explanations).toBeHidden();
    await summary.focus();
    await expect(summary).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(explanations).toBeVisible();
    await expect(explanations.locator('dt')).toHaveCount(2);
    await expect(explanations.locator('dd')).toHaveCount(2);
    for (const description of await explanations.locator('dd').all()) {
      await expect(description).toBeVisible();
      expect((await description.innerText()).length).toBeGreaterThan(20);
    }
    await page.keyboard.press('Space');
    await expect(explanations).toBeHidden();
    if (isMobile) await summary.tap();
    else await summary.click();
    await expect(explanations).toBeVisible();
    const bounds = await summary.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate('document.documentElement.scrollWidth')).toBeLessThanOrEqual(360);
});

test('explains supplies and priority waiting at 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await page.getByTestId('seed-input').fill('issue-9-outlook');
  await page.getByTestId('start-expedition').click();
  await page.getByRole('button', { name: '0x', exact: true }).click();
  const outlook = page.getByRole('region', { name: 'Camp outlook', exact: true });
  await expect(outlook).toContainText('3 living');
  await expect(outlook).toContainText('estimated incoming');
  await expect(outlook).toContainText('Most urgent need:');
  await page.getByTestId('priority-food').click();
  await outlook.locator('summary').click();
  await expect(outlook.getByTestId('priority-work')).toBeVisible();
  await expect(outlook).toContainText('the new priority waits for the next task choice');
  await expect(outlook).toContainText('critical self-care and nighttime sleep take precedence');
  const sources = page.getByRole('region', { name: 'Source availability' });
  await expect(sources).toContainText('unreserved');
  await expect(sources).toContainText('Next dawn in');
  await expect(sources).toContainText('Finite; no replenishment.');
  expect(await page.evaluate('document.documentElement.scrollWidth')).toBeLessThanOrEqual(360);
});
