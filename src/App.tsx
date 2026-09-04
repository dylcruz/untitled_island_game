import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { EVENT_BY_ID } from './game/events';
import { deriveEndingSummary } from './game/endings';
import { TRAIT_BY_ID } from './game/traits';
import { createGame, createSnapshot, deriveTime } from './game/simulation';
import { SLICE_GAME_CONFIG } from './game/tuning';
import type {
  CampPriority,
  CommandRejectionReason,
  EffectData,
  EventChoiceDefinition,
  GameSnapshot,
  HistoryEntry,
  NeedState,
  ResourceId,
  RiskSeverity,
  Speed,
  SurvivorState,
} from './game/types';
import { SPEEDS } from './game/types';
import { LocalSaveAdapter, SLICE_SAVE_STORAGE_KEY } from './persistence';
import { GameController } from './runtime/GameController';
import {
  CanvasRenderer,
  cosmeticVariantLabel,
  waypointLabel,
  waypointSummary,
} from './rendering/CanvasRenderer';

const speedLabel = (speed: Speed): string => `${speed}x`;
const formatValue = (value: number): string => Math.round(value).toString();
const formatDuration = (milliseconds: number): string => {
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`;
  return `${(milliseconds / 1_000).toFixed(1)} s`;
};

const PRIORITIES: readonly CampPriority[] = ['balanced', 'water', 'food', 'build', 'recover'];

const PRIORITY_DETAILS: Record<CampPriority, { label: string; effect: string }> = {
  balanced: {
    label: 'Balanced',
    effect: 'Keeps water, food, materials, shelter, and rest in steady rotation.',
  },
  water: {
    label: 'Secure water',
    effect: 'Favors water gathering, at the cost of food, materials, and shelter work.',
  },
  food: {
    label: 'Secure food',
    effect: 'Favors food gathering, at the cost of water, materials, and shelter work.',
  },
  build: {
    label: 'Build shelter',
    effect: 'Favors materials and shelter repairs, at the cost of gathering and rest.',
  },
  recover: {
    label: 'Recover',
    effect: 'Favors rest and recovery, at the cost of gathering and shelter work.',
  },
};

const COMMAND_REASON_LABELS: Record<CommandRejectionReason, string> = {
  'game-not-running': 'the simulation is not running',
  'priority-already-selected': 'that priority is already active',
  'daily-change-used': "today's priority change has already been used",
  'insufficient-resources': 'the camp lacks the required supplies',
  'event-not-awaiting-choice': 'the event is not awaiting a choice',
  'event-not-showing-result': 'the event is not showing a result',
  'event-id-mismatch': 'the event changed before the command arrived',
  'unknown-choice': 'that choice is not available',
  'unknown-command': 'the command is not recognized',
};

function formatTaskReason(reason: NonNullable<SurvivorState['activeTask']>['reason']): string {
  const entries = Object.entries(reason.params).map(([key, value]) => `${key}=${value}`);
  return `${reason.code}${entries.length ? ` (${entries.join(', ')})` : ''}`;
}

function formatSourceId(id: string): string {
  return id.replaceAll('-', ' ');
}

const RESOURCE_LABELS: Record<ResourceId, string> = {
  water: 'water',
  food: 'food',
  materials: 'materials',
};

const NEED_LABELS: Record<keyof NeedState, string> = {
  health: 'health',
  hunger: 'hunger',
  thirst: 'thirst',
  energy: 'energy',
};

const HISTORY_KIND_LABELS: Record<HistoryEntry['kind'], string> = {
  task: 'Activity',
  resource: 'Supply',
  event: 'Event',
  effect: 'Effect',
  health: 'Health',
  terminal: 'Milestone',
  day: 'Daybreak',
};

const PORTRAIT_VARIANTS = [
  'sun cap',
  'braided hair',
  'bandana',
  'wind scarf',
  'shell pin',
  'rain hood',
];

function titleCase(value: string): string {
  return value.replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatProbabilityRange(min: number, max: number): string {
  const lower = Math.round(min * 100);
  const upper = Math.round(max * 100);
  return lower === upper ? `${lower}%` : `${lower}%–${upper}%`;
}

function formatRiskSeverity(severity: RiskSeverity): string {
  return severity === 'none' ? 'No stated severity' : `${titleCase(severity)} severity`;
}

function choiceCosts(choice: EventChoiceDefinition): { resource: ResourceId; amount: number }[] {
  const costs = new Map<ResourceId, number>();
  for (const effect of choice.immediateEffects) {
    if (effect.kind !== 'resource' || !effect.target || effect.amount >= 0) continue;
    const resource = effect.target as ResourceId;
    if (!(resource in RESOURCE_LABELS)) continue;
    costs.set(resource, (costs.get(resource) ?? 0) - effect.amount);
  }
  return [...costs.entries()].map(([resource, amount]) => ({ resource, amount }));
}

function effectTargetLabel(effect: EffectData): string {
  if (effect.kind === 'resource' && effect.target && effect.target in RESOURCE_LABELS)
    return RESOURCE_LABELS[effect.target as ResourceId];
  if (effect.kind === 'need' && effect.target && effect.target in NEED_LABELS)
    return NEED_LABELS[effect.target as keyof NeedState];
  if (effect.kind === 'injury' && effect.target) return `${effect.target} injury`;
  if (effect.kind === 'shelter') return 'shelter condition';
  if (effect.kind === 'health') return 'health';
  if (effect.kind === 'morale') return 'morale';
  return effect.kind;
}

function effectScopeLabel(effect: EffectData): string {
  return effect.targetScope === 'group'
    ? 'everyone'
    : effect.targetScope === 'participant'
      ? 'involved survivor'
      : 'camp';
}

function formatEffect(effect: EffectData): string {
  const amount = `${effect.amount > 0 ? '+' : ''}${effect.amount}`;
  const qualifier = effect.probability === undefined ? '' : ' if the risk occurs';
  return `${effectTargetLabel(effect)} ${amount} · ${effectScopeLabel(effect)}${qualifier}`;
}

function formatHistoryTick(tick: number, ticksPerDay: number): string {
  return `Day ${Math.floor(tick / ticksPerDay) + 1} · step ${tick.toLocaleString()}`;
}

function needStatus(
  kind: keyof NeedState | 'morale',
  value: number,
): { label: string; tone: 'good' | 'watch' | 'critical' } {
  const lowIsBad = kind === 'health' || kind === 'energy' || kind === 'morale';
  if (lowIsBad) {
    if (value <= (kind === 'health' ? 25 : kind === 'energy' ? 18 : 25))
      return { label: 'Critical', tone: 'critical' };
    if (value <= (kind === 'health' ? 50 : kind === 'energy' ? 35 : 45))
      return { label: 'Low', tone: 'watch' };
    return { label: 'Stable', tone: 'good' };
  }
  if (value >= 85) return { label: 'Critical', tone: 'critical' };
  if (value >= 68) return { label: 'High', tone: 'watch' };
  return { label: 'Good', tone: 'good' };
}

function resourceStatus(value: number): { label: string; tone: 'good' | 'watch' | 'critical' } {
  if (value <= 0) return { label: 'Depleted', tone: 'critical' };
  if (value <= 2) return { label: 'Low', tone: 'watch' };
  return { label: 'Stocked', tone: 'good' };
}

function StatusMeter({
  label,
  value,
  kind,
}: {
  label: string;
  value: number;
  kind: keyof NeedState | 'morale';
}): ReactElement {
  const status = needStatus(kind, value);
  const bounded = Math.max(0, Math.min(100, value));
  return (
    <div className={`status-meter status-meter-${status.tone}`}>
      <div className="status-meter-heading">
        <span>{label}</span>
        <strong>
          {formatValue(value)} · {status.label}
        </strong>
      </div>
      <meter
        min="0"
        max="100"
        value={bounded}
        aria-label={`${label}: ${formatValue(value)}, ${status.label}`}
      >
        {formatValue(value)}
      </meter>
    </div>
  );
}

function CanvasView({ snapshot }: { snapshot: GameSnapshot }): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snapshotRef = useRef(snapshot);
  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const renderer = new CanvasRenderer(canvas);
    let frameHandle = 0;
    const draw = (): void => {
      renderer.render(snapshotRef.current);
      frameHandle = window.requestAnimationFrame(draw);
    };
    draw();
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(() => renderer.render(snapshotRef.current));
    resizeObserver?.observe(canvas);
    return () => {
      window.cancelAnimationFrame(frameHandle);
      resizeObserver?.disconnect();
    };
  }, []);
  const time = deriveTime(snapshot);
  const compatibilityLabel =
    snapshot.config.mode === 'slice'
      ? 'Authored island map with one moving survivor'
      : 'Authored island map with three moving survivor placeholders';
  const label = `${compatibilityLabel}; final map has fixed routes, ${cosmeticVariantLabel(snapshot.island.cosmeticVariant)} scenery, ${time.phase} lighting, and ${snapshot.survivors.length} distinct survivor markers`;
  return (
    <canvas
      ref={canvasRef}
      className="island-canvas"
      role="img"
      aria-describedby="island-summary"
      aria-label={label}
      data-cosmetic-variant={snapshot.island.cosmeticVariant}
      data-phase={time.phase}
    />
  );
}

function SurvivorCard({ survivor }: { survivor: SurvivorState }): ReactElement {
  const task = survivor.activeTask;
  const traitNames = survivor.traits.map((trait) => TRAIT_BY_ID[trait].name).join(' · ');
  const statusMessages: string[] = [];
  if (!survivor.alive) statusMessages.push('Lost from the expedition');
  else if (survivor.needs.health <= 25) statusMessages.push('Critical health');
  else if (survivor.needs.health <= 50) statusMessages.push('Health needs attention');
  if (survivor.needs.thirst >= 85) statusMessages.push('Dehydrated');
  else if (survivor.needs.thirst >= 68) statusMessages.push('Thirst is high');
  if (survivor.needs.hunger >= 85) statusMessages.push('Starving');
  if (survivor.needs.energy <= 18) statusMessages.push('Exhausted');
  if (survivor.injury)
    statusMessages.push(
      `${titleCase(survivor.injury.kind)} injury, severity ${survivor.injury.severity}`,
    );
  const movement = task?.phase === 'travel' || survivor.currentWaypoint !== survivor.targetWaypoint;
  return (
    <li
      className={`survivor-card${survivor.alive ? '' : ' survivor-card-lost'}`}
      data-testid="survivor-card"
    >
      <div className="survivor-heading">
        <span
          className={`survivor-portrait portrait-${survivor.visualVariant % PORTRAIT_VARIANTS.length}`}
          data-testid="survivor-portrait"
          data-visual-variant={survivor.visualVariant}
          role="img"
          aria-label={`Portrait of ${survivor.name}; ${PORTRAIT_VARIANTS[survivor.visualVariant % PORTRAIT_VARIANTS.length]}`}
        >
          <span className="portrait-hair" aria-hidden="true" />
          <span
            className="portrait-face"
            style={{ backgroundColor: survivor.color }}
            aria-hidden="true"
          >
            {survivor.name.slice(0, 1)}
          </span>
          <span className="portrait-accent" aria-hidden="true" />
        </span>
        <div>
          <h3>{survivor.name}</h3>
          <p className="survivor-identity">
            {PORTRAIT_VARIANTS[survivor.visualVariant % PORTRAIT_VARIANTS.length]} portrait
          </p>
        </div>
        <strong className="survivor-alive">{survivor.alive ? 'Alive' : 'Lost'}</strong>
      </div>
      <p className="survivor-traits">
        <strong>Traits:</strong> {traitNames}
      </p>
      <div className="need-grid" aria-label={`${survivor.name} condition meters`}>
        <StatusMeter label="Health" value={survivor.needs.health} kind="health" />
        <StatusMeter label="Hunger" value={survivor.needs.hunger} kind="hunger" />
        <StatusMeter label="Thirst" value={survivor.needs.thirst} kind="thirst" />
        <StatusMeter label="Energy" value={survivor.needs.energy} kind="energy" />
        <StatusMeter label="Morale" value={survivor.morale} kind="morale" />
      </div>
      <p
        className={`survivor-condition${statusMessages.length ? ' survivor-condition-alert' : ''}`}
        data-testid="survivor-status"
      >
        <strong>Status:</strong>{' '}
        {statusMessages.length ? statusMessages.join(' · ') : 'Stable and ready'}
      </p>
      <p className="survivor-route">
        <strong>{movement ? 'Moving:' : 'At:'}</strong>{' '}
        {movement
          ? `${waypointLabel(survivor.currentWaypoint)} → ${waypointLabel(survivor.targetWaypoint)}`
          : waypointLabel(survivor.currentWaypoint)}
      </p>
      <p className="survivor-task">
        <strong>Activity:</strong>{' '}
        {task
          ? `${titleCase(task.kind)} · ${task.phase} at ${waypointLabel(task.destination)} (${task.remainingTicks} ticks)`
          : 'Idle at camp'}
      </p>
      <p className="survivor-task">
        <strong>Reason:</strong>{' '}
        {task ? <code>{formatTaskReason(task.reason)}</code> : 'No active task'}
      </p>
      <p className="survivor-injury">
        <strong>Injury:</strong>{' '}
        {survivor.injury
          ? `${survivor.injury.kind}, severity ${survivor.injury.severity} (${survivor.injury.recoveryTicksRemaining} ticks to recover)`
          : 'None'}
      </p>
    </li>
  );
}

export default function App(): ReactElement {
  const isSlice = useMemo(
    () => new URLSearchParams(window.location.search).get('mode') === 'slice',
    [],
  );
  const saveAdapter = useMemo(
    () => new LocalSaveAdapter(isSlice ? { key: SLICE_SAVE_STORAGE_KEY } : {}),
    [isSlice],
  );
  const initialState = useMemo(
    () => createGame(isSlice ? SLICE_GAME_CONFIG : undefined),
    [isSlice],
  );
  const controller = useMemo(
    () =>
      new GameController(initialState, {
        onCheckpoint: (state) => {
          saveAdapter.save(state);
        },
      }),
    [initialState, saveAdapter],
  );
  const [snapshot, setSnapshot] = useState<GameSnapshot>(() => createSnapshot(initialState));
  const [started, setStarted] = useState(false);
  const [commandMessage, setCommandMessage] = useState('');
  const eventPanelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const unsubscribe = controller.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      controller.destroy();
    };
  }, [controller]);

  useEffect(() => {
    if (
      !eventPanelRef.current ||
      (snapshot.status !== 'decision' && snapshot.status !== 'event-result')
    )
      return;
    const firstAction = eventPanelRef.current.querySelector<HTMLElement>('button');
    firstAction?.focus();
  }, [snapshot.status, snapshot.activeEvent?.id]);

  const begin = (): void => {
    controller.start();
    setStarted(true);
  };
  const reset = (): void => {
    controller.dispatch({ type: 'reset-run' });
    setStarted(false);
    setCommandMessage('');
  };
  const selectSpeed = (speed: Speed): void => {
    controller.setSpeed(speed);
    if (speed !== 0 && snapshot.status === 'running') {
      controller.start();
      setStarted(true);
    }
  };
  const choose = (choiceId: string): void => {
    if (!snapshot.activeEvent) return;
    const result = controller.dispatch({
      type: 'select-event-choice',
      eventId: snapshot.activeEvent.id,
      choiceId,
    });
    if (!result.accepted)
      setCommandMessage(`Decision rejected: ${COMMAND_REASON_LABELS[result.reason!]}`);
    else setCommandMessage('');
  };
  const acknowledge = (): void => {
    if (!snapshot.activeEvent) return;
    const result = controller.dispatch({
      type: 'acknowledge-event-result',
      eventId: snapshot.activeEvent.id,
    });
    if (result.accepted) {
      controller.resume();
      setStarted(true);
      setCommandMessage('');
    } else {
      setCommandMessage(`Continue rejected: ${COMMAND_REASON_LABELS[result.reason!]}`);
    }
  };
  const setPriority = (priority: CampPriority): void => {
    const result = controller.dispatch({ type: 'set-camp-priority', priority });
    if (result.accepted) {
      setCommandMessage(`Camp priority changed to ${PRIORITY_DETAILS[priority].label}.`);
    } else {
      setCommandMessage(
        `Priority change rejected: ${COMMAND_REASON_LABELS[result.reason!] ?? 'the command was not accepted'}.`,
      );
    }
  };

  const time = deriveTime(snapshot);
  const event = snapshot.activeEvent ? EVENT_BY_ID[snapshot.activeEvent.id] : null;
  const activePriority = PRIORITY_DETAILS[snapshot.campPolicy.priority];
  const priorityChangeUsed = snapshot.campPolicy.lastChangedDay === snapshot.clock.day;
  const endingSummary =
    snapshot.status === 'victory' || snapshot.status === 'defeat'
      ? deriveEndingSummary(snapshot)
      : null;
  const runtimeTiming = endingSummary ? controller.getTimingSummary() : null;
  const eventParticipants = snapshot.activeEvent
    ? (snapshot.activeEvent.participantIds ?? [])
        .map((id) => snapshot.survivors.find((survivor) => survivor.id === id)?.name)
        .filter((name): name is string => !!name)
    : [];
  const referencedChoice = snapshot.activeEvent?.referencedChoice
    ? snapshot.choiceRecords.find(
        (choice) =>
          choice.eventId === snapshot.activeEvent?.referencedChoice?.eventId &&
          choice.choiceId === snapshot.activeEvent?.referencedChoice?.choiceId,
      )
    : undefined;
  const selectedChoice =
    event && snapshot.activeEvent?.chosenChoiceId
      ? event.choices.find((choice) => choice.id === snapshot.activeEvent?.chosenChoiceId)
      : undefined;
  const scheduledForChoice =
    selectedChoice && snapshot.activeEvent
      ? snapshot.scheduledEffects.find(
          (scheduled) =>
            scheduled.sourceEventId === snapshot.activeEvent?.id &&
            scheduled.sourceChoiceId === selectedChoice.id,
        )
      : undefined;
  const followUpForChoice = selectedChoice?.followUpEventId
    ? EVENT_BY_ID[selectedChoice.followUpEventId]
    : undefined;

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="eyebrow">
          {isSlice ? 'Internal · Milestone 1 technical slice' : 'Milestone 3 · final presentation'}
        </p>
        <h1>Untitled Island</h1>
        <p className="lede">
          {isSlice
            ? 'Keep one survivor alive, respond to island events, and hold out until rescue.'
            : 'Keep all three survivors alive for 14 days until rescue. Read the island at a glance, follow every survivor’s work, and make informed choices when the shoreline changes.'}
        </p>
      </header>
      <section className="game-layout" aria-label="Island simulation">
        <div className="map-card">
          <CanvasView snapshot={snapshot} />
          <p id="island-summary" className="map-summary">
            Fixed gameplay geometry: {waypointSummary()}. Cosmetic scenery:{' '}
            {cosmeticVariantLabel(snapshot.island.cosmeticVariant)} (seeded variant{' '}
            {snapshot.island.cosmeticVariant + 1} of 4). Lighting: {time.phase}.
          </p>
        </div>
        <aside className="control-card" aria-label="Simulation controls">
          <div className="status-row">
            <span className="status-label">Simulation</span>
            <strong aria-live="polite">
              {started && snapshot.status === 'running' ? 'Running' : snapshot.status}
            </strong>
          </div>
          <p data-testid="time-status">
            Day {time.day} · {time.phase} · run phase {time.runPhase} · step{' '}
            {snapshot.clock.tick.toLocaleString()} of {snapshot.config.rescueTick.toLocaleString()}
            {' · '}
            {time.rescueTicksRemaining.toLocaleString()} ticks to rescue
          </p>
          <div className="button-row">
            <button
              type="button"
              onClick={begin}
              disabled={started && snapshot.status === 'running'}
            >
              {started ? 'Resume' : 'Begin'}
            </button>
            <button type="button" className="secondary" onClick={reset}>
              New seed
            </button>
          </div>
          <fieldset>
            <legend>Simulation speed</legend>
            <div className="speed-grid">
              {SPEEDS.map((speed) => (
                <button
                  key={speed}
                  type="button"
                  className={controller.getSpeed() === speed ? 'speed selected' : 'speed'}
                  aria-pressed={controller.getSpeed() === speed}
                  onClick={() => selectSpeed(speed)}
                >
                  {speedLabel(speed)}
                </button>
              ))}
            </div>
          </fieldset>

          {isSlice ? (
            <>
              <section className="stats" aria-label="Supplies">
                <h2>Supplies</h2>
                <dl>
                  <div>
                    <dt>Water</dt>
                    <dd>{formatValue(snapshot.resources.water)}</dd>
                  </div>
                  <div>
                    <dt>Food</dt>
                    <dd>{formatValue(snapshot.resources.food)}</dd>
                  </div>
                  <div>
                    <dt>Materials</dt>
                    <dd>{formatValue(snapshot.resources.materials)}</dd>
                  </div>
                </dl>
              </section>
              <section className="stats" aria-label="Source availability">
                <h2>Source availability</h2>
                <dl>
                  {Object.values(snapshot.island.sourceStates).map((source) => (
                    <div key={source.id}>
                      <dt>{source.id}</dt>
                      <dd>
                        {formatValue(source.available)} / {source.capacity}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            </>
          ) : (
            <>
              <section className="stats" aria-label="Supplies and shelter">
                <h2>Camp status</h2>
                <dl>
                  <div>
                    <dt>Water</dt>
                    <dd>
                      {formatValue(snapshot.resources.water)}{' '}
                      <span
                        className={`resource-state resource-state-${resourceStatus(snapshot.resources.water).tone}`}
                      >
                        {resourceStatus(snapshot.resources.water).label}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Food</dt>
                    <dd>
                      {formatValue(snapshot.resources.food)}{' '}
                      <span
                        className={`resource-state resource-state-${resourceStatus(snapshot.resources.food).tone}`}
                      >
                        {resourceStatus(snapshot.resources.food).label}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Materials</dt>
                    <dd>
                      {formatValue(snapshot.resources.materials)}{' '}
                      <span
                        className={`resource-state resource-state-${resourceStatus(snapshot.resources.materials).tone}`}
                      >
                        {resourceStatus(snapshot.resources.materials).label}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Shelter</dt>
                    <dd>
                      {formatValue(snapshot.shelter.condition)} /{' '}
                      {snapshot.shelter.maximumCondition}
                    </dd>
                  </div>
                </dl>
                <div className="shelter-meter">
                  <StatusMeter
                    label="Shelter integrity"
                    value={snapshot.shelter.condition}
                    kind="health"
                  />
                  <p
                    className={`shelter-status shelter-status-${needStatus('health', snapshot.shelter.condition).tone}`}
                  >
                    {snapshot.shelter.condition <= 25
                      ? 'Critical damage — repair before nightfall.'
                      : snapshot.shelter.condition <= 50
                        ? 'Damaged — vulnerable to worsening weather.'
                        : 'Sound enough for the next rest cycle.'}
                  </p>
                </div>
              </section>
              <section className="stats" aria-label="Source availability">
                <h2>Source availability</h2>
                <dl>
                  {Object.values(snapshot.island.sourceStates).map((source) => (
                    <div key={source.id}>
                      <dt>{formatSourceId(source.id)}</dt>
                      <dd>
                        {formatValue(source.available)} / {source.capacity}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
              <section className="priority-panel" aria-label="Camp priority">
                <h2>Camp priority</h2>
                <p>
                  <strong data-testid="active-priority">{activePriority.label}</strong> —{' '}
                  {activePriority.effect}
                </p>
                <p className="priority-availability" id="priority-availability" aria-live="polite">
                  {priorityChangeUsed
                    ? `Today's change is used. Another change is available at dawn on day ${snapshot.clock.day + 1}.`
                    : 'One priority change remains available today while the simulation is running.'}
                </p>
                <div className="priority-grid" role="group" aria-label="Camp priorities">
                  {PRIORITIES.map((priority) => {
                    const selected = snapshot.campPolicy.priority === priority;
                    const disabled = selected || priorityChangeUsed;
                    return (
                      <button
                        type="button"
                        key={priority}
                        data-testid={`priority-${priority}`}
                        className={selected ? 'priority selected' : 'priority'}
                        aria-pressed={selected}
                        disabled={disabled}
                        aria-describedby="priority-availability"
                        onClick={() => setPriority(priority)}
                      >
                        {PRIORITY_DETAILS[priority].label}
                      </button>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          {isSlice ? (
            <>
              <h2>Survivors</h2>
              <ul className="survivor-list">
                {snapshot.survivors.map((survivor) => (
                  <li key={survivor.id}>
                    <span className="survivor-dot" style={{ backgroundColor: survivor.color }} />
                    <span>
                      <strong>{survivor.name}</strong>
                      <small>
                        {survivor.currentWaypoint} → {survivor.targetWaypoint}
                      </small>
                      <small>
                        Health {formatValue(survivor.needs.health)} · hunger{' '}
                        {formatValue(survivor.needs.hunger)} · thirst{' '}
                        {formatValue(survivor.needs.thirst)} · energy{' '}
                        {formatValue(survivor.needs.energy)}
                      </small>
                      <small>
                        Task:{' '}
                        {survivor.activeTask
                          ? `${survivor.activeTask.kind} → ${survivor.activeTask.destination} (${survivor.activeTask.reason.code})`
                          : 'none'}
                      </small>
                    </span>
                  </li>
                ))}
              </ul>
              <section className="history" aria-label="Recent history">
                <h2>Recent history</h2>
                <ol>
                  {snapshot.history
                    .slice(-5)
                    .reverse()
                    .map((entry) => (
                      <li key={entry.id}>{entry.message}</li>
                    ))}
                </ol>
              </section>
            </>
          ) : (
            <>
              <section className="survivor-section" aria-label="Survivors">
                <h2>Survivors</h2>
                <ul className="survivor-grid">
                  {snapshot.survivors.map((survivor) => (
                    <SurvivorCard key={survivor.id} survivor={survivor} />
                  ))}
                </ul>
              </section>
              <section
                className="history"
                aria-label="Recent history"
                data-testid="production-history"
              >
                <div className="section-heading-row">
                  <h2>Recent history</h2>
                  <span className="history-caption">Newest first</span>
                </div>
                {snapshot.history.length ? (
                  <div className="history-log">
                    {snapshot.history
                      .slice(-8)
                      .reverse()
                      .map((entry) => (
                        <article
                          key={entry.id}
                          className={`history-entry history-entry-${entry.kind}`}
                        >
                          <span className="history-meta">
                            {HISTORY_KIND_LABELS[entry.kind]} ·{' '}
                            {formatHistoryTick(entry.tick, snapshot.config.ticksPerDay)}
                          </span>
                          <span>{entry.message}</span>
                        </article>
                      ))}
                  </div>
                ) : (
                  <p className="history-empty">
                    Begin the run to record camp activity, choices, and effects.
                  </p>
                )}
              </section>
            </>
          )}
          <p className="assistive-note">
            The map is decorative; survivor details and destinations are listed above.
          </p>
        </aside>
      </section>

      {event && snapshot.status === 'decision' && (
        <section
          ref={eventPanelRef}
          className="event-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="event-title"
        >
          <p className="event-kicker">Decision · {event.category ?? 'island event'}</p>
          <h2 id="event-title">{event.title}</h2>
          <p>{event.description}</p>
          <p>
            <strong>Survivors involved:</strong>{' '}
            {eventParticipants.length ? eventParticipants.join(', ') : 'the camp'}
          </p>
          {referencedChoice && (
            <p className="event-reference">
              This follows {EVENT_BY_ID[referencedChoice.eventId].title}; prior choice:{' '}
              <strong>{referencedChoice.choiceId}</strong>.
            </p>
          )}
          <div className="event-actions">
            {event.choices.map((choice) => {
              const costs = choiceCosts(choice);
              return (
                <article
                  className="event-choice-card"
                  key={choice.id}
                  data-testid="event-choice-card"
                >
                  <div className="event-choice-heading">
                    <h3>{choice.label}</h3>
                    <span className={`risk-badge risk-${choice.risk.level}`}>
                      {choice.risk.label}
                    </span>
                  </div>
                  <dl className="choice-facts">
                    <div>
                      <dt>Supply cost</dt>
                      <dd>
                        {costs.length
                          ? costs
                              .map(
                                ({ resource, amount }) => `${amount} ${RESOURCE_LABELS[resource]}`,
                              )
                              .join(' · ')
                          : 'No supply cost'}
                      </dd>
                    </div>
                    <div>
                      <dt>Risk window</dt>
                      <dd>
                        {formatRiskSeverity(choice.risk.severity)} ·{' '}
                        {formatProbabilityRange(
                          choice.risk.probabilityRange.min,
                          choice.risk.probabilityRange.max,
                        )}
                      </dd>
                    </div>
                  </dl>
                  <p className="choice-impact-label">Known immediate impact</p>
                  <ul className="choice-impact-list">
                    {choice.immediateEffects.map((effect, index) => (
                      <li key={`${choice.id}-effect-${index}`}>{formatEffect(effect)}</li>
                    ))}
                  </ul>
                  {choice.delayedEffect && (
                    <p className="choice-follow-up">
                      Follow-up in {choice.delayedEffect.delayTicks} ticks:{' '}
                      {choice.delayedEffect.description}
                    </p>
                  )}
                  {choice.followUpEventId && (
                    <p className="choice-follow-up">
                      Possible follow-up event: {EVENT_BY_ID[choice.followUpEventId].title}.
                    </p>
                  )}
                  <button type="button" onClick={() => choose(choice.id)}>
                    Choose {choice.label}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      )}
      {event && snapshot.status === 'event-result' && (
        <section
          ref={eventPanelRef}
          className="event-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="result-title"
        >
          <p className="event-kicker">Decision resolved</p>
          <h2 id="result-title">Decision result</h2>
          <p aria-live="polite">
            <strong>Outcome:</strong> {snapshot.activeEvent?.result}
          </p>
          {selectedChoice && (
            <p className="selected-choice" data-testid="selected-choice">
              <strong>Selected choice:</strong> {selectedChoice.label}
            </p>
          )}
          <p>
            <strong>Survivors involved:</strong>{' '}
            {eventParticipants.length ? eventParticipants.join(', ') : 'the camp'}
          </p>
          {selectedChoice && (
            <div className="result-details" data-testid="result-details">
              <h3>Immediate impact</h3>
              <ul className="choice-impact-list">
                {selectedChoice.immediateEffects.map((effect, index) => (
                  <li key={`result-effect-${index}`}>{formatEffect(effect)}</li>
                ))}
              </ul>
              {scheduledForChoice ? (
                <p className="choice-follow-up">
                  Delayed consequence scheduled for{' '}
                  {formatHistoryTick(scheduledForChoice.dueTick, snapshot.config.ticksPerDay)}:{' '}
                  {scheduledForChoice.description}
                </p>
              ) : selectedChoice.delayedEffect ? (
                <p className="choice-follow-up">
                  Delayed consequence: {selectedChoice.delayedEffect.description} (if it fits before
                  rescue).
                </p>
              ) : null}
              {followUpForChoice && (
                <p className="choice-follow-up">
                  Follow-up event queued: {followUpForChoice.title}.
                </p>
              )}
            </div>
          )}
          {referencedChoice && (
            <p className="event-reference">
              Prior choice reference: {EVENT_BY_ID[referencedChoice.eventId].title} ·{' '}
              {referencedChoice.choiceId}
            </p>
          )}
          <button type="button" onClick={acknowledge}>
            Continue
          </button>
        </section>
      )}

      {endingSummary && (
        <section className="ending" aria-live="assertive" aria-labelledby="ending-title">
          <p className="event-kicker">Run complete</p>
          <h2 id="ending-title">
            {isSlice
              ? endingSummary.result === 'victory'
                ? 'Rescue has arrived'
                : 'No survivors remain'
              : endingSummary.result === 'victory'
                ? 'Victory: rescue has arrived'
                : 'Defeat: no survivors remain'}
          </h2>
          <p>
            <strong>Result:</strong> {endingSummary.result} · <strong>Quality:</strong>{' '}
            {endingSummary.quality.replaceAll('-', ' ')}
          </p>
          <p>
            {isSlice
              ? endingSummary.result === 'victory'
                ? 'The survivor held out until the exact rescue tick.'
                : 'The technical slice ends in defeat.'
              : `${endingSummary.survivors.filter((survivor) => survivor.fate === 'rescued').length} of ${endingSummary.survivors.length} survivors reached rescue.`}
          </p>
          <dl className="ending-facts">
            <div>
              <dt>Days survived</dt>
              <dd>{endingSummary.daysSurvived}</dd>
            </div>
            <div>
              <dt>Seed</dt>
              <dd>{endingSummary.seed}</dd>
            </div>
          </dl>
          <h3>Survivor fates and turning points</h3>
          <ul className="ending-survivors">
            {endingSummary.survivors.map((survivor) => (
              <li key={survivor.survivorId}>
                <strong>
                  {survivor.name}: {survivor.fate}
                </strong>
                <span>{survivor.summary}</span>
                {survivor.turningPoints.length > 0 && (
                  <span>
                    Turning points:{' '}
                    {survivor.turningPoints.map((point) => point.description).join(' ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <h3>Notable choices</h3>
          {endingSummary.notableChoices.length ? (
            <ol className="ending-choices">
              {endingSummary.notableChoices.map((choice) => (
                <li key={`${choice.eventId}-${choice.tick}`}>
                  {EVENT_BY_ID[choice.eventId].title}: {choice.choiceId} — {choice.result}
                </li>
              ))}
            </ol>
          ) : (
            <p>No event choices were recorded.</p>
          )}
          {runtimeTiming && (
            <section className="instrumentation" aria-label="Local run instrumentation">
              <h3>Run instrumentation (local)</h3>
              <dl className="ending-facts">
                <div>
                  <dt>Wall duration</dt>
                  <dd>{formatDuration(runtimeTiming.wallDurationMs)}</dd>
                </div>
                <div>
                  <dt>Event decisions</dt>
                  <dd>{snapshot.metrics.interactiveEventCount}</dd>
                </div>
                <div>
                  <dt>Max decision gap</dt>
                  <dd>{snapshot.metrics.maxDecisionGapTicks} ticks</dd>
                </div>
                <div>
                  <dt>Active time by speed</dt>
                  <dd>
                    1x {formatDuration(runtimeTiming.activeBySpeedMs[1])}; 3x{' '}
                    {formatDuration(runtimeTiming.activeBySpeedMs[3])}; 8x{' '}
                    {formatDuration(runtimeTiming.activeBySpeedMs[8])}
                  </dd>
                </div>
                <div>
                  <dt>Paused / hidden / decisions</dt>
                  <dd>
                    {formatDuration(runtimeTiming.manualPausedMs)} /{' '}
                    {formatDuration(runtimeTiming.hiddenMs)} /{' '}
                    {formatDuration(runtimeTiming.decisionMs)}
                  </dd>
                </div>
              </dl>
              <p className="task-reasons">
                <strong>Task reason counts:</strong>{' '}
                {Object.entries(snapshot.metrics.taskReasonCounts)
                  .map(([reason, count]) => `${reason}=${count}`)
                  .join(' · ') || 'none'}
              </p>
            </section>
          )}
          <div className="ending-actions">
            <button type="button" onClick={reset}>
              New seed
            </button>
          </div>
        </section>
      )}
      {commandMessage && <p role="alert">{commandMessage}</p>}
    </main>
  );
}
