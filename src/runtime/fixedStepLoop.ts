import type { GameStatus, Speed } from '../game/types';
import { SPEEDS } from '../game/types';
import { TUNING } from '../game/tuning';

export interface FixedStepLoopOptions<T> {
  stepMs?: number;
  speed?: Speed;
  maxCatchUpSteps?: number;
  isRunning?: (state: T) => boolean;
}

export interface FixedStepResult {
  steps: number;
  droppedMs: number;
  accumulatorMs: number;
}

const DEFAULT_IS_RUNNING = (state: unknown): boolean => {
  if (typeof state === 'object' && state !== null && 'status' in state) {
    return (state as { status: GameStatus }).status === 'running';
  }
  return true;
};

/**
 * Converts wall-clock deltas into deterministic fixed simulation steps.
 * Excess whole steps are intentionally dropped after the cap: the simulation
 * falls behind rather than producing a burst on the next animation frame.
 */
export class FixedStepLoop<T> {
  private readonly stepMs: number;

  private readonly maxCatchUpSteps: number;

  private readonly step: (state: T) => T;

  private readonly isRunning: (state: T) => boolean;

  private state: T;

  private accumulatorMs = 0;

  private speed: Speed;

  private paused = false;

  public constructor(state: T, step: (state: T) => T, options: FixedStepLoopOptions<T> = {}) {
    this.stepMs = options.stepMs ?? 100;
    this.maxCatchUpSteps = options.maxCatchUpSteps ?? TUNING.maxCatchUpSteps;
    this.step = step;
    this.isRunning = options.isRunning ?? DEFAULT_IS_RUNNING;
    this.state = state;
    this.speed = options.speed ?? 1;
    if (!Number.isFinite(this.stepMs) || this.stepMs <= 0)
      throw new Error('stepMs must be positive');
    if (!Number.isInteger(this.maxCatchUpSteps) || this.maxCatchUpSteps <= 0) {
      throw new Error('maxCatchUpSteps must be a positive integer');
    }
    this.assertSpeed(this.speed);
  }

  public getState(): T {
    return this.state;
  }

  public setState(state: T): void {
    this.state = state;
    if (!this.isRunning(state)) this.stop();
  }

  public getSpeed(): Speed {
    return this.speed;
  }

  public setSpeed(speed: Speed): void {
    this.assertSpeed(speed);
    this.speed = speed;
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) this.resetAccumulator();
  }

  public isPaused(): boolean {
    return this.paused || this.speed === 0 || !this.isRunning(this.state);
  }

  public getAccumulatorMs(): number {
    return this.accumulatorMs;
  }

  public resetAccumulator(): void {
    this.accumulatorMs = 0;
  }

  public stop(): void {
    this.paused = true;
    this.resetAccumulator();
  }

  public advanceElapsed(elapsedMs: number): FixedStepResult {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
      throw new Error('elapsedMs must be a finite, non-negative number');
    }
    if (this.isPaused()) {
      return { steps: 0, droppedMs: 0, accumulatorMs: this.accumulatorMs };
    }

    this.accumulatorMs += elapsedMs * this.speed;
    let steps = 0;
    while (this.accumulatorMs + Number.EPSILON >= this.stepMs && steps < this.maxCatchUpSteps) {
      this.accumulatorMs -= this.stepMs;
      this.state = this.step(this.state);
      steps += 1;
      if (!this.isRunning(this.state)) {
        const droppedMs = this.accumulatorMs;
        this.stop();
        return { steps, droppedMs, accumulatorMs: 0 };
      }
    }

    // Keep at most a fractional frame after a cap. This bounds the next-frame
    // work to one step and makes a long stall observable as simulation drift.
    let droppedMs = 0;
    if (steps === this.maxCatchUpSteps && this.accumulatorMs >= this.stepMs) {
      droppedMs = this.accumulatorMs - (this.accumulatorMs % this.stepMs);
      this.accumulatorMs %= this.stepMs;
    }
    return { steps, droppedMs, accumulatorMs: this.accumulatorMs };
  }

  private assertSpeed(speed: Speed): void {
    if (!SPEEDS.includes(speed)) throw new Error(`unsupported speed: ${speed}`);
  }
}
