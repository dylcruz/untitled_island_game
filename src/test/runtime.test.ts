import { describe, expect, it } from 'vitest';
import { advanceStep, createGame } from '../game/simulation';
import { EVENT_BY_ID } from '../game/events';
import { GameController } from '../runtime/GameController';
import { FixedStepLoop } from '../runtime/fixedStepLoop';

describe('fixed-step runtime', () => {
  it.each([0, 1, 3, 8] as const)('maps %sx to that many fixed steps', (speed) => {
    const loop = new FixedStepLoop(0, (value) => value + 1, {
      maxCatchUpSteps: 20,
      speed,
    });

    const result = loop.advanceElapsed(100);

    expect(result.steps).toBe(speed);
    expect(loop.getState()).toBe(speed);
  });

  it('processes equivalent fixed steps at accelerated speed', () => {
    const normal = new FixedStepLoop(0, (value) => value + 1, {
      maxCatchUpSteps: 20,
      speed: 1,
    });
    const accelerated = new FixedStepLoop(0, (value) => value + 1, {
      maxCatchUpSteps: 20,
      speed: 8,
    });

    normal.advanceElapsed(800);
    accelerated.advanceElapsed(100);

    expect(normal.getState()).toBe(accelerated.getState());
    expect(normal.getState()).toBe(8);
  });

  it('drops whole excess steps after the catch-up cap', () => {
    const loop = new FixedStepLoop(0, (value) => value + 1, {
      maxCatchUpSteps: 8,
    });

    const result = loop.advanceElapsed(2_000);

    expect(result.steps).toBe(8);
    expect(result.droppedMs).toBe(1_200);
    expect(result.accumulatorMs).toBe(0);
  });

  it('does not accumulate while paused or at zero speed', () => {
    const loop = new FixedStepLoop(0, (value) => value + 1);

    loop.setPaused(true);
    expect(loop.advanceElapsed(500)).toEqual({ steps: 0, droppedMs: 0, accumulatorMs: 0 });
    loop.setPaused(false);
    loop.setSpeed(0);
    expect(loop.advanceElapsed(500)).toEqual({ steps: 0, droppedMs: 0, accumulatorMs: 0 });
  });
});

interface TestScheduler {
  nowValue: number;
  callbacks: Map<number, (timestamp: number) => void>;
  nextHandle: number;
  now(): number;
  request(callback: (timestamp: number) => void): number;
  cancel(handle: number): void;
  run(timestamp: number): void;
}

function createScheduler(): TestScheduler {
  const scheduler: TestScheduler = {
    nowValue: 0,
    callbacks: new Map(),
    nextHandle: 1,
    now: () => scheduler.nowValue,
    request: (callback) => {
      const handle = scheduler.nextHandle;
      scheduler.nextHandle += 1;
      scheduler.callbacks.set(handle, callback);
      return handle;
    },
    cancel: (handle) => {
      scheduler.callbacks.delete(handle);
    },
    run: (timestamp) => {
      scheduler.nowValue = timestamp;
      const pending = [...scheduler.callbacks.entries()];
      scheduler.callbacks.clear();
      for (const [, callback] of pending) callback(timestamp);
    },
  };
  return scheduler;
}

function createVisibility(): {
  hidden: boolean;
  emit(): void;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
} {
  const listeners = new Set<() => void>();
  return {
    hidden: false,
    emit: () => {
      for (const listener of listeners) listener();
    },
    addEventListener: (_type, listener) => listeners.add(listener),
    removeEventListener: (_type, listener) => listeners.delete(listener),
  };
}

