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
  GameSnapshot,
  Speed,
  SurvivorState,
} from './game/types';
import { SPEEDS } from './game/types';
import { LocalSaveAdapter, SLICE_SAVE_STORAGE_KEY } from './persistence';
import { GameController } from './runtime/GameController';
import { CanvasRenderer, waypointSummary } from './rendering/CanvasRenderer';

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

function formatTaskKind(kind: string): string {
  return kind.replaceAll('-', ' ');
}

function formatTaskReason(reason: NonNullable<SurvivorState['activeTask']>['reason']): string {
  const entries = Object.entries(reason.params).map(([key, value]) => `${key}=${value}`);
  return `${reason.code}${entries.length ? ` (${entries.join(', ')})` : ''}`;
}

function formatSourceId(id: string): string {
  return id.replaceAll('-', ' ');
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
  const label =
    snapshot.config.mode === 'slice'
      ? 'Authored island map with one moving survivor'
      : 'Authored island map with three moving survivor placeholders';
  return (
    <canvas
      ref={canvasRef}
      className="island-canvas"
      role="img"
      aria-describedby="island-summary"
      aria-label={label}
    />
  );
}

function SurvivorCard({ survivor }: { survivor: SurvivorState }): ReactElement {
  const task = survivor.activeTask;
  const traitNames = survivor.traits.map((trait) => TRAIT_BY_ID[trait].name).join(' · ');
  return (
    <li
      className={`survivor-card${survivor.alive ? '' : ' survivor-card-lost'}`}
      data-testid="survivor-card"
    >
      <div className="survivor-heading">
        <span
          className="survivor-avatar"
          style={{ backgroundColor: survivor.color }}
          aria-label={`Color ${survivor.color}`}
        >
          {survivor.name.slice(0, 1)}
        </span>
        <div>
          <h3>{survivor.name}</h3>
          <p className="survivor-variant">
            Color {survivor.color} · Variant {survivor.visualVariant + 1}
          </p>
        </div>
        <strong className="survivor-alive">{survivor.alive ? 'Alive' : 'Lost'}</strong>
      </div>
      <p className="survivor-traits">
        <strong>Traits:</strong> {traitNames}
      </p>
      <dl className="need-grid">
        <div>
          <dt>Health</dt>
          <dd>{formatValue(survivor.needs.health)}</dd>
        </div>
        <div>
          <dt>Hunger</dt>
          <dd>{formatValue(survivor.needs.hunger)}</dd>
        </div>
        <div>
          <dt>Thirst</dt>
          <dd>{formatValue(survivor.needs.thirst)}</dd>
        </div>
        <div>
          <dt>Energy</dt>
          <dd>{formatValue(survivor.needs.energy)}</dd>
        </div>
        <div>
          <dt>Morale</dt>
          <dd>{formatValue(survivor.morale)}</dd>
        </div>
      </dl>
      <p className="survivor-route">
        <strong>Route:</strong> {survivor.currentWaypoint} → {survivor.targetWaypoint}
      </p>
      <p className="survivor-task">
        <strong>Task:</strong>{' '}
        {task ? `${formatTaskKind(task.kind)} · ${task.phase} at ${task.destination}` : 'none'}
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

  useEffect(() => {
    const unsubscribe = controller.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      controller.destroy();
    };
  }, [controller]);

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

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="eyebrow">
          {isSlice
            ? 'Internal · Milestone 1 technical slice'
            : 'Milestone 2 · production experience'}
        </p>
        <h1>Untitled Island</h1>
        <p className="lede">
          {isSlice
            ? 'Keep one survivor alive, respond to island events, and hold out until rescue.'
            : 'Keep all three survivors alive for 14 days until rescue. Guide the camp, watch their autonomous work, and make the choices that shape the run.'}
        </p>
      </header>
      <section className="game-layout" aria-label="Island simulation">
        <div className="map-card">
          <CanvasView snapshot={snapshot} />
          <p id="island-summary" className="map-summary">
            Fixed locations: {waypointSummary()}.
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
                  <div>
                    <dt>Shelter</dt>
                    <dd>
                      {formatValue(snapshot.shelter.condition)} /{' '}
                      {snapshot.shelter.maximumCondition}
                    </dd>
                  </div>
                </dl>
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
            <section className="survivor-section" aria-label="Survivors">
              <h2>Survivors</h2>
              <ul className="survivor-grid">
                {snapshot.survivors.map((survivor) => (
                  <SurvivorCard key={survivor.id} survivor={survivor} />
                ))}
              </ul>
            </section>
          )}
          <p className="assistive-note">
            The map is decorative; survivor details and destinations are listed above.
          </p>
        </aside>
      </section>

      {event && snapshot.status === 'decision' && (
        <section
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
            {event.choices.map((choice) => (
              <button type="button" key={choice.id} onClick={() => choose(choice.id)}>
                {choice.label}
              </button>
            ))}
          </div>
        </section>
      )}
      {event && snapshot.status === 'event-result' && (
        <section
          className="event-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="result-title"
        >
          <p className="event-kicker">Decision resolved</p>
          <h2 id="result-title">Decision result</h2>
          <p aria-live="polite">{snapshot.activeEvent?.result}</p>
          <p>
            <strong>Survivors involved:</strong>{' '}
            {eventParticipants.length ? eventParticipants.join(', ') : 'the camp'}
          </p>
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
