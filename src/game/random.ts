import type { RandomStreamState, RandomStreamStates } from './types';

export const RANDOM_STREAM_NAMES = [
  'survivorGeneration',
  'islandCosmetics',
  'behavior',
  'eventSelection',
  'eventOutcome',
] as const;

export const RANDOM_STREAM_LABELS = {
  survivorGeneration: 'survivor-generation',
  islandCosmetics: 'island-cosmetics',
  behavior: 'behavior',
  eventSelection: 'event-selection',
  eventOutcome: 'event-outcome',
} as const;

export interface WeightedOption<T> {
  value: T;
  weight: number;
}

function hashSeed(seed: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0 || 2_654_435_761;
}

export function deriveStreamState(seed: string, streamLabel: string): RandomStreamState {
  const base = hashSeed(`${seed}\u0000${streamLabel}`);
  return { state: base };
}

export function createRandomStreamStates(seed: string): RandomStreamStates {
  return {
    survivorGeneration: deriveStreamState(seed, RANDOM_STREAM_LABELS.survivorGeneration),
    islandCosmetics: deriveStreamState(seed, RANDOM_STREAM_LABELS.islandCosmetics),
    behavior: deriveStreamState(seed, RANDOM_STREAM_LABELS.behavior),
    eventSelection: deriveStreamState(seed, RANDOM_STREAM_LABELS.eventSelection),
    eventOutcome: deriveStreamState(seed, RANDOM_STREAM_LABELS.eventOutcome),
  };
}

function validState(state: RandomStreamState): number {
  if (!Number.isInteger(state.state)) {
    throw new Error('PRNG state must be an integer');
  }
  return state.state >>> 0;
}

/** A tiny serializable Mulberry32 source. It never reads ambient randomness. */
export class DeterministicRandom {
  private state: number;

  public constructor(initialState: RandomStreamState | number) {
    this.state = typeof initialState === 'number' ? initialState >>> 0 : validState(initialState);
  }

  public next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }

  public integer(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new Error('integer bounds must be ordered integers');
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  public pickWeighted<T>(options: readonly WeightedOption<T>[]): T {
    const available = options.filter(
      (option) => option.weight > 0 && Number.isFinite(option.weight),
    );
    const total = available.reduce((sum, option) => sum + option.weight, 0);
    if (total <= 0 || available.length === 0) {
      throw new Error('pickWeighted requires at least one positive weight');
    }
    let cursor = this.next() * total;
    for (const option of available) {
      cursor -= option.weight;
      if (cursor < 0) return option.value;
    }
    return available[available.length - 1]!.value;
  }

  public shuffle<T>(values: readonly T[]): T[] {
    const shuffled = [...values];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = this.integer(0, index);
      const current = shuffled[index]!;
      shuffled[index] = shuffled[swapIndex]!;
      shuffled[swapIndex] = current;
    }
    return shuffled;
  }

  public exportState(): RandomStreamState {
    return { state: this.state >>> 0 };
  }
}

export function cloneRandomStreamStates(states: RandomStreamStates): RandomStreamStates {
  return {
    survivorGeneration: { ...states.survivorGeneration },
    islandCosmetics: { ...states.islandCosmetics },
    behavior: { ...states.behavior },
    eventSelection: { ...states.eventSelection },
    eventOutcome: { ...states.eventOutcome },
  };
}
