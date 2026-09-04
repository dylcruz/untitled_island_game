import { expect, test, type Page } from '@playwright/test';
import { EVENT_BY_ID } from '../src/game/events';
import { advanceStep, applyCommand, createGame } from '../src/game/simulation';
import { serializeSave } from '../src/persistence/saveSchema';

function savedEventResult(seed: string): { raw: string; step: number } {
  let state = createGame(seed);
  while (state.status === 'running') state = advanceStep(state);
  if (state.status !== 'decision' || !state.activeEvent)
    throw new Error('fixture did not reach a decision');
  const choice = EVENT_BY_ID[state.activeEvent.id].choices[0];
  if (!choice) throw new Error('fixture event has no choice');
  const result = applyCommand(state, {
    type: 'select-event-choice',
    eventId: state.activeEvent.id,
    choiceId: choice.id,
  });
  if (!result.accepted || result.state.status !== 'event-result')
    throw new Error('fixture did not reach an event result');
  return { raw: serializeSave(result.state, '2026-09-03T00:00:00.000Z'), step: state.clock.tick };
}

function savedTerminal(seed: string, result: 'victory' | 'defeat'): string {
  const state = createGame(seed);
  state.activeEvent = null;
  state.eventSchedule.nextEventTick = null;
  if (result === 'victory') {
    state.status = 'victory';
    state.clock.tick = state.config.rescueTick;
    state.clock.day = Math.ceil(state.config.rescueTick / state.config.ticksPerDay);
  } else {
    state.status = 'defeat';
    state.clock.tick = 120;
    state.clock.day = 1;
    state.reservations = [];
    for (const survivor of state.survivors) {
      survivor.alive = false;
      survivor.activeTask = null;
    }
  }
  return serializeSave(state, '2026-09-03T00:00:00.000Z');
}

async function installProductionSave(page: Page, raw: string): Promise<void> {
  await page.addInitScript({
    content: `localStorage.setItem('untitled-island:resume', ${JSON.stringify(raw)});`,
  });
}

