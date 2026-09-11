import { describe, expect, it } from 'vitest';
import { deriveCampOutlook } from '../game/campOutlook';
import { advanceStep, applyCommand, createGame, economyRates } from '../game/simulation';
import { TUNING } from '../game/tuning';

const setup = () => createGame('issue-9-outlook');

describe('read-only camp outlook', () => {
  it('uses living population and exact fractional stock without changing state or RNG', () => {
    const state = setup();
    state.resources.water = 0.29;
    const before = JSON.stringify(state);
    expect(deriveCampOutlook(state).supplies[0]).toMatchObject({ stored: 0.29, target: 10.5 });
    expect(JSON.stringify(state)).toBe(before);
    state.survivors[0]!.alive = false;
    state.survivors[0]!.activeTask = null;
    state.reservations = state.reservations.filter((r) => r.survivorId !== state.survivors[0]!.id);
    expect(deriveCampOutlook(state).supplies[0]!.target).toBe(7);
    state.survivors.forEach((s) => {
      s.alive = false;
    });
    expect(deriveCampOutlook(state).urgentNeed).toBeNull();
    expect(deriveCampOutlook(state).nextReplenishmentTick).toBeNull();
  });

  it('separates reserved incoming output from unreserved and depleted sources', () => {
    const state = setup();
    const reservation = state.reservations.find((r) => r.sourceId === 'water')!;
    expect(reservation).toBeDefined();
    const reservedWater = state.reservations
      .filter((r) => r.sourceId === 'water')
      .reduce((sum, r) => sum + r.expectedYield, 0);
    state.island.sourceStates.water.available = reservedWater;
    const outlook = deriveCampOutlook(state);
    expect(outlook.sources.find((s) => s.id === 'water')!.unreserved).toBe(0);
    const water = outlook.supplies[0]!;
    expect(water.incoming).toBe(reservedWater);
    expect(water.shortfall).toBe(Math.max(0, water.target - water.stored - water.incoming));
    state.reservations = state.reservations.filter((r) => r.sourceId !== 'water');
    state.survivors.find((s) => s.id === reservation.survivorId)!.activeTask = null;
    state.island.sourceStates.water.available = 0;
    expect(deriveCampOutlook(state).supplies[0]!.incoming).toBe(0);
    expect(deriveCampOutlook(state).sources.find((s) => s.id === 'water')!.unreserved).toBe(0);
  });

  it('matches replenishment at dawn and suppresses a nonexistent rescue-day refill', () => {
    for (const mode of ['production', 'slice'] as const) {
      const state = createGame({ mode, seed: 'issue-9-dawn' });
      state.clock.tick = state.config.ticksPerDay - 1;
      state.island.sourceStates.water.available = 0;
      const outlook = deriveCampOutlook(state);
      expect(outlook.nextReplenishmentTick).toBe(state.config.ticksPerDay);
      const amount = outlook.sources.find((s) => s.id === 'water')!.replenishment;
      expect(amount).toBe(economyRates(state).dawnReplenishment.water);
      expect(advanceStep(state).island.sourceStates.water.available).toBe(amount);
      state.clock.tick = state.config.rescueTick - 1;
      expect(deriveCampOutlook(state).nextReplenishmentTick).toBeNull();
      expect(outlook.sources.find((s) => s.id === 'wreckage')!.replenishment).toBe(0);
    }
  });

  it('identifies critical needs even without stock, and follows core self-care/night constraints', () => {
    const state = setup();
    const survivor = state.survivors[0]!;
    survivor.needs.thirst = 100;
    expect(deriveCampOutlook(state).urgentNeed).toMatchObject({
      name: survivor.name,
      kind: 'thirst',
      critical: true,
    });
    expect(deriveCampOutlook(state).work[0]!.constraint).toBe('critical-thirst');
    state.resources.water = 0;
    expect(deriveCampOutlook(state).urgentNeed!.critical).toBe(true);
    expect(deriveCampOutlook(state).work[0]!.constraint).toBeNull();
    survivor.needs.thirst = 0;
    survivor.needs.energy = TUNING.critical.energy;
    expect(deriveCampOutlook(state).work[0]!.constraint).toBe('low-energy');
    survivor.needs.energy = 100;
    survivor.needs.health = 30;
    expect(deriveCampOutlook(state).work[0]!.constraint).toBe('critical-health');
    survivor.needs.health = 100;
    state.clock.tick = Math.ceil(state.config.ticksPerDay * 0.8);
    expect(deriveCampOutlook(state).work.every((w) => w.constraint === 'night-sleep')).toBe(true);
  });

  it('explains a newly selected priority waiting for existing work and counts repair reservations separately', () => {
    const state = setup();
    const result = applyCommand(state, { type: 'set-camp-priority', priority: 'food' });
    expect(result.accepted).toBe(true);
    expect(result.state.survivors.map((s) => s.activeTask)).toEqual(
      state.survivors.map((s) => s.activeTask),
    );
    expect(deriveCampOutlook(result.state).work.every((w) => w.previousPriority)).toBe(true);
    state.reservations.push({
      id: 'repair',
      taskId: 'repair',
      survivorId: state.survivors[0]!.id,
      sourceId: 'forest',
      kind: 'materials',
      expectedYield: 0,
      reservedAmount: 2,
    });
    expect(deriveCampOutlook(state).reservedMaterials).toBe(2);
    expect(deriveCampOutlook(state).supplies[2]!.incoming).toBe(0);
  });
});