describe('controller visibility lifecycle', () => {
  it('pauses hidden simulation and resets the return accumulator', () => {
    const scheduler = createScheduler();
    const visibility = createVisibility();
    const controller = new GameController(createGame('visibility-seed'), {
      scheduler,
      visibility,
    });

    controller.start();
    scheduler.run(0);
    scheduler.run(100);
    expect(controller.getState().clock.tick).toBe(1);

    visibility.hidden = true;
    visibility.emit();
    expect(controller.getState().clock.tick).toBe(1);
    expect(controller.getInterpolationAlpha()).toBe(0);

    visibility.hidden = false;
    visibility.emit();
    scheduler.run(10_000);
    expect(controller.getState().clock.tick).toBe(1);
    controller.destroy();
  });

  it('throttles snapshots below animation-frame frequency', () => {
    const scheduler = createScheduler();
    const controller = new GameController(createGame('snapshot-throttle-seed'), {
      scheduler,
      snapshotHz: 8,
    });
    let published = 0;
    controller.subscribe(() => {
      published += 1;
    });

    controller.start();
    controller.setSpeed(8);
    for (let timestamp = 0; timestamp <= 400; timestamp += 16) scheduler.run(timestamp);

    expect(published).toBeLessThanOrEqual(6);
    controller.destroy();
  });

  it('publishes a terminal transition immediately despite cadence throttling', () => {
    const scheduler = createScheduler();
    const terminalState = createGame({ mode: 'slice' });
    terminalState.clock.tick = terminalState.config.rescueTick - 1;
    terminalState.clock.day = 3;
    const controller = new GameController(terminalState, { scheduler, snapshotHz: 8 });
    const snapshots: string[] = [];
    controller.subscribe((snapshot) => {
      snapshots.push(snapshot.status);
    });

    controller.start();
    scheduler.run(0);
    scheduler.run(100);

    expect(snapshots.at(-1)).toBe('victory');
    controller.destroy();
  });

  it('checkpoints start, day, event choice/acknowledgement, terminal, and hidden boundaries', () => {
    const dayCheckpoints: Array<{ status: string; tick: number; day: number }> = [];
    const dayScheduler = createScheduler();
    const dayState = createGame({ mode: 'slice', seed: 'checkpoint-day' });
    dayState.eventSchedule.nextEventTick = null;
    const dayController = new GameController(dayState, {
      scheduler: dayScheduler,
      onCheckpoint: (snapshot) =>
        dayCheckpoints.push({ ...snapshot.clock, status: snapshot.status }),
    });
    dayController.start();
    expect(dayCheckpoints[0]).toEqual({ status: 'running', tick: 0, day: 1 });
    dayScheduler.run(0);
    for (let timestamp = 100; timestamp <= 12_000; timestamp += 100) dayScheduler.run(timestamp);
    expect(dayCheckpoints.some((checkpoint) => checkpoint.day === 2)).toBe(true);
    dayController.destroy();

    let eventState = createGame({ mode: 'slice', seed: 'checkpoint-event' });
    while (eventState.status === 'running') eventState = advanceStep(eventState);
    const eventCheckpoints: string[] = [];
    const eventScheduler = createScheduler();
    const visibility = createVisibility();
    const eventController = new GameController(eventState, {
      scheduler: eventScheduler,
      visibility,
      onCheckpoint: (snapshot) => eventCheckpoints.push(snapshot.status),
    });
    const event = eventController.getState().activeEvent!;
    const choice = EVENT_BY_ID[event.id].choices[0]!;
    expect(
      eventController.dispatch({
        type: 'select-event-choice',
        eventId: event.id,
        choiceId: choice.id,
      }),
    ).toMatchObject({ accepted: true });
    expect(eventCheckpoints.at(-1)).toBe('event-result');
    expect(
      eventController.dispatch({ type: 'acknowledge-event-result', eventId: event.id }),
    ).toMatchObject({ accepted: true });
    expect(eventCheckpoints.at(-1)).toBe('running');
    eventController.start();
    eventScheduler.run(0);
    const beforeHidden = eventCheckpoints.length;
    visibility.hidden = true;
    visibility.emit();
    expect(eventCheckpoints.length).toBeGreaterThan(beforeHidden);
    expect(eventCheckpoints.at(-1)).toBe('running');
    eventController.destroy();

    const terminalCheckpoints: string[] = [];
    const terminalScheduler = createScheduler();
    const terminalState = createGame({ mode: 'slice', seed: 'checkpoint-terminal' });
    terminalState.clock.tick = terminalState.config.rescueTick - 1;
    terminalState.clock.day = 3;
    terminalState.eventSchedule.nextEventTick = null;
    const terminalController = new GameController(terminalState, {
      scheduler: terminalScheduler,
      onCheckpoint: (snapshot) => terminalCheckpoints.push(snapshot.status),
    });
    terminalController.start();
    terminalScheduler.run(0);
    terminalScheduler.run(100);
    expect(terminalCheckpoints.at(-1)).toBe('victory');
    terminalController.destroy();
  });

  it('accounts visible speed, manual-pause, and hidden buckets without overlap', () => {
    const scheduler = createScheduler();
    const visibility = createVisibility();
    const controller = new GameController(createGame({ mode: 'slice', seed: 'timing-buckets' }), {
      scheduler,
      visibility,
    });

    scheduler.nowValue = 100;
    controller.start();
    scheduler.nowValue = 150;
    controller.setSpeed(3);
    scheduler.run(150);
    scheduler.nowValue = 200;
    controller.setSpeed(8);
    scheduler.nowValue = 250;
    controller.pause();
    scheduler.nowValue = 300;
    controller.resume();
    scheduler.run(300);
    scheduler.nowValue = 350;
    visibility.hidden = true;
    visibility.emit();
    scheduler.nowValue = 400;
    visibility.hidden = false;
    visibility.emit();
    scheduler.nowValue = 450;
    controller.stop();

    expect(controller.getTimingSummary()).toEqual({
      wallDurationMs: 350,
      activeBySpeedMs: { 1: 50, 3: 50, 8: 150 },
      manualPausedMs: 50,
      hiddenMs: 50,
      decisionMs: 0,
    });
    expect(controller.getPlaybackState()).toBe('idle');
    controller.destroy();
  });

  it('gives hidden time precedence over a simultaneous manual pause', () => {
    const scheduler = createScheduler();
    const visibility = createVisibility();
    const controller = new GameController(
      createGame({ mode: 'slice', seed: 'timing-precedence' }),
      {
        scheduler,
        visibility,
      },
    );

    controller.start();
    scheduler.run(0);
    scheduler.nowValue = 100;
    controller.pause();
    scheduler.nowValue = 150;
    visibility.hidden = true;
    visibility.emit();
    scheduler.nowValue = 200;
    visibility.hidden = false;
    visibility.emit();
    scheduler.nowValue = 250;
    controller.resume();
    scheduler.nowValue = 300;
    controller.stop();

    expect(controller.getTimingSummary()).toMatchObject({
      wallDurationMs: 300,
      activeBySpeedMs: { 1: 150, 3: 0, 8: 0 },
      manualPausedMs: 100,
      hiddenMs: 50,
      decisionMs: 0,
    });
    controller.destroy();
  });

  it('keeps decision and event-result time running through acknowledgement', () => {
    let state = createGame({ mode: 'slice', seed: 'timing-decision' });
    while (state.status === 'running') state = advanceStep(state);
    const scheduler = createScheduler();
    const controller = new GameController(state, { scheduler });
    const event = controller.getState().activeEvent!;
    const choice = EVENT_BY_ID[event.id].choices[0]!;

    controller.start();
    scheduler.run(0);
    scheduler.nowValue = 120;
    expect(controller.getTimingSummary().decisionMs).toBe(120);
    scheduler.nowValue = 200;
    expect(
      controller.dispatch({ type: 'select-event-choice', eventId: event.id, choiceId: choice.id }),
    ).toMatchObject({ accepted: true });
    scheduler.nowValue = 300;
    expect(controller.getPlaybackState()).toBe('event-result');
    scheduler.nowValue = 400;
    expect(
      controller.dispatch({ type: 'acknowledge-event-result', eventId: event.id }),
    ).toMatchObject({ accepted: true });
    expect(controller.getTimingSummary()).toMatchObject({
      wallDurationMs: 400,
      decisionMs: 400,
    });
    controller.destroy();
  });

  it('counts zero speed as manual pause and resumes from zero without an RAF spin', () => {
    const scheduler = createScheduler();
    const controller = new GameController(createGame({ mode: 'slice', seed: 'timing-zero' }), {
      scheduler,
    });

    controller.start();
    scheduler.run(0);
    scheduler.nowValue = 100;
    controller.setSpeed(0);
    expect(scheduler.callbacks.size).toBe(0);
    scheduler.nowValue = 200;
    controller.setSpeed(3);
    expect(scheduler.callbacks.size).toBe(1);
    scheduler.run(300);
    expect(controller.getTimingSummary()).toMatchObject({
      wallDurationMs: 300,
      activeBySpeedMs: { 1: 100, 3: 100, 8: 0 },
      manualPausedMs: 100,
    });
    controller.destroy();
  });

  it('resets timing and RAF lifecycle until an explicit new start', () => {
    const scheduler = createScheduler();
    const controller = new GameController(createGame({ mode: 'slice', seed: 'timing-reset' }), {
      scheduler,
    });

    controller.start();
    scheduler.run(0);
    scheduler.nowValue = 50;
    expect(controller.dispatch({ type: 'reset-run' })).toMatchObject({ accepted: true });
    expect(scheduler.callbacks.size).toBe(0);
    expect(controller.getPlaybackState()).toBe('idle');
    expect(controller.getTimingSummary()).toEqual({
      wallDurationMs: 0,
      activeBySpeedMs: { 1: 0, 3: 0, 8: 0 },
      manualPausedMs: 0,
      hiddenMs: 0,
      decisionMs: 0,
    });

    scheduler.nowValue = 100;
    controller.start();
    scheduler.run(100);
    scheduler.nowValue = 150;
    expect(controller.getTimingSummary().wallDurationMs).toBe(50);
    controller.destroy();
  });

  it('returns detached timing summaries', () => {
    const scheduler = createScheduler();
    const controller = new GameController(createGame({ mode: 'slice', seed: 'timing-detached' }), {
      scheduler,
    });
    controller.start();
    scheduler.run(0);
    scheduler.nowValue = 25;
    const summary = controller.getTimingSummary();
    summary.activeBySpeedMs[1] = 999;
    expect(controller.getTimingSummary().activeBySpeedMs[1]).toBe(25);
    controller.destroy();
  });
});
