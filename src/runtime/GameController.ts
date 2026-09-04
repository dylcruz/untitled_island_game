import { advanceStep, applyCommand, createSnapshot } from '../game/simulation';
import { FixedStepLoop } from './fixedStepLoop';
import type { CommandResult, GameCommand, GameSnapshot, GameState, Speed } from '../game/types';
import { TUNING } from '../game/tuning';

export interface FrameScheduler {
  now(): number;
  request(callback: (timestamp: number) => void): number;
  cancel(handle: number): void;
}

export interface VisibilitySource {
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
  get hidden(): boolean;
}

export interface GameControllerOptions {
  scheduler?: FrameScheduler;
  visibility?: VisibilitySource;
  snapshotHz?: number;
  onCheckpoint?: (state: GameSnapshot) => void;
}

export type ActiveSpeed = 1 | 3 | 8;

/** Observable lifecycle classification used by the local playtest timer. */
export type PlaybackState =
  'idle' | 'running' | 'manual-paused' | 'hidden' | 'decision' | 'event-result' | 'terminal';

/** Wall-clock timing collected locally for a single started run. */
export interface RuntimeTimingSummary {
  wallDurationMs: number;
  activeBySpeedMs: Record<ActiveSpeed, number>;
  manualPausedMs: number;
  hiddenMs: number;
  decisionMs: number;
}

function browserScheduler(): FrameScheduler {
  if (typeof window === 'undefined') throw new Error('a scheduler is required outside a browser');
  return {
    now: () => window.performance.now(),
    request: (callback) => window.requestAnimationFrame(callback),
    cancel: (handle) => window.cancelAnimationFrame(handle),
  };
}

function browserVisibility(): VisibilitySource | undefined {
  return typeof document === 'undefined' ? undefined : document;
}

/** Imperative browser seam that keeps wall-clock concerns out of the game core. */
export class GameController {
  private readonly scheduler: FrameScheduler;

  private readonly visibility?: VisibilitySource;

  private readonly snapshotIntervalMs: number;

  private readonly onCheckpoint?: (state: GameSnapshot) => void;

  private readonly loop: FixedStepLoop<GameState>;

  private readonly listeners = new Set<(snapshot: GameSnapshot) => void>();

  private frameHandle: number | null = null;

  private lastFrameAt: number | null = null;

  private lastPublishedAt = Number.NEGATIVE_INFINITY;

  private running = false;

  private manuallyPaused = false;

  private hidden = false;

  private resumeAfterVisibility = false;

  private hasCheckpointedStart = false;

  private timingStarted = false;

  private timingLastAt: number | null = null;

  private timingWallDurationMs = 0;

  private timingActiveBySpeedMs: Record<ActiveSpeed, number> = {
    1: 0,
    3: 0,
    8: 0,
  };

  private timingManualPausedMs = 0;

  private timingHiddenMs = 0;

  private timingDecisionMs = 0;

  private timingFinalized = false;

  private readonly handleFrame = (timestamp: number): void => {
    this.frameHandle = null;
    if (!this.running || this.hidden) return;
    const now = this.scheduler.now();
    this.accountTiming(now);
    const elapsed = this.lastFrameAt === null ? 0 : Math.max(0, timestamp - this.lastFrameAt);
    this.lastFrameAt = timestamp;
    const before = this.loop.getState();
    this.loop.advanceElapsed(elapsed);
    const after = this.loop.getState();
    const enteredBoundary = before.status === 'running' && after.status !== 'running';
    const crossedDay = before.clock.day !== after.clock.day;
    if (enteredBoundary || crossedDay) this.onCheckpoint?.(createSnapshot(after));
    if (enteredBoundary || timestamp - this.lastPublishedAt >= this.snapshotIntervalMs) {
      this.publish(timestamp);
    }
    if (this.loop.isPaused() && this.loop.getState().status !== 'running') {
      // A terminal fixed step stops the loop itself. Keep the controller's
      // lifecycle flag in sync so a later reset can start a fresh run.
      this.running = false;
    }
    if (this.running && !this.hidden && !this.loop.isPaused()) this.requestFrame();
  };

