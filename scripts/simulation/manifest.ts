import { createHash } from 'node:crypto';
import releaseManifest from '../manifests/m5-release-v1.json' with { type: 'json' };

export interface SeedManifest {
  id: string;
  version: string;
  algorithm: string;
  prefix: string;
  count: number;
  width: number;
  firstSeed: string;
  lastSeed: string;
  sha256: string;
}

export function loadReleaseManifest(): { definition: SeedManifest; seeds: string[] } {
  const definition: SeedManifest = releaseManifest;
  if (definition.algorithm !== 'prefix-plus-one-based-zero-padded-decimal-v1')
    throw new Error(`unsupported manifest algorithm: ${definition.algorithm}`);
  const seeds = Array.from(
    { length: definition.count },
    (_, index) => `${definition.prefix}${String(index + 1).padStart(definition.width, '0')}`,
  );
  const hash = createHash('sha256').update(seeds.join('\n')).digest('hex');
  if (
    new Set(seeds).size !== definition.count ||
    seeds[0] !== definition.firstSeed ||
    seeds.at(-1) !== definition.lastSeed ||
    hash !== definition.sha256
  )
    throw new Error(`manifest ${definition.id} failed count, uniqueness, endpoint, or hash checks`);
  return { definition, seeds };
}
