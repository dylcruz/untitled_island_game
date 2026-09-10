import { applyCommand, createGame } from '../src/game/simulation';
import { parseSaveEnvelope, serializeSave } from '../src/persistence/saveSchema';
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
  await expect(dialog.locator('.risk-badge').first()).toBeVisible();
  await expect(dialog.getByText('Guaranteed immediate effects').first()).toBeVisible();
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

for (const materials of [0, 1.6, 2 - Number.EPSILON, 2]) {
  test(`fractional supplies and pre-selection affordability at ${materials} materials`, async ({
    page,
    isMobile,
  }) => {
    const state = createGame('issue-6-supplies');
    state.reservations = [];
    for (const survivor of state.survivors) survivor.activeTask = null;
    state.status = 'decision';
    state.eventSchedule.nextEventTick = null;
    state.resources = { water: 0, food: 0.25, materials };
    state.island.sourceStates.forage.available = 0.25;
    state.activeEvent = {
      id: 'leaking-roof',
      activatedTick: 0,
      participantIds: [state.survivors[0]!.id],
      chosenChoiceId: null,
      result: null,
    };
    const raw = serializeSave(state, '2026-09-09T00:00:00.000Z');
    expect(parseSaveEnvelope(raw).ok).toBe(true);
    await page.addInitScript((save) => localStorage.setItem('untitled-island:resume', save), raw);
    await page.goto('/');
    await page.getByTestId('resume-saved').click();
    const supplies = page.getByRole('region', { name: 'Supplies and shelter' });
    await expect(
      supplies.locator('dl > div').filter({ has: page.getByText('Water', { exact: true }) }),
    ).toHaveText('Water0 Depleted');
    await expect(
      supplies.locator('dl > div').filter({ has: page.getByText('Food', { exact: true }) }),
    ).toHaveText('Food0.25 Low');
    const shown = materials === 0 ? '0' : materials === 1.6 ? '1.6' : materials < 2 ? '1.99' : '2';
    await expect(
      supplies.locator('dl > div').filter({ has: page.getByText('Materials', { exact: true }) }),
    ).toHaveText(`Materials${shown} ${materials === 0 ? 'Depleted' : 'Low'}`);
    await expect(page.getByRole('region', { name: 'Source availability' })).toContainText('0.25 /');
    const dialog = page.getByRole('dialog');
    const patch = dialog.getByRole('button', { name: 'Choose Spend materials' });
    await expect(patch).toBeFocused();
    if (materials < 2) {
      const reason = `Unavailable: requires 2 materials; you have ${shown}.`;
      await expect(dialog.getByText(reason, { exact: true })).toBeVisible();
      await expect(patch).toHaveAttribute('aria-disabled', 'true');
      await expect(patch).toHaveAccessibleDescription(reason);
      await patch.press('Enter');
      await patch.press('Space');
      // Playwright intentionally refuses normal clicks on aria-disabled buttons;
      // raw touch/mouse input verifies that our handler also prevents activation.
      await patch.scrollIntoViewIfNeeded();
      const box = (await patch.boundingBox())!;
      if (isMobile) await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(dialog.getByRole('heading', { name: 'A Leaking Roof' })).toBeVisible();
      await expect(page.getByRole('alert')).toHaveCount(0);
      await patch.press('Tab');
      const endure = dialog.getByRole('button', { name: 'Choose Endure the leak' });
      await expect(endure).toBeFocused();
      await endure.press('Enter');
    } else {
      await expect(patch).toHaveAttribute('aria-disabled', 'false');
      await expect(dialog.locator('.choice-unavailable')).toHaveCount(0);
      await patch.press('Enter');
    }
    await expect(dialog.getByRole('heading', { name: 'Decision result' })).toBeVisible();
  });
}