test('production setup exposes a deterministic seed and starts a run', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Start or resume your expedition' }),
  ).toBeVisible();
  const seed = page.getByTestId('seed-input');
  await seed.fill('m4-browser-seed');
  await page.getByTestId('start-expedition').click();
  await expect(page.getByTestId('survivor-card')).toHaveCount(3);
  await expect(page.getByTestId('time-status')).toContainText('Day 1');
  await expect(page.getByText(/Checkpoint saved/)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('checkpoint write failures are exposed as accessible alerts', async ({ page }) => {
  await page.addInitScript(`Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem: () => null,
    setItem: () => { throw new Error('storage quota'); },
    removeItem: () => undefined,
  } });`);
  await page.goto('/');
  await page.getByTestId('start-expedition').click();
  await expect(page.getByRole('alert')).toContainText('Checkpoint not saved');
});

test('running checkpoints reopen through Resume and replacement is confirmed', async ({ page }) => {
  await page.goto('/');
  const seed = page.getByTestId('seed-input');
  await seed.fill('m4-resume-seed');
  await page.getByTestId('start-expedition').click();
  await expect(page.getByText(/Checkpoint saved/)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('resume-saved')).toBeVisible();
  await expect(page.getByText(/status running/)).toBeVisible();
  await page.getByTestId('resume-saved').click();
  await expect(page.getByRole('button', { name: 'Running', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'New seed', exact: true }).click();
  const confirmation = page.getByRole('dialog');
  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByRole('button', { name: 'Replace and start' })).toBeFocused();
  await confirmation.getByRole('button', { name: 'Keep current run' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('invalid production checkpoints have an accessible recovery path', async ({ page }) => {
  await page.addInitScript(
    "window.localStorage.setItem('untitled-island:resume', '{not valid json');",
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Saved expedition unavailable');
  await page.getByRole('button', { name: 'Discard saved checkpoint' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByTestId('start-expedition')).toBeVisible();
});

test('a saved decision reopens paused at its exact state', async ({ page }) => {
  let state = createGame('m4-decision-resume');
  while (state.status === 'running') state = advanceStep(state);
  const raw = serializeSave(state, '2026-09-03T00:00:00.000Z');
  await page.addInitScript({
    content: `localStorage.setItem('untitled-island:resume', ${JSON.stringify(raw)});`,
  });
  await page.goto('/');
  await expect(page.getByTestId('resume-saved')).toBeVisible();
  const savedStep = state.clock.tick;
  await page.getByTestId('resume-saved').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByTestId('time-status')).toContainText(`step ${savedStep} of`);
  await expect(page.getByRole('dialog').getByRole('button').first()).toBeFocused();
  const pausedTime = await page.getByTestId('time-status').textContent();
  await page.waitForTimeout(200);
  await expect(page.getByTestId('time-status')).toHaveText(pausedTime ?? '');
});

test('oversized checkpoints announce recovery and allow a fresh run', async ({ page }) => {
  await page.addInitScript(
    "window.localStorage.setItem('untitled-island:resume', 'x'.repeat(524289));",
  );
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('too large to open safely');
  await page.getByRole('button', { name: 'Discard saved checkpoint' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByTestId('start-expedition').click();
  await expect(page.getByTestId('survivor-card')).toHaveCount(3);
});

test('event-result checkpoints resume exactly and remain paused', async ({ page }) => {
  const fixture = savedEventResult('m4-event-result-resume');
  await installProductionSave(page, fixture.raw);
  await page.goto('/');
  await page.getByTestId('resume-saved').click();
  await expect(page.getByRole('heading', { name: 'Decision result' })).toBeVisible();
  await expect(page.getByTestId('time-status')).toContainText(`step ${fixture.step} of`);
  const savedTime = await page.getByTestId('time-status').textContent();
  await page.waitForTimeout(250);
  await expect(page.getByTestId('time-status')).toHaveText(savedTime ?? '');
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeFocused();
});

for (const result of ['victory', 'defeat'] as const) {
  test(`unacknowledged ${result} checkpoints survive reload and acknowledgement clears storage`, async ({
    page,
  }) => {
    await installProductionSave(page, savedTerminal(`m4-terminal-${result}`, result));
    await page.goto('/');
    await page.getByTestId('resume-saved').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button').first()).toBeFocused();
    await expect(
      page.getByRole('heading', { name: result === 'victory' ? /Victory/ : /Defeat/ }),
    ).toBeVisible();
    await page.reload();
    await page.getByTestId('resume-saved').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button').first()).toBeFocused();
    await page.getByTestId('acknowledge-ending').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText(/terminal checkpoint was cleared/)).toBeVisible();
    await expect(
      page.evaluate("localStorage.getItem('untitled-island:resume')"),
    ).resolves.toBeNull();
  });
}

test('ending restart actions preserve or replace the seed explicitly', async ({ page }) => {
  const originalSeed = 'm4-restart-original';
  await installProductionSave(page, savedTerminal(originalSeed, 'victory'));
  await page.goto('/');
  await page.getByTestId('resume-saved').click();
  await page.getByRole('button', { name: 'Restart with same seed', exact: true }).click();
  await expect(page.locator('.game-layout')).toHaveAttribute('data-seed', originalSeed);
  await expect(page.getByRole('button', { name: 'Running', exact: true })).toBeDisabled();

  await page.evaluate(
    (raw) => localStorage.setItem('untitled-island:resume', raw),
    savedTerminal('m4-restart-random', 'victory'),
  );
  await page.reload();
  await page.getByTestId('resume-saved').click();
  await page.getByRole('button', { name: 'Restart with randomized seed', exact: true }).click();
  await expect(page.locator('.game-layout')).not.toHaveAttribute('data-seed', 'm4-restart-random');
  await expect(page.getByRole('button', { name: 'Running', exact: true })).toBeDisabled();
});

test('mobile touch flow covers setup, controls, decision, and continue targets', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'touch geometry is covered by the mobile project');
  await page.setViewportSize({ width: 412, height: 915 });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: 'http://127.0.0.1:4173',
  });
  await page.goto('/');
  const seed = page.getByTestId('seed-input');
  const originalSeed = await seed.inputValue();
  await page.getByRole('button', { name: 'Randomize', exact: true }).tap();
  await expect(seed).not.toHaveValue(originalSeed);
  await page.getByRole('button', { name: 'Copy seed', exact: true }).tap();
  await expect(page.getByText(/Seed copied|Copy was unavailable/)).toBeVisible();
  const setupBoxes = await page.locator('button:visible').evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
  for (const box of setupBoxes) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await seed.fill('m4-touch-reuse');
  await page.getByTestId('start-expedition').tap();
  await expect(page.locator('.game-layout')).toHaveAttribute('data-seed', 'm4-touch-reuse');
  await page.getByRole('button', { name: '0x', exact: true }).tap();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  await page.getByTestId('priority-water').tap();
  await page.getByRole('button', { name: '8x', exact: true }).tap();
  const decision = page.getByRole('dialog');
  await expect(decision).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId('announcement')).toContainText('Decision required');
  const boxes = await page.locator('button:visible').evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    }),
  );
  for (const box of boxes) {
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await decision.getByTestId('event-choice-card').first().getByRole('button').tap();
  await expect(page.getByRole('heading', { name: 'Decision result' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).tap();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('visibility interruption checkpoints without catch-up drift', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-expedition').click();
  await page.getByRole('button', { name: '1x', exact: true }).click();
  await page.waitForTimeout(250);
  await expect(page.getByTestId('time-status')).toContainText(/step [1-9]/, { timeout: 3_000 });
  await page.evaluate(`(() => {
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
  })()`);
  const checkpoint = await page.evaluate(() => localStorage.getItem('untitled-island:resume'));
  expect(checkpoint).not.toBeNull();
  const checkpointStep = Number(JSON.parse(checkpoint ?? '{}').gameState?.clock?.tick);
  await page.waitForTimeout(300);
  await expect(
    page.evaluate((raw) => localStorage.getItem('untitled-island:resume') === raw, checkpoint),
  ).resolves.toBe(true);
  await page.reload();
  await expect(page.locator('.resume-summary')).toContainText(
    `step ${checkpointStep.toLocaleString()}`,
  );
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`wide dashboard stays within the ${viewport.width}px viewport`, async ({ page }) => {
    test.setTimeout(14_000);
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByTestId('start-expedition').click();
    await expect(page.getByTestId('survivor-card')).toHaveCount(3);
    await expect(page.getByTestId('production-history')).toBeVisible();
    await page.getByRole('button', { name: '8x', exact: true }).click();
    const decision = page.getByRole('dialog');
    await expect(decision).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('production-history').locator('.history-entry')).toHaveCount(8);
    await expect(page.getByTestId('announcement')).toContainText('Decision required');
    await decision.getByTestId('event-choice-card').first().getByRole('button').click();
    await expect(page.getByRole('heading', { name: 'Decision result' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: '0x', exact: true }).click();
    await expect(page.getByText('Paused', { exact: true })).toBeVisible();
    const metrics = (await page.evaluate(`(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      layout: getComputedStyle(document.querySelector('.game-layout')).gridTemplateColumns,
      cards: Array.from(document.querySelectorAll('.survivor-card')).map((element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      }),
      history: Array.from(document.querySelectorAll('.history-entry')).map((element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      }),
      historySection: (() => {
        const element = document.querySelector('.production-overview .history');
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      })(),
      targets: Array.from(document.querySelectorAll('button.speed, button.priority')).map((element) => {
        const rect = element.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }),
    }))()`)) as {
      scrollHeight: number;
      innerHeight: number;
      scrollWidth: number;
      layout: string;
      cards: { top: number; bottom: number }[];
      history: { top: number; bottom: number }[];
      historySection: { top: number; bottom: number } | null;
      targets: { width: number; height: number }[];
    };
    expect(metrics.scrollWidth).toBeLessThanOrEqual(viewport.width);
    expect(metrics.scrollHeight).toBeLessThanOrEqual(metrics.innerHeight);
    expect(metrics.layout.split(' ').length).toBe(3);
    expect(metrics.cards).toHaveLength(3);
    for (const rect of metrics.cards) {
      expect(rect.top).toBeGreaterThanOrEqual(0);
      expect(rect.bottom).toBeLessThanOrEqual(metrics.innerHeight);
    }
    expect(metrics.historySection).not.toBeNull();
    expect(metrics.historySection!.top).toBeGreaterThanOrEqual(0);
    expect(metrics.historySection!.bottom).toBeLessThanOrEqual(metrics.innerHeight);
    for (const rect of metrics.history) {
      expect(rect.top).toBeGreaterThanOrEqual(0);
      expect(rect.bottom).toBeLessThanOrEqual(metrics.innerHeight);
    }
    for (const target of metrics.targets) {
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
    }
    await page.screenshot({
      path: `/tmp/m4-browser-${viewport.width}-history8.png`,
      fullPage: true,
    });
  });
}
