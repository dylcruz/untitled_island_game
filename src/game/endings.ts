import type { EndingQuality, EndingSummary, GameState } from './types';

export function deriveEndingSummary(state: GameState): EndingSummary {
  const living = state.survivors.filter((survivor) => survivor.alive);
  const averageHealth = living.length
    ? living.reduce((sum, survivor) => sum + survivor.needs.health, 0) / living.length
    : 0;
  const averageMorale = living.length
    ? living.reduce((sum, survivor) => sum + survivor.morale, 0) / living.length
    : 0;
  let quality: EndingQuality = 'lost-expedition';
  if (
    living.length === state.survivors.length &&
    averageHealth >= 65 &&
    averageMorale >= 45 &&
    state.shelter.condition >= 45
  )
    quality = 'triumphant-rescue';
  else if (living.length >= 2 && averageHealth >= 35) quality = 'costly-rescue';
  else if (living.length >= 1) quality = 'barely-alive';
  return {
    result: living.length ? 'victory' : 'defeat',
    quality,
    daysSurvived: Math.min(14, Math.ceil(state.clock.tick / state.config.ticksPerDay)),
    seed: state.seed,
    survivors: state.survivors.map((survivor) => {
      const turningPoints = state.turningPoints.filter((point) =>
        point.survivorIds.includes(survivor.id),
      );
      return {
        survivorId: survivor.id,
        name: survivor.name,
        fate: survivor.alive ? 'rescued' : 'lost',
        summary: survivor.alive
          ? `${survivor.name} was rescued with ${Math.round(survivor.needs.health)} health and ${Math.round(survivor.morale)} morale.`
          : `${survivor.name} was lost before rescue.`,
        turningPoints,
      };
    }),
    notableChoices: state.choiceRecords.slice(-5),
  };
}
