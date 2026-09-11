import { describe, expect, it } from 'vitest';
import { getChoiceAvailability } from '../game/choiceAvailability';
import { EVENT_BY_ID } from '../game/events';
import { formatSupply, formatSupplyEstimate } from '../presentation/supplies';

describe('supply presentation', () => {
  it('rounds derived targets without changing conservative stock formatting', () => {
    expect(formatSupplyEstimate(3 * 2.8)).toBe('8.4');
    expect(formatSupplyEstimate(3 * 2.8 - 6)).toBe('2.4');
    expect(formatSupplyEstimate(0.001)).toBe('<0.01');
    expect(formatSupply(2 - Number.EPSILON)).toBe('1.99');
  });
  it.each([
    [0, '0'],
    [0.25, '0.25'],
    [0.29, '0.29'],
    [1.6, '1.6'],
    [2 - Number.EPSILON, '1.99'],
    [2, '2'],
    [0.009, '<0.01'],
    [Number.MIN_VALUE, '<0.01'],
    [12.345, '12.34'],
    [12.3, '12.3'],
  ])('formats %s as %s', (value, expected) => {
    expect(formatSupply(value)).toBe(expected);
  });
});

describe('shared choice affordability', () => {
  const patch = EVENT_BY_ID['leaking-roof'].choices[0]!;
  it.each([0, 0.25, 1.6, 2 - Number.EPSILON, 2, 2.25])(
    'compares the exact balance %s with the cost',
    (materials) => {
      const result = getChoiceAvailability({ water: 0, food: 0, materials }, patch);
      expect(result.affordable).toBe(materials >= 2);
      expect(result.costs).toEqual([{ resource: 'materials', amount: 2, available: materials }]);
      expect(result.shortages).toHaveLength(materials < 2 ? 1 : 0);
    },
  );
  it('aggregates losses across resources without crediting gains or discounting conditional costs', () => {
    const resources = { water: 0.25, food: 0, materials: 1.6 };
    const result = getChoiceAvailability(resources, {
      ...patch,
      immediateEffects: [
        { kind: 'resource', target: 'materials', amount: 10 },
        { kind: 'resource', target: 'materials', amount: -1 },
        { kind: 'resource', target: 'materials', amount: -1, probability: 0.2 },
        { kind: 'resource', target: 'water', amount: -1 },
      ],
    });
    expect(result.affordable).toBe(false);
    expect(result.shortages).toEqual([
      { resource: 'materials', amount: 2, available: 1.6 },
      { resource: 'water', amount: 1, available: 0.25 },
    ]);
    expect(resources).toEqual({ water: 0.25, food: 0, materials: 1.6 });
    expect(
      getChoiceAvailability(resources, EVENT_BY_ID['leaking-roof'].choices[1]!).affordable,
    ).toBe(true);
  });
});
