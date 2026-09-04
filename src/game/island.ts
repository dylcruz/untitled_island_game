import { TUNING } from './tuning';
import type { DeterministicRandom } from './random';
import type { IslandState, Point, SourceState, Waypoint, WaypointId, SourceId } from './types';

export const AUTHORED_WAYPOINTS: readonly Waypoint[] = [
  { id: 'camp', label: 'Camp', x: 0.28, y: 0.62 },
  { id: 'water', label: 'Fresh water', x: 0.19, y: 0.34 },
  { id: 'forage', label: 'Forage beach', x: 0.54, y: 0.23 },
  { id: 'wreckage', label: 'Wreckage', x: 0.78, y: 0.42 },
  { id: 'forest', label: 'Forest edge', x: 0.65, y: 0.76 },
  { id: 'interior', label: 'Island interior', x: 0.44, y: 0.52 },
];

export const AUTHORED_ROUTES: Readonly<Record<WaypointId, readonly WaypointId[]>> = {
  camp: ['water', 'interior', 'forest'],
  water: ['camp', 'forage', 'interior'],
  forage: ['water', 'wreckage', 'interior'],
  wreckage: ['forage', 'forest', 'interior'],
  forest: ['wreckage', 'camp', 'interior'],
  interior: ['camp', 'forage', 'forest'],
};

const WAYPOINT_BY_ID: Readonly<Record<WaypointId, Waypoint>> = Object.fromEntries(
  AUTHORED_WAYPOINTS.map((waypoint) => [waypoint.id, waypoint]),
) as Record<WaypointId, Waypoint>;

export function waypoint(id: WaypointId): Waypoint {
  return WAYPOINT_BY_ID[id];
}

export function waypointPosition(id: WaypointId): Point {
  const value = waypoint(id);
  return { x: value.x, y: value.y };
}

export function createIslandState(random: DeterministicRandom): IslandState {
  const sourceStates: Record<SourceId, SourceState> = {
    water: { id: 'water', available: TUNING.sourceCaps.water, capacity: TUNING.sourceCaps.water },
    forage: {
      id: 'forage',
      available: TUNING.sourceCaps.forage,
      capacity: TUNING.sourceCaps.forage,
    },
    wreckage: {
      id: 'wreckage',
      available: TUNING.sourceCaps.wreckage,
      capacity: TUNING.sourceCaps.wreckage,
    },
    forest: {
      id: 'forest',
      available: TUNING.sourceCaps.forest,
      capacity: TUNING.sourceCaps.forest,
    },
  };
  return { cosmeticVariant: random.integer(0, 3), sourceStates };
}