for (const eventId of [
  'forager-instinct',
  'seep-follow-up',
  'driftwood-cache',
  'night-watch',
  'fallen-palm',
  'smoke-on-horizon',
  'signal-answer',
  'storm-front',
] as const) {
  test(`choice promises, certainty and setbacks for ${eventId}`, async ({ page }) => {
    let state = createGame('issue5-preview');
    state.reservations = [];
    for (const survivor of state.survivors) survivor.activeTask = null;
    state.status = 'decision';
    state.eventSchedule.nextEventTick = null;
    state.resources.materials = 4;
    state.activeEvent = {
      id: eventId,
      activatedTick: 0,
      participantIds: state.survivors
        .slice(0, eventId === 'night-watch' || eventId === 'smoke-on-horizon' ? 2 : 1)
        .map((survivor) => survivor.id),
      chosenChoiceId: null,
      result: null,
    };
    if (eventId === 'forager-instinct') state.survivors[0]!.traits = ['forager', 'resourceful'];
    if (eventId === 'seep-follow-up' || eventId === 'signal-answer') {
      const followUp = state.activeEvent;
      const prior =
        eventId === 'seep-follow-up'
          ? { eventId: 'freshwater-seep' as const, choiceId: 'mark-source' }
          : { eventId: 'smoke-on-horizon' as const, choiceId: 'signal' };
      state.activeEvent = {
        ...followUp,
        id: prior.eventId,
        participantIds: state.survivors
          .slice(0, prior.eventId === 'smoke-on-horizon' ? 2 : 1)
          .map((survivor) => survivor.id),
      };
      state = applyCommand(state, { type: 'select-event-choice', ...prior }).state;
      state.status = 'decision';
      state.activeEvent = { ...followUp, referencedChoice: prior };
      state.eventSchedule.pendingFollowUps = [];
    }
    const raw = serializeSave(state);
    expect(parseSaveEnvelope(raw).ok).toBe(true);
    await page.addInitScript((save) => localStorage.setItem('untitled-island:resume', save), raw);
    await page.goto('/');
    await page.getByTestId('resume-saved').click();
    const dialog = page.getByRole('dialog');
    const cards = dialog.getByTestId('event-choice-card');
    const first = cards.first();
    const second = cards.last();
    if (eventId === 'night-watch') {
      await expect(first).toContainText('energy -8 · each involved survivor');
      await expect(first).toContainText('Possible setback · Minor severity');
      await expect(first).toContainText('morale -4 · each involved survivor · 70% chance');
      await expect(first).toContainText('morale +6 · each involved survivor');
      await expect(first).toContainText('Applies if its target survives');
      await expect(second).toContainText('No random setback');
    } else if (eventId === 'fallen-palm') {
      await expect(first).toContainText('Moderate severity');
      await expect(first).toContainText('sprain injury severity 2, morale -10');
      await expect(first).toContainText('45% chance');
    } else {
      await expect(dialog.locator('.risk-none')).toHaveCount(2);
      await expect(dialog).not.toContainText('% chance');
      if (eventId === 'forager-instinct') {
        await expect(first).toContainText('food +0.25');
        await expect(first).toContainText('morale +4');
        await expect(second).toContainText('larger edible portion');
        await expect(second).toContainText('food +2');
      }
      if (eventId === 'seep-follow-up') {
        await expect(second).toContainText('Fill another container');
        await expect(second).toContainText('water +1');
        await expect(second).toContainText('No delayed event effect or follow-up is scheduled');
      }
      if (eventId === 'driftwood-cache') {
        await expect(second).toContainText('Leave it behind');
        await expect(second).toContainText('no wood is stored or return visit arranged');
      }
      if (eventId === 'smoke-on-horizon' || eventId === 'signal-answer') {
        await expect(dialog).toContainText(
          'rescue remains scheduled for day 14 if anyone survives',
        );
        await expect(first).toContainText('Guaranteed supply cost');
      }
      if (eventId === 'smoke-on-horizon')
        await expect(first).toContainText('Possible follow-up event: An Answering Flash');
      if (eventId === 'storm-front')
        await expect(first).toContainText('energy -5 · each involved survivor');
    }
    await first.getByRole('button').click();
    await expect(dialog.getByRole('heading', { name: 'Decision result' })).toBeVisible();
    const saved = await page.evaluate(() => localStorage.getItem('untitled-island:resume')!);
    expect(parseSaveEnvelope(saved).ok).toBe(true);
  });
}

test('does not promise a night-watch reward after rescue', async ({ page }) => {
  const state = createGame('issue5-late-watch');
  state.reservations = [];
  for (const survivor of state.survivors) survivor.activeTask = null;
  state.clock.tick = state.config.rescueTick - 100;
  state.clock.day = 14;
  state.status = 'decision';
  state.eventSchedule.nextEventTick = null;
  state.activeEvent = {
    id: 'night-watch',
    activatedTick: state.clock.tick,
    participantIds: state.survivors.slice(0, 2).map((survivor) => survivor.id),
    chosenChoiceId: null,
    result: null,
  };
  const raw = serializeSave(state);
  expect(parseSaveEnvelope(raw).ok).toBe(true);
  await page.addInitScript((save) => localStorage.setItem('untitled-island:resume', save), raw);
  await page.goto('/');
  await page.getByTestId('resume-saved').click();
  const card = page.getByTestId('event-choice-card').first();
  await expect(card).toContainText(
    'The delayed effect falls after rescue and will not be scheduled',
  );
  await card.getByRole('button').click();
  await expect(page.getByTestId('result-details')).toContainText(
    'Delayed consequence was not scheduled before rescue',
  );
});
