import { advanceStep, createGame, createSnapshot } from '../src/game/index';
import type { GameState } from '../src/game/index';

const DEFAULT_RUNS = 3;
const DEFAULT_SEED = 'm0-headless';

interface SimulationResult {
  seed: string;
  status: GameState['status'];
  tick: number;
  day: number;
  survivorCount: number;
  aliveCount: number;
  serializedStateBytes: number;
}

function parseArgument(name: string): string | undefined {
  const prefix = `${name}=`;
  const value = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  return value?.slice(prefix.length);
}

function parseRuns(): number {
  const value = parseArgument('--runs');
  if (value === undefined) return DEFAULT_RUNS;
  const runs = Number(value);
  if (!Number.isInteger(runs) || runs < 1 || runs > 1000) {
    throw new Error('--runs must be an integer between 1 and 1000');
  }
  return runs;
}

function runOnce(seed: string): SimulationResult {
  let state = createGame(seed);
  const maximumSteps = state.config.rescueTick + 1;
  let guard = 0;

  while (state.status === 'running' && guard < maximumSteps) {
    state = advanceStep(state);
    guard += 1;
  }

  if (state.status === 'running') {
    throw new Error(`simulation did not reach a terminal state within ${maximumSteps} steps`);
  }

  const snapshot = createSnapshot(state);
  const serializedStateBytes = JSON.stringify(snapshot).length;
  return {
    seed,
    status: snapshot.status,
    tick: snapshot.clock.tick,
    day: snapshot.clock.day,
    survivorCount: snapshot.survivors.length,
    aliveCount: snapshot.survivors.filter((survivor) => survivor.alive).length,
    serializedStateBytes,
  };
}

function main(): void {
  const runs = parseRuns();
  const seedPrefix = parseArgument('--seed') ?? DEFAULT_SEED;
  if (seedPrefix.trim().length === 0) throw new Error('--seed must not be empty');

  const results = Array.from({ length: runs }, (_, index) =>
    runOnce(runs === 1 ? seedPrefix : `${seedPrefix}-${index + 1}`),
  );
  const allDeterministic = results.every((result) => result.survivorCount === 3);
  if (!allDeterministic)
    throw new Error('foundation simulation did not create exactly three survivors');

  console.log(
    JSON.stringify(
      {
        policy: 'foundation-stepper',
        version: 'm0',
        runs,
        results,
      },
      null,
      2,
    ),
  );
}

main();