  private readonly handleVisibility = (): void => {
    const now = this.scheduler.now();
    this.accountTiming(now);
    const isHidden = this.visibility?.hidden ?? false;
    if (isHidden) {
      this.resumeAfterVisibility = this.running && !this.manuallyPaused;
      this.hidden = true;
      this.loop.setPaused(true);
      this.cancelFrame();
      this.onCheckpoint?.(createSnapshot(this.loop.getState()));
      return;
    }
    this.hidden = false;
    this.loop.resetAccumulator();
    this.lastFrameAt = null;
    if (this.resumeAfterVisibility && !this.manuallyPaused) {
      this.loop.setPaused(false);
      this.running = true;
      this.requestFrame();
    }
    this.resumeAfterVisibility = false;
  };

  public constructor(initialState: GameState, options: GameControllerOptions = {}) {
    this.scheduler = options.scheduler ?? browserScheduler();
    this.visibility = options.visibility ?? browserVisibility();
    const snapshotHz = options.snapshotHz ?? TUNING.snapshotHz;
    if (!Number.isFinite(snapshotHz) || snapshotHz <= 0) {
      throw new Error('snapshotHz must be a positive finite number');
    }
    this.snapshotIntervalMs = 1_000 / snapshotHz;
    this.onCheckpoint = options.onCheckpoint;
    this.loop = new FixedStepLoop(initialState, advanceStep, {
      stepMs: initialState.config.fixedStepMs,
      maxCatchUpSteps: TUNING.maxCatchUpSteps,
      speed: 1,
    });
    this.visibility?.addEventListener('visibilitychange', this.handleVisibility);
    this.hidden = this.visibility?.hidden ?? false;
  }

