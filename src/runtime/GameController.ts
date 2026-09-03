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

  private readonly handleFrame = (timestamp: number): void => {
    this.frameHandle = null;
    if (!this.running || this.hidden) return;
    const elapsed = this.lastFrameAt === null ? 0 : Math.max(0, timestamp - this.lastFrameAt);
    this.lastFrameAt = timestamp;
    const statusBeforeStep = this.loop.getState().status;
    this.loop.advanceElapsed(elapsed);
    const statusAfterStep = this.loop.getState().status;
    const enteredTerminalState = statusBeforeStep === 'running' && statusAfterStep !== 'running';
    if (enteredTerminalState || timestamp - this.lastPublishedAt >= this.snapshotIntervalMs) {
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

  public start(): void {
    if (this.running || this.hidden) return;
    this.running = true;
    this.manuallyPaused = false;
    this.loop.setPaused(false);
    this.lastFrameAt = null;
    this.requestFrame();
  }

  public stop(): void {
    this.running = false;
    this.cancelFrame();
    this.loop.stop();
  }

  public pause(): void {
    this.manuallyPaused = true;
    this.loop.setPaused(true);
    this.cancelFrame();
    this.publish(this.scheduler.now());
  }

  public resume(): void {
    if (this.hidden || this.loop.getState().status !== 'running') return;
    this.manuallyPaused = false;
    this.loop.setPaused(false);
    this.running = true;
    this.lastFrameAt = null;
    this.requestFrame();
  }

  public setSpeed(speed: Speed): void {
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
    this.publish(this.scheduler.now());
  }

  public dispatch(command: GameCommand): CommandResult {
    const result = applyCommand(this.loop.getState(), command);
    if (result.accepted) {
      this.loop.setState(result.state);
      this.onCheckpoint?.(createSnapshot(result.state));
      this.publish(this.scheduler.now());
      if (result.state.status !== 'running') this.stop();
    }
    return result;
  }

  public destroy(): void {
    this.stop();
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

  private publish(timestamp: number): void {
    this.lastPublishedAt = timestamp;
    const snapshot = createSnapshot(this.loop.getState());
    for (const listener of this.listeners) listener(snapshot);
  }
}
