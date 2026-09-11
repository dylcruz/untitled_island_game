import type { GameSnapshot, TaskReasonCode } from '../game/types';
import type { deriveCampOutlook } from '../game/campOutlook';
import { formatSupply, formatSupplyEstimate } from './supplies';

const reasons: Record<TaskReasonCode, string> = {
  'critical-thirst': 'critical thirst: drinking takes precedence when water is stored',
  'critical-hunger': 'critical hunger: eating takes precedence when food is stored',
  'critical-health': 'critical health: recovery takes precedence',
  'low-energy': 'rest for energy',
  'night-sleep': 'nighttime sleep takes precedence',
  'recover-policy': 'the recovery priority',
  'stock-water': 'water supply pressure',
  'stock-food': 'food supply pressure',
  'stock-materials': 'materials supply pressure',
  'repair-shelter': 'shelter repair pressure',
};

export function CampOutlook({
  snapshot,
  outlook,
}: {
  snapshot: GameSnapshot;
  outlook: ReturnType<typeof deriveCampOutlook>;
}) {
  const urgent = outlook.urgentNeed;
  return (
    <section className="camp-outlook" aria-label="Camp outlook">
      <h3>Camp outlook · {outlook.livingCount} living</h3>
      <p>
        Targets guide task selection; they are not a daily ration. Incoming estimates are reserved
        gathering output, not yet stored. Interruptions, source changes, and storage caps can reduce
        delivery.
      </p>
      <dl>
        {outlook.supplies.map((supply) => (
          <div key={supply.resource}>
            <dt>{supply.resource}</dt>
            <dd>
              {formatSupply(supply.stored)} stored · {formatSupply(supply.incoming)} estimated
              incoming · target {formatSupplyEstimate(supply.target)}.{' '}
              {supply.shortfall > 0
                ? `${formatSupplyEstimate(supply.shortfall)} below target including incoming.`
                : 'Target covered including incoming.'}
            </dd>
          </div>
        ))}
      </dl>
      <p>
        {formatSupply(outlook.reservedMaterials)} stored materials reserved for ongoing repairs.
      </p>
      <p>
        {urgent
          ? `Most urgent need: ${urgent.name} — ${urgent.kind}${urgent.critical ? ' (critical)' : ''}, ${Math.round(urgent.remaining)}% ${urgent.kind === 'thirst' ? 'hydration' : urgent.kind === 'hunger' ? 'fullness' : urgent.kind} remaining.`
          : 'No living survivors.'}
      </p>
      {urgent?.critical &&
        (urgent.kind === 'thirst' || urgent.kind === 'hunger') &&
        snapshot.resources[urgent.kind === 'thirst' ? 'water' : 'food'] <= 0 && (
          <p>
            Self-care is waiting for stored {urgent.kind === 'thirst' ? 'water' : 'food'}; incoming
            supply cannot be consumed yet.
          </p>
        )}
      <p>
        Priority biases new task choices. Existing work continues; critical self-care and nighttime
        sleep take precedence. Available sources and supplies still limit which tasks can start.
      </p>
      <details>
        <summary>
          Ongoing work · {outlook.work.filter((work) => work.previousPriority).length} awaiting a
          task choice under this priority
        </summary>
        <ul data-testid="priority-work">
          {outlook.work.map((work) => (
            <li key={work.name}>
              {work.name}: {work.task?.replaceAll('-', ' ') ?? 'waiting for a viable task'}
              {work.reason ? ` — ${reasons[work.reason]}` : ''}.
              {work.previousPriority
                ? ' Selected under the previous priority; the new priority waits for the next task choice.'
                : ''}
              {work.constraint
                ? ` Current constraint: ${work.constraint === 'low-energy' ? 'critical energy: rest takes precedence' : reasons[work.constraint]}.`
                : ''}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
