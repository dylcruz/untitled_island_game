import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react';
import { EVENT_BY_ID } from './game/events';
import { deriveEndingSummary } from './game/endings';
import { TRAIT_BY_ID } from './game/traits';
import { createGame, createSnapshot, deriveTime } from './game/simulation';
import { DEFAULT_GAME_CONFIG, SLICE_GAME_CONFIG } from './game/tuning';
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
  formatDurationTicks,
  formatGameTimestamp,
  remainingNeedPercent,
} from './presentation/gameTime';
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

function formatTaskReason(
  reason: NonNullable<SurvivorState['activeTask']>['reason'],
  ticksPerDay: number,
  rescueTick: number,
): string {
  const entries = Object.entries(reason.params).map(([key, value]) =>
    key === 'selectedAtTick' && typeof value === 'number'
      ? `selected at ${formatGameTimestamp(value, ticksPerDay, rescueTick)}`
      : `${key}=${value}`,
  );
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

const SAVE_FAILURE_LABELS: Record<string, string> = {
  missing: 'No saved expedition is available.',
  'payload-too-large': 'The saved checkpoint is too large to open safely.',
  oversized: 'The saved checkpoint is too large to open safely.',
  'malformed-json': 'The saved checkpoint is damaged and could not be read.',
  'invalid-envelope': 'The saved checkpoint is not a valid Untitled Island run.',
  'unsupported-schema': 'The saved checkpoint uses an unsupported format.',
  'incompatible-rules': 'The saved checkpoint was made with different game rules.',
  'storage-unavailable': 'Browser storage is unavailable in this window.',
  'storage-write-failed': 'The checkpoint could not be written to browser storage.',
};

function saveFailureLabel(reason: string): string {
  return SAVE_FAILURE_LABELS[reason] ?? `The saved checkpoint could not be opened (${reason}).`;
}

function randomSeed(): string {
  const randomPart =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.floor(Math.random() * 0xffffffff)
          .toString(36)
          .padStart(7, '0');
  return `island-${randomPart}`;
}

function stableIdentityHash(value: string): number {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash;
}

function portraitPresentationVariants(survivors: readonly SurvivorState[]): number[] {
  const used = new Set<number>();
  return survivors.map((survivor, index) => {
    const identityOffset = stableIdentityHash(`${survivor.id}:${survivor.name}`);
    let presentationVariant =
      (survivor.visualVariant + identityOffset + index) % PORTRAIT_VARIANTS.length;
    while (used.has(presentationVariant))
      presentationVariant = (presentationVariant + 1) % PORTRAIT_VARIANTS.length;
    used.add(presentationVariant);
    return presentationVariant;
  });
}

function trapDialogFocus(event: ReactKeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Tab') return;
  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getClientRects().length > 0);
  const first = focusable.at(0);
  const last = focusable.at(-1);
  if (!first || !last) {
    event.preventDefault();
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

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

function formatHistoryTimestamp(tick: number, ticksPerDay: number, rescueTick: number): string {
  return formatGameTimestamp(tick, ticksPerDay, rescueTick);
}

function needStatus(
  kind: keyof NeedState | 'morale',
  value: number,
): { label: string; tone: 'good' | 'watch' | 'critical' } {
  const criticalThreshold =
    kind === 'health' ? 25 : kind === 'energy' ? 18 : kind === 'morale' ? 25 : 15;
  const watchThreshold =
    kind === 'health' ? 50 : kind === 'energy' ? 35 : kind === 'morale' ? 45 : 32;
  if (value <= criticalThreshold) return { label: 'Critical', tone: 'critical' };
  if (value <= watchThreshold) return { label: 'Low', tone: 'watch' };
  return { label: 'Stable', tone: 'good' };
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
  const bounded = Math.max(0, Math.min(100, Math.round(value)));
  const displayValue = `${formatValue(bounded)}${kind === 'hunger' || kind === 'thirst' ? '%' : ''}`;
  return (
    <div className={`status-meter status-meter-${status.tone}`}>
      <div className="status-meter-heading">
        <span>{label}</span>
        <strong>
          {displayValue} · {status.label}
        </strong>
      </div>
      <meter
        min="0"
        max="100"
        value={bounded}
        aria-label={`${label}: ${displayValue}, ${status.label}`}
      >
        {displayValue}
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

function SurvivorCard({
  survivor,
  portraitVariant,
  ticksPerDay,
  rescueTick,
}: {
  survivor: SurvivorState;
  portraitVariant: number;
  ticksPerDay: number;
  rescueTick: number;
}): ReactElement {
  const task = survivor.activeTask;
  const traitNames = survivor.traits.map((trait) => TRAIT_BY_ID[trait].name).join(' · ');
  const statusMessages: string[] = [];
  const hungerRemaining = remainingNeedPercent(survivor.needs.hunger);
  const thirstRemaining = remainingNeedPercent(survivor.needs.thirst);
  if (!survivor.alive) statusMessages.push('Lost from the expedition');
  else if (survivor.needs.health <= 25) statusMessages.push('Critical health');
  else if (survivor.needs.health <= 50) statusMessages.push('Health needs attention');
  if (thirstRemaining <= 15) statusMessages.push('Dehydrated');
  else if (thirstRemaining <= 32) statusMessages.push('Thirst is running low');
  if (hungerRemaining <= 15) statusMessages.push('Starving');
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
          className={`survivor-portrait portrait-${portraitVariant}`}
          data-testid="survivor-portrait"
          data-portrait-variant={portraitVariant}
          data-visual-variant={survivor.visualVariant}
          role="img"
          aria-label={`Portrait of ${survivor.name}; ${PORTRAIT_VARIANTS[portraitVariant]}`}
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
          <p className="survivor-identity">{PORTRAIT_VARIANTS[portraitVariant]} portrait</p>
        </div>
        <strong className="survivor-alive">{survivor.alive ? 'Alive' : 'Lost'}</strong>
      </div>
      <p className="survivor-traits">
        <strong>Traits:</strong> {traitNames}
      </p>
      <div className="need-grid" aria-label={`${survivor.name} condition meters`}>
        <StatusMeter label="Health" value={survivor.needs.health} kind="health" />
        <StatusMeter label="Hunger" value={hungerRemaining} kind="hunger" />
        <StatusMeter label="Thirst" value={thirstRemaining} kind="thirst" />
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
          ? `${titleCase(task.kind)} · ${task.phase} at ${waypointLabel(task.destination)} (${formatDurationTicks(task.remainingTicks, ticksPerDay)} remaining)`
          : 'Idle at camp'}
      </p>
      <p className="survivor-task">
        <strong>Reason:</strong>{' '}
        {task ? (
          <code>{formatTaskReason(task.reason, ticksPerDay, rescueTick)}</code>
        ) : (
          'No active task'
        )}
      </p>
      <p className="survivor-injury">
        <strong>Injury:</strong>{' '}
        {survivor.injury
          ? `${survivor.injury.kind}, severity ${survivor.injury.severity} (${formatDurationTicks(survivor.injury.recoveryTicksRemaining, ticksPerDay)} to recover)`
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
  const loadResult = useMemo(() => {
    if (isSlice) return null;
    const result = saveAdapter.load();
    // Never let the production key bootstrap an internal slice checkpoint.
    if (result.ok && result.state.config.mode !== 'production')
      return { ok: false as const, reason: 'invalid-envelope' as const };
    return result;
  }, [isSlice, saveAdapter]);
  const initialState = useMemo(
    () => (loadResult?.ok ? loadResult.state : createGame(isSlice ? SLICE_GAME_CONFIG : undefined)),
    [isSlice, loadResult],
  );
  const [snapshot, setSnapshot] = useState<GameSnapshot>(() => createSnapshot(initialState));
  const [sessionActive, setSessionActive] = useState(isSlice);
  const [started, setStarted] = useState(false);
  const [setupSeed, setSetupSeed] = useState(() =>
    loadResult?.ok ? loadResult.state.seed : DEFAULT_GAME_CONFIG.seed,
  );
  const [commandMessage, setCommandMessage] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [saveFailure, setSaveFailure] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [endingAcknowledged, setEndingAcknowledged] = useState(false);
  const [replacementSeed, setReplacementSeed] = useState<string | null>(null);
  const [clipboardMessage, setClipboardMessage] = useState('');
  const [checkpointDismissed, setCheckpointDismissed] = useState(false);
  const eventPanelRef = useRef<HTMLElement>(null);
  const endingPanelRef = useRef<HTMLElement>(null);
  const confirmPanelRef = useRef<HTMLElement>(null);
  const previousSnapshotRef = useRef<GameSnapshot | null>(null);
  const controller = useMemo(
    () =>
      new GameController(initialState, {
        onCheckpoint: (state) => {
          const result = saveAdapter.save(state);
          if (result.ok) {
            setSaveFailure(false);
            setSaveMessage(
              `Checkpoint saved at ${formatGameTimestamp(state.clock.tick, state.config.ticksPerDay, state.config.rescueTick)}.`,
            );
          } else {
            setSaveFailure(true);
            setSaveMessage(`Checkpoint not saved: ${saveFailureLabel(result.reason)}`);
          }
        },
      }),
    [initialState, saveAdapter],
  );

  useEffect(() => {
    const unsubscribe = controller.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      controller.destroy();
    };
  }, [controller]);

  useEffect(() => {
    const previous = previousSnapshotRef.current;
    previousSnapshotRef.current = snapshot;
    if (!previous) return;
    let message = '';
    if (previous.status !== 'decision' && snapshot.status === 'decision') {
      const currentEvent = snapshot.activeEvent ? EVENT_BY_ID[snapshot.activeEvent.id] : undefined;
      message = `Decision required${currentEvent ? `: ${currentEvent.title}` : ''}.`;
    } else {
      const previousSurvivors = new Map(
        previous.survivors.map((survivor) => [survivor.id, survivor]),
      );
      const changedSurvivor = snapshot.survivors.find((survivor) => {
        const prior = previousSurvivors.get(survivor.id);
        return prior?.injury === null && survivor.injury !== null;
      });
      if (changedSurvivor) message = `New injury: ${changedSurvivor.name}.`;
      const died = snapshot.survivors.find((survivor) => {
        const prior = previousSurvivors.get(survivor.id);
        return prior?.alive === true && !survivor.alive;
      });
      if (died) message = `${died.name} has died.`;
      if (!message) {
        const depleted = Object.values(snapshot.island.sourceStates).find((source) => {
          const prior = previous.island.sourceStates[source.id];
          return prior.available > 0 && source.available <= 0;
        });
        if (depleted) message = `${formatSourceId(depleted.id)} source depleted.`;
      }
      if (!message) {
        const crossedShelterWatch =
          previous.shelter.condition > 50 && snapshot.shelter.condition <= 50;
        const crossedShelterCritical =
          previous.shelter.condition > 25 && snapshot.shelter.condition <= 25;
        if (crossedShelterCritical) message = 'Shelter condition is critical.';
        else if (crossedShelterWatch) message = 'Shelter condition needs watching.';
      }
      if (!message) {
        const rescueWindow = snapshot.config.ticksPerDay;
        if (
          previous.clock.tick < snapshot.config.rescueTick - rescueWindow &&
          snapshot.clock.tick >= snapshot.config.rescueTick - rescueWindow
        )
          message = 'Rescue is within one in-game day.';
      }
    }
    if (message) setAnnouncement(message);
  }, [snapshot]);

  useEffect(() => {
    if (
      !eventPanelRef.current ||
      (snapshot.status !== 'decision' && snapshot.status !== 'event-result')
    )
      return;
    const firstAction = eventPanelRef.current.querySelector<HTMLElement>('button');
    firstAction?.focus();
  }, [snapshot.status, snapshot.activeEvent?.id, sessionActive]);

  useEffect(() => {
    if ((snapshot.status !== 'victory' && snapshot.status !== 'defeat') || endingAcknowledged)
      return;
    const firstAction = endingPanelRef.current?.querySelector<HTMLElement>('button');
    firstAction?.focus();
  }, [snapshot.status, endingAcknowledged, sessionActive]);

  useEffect(() => {
    if (!replacementSeed) return;
    const firstAction = confirmPanelRef.current?.querySelector<HTMLElement>('button');
    firstAction?.focus();
  }, [replacementSeed]);

  const activateCurrentRun = (): void => {
    setSessionActive(true);
    if (snapshot.status === 'running') {
      controller.start();
      setStarted(true);
    } else {
      setStarted(false);
    }
  };
  const replaceRun = (seed: string, shouldStart: boolean): void => {
    const cleanSeed = seed.trim() || DEFAULT_GAME_CONFIG.seed;
    saveAdapter.clear();
    const result = controller.dispatch({ type: 'reset-run', seed: cleanSeed });
    if (!result.accepted) {
      setCommandMessage(`New expedition rejected: ${COMMAND_REASON_LABELS[result.reason!]}`);
      return;
    }
    setSetupSeed(cleanSeed);
    setEndingAcknowledged(false);
    setReplacementSeed(null);
    setSessionActive(true);
    setStarted(false);
    setCommandMessage('');
    if (shouldStart) {
      controller.start();
      setStarted(true);
    }
  };
  const begin = (): void => {
    if (snapshot.status === 'running' && controller.getSpeed() === 0) controller.setSpeed(1);
    activateCurrentRun();
  };
  const requestReset = (): void => {
    const proposedSeed = randomSeed();
    if (snapshot.clock.tick > 0 || snapshot.status !== 'running' || started)
      setReplacementSeed(proposedSeed);
    else replaceRun(proposedSeed, false);
  };
  const confirmReset = (): void => {
    if (replacementSeed) replaceRun(replacementSeed, true);
  };
  const acknowledgeEnding = (): void => {
    const cleared = saveAdapter.clear();
    setEndingAcknowledged(true);
    setSaveFailure(!cleared);
    setSaveMessage(
      cleared
        ? 'Ending acknowledged; the terminal checkpoint was cleared.'
        : 'Ending acknowledged, but the terminal checkpoint could not be cleared.',
    );
  };
  const restartEnding = (seed: string): void => replaceRun(seed, true);
  const resumeSaved = (): void => activateCurrentRun();
  const startSetupRun = (): void => {
    if (loadResult?.ok) {
      setReplacementSeed(setupSeed.trim() || DEFAULT_GAME_CONFIG.seed);
      return;
    }
    replaceRun(setupSeed, true);
  };
  const randomizeSeed = (): void => {
    setSetupSeed(randomSeed());
    setClipboardMessage('');
  };
  const copySeed = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(setupSeed);
      setClipboardMessage('Seed copied.');
    } catch {
      setClipboardMessage('Copy was unavailable; select the seed to copy it manually.');
    }
  };
  const reset = (): void => requestReset();
  const selectSpeed = (speed: Speed): void => {
    controller.setSpeed(speed);
    if (snapshot.status === 'running') setStarted(true);
    if (speed !== 0 && snapshot.status === 'running') {
      controller.start();
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
  const portraitVariants = portraitPresentationVariants(snapshot.survivors);
  const event = snapshot.activeEvent ? EVENT_BY_ID[snapshot.activeEvent.id] : null;
  const activePriority = PRIORITY_DETAILS[snapshot.campPolicy.priority];
  const priorityChangeUsed = snapshot.campPolicy.lastChangedDay === snapshot.clock.day;
  const rescueDay = Math.ceil(snapshot.config.rescueTick / snapshot.config.ticksPerDay);
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

  const hasCompatibleCheckpoint = loadResult?.ok === true;
  const invalidCheckpointReason =
    !checkpointDismissed && loadResult && !loadResult.ok && loadResult.reason !== 'missing'
      ? saveFailureLabel(loadResult.reason)
      : null;

  if (!isSlice && !sessionActive) {
    return (
      <main className="app-shell setup-shell">
        <header className="app-header">
          <p className="eyebrow">Milestone 4 · expedition setup</p>
          <h1>Untitled Island</h1>
          <p className="lede">
            Prepare three autonomous survivors for a 14-day rescue run. You set the pace and one
            camp priority each day; the survivors handle their own work.
          </p>
        </header>
        <section className="setup-card" aria-labelledby="setup-title">
          <p className="event-kicker">A clear plan before the shoreline</p>
          <h2 id="setup-title">Start or resume your expedition</h2>
          <p>
            Keep all three survivors alive until rescue. Watch water, food, materials, shelter, and
            health as the camp responds autonomously.
          </p>
          <div className="setup-guidance" aria-label="How this run works">
            <article>
              <h3>Autonomous survivors</h3>
              <p>They gather, travel, rest, repair shelter, and care for urgent needs.</p>
            </article>
            <article>
              <h3>Your decisions</h3>
              <p>
                Choose a daily priority, use time controls, and respond when island events pause
                play.
              </p>
            </article>
            <article>
              <h3>Resources and rescue</h3>
              <p>Balance shared supplies and shelter while the clock advances toward day 14.</p>
            </article>
            <article>
              <h3>Save and resume</h3>
              <p>
                Auto-save checkpoints are stored locally at meaningful boundaries for later resume.
              </p>
            </article>
          </div>
          <div className="seed-field">
            <label htmlFor="seed-input">Expedition seed</label>
            <div className="seed-controls">
              <input
                id="seed-input"
                data-testid="seed-input"
                type="text"
                value={setupSeed}
                onChange={(event) => setSetupSeed(event.target.value)}
                autoComplete="off"
                required
                minLength={1}
                spellCheck={false}
              />
              <button type="button" className="secondary" onClick={randomizeSeed}>
                Randomize
              </button>
              <button type="button" className="secondary" onClick={copySeed}>
                Copy seed
              </button>
            </div>
            <p className="assistive-note">
              The same seed always creates the same survivors and island cosmetics.
            </p>
            {clipboardMessage && <p className="seed-feedback">{clipboardMessage}</p>}
          </div>
          {invalidCheckpointReason && (
            <div className="save-recovery" role="alert">
              <strong>Saved expedition unavailable.</strong>
              <p>{invalidCheckpointReason}</p>
              <p>Recover by starting a fresh run with the seed above.</p>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  saveAdapter.clear();
                  setCheckpointDismissed(true);
                }}
              >
                Discard saved checkpoint
              </button>
            </div>
          )}
          {hasCompatibleCheckpoint && (
            <section className="resume-summary" aria-label="Saved expedition summary">
              <h3>Saved expedition ready</h3>
              <p>
                Seed <strong>{initialState.seed}</strong> ·{' '}
                {formatGameTimestamp(
                  initialState.clock.tick,
                  initialState.config.ticksPerDay,
                  initialState.config.rescueTick,
                )}{' '}
                · status {initialState.status}.
              </p>
              <button type="button" onClick={resumeSaved} data-testid="resume-saved">
                Resume saved expedition
              </button>
            </section>
          )}
          <div className="setup-actions">
            <button type="button" onClick={startSetupRun} data-testid="start-expedition">
              {hasCompatibleCheckpoint ? 'Start new expedition' : 'Start expedition'}
            </button>
          </div>
        </section>
        {replacementSeed && (
          <section
            className="modal-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setReplacementSeed(null);
            }}
          >
            <section
              ref={confirmPanelRef}
              className="confirm-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="replace-title"
              onKeyDown={(event) => {
                if (event.key === 'Escape') setReplacementSeed(null);
                trapDialogFocus(event);
              }}
            >
              <p className="event-kicker">Replace expedition?</p>
              <h2 id="replace-title">Start a new run with this seed?</h2>
              <p>
                Your current checkpoint will be replaced. This cannot be undone from this browser.
              </p>
              <div className="dialog-actions">
                <button type="button" onClick={confirmReset}>
                  Replace and start
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setReplacementSeed(null)}
                >
                  Keep current run
                </button>
              </div>
            </section>
          </section>
        )}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="eyebrow">
          {isSlice
            ? 'Internal · Milestone 1 technical slice'
            : 'Milestone 4 · expedition dashboard'}
        </p>
        <h1>Untitled Island</h1>
        <p className="lede">
          {isSlice
            ? 'Keep one survivor alive, respond to island events, and hold out until rescue.'
            : 'Keep all three survivors alive for 14 days until rescue. Read the island at a glance, follow every survivor’s work, and make informed choices when the shoreline changes.'}
        </p>
        {saveMessage && (
          <p
            className={`save-status${saveFailure ? ' save-status-failure' : ''}`}
            role={saveFailure ? 'alert' : undefined}
          >
            {saveMessage}
          </p>
        )}
      </header>
      {announcement && (
        <p className="announcement" role="status" aria-live="polite" data-testid="announcement">
          {announcement}
        </p>
      )}
      <section
        className={isSlice ? 'game-layout slice-layout' : 'game-layout production-layout'}
        aria-label="Island simulation"
        data-seed={snapshot.seed}
      >
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
            <strong>
              {started && snapshot.status === 'running'
                ? controller.getSpeed() === 0
                  ? 'Paused'
                  : 'Running'
                : snapshot.status}
            </strong>
          </div>
          <p data-testid="time-status">
            {formatGameTimestamp(
              snapshot.clock.tick,
              snapshot.config.ticksPerDay,
              snapshot.config.rescueTick,
            )}{' '}
            · phase {time.phase} · run phase {time.runPhase} ·{' '}
            {formatDurationTicks(time.rescueTicksRemaining, snapshot.config.ticksPerDay)} to rescue
          </p>
          <div className="button-row">
            <button
              type="button"
              onClick={begin}
              disabled={started && snapshot.status === 'running' && controller.getSpeed() !== 0}
            >
              {started && snapshot.status === 'running' && controller.getSpeed() !== 0
                ? 'Running'
                : started && snapshot.status === 'running'
                  ? 'Resume'
                  : 'Begin'}
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
                <p className="priority-availability" id="priority-availability">
                  {priorityChangeUsed
                    ? snapshot.clock.day >= rescueDay
                      ? "Today's change is used. No further change is available after rescue."
                      : `Today's change is used. Another change is available at dawn on day ${snapshot.clock.day + 1}.`
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
                        {formatValue(remainingNeedPercent(survivor.needs.hunger))}% · thirst{' '}
                        {formatValue(remainingNeedPercent(survivor.needs.thirst))}% · energy{' '}
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
          ) : null}
          <p className="assistive-note">
            The map is decorative; survivor details and destinations are listed above.
          </p>
        </aside>
        {!isSlice && (
          <section className="production-overview" aria-label="Survivor and history overview">
            <section className="survivor-section" aria-label="Survivors">
              <h2>Survivors</h2>
              <ul className="survivor-grid">
                {snapshot.survivors.map((survivor, index) => (
                  <SurvivorCard
                    key={survivor.id}
                    survivor={survivor}
                    portraitVariant={portraitVariants[index] ?? index % PORTRAIT_VARIANTS.length}
                    ticksPerDay={snapshot.config.ticksPerDay}
                    rescueTick={snapshot.config.rescueTick}
                  />
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
                          {formatHistoryTimestamp(
                            entry.tick,
                            snapshot.config.ticksPerDay,
                            snapshot.config.rescueTick,
                          )}
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
          </section>
        )}
      </section>

      {event && snapshot.status === 'decision' && (
        <section
          ref={eventPanelRef}
          className="event-panel"
          onKeyDown={trapDialogFocus}
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
                      Follow-up in{' '}
                      {formatDurationTicks(
                        choice.delayedEffect.delayTicks,
                        snapshot.config.ticksPerDay,
                      )}
                      : {choice.delayedEffect.description}
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
          onKeyDown={trapDialogFocus}
          role="dialog"
          aria-modal="true"
          aria-labelledby="result-title"
        >
          <p className="event-kicker">Decision resolved</p>
          <h2 id="result-title">Decision result</h2>
          <p>
            <strong>Outcome:</strong> {snapshot.activeEvent?.result}
          </p>
          <p className="event-reference" data-testid="source-event">
            <strong>Source event:</strong> {event.title} ({event.id})
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
                  Delayed consequence in{' '}
                  {formatDurationTicks(
                    scheduledForChoice.dueTick - snapshot.clock.tick,
                    snapshot.config.ticksPerDay,
                  )}
                  : {scheduledForChoice.description}
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

      {endingSummary && !endingAcknowledged && (
        <section className="modal-backdrop" role="presentation">
          <section
            ref={endingPanelRef}
            className="ending"
            onKeyDown={trapDialogFocus}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ending-title"
            aria-describedby="ending-summary"
          >
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
            <p id="ending-summary">
              <strong>Result:</strong> {endingSummary.result} · <strong>Quality:</strong>{' '}
              {endingSummary.quality.replaceAll('-', ' ')}
            </p>
            <p>
              {isSlice
                ? endingSummary.result === 'victory'
                  ? 'The survivor held out until rescue.'
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
                    <dd>
                      {formatDurationTicks(
                        snapshot.metrics.maxDecisionGapTicks,
                        snapshot.config.ticksPerDay,
                      )}
                    </dd>
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
              <button type="button" onClick={acknowledgeEnding} data-testid="acknowledge-ending">
                Acknowledge ending
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => restartEnding(snapshot.seed)}
              >
                Restart with same seed
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => restartEnding(randomSeed())}
              >
                Restart with randomized seed
              </button>
            </div>
          </section>
        </section>
      )}
      {replacementSeed && sessionActive && (
        <section
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setReplacementSeed(null);
          }}
        >
          <section
            ref={confirmPanelRef}
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="replace-title-dashboard"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setReplacementSeed(null);
              trapDialogFocus(event);
            }}
          >
            <p className="event-kicker">Replace expedition?</p>
            <h2 id="replace-title-dashboard">Start a new run?</h2>
            <p>
              Your current checkpoint will be replaced. This cannot be undone from this browser.
            </p>
            <div className="dialog-actions">
              <button type="button" onClick={confirmReset}>
                Replace and start
              </button>
              <button type="button" className="secondary" onClick={() => setReplacementSeed(null)}>
                Keep current run
              </button>
            </div>
          </section>
        </section>
      )}
      {commandMessage && <p role="alert">{commandMessage}</p>}
    </main>
  );
}
