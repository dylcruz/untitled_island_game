import { describe, expect, it } from 'vitest';
import { createGame } from '../game/simulation';
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
    const controller = new GameController(
      createGame({ seed: 'terminal-publication', ticksPerDay: 1, rescueTick: 1 }),
      { scheduler, snapshotHz: 8 },
    );
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
});