  public subscribe(listener: (snapshot: GameSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(createSnapshot(this.loop.getState()));
    return () => this.listeners.delete(listener);
  }

  public getState(): GameState {
    return this.loop.getState();
  }

  public getSpeed(): Speed {
    return this.loop.getSpeed();
  }

  public getInterpolationAlpha(): number {
    return this.loop.getAccumulatorMs() / this.getState().config.fixedStepMs;
  }

  public getPlaybackState(): PlaybackState {
    this.accountTiming(this.scheduler.now());
    return this.getCurrentPlaybackState();
  }

  public getTimingSummary(): RuntimeTimingSummary {
    this.accountTiming(this.scheduler.now());
    return {
      wallDurationMs: this.timingWallDurationMs,
      activeBySpeedMs: { ...this.timingActiveBySpeedMs },
      manualPausedMs: this.timingManualPausedMs,
      hiddenMs: this.timingHiddenMs,
      decisionMs: this.timingDecisionMs,
    };
  }

  public start(): void {
    const now = this.scheduler.now();
    this.accountTiming(now);
    if (this.running || this.hidden) return;
    if (!this.timingStarted) {
      this.timingStarted = true;
      this.timingLastAt = now;
    }
    if (!this.hasCheckpointedStart && this.loop.getState().clock.tick === 0) {
      this.onCheckpoint?.(createSnapshot(this.loop.getState()));
      this.hasCheckpointedStart = true;
    }
    this.running = true;
    this.manuallyPaused = false;
    this.loop.setPaused(false);
    this.lastFrameAt = null;
    this.requestFrame();
  }

  public stop(): void {
    this.accountTiming(this.scheduler.now());
    this.running = false;
    this.cancelFrame();
    this.loop.stop();
  }

  public pause(): void {
    const now = this.scheduler.now();
    this.accountTiming(now);
    this.manuallyPaused = true;
    this.loop.setPaused(true);
    this.cancelFrame();
    this.publish(now);
  }

  public resume(): void {
    const now = this.scheduler.now();
    this.accountTiming(now);
    if (this.hidden || this.loop.getState().status !== 'running') return;
    this.manuallyPaused = false;
    this.loop.setPaused(false);
    this.running = true;
    this.lastFrameAt = null;
    this.requestFrame();
  }

  public setSpeed(speed: Speed): void {
    const now = this.scheduler.now();
    this.accountTiming(now);
    this.loop.setSpeed(speed);
    if (speed === 0) {
      // A zero-speed loop is still part of the controller lifecycle, but it
      // must not leave a requestAnimationFrame callback spinning forever.
      this.cancelFrame();
    } else if (!this.manuallyPaused && !this.hidden && this.loop.getState().status === 'running') {
      // Changing from 0x to a moving speed must schedule a new frame even
      // when the controller was already marked as running.
      this.running = true;
      this.loop.setPaused(false);
      this.lastFrameAt = null;
      this.requestFrame();
    }
    this.publish(now);
  }

  public dispatch(command: GameCommand): CommandResult {
    const now = this.scheduler.now();
    this.accountTiming(now);
    const result = applyCommand(this.loop.getState(), command);
    if (result.accepted) {
      this.loop.setState(result.state);
      this.onCheckpoint?.(createSnapshot(result.state));
      this.publish(now);
      if (command.type === 'reset-run') {
        // A reset is a fresh run. It must not inherit an outstanding RAF or
        // timing anchor from the previous run; the next explicit start starts
        // both lifecycles.
        this.cancelFrame();
        this.running = false;
        this.manuallyPaused = false;
        this.resumeAfterVisibility = false;
        this.loop.stop();
        this.resetTiming();
        this.hasCheckpointedStart = true;
      } else if (result.state.status !== 'running') this.stop();
    }
    return result;
  }

  public destroy(): void {
    this.accountTiming(this.scheduler.now());
    this.stop();
    this.timingFinalized = true;
    this.visibility?.removeEventListener('visibilitychange', this.handleVisibility);
    this.listeners.clear();
  }

  private requestFrame(): void {
    if (this.frameHandle === null) this.frameHandle = this.scheduler.request(this.handleFrame);
  }

  private cancelFrame(): void {
    if (this.frameHandle !== null) {
      this.scheduler.cancel(this.frameHandle);
      this.frameHandle = null;
    }
  }

  private getCurrentPlaybackState(): PlaybackState {
    const status = this.loop.getState().status;
    if (status === 'victory' || status === 'defeat') return 'terminal';
    if (this.hidden) {
      // A decision boundary may have stopped the RAF while its wall-clock
      // timer remains live; all other stopped/idle states stay uncounted.
      if (
        this.timingStarted &&
        (this.running || status === 'decision' || status === 'event-result')
      ) {
        return 'hidden';
      }
      return 'idle';
    }
    if (status === 'decision' || status === 'event-result') return status;
    if (!this.timingStarted || !this.running) return 'idle';
    if (this.manuallyPaused || this.loop.getSpeed() === 0) return 'manual-paused';
    return status === 'running' ? 'running' : 'idle';
  }

  private accountTiming(now: number): void {
    if (this.timingFinalized) return;
    if (!Number.isFinite(now)) return;
    if (this.timingLastAt === null) {
      if (this.timingStarted) this.timingLastAt = now;
      return;
    }
    const elapsed = now - this.timingLastAt;
    if (elapsed <= 0) return;
    this.timingLastAt = now;
    if (!this.timingStarted) return;

    const playbackState = this.getCurrentPlaybackState();
    if (playbackState === 'idle' || playbackState === 'terminal') return;
    this.timingWallDurationMs += elapsed;
    if (playbackState === 'hidden') {
      this.timingHiddenMs += elapsed;
    } else if (playbackState === 'decision' || playbackState === 'event-result') {
      this.timingDecisionMs += elapsed;
    } else if (playbackState === 'manual-paused') {
      this.timingManualPausedMs += elapsed;
    } else {
      const speed = this.loop.getSpeed();
      if (speed === 1 || speed === 3 || speed === 8) this.timingActiveBySpeedMs[speed] += elapsed;
    }
  }

  private resetTiming(): void {
    this.timingStarted = false;
    this.timingLastAt = null;
    this.timingWallDurationMs = 0;
    this.timingActiveBySpeedMs = { 1: 0, 3: 0, 8: 0 };
    this.timingManualPausedMs = 0;
    this.timingHiddenMs = 0;
    this.timingDecisionMs = 0;
    this.timingFinalized = false;
  }

  private publish(timestamp: number): void {
    this.lastPublishedAt = timestamp;
    const snapshot = createSnapshot(this.loop.getState());
    for (const listener of this.listeners) listener(snapshot);
  }
}
