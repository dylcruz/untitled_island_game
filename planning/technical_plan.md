# Island Survival Simulation: Technical Plan

## 1. Recommended Stack

| Area | Choice | Rationale |
| --- | --- | --- |
| Language | TypeScript with strict mode | Deterministic simulation, serializable state, and data-driven events benefit from strong types |
| Build tool | Vite | Fast development, simple static production output, and first-class TypeScript support |
| Interface | React | Survivor panels, camp policy, decisions, logs, resume flow, and endings justify a small UI framework |
| Island rendering | Native Canvas 2D | Three survivors and one compact authored island do not require a game engine or WebGL renderer |
| Styling | Plain CSS with CSS Modules | Supports responsive, accessible, project-specific design without a component-library dependency |
| Unit testing | Vitest | Integrates with Vite and supports fast deterministic simulation and persistence tests |
| Browser testing | Playwright | Covers complete runs, keyboard controls, touch viewports, visibility changes, resume, and static builds |
| Formatting and linting | Prettier and ESLint | Standardizes TypeScript, React, and accessibility checks |
| Package manager | npm | Sufficient for a single-package application and requires no additional tooling |
| Persistence | Versioned `localStorage` envelope | Provides one automatic local resume point without a backend or save-system framework |
| Deployment | Static hosting | The generated `dist/` can run on GitHub Pages, Cloudflare Pages, Netlify, or equivalent hosting |

Use the current active Node.js LTS release and pin dependencies through `package-lock.json`.

## 2. Rendering Decision

Start with native Canvas 2D rather than PixiJS or Phaser.

The expected rendering workload is modest:

- One compact authored island
- Six fixed gameplay locations
- Exactly three moving survivors
- Seeded cosmetic decoration that does not change navigation
- Basic task poses, particles, and day/night effects
- Interactive controls handled through accessible HTML rather than Canvas hit regions

Canvas avoids introducing a second scene or state framework and keeps the simulation independent from rendering. React renders all interactive controls, dialogs, status displays, camp-priority controls, and accessible descriptions.

Adopt PixiJS only if the technical spike demonstrates a concrete Canvas problem, such as:

- Sprite animation or asset code becoming difficult to maintain
- Required effects performing poorly on representative mobile hardware
- Camera, masking, or asset-management needs expanding substantially

Phaser is not recommended because its integrated physics, scene, and game-state systems exceed the fixed-island MVP's requirements and encourage coupling simulation logic to rendering.

## 3. Application Architecture

Use four primary layers plus a narrow persistence adapter:

```text
Input/UI -> Commands -> Simulation -> Read-only snapshots -> UI/Renderer
                                |
                                +-> Save checkpoints -> Persistence adapter
```

### 3.1 Simulation

Implement the simulation in pure TypeScript with no React, Canvas, DOM, storage, or wall-clock dependencies.

Responsibilities include:

- Fixed-step time advancement across the 14-day run
- Survivor needs, morale, injury, health, and nighttime scheduling
- Camp-priority rules and once-per-day changes
- Deterministic group-aware task selection
- Task and source-output reservations
- Movement along the authored waypoint graph
- Stored-resource consumption
- Source depletion, caps, and replenishment
- Shelter decay, protection, and repair
- Event pacing, phase weighting, selection, and outcomes
- Delayed consequences
- Victory, defeat, and ending quality
- Seeded survivor creation and cosmetic setup

Expose an explicit state-in, state-out API rather than module-global game state. The exact function names may change, but the boundary should resemble:

```ts
createGame(config): GameState;
advanceStep(state): GameState;
applyCommand(state, command): GameState;
```

Player commands include:

```ts
type GameCommand =
  | { type: "set-camp-priority"; priority: CampPriority }
  | { type: "select-event-choice"; eventId: EventId; choiceId: ChoiceId }
  | { type: "acknowledge-event-result"; eventId: EventId };
```

Commands are valid only in documented game states. Rejected commands return a typed reason for UI feedback and tests. The simulation must not read `Date.now()`, `Math.random()`, browser dimensions, React state, or `localStorage` directly.

### 3.2 Runtime Controller

A small imperative controller owns:

- `requestAnimationFrame`
- The fixed-step accumulator
- Pause and speed state
- Catch-up limits
- Browser visibility handling
- Publishing UI snapshots
- Dispatching commands from React
- Requesting persistence checkpoints after designated state transitions
- Collecting local playtest timing telemetry that never feeds back into simulation state

Render animation can run every frame while React receives snapshots at a lower rate, approximately five to ten times per second. This prevents ordinary simulation updates from rerendering the complete interface every frame.

Speed controls change how many fixed simulation steps are processed, not the size of a simulation step. If a frame exceeds the catch-up limit, the game falls behind wall-clock time rather than increasing step size or skipping simulation transitions.

When an event changes the simulation status away from `running`, the controller stops processing additional accumulated steps immediately. This prevents accelerated speed from advancing past a decision boundary.

On `visibilitychange` to hidden, the controller pauses before requesting a save checkpoint. It resets the accumulator on return so there is no catch-up burst.

For the release timing protocol, the controller records wall-clock duration by speed plus time spent manually paused, hidden, and in event decisions. This instrumentation may use `performance.now()` because it remains outside the simulation and does not affect outcomes. No telemetry needs to leave the device for the MVP.

### 3.3 Canvas Renderer

The renderer receives read-only state plus interpolation data.

Responsibilities include:

- Fixed island shape and seeded cosmetic decoration
- Location and source-availability markers
- Survivor positions and task poses
- Movement interpolation
- Day/night overlay
- Important visual feedback for policy, injury, depletion, and shelter damage

It must not select tasks, reserve sources, consume resources, trigger events, generate random values, or otherwise mutate game state.

Use a high-DPI canvas scaled by `devicePixelRatio`, but cap the effective pixel ratio if mobile profiling shows excessive fill cost. Resizing changes the viewport transform, not simulation coordinates or routes.

### 3.4 React Interface

React owns presentation state, not authoritative game rules.

Screens and components include:

- New-game and resume screen
- Main status interface
- Three survivor cards
- Camp-priority control and daily availability feedback
- Time controls
- Resource-source summary
- Activity log
- Decision dialog and result state
- First-run introduction
- Ending summary

Use semantic HTML buttons, dialogs, headings, lists, and progress indicators. Canvas content must have an adjacent textual summary so critical information is not available only visually.

React dispatches commands and displays command-rejection reasons. It must not duplicate camp-priority eligibility, event eligibility, resource projections, or other authoritative rules.

### 3.5 Persistence Adapter

Persistence is an infrastructure boundary around the simulation state, not part of the simulation itself.

The MVP stores one automatic local resume point in `localStorage`. Save checkpoints occur:

- Immediately after starting a new game
- At each in-game day boundary
- After a successful camp-priority command
- When an event becomes active
- After an event choice and after result acknowledgement
- Immediately upon entering victory or defeat, before presenting the ending
- When the document becomes hidden, when storage is available

Do not write on every simulation step or UI snapshot. Saves are small, synchronous checkpoints around meaningful state changes.

The adapter must:

- Serialize only plain data, never functions or class instances
- Wrap state in a schema-versioned and rules-versioned envelope
- Perform lightweight structural validation before loading
- Reject corrupt or incompatible saves safely
- Treat unavailable or full storage as nonfatal
- Expose enough status for an unobtrusive saved or save-failed UI message
- Preserve a terminal checkpoint until its ending is acknowledged, then remove the resume point

The MVP does not require save slots, cloud saves, cross-device synchronization, or a general persistence framework.

## 4. Suggested Project Structure

```text
src/
  app/
    App.tsx
    screens/
    components/
  game/
    model/
    simulation/
    behavior/
    events/
    setup/
    endings/
    random/
  runtime/
    GameController.ts
    fixedStepLoop.ts
  rendering/
    CanvasRenderer.ts
    island/
    survivors/
  persistence/
    localSave.ts
    saveSchema.ts
  content/
    island.ts
    traits.ts
    events/
    names.ts
  styles/
  test/
    fixtures/
    simulation/
    persistence/
  main.tsx

e2e/
  setup.spec.ts
  complete-run.spec.ts
  controls.spec.ts
  resume.spec.ts
  accessibility.spec.ts

scripts/
  simulate.ts
```

Keep `game/` importable in Node without browser globals. This enables unit tests and thousands of policy-driven headless simulations without Canvas, React, DOM, or storage mocks.

## 5. State Model

Use ordinary typed objects and discriminated unions rather than a state-management library.

The authoritative state should follow this general shape:

```ts
interface GameState {
  seed: string;
  config: GameConfig;
  rngStates: RandomStreamStates;
  status: "running" | "decision" | "event-result" | "victory" | "defeat";
  clock: GameClock;
  island: IslandState;
  resources: ResourceState;
  shelter: ShelterState;
  campPolicy: CampPolicyState;
  survivors: SurvivorState[];
  reservations: TaskReservation[];
  activeEvent: ActiveEvent | null;
  scheduledEffects: ScheduledEffect[];
  eventSchedule: EventScheduleState;
  history: HistoryEntry[];
}

interface SaveEnvelopeV1 {
  schemaVersion: 1;
  rulesVersion: string;
  savedAt: string;
  gameState: GameState;
}
```

`GameConfig` records the fixed survivor count, rescue tick, and any setup values needed to interpret the run even though the MVP exposes only one configuration. `rulesVersion` identifies the exact compatible simulation tuning and content contract. `savedAt` is persistence metadata and must never influence simulation behavior. The run phase is derived from the game clock rather than stored separately.

State design rules:

- Store stable IDs rather than object references across subsystems.
- Represent resources, source availability, needs, morale, and shelter with explicit bounded values.
- Store every active task's target, expected yield, and reservation ID.
- Store the active priority and the numbered in-game day on which it was last changed.
- Record meaningful history entries rather than every simulation tick.
- Include every runtime PRNG stream state so a resumed run remains reproducible.
- Store scheduled effect IDs and plain parameters, never executable callbacks.
- Derive display values and group morale where practical rather than duplicating them.
- Keep tuning values in centralized typed configuration objects.
- Ensure all authoritative state can survive a JSON serialize and parse round trip.

Represent simulation time as an integer fixed-step tick. Day boundaries, event deadlines, scheduled effects, replenishment, and the rescue instant resolve against ticks rather than accumulated floating-point time. Validate that configured day length and rescue duration are exact fixed-step counts.

Within a simulation tick, apply deterministic ordering:

1. Advance needs, active tasks, source changes, shelter, and other continuous rules through that tick.
2. Apply task completions and all automatic scheduled effects due on that tick.
3. Resolve resulting health changes and deaths.
4. Enter defeat immediately if no survivors remain.
5. If this is the configured rescue tick, enter victory when at least one survivor remains.
6. Only on an earlier nonterminal tick, evaluate whether a new interactive event should begin.

Effects due on the rescue tick therefore resolve before rescue. Once victory or defeat is entered, no later effects or simulation ticks are processed. Interactive follow-ups must be scheduled before the rescue tick; content that cannot satisfy that requirement is ineligible to schedule the follow-up.

A separate global store such as Redux, Zustand, or XState is unnecessary for the MVP. The simulation is already the authoritative state machine, and the controller publishes its snapshots to React.

## 6. Fixed Island And Resource Model

Separate the authored, immutable island definition from per-run mutable island state.

```ts
interface IslandDefinition {
  locations: readonly LocationDefinition[];
  routes: readonly RouteDefinition[];
  sources: readonly SourceDefinition[];
}

interface IslandState {
  sourceStates: Record<SourceId, SourceState>;
  cosmeticVariant: CosmeticVariant;
}
```

The authored definition contains camp, wreckage, fresh water, forage, forest, and dangerous-interior locations. Routes and base travel costs do not change by seed in the MVP.

Mutable source state follows explicit rules:

- Fresh water and forage replenish at dawn up to configured caps.
- Forest materials replenish more slowly up to a configured cap.
- Wreckage supplies are finite and do not replenish.
- Gathering consumes source availability and adds to communal stored resources on task completion.
- A task cannot reserve more yield than the unreserved source availability.
- A reservation is released if its task completes, is invalidated, or is interrupted.

Source projections used by behavior include stored supply, expected consumption before replenishment, incoming reserved yields, travel time, and available workers. Exact formulas remain centralized and unit tested.

Shelter is modeled separately from stored materials. It decays at a configured rate, modifies nighttime recovery and applicable event effects, and consumes materials when repaired.

No procedural navigation generator is required for the MVP. Seeded cosmetic generation must not alter collision, routes, source positions, source capacities, or gameplay travel distances.

## 7. Behavior And Camp Policy

Use a deterministic group-planning pass whenever an idle survivor needs a task or a material state change invalidates current plans.

The planning pass:

1. Applies nighttime sleep as a scheduling constraint.
2. Handles critical personal thirst, hunger, health, and energy needs.
3. Reads existing reservations and projected group supply.
4. Applies the active camp-priority bias to viable tasks.
5. Chooses tasks in a rotating survivor order derived from simulation state.
6. Creates reservations for source yield, materials, beds, or other exclusive capacity where required.
7. Records a structured reason code plus display parameters for each choice.

The rotating order must be deterministic and must prevent one stable survivor-array order from always receiving first choice. Critical self-care can interrupt an existing ordinary task and releases its reservation. An ordinary camp-policy change affects future planning but does not cancel valid movement already underway.

Camp priorities are `balanced`, `water`, `food`, `build`, and `recover`. Each priority modifies centralized task scores or thresholds. Critical self-care and nighttime rules remain hard constraints, not merely larger score modifiers.

The initial priority is `balanced`, with `lastChangedDay` set to `null`. The simulation permits one successful priority change during each numbered in-game day. Availability resets at dawn when the day number changes; it is not a rolling-duration cooldown. React only presents whether the command is currently available.

## 8. Randomness And Reproducibility

Provide a small deterministic PRNG abstraction with importable and exportable state:

```ts
interface RandomSource<State> {
  next(): number;
  integer(min: number, max: number): number;
  pickWeighted<T>(options: readonly WeightedOption<T>[]): T;
  shuffle<T>(values: readonly T[]): T[];
  exportState(): State;
}
```

All survivor creation, cosmetic setup, behavior tie-breaking, event selection, and event outcomes must use this abstraction. Game logic and rendering must never use `Math.random()`.

Derive independent named streams from the user seed:

- `survivor-generation`
- `island-cosmetics`
- `behavior`
- `event-selection`
- `event-outcome`

Represent their serializable states explicitly:

```ts
interface RandomStreamStates {
  survivorGeneration: PrngState;
  islandCosmetics: PrngState;
  behavior: PrngState;
  eventSelection: PrngState;
  eventOutcome: PrngState;
}
```

Separate behavior, event-selection, and event-outcome streams so changes to task tie-breaking or eligible-event ordering do not silently consume outcome randomness. Cosmetic changes must never alter gameplay streams.

The determinism contract is: the same rules version, seed, initial configuration, and commands at the same simulation ticks produce the same authoritative state. Real-world input timing is not part of this contract until converted into a command at a specific simulation tick.

## 9. Event Scheduling And Content Format

Define traits and events as TypeScript data using `satisfies` against strict types.

```ts
export const waterDispute = {
  id: "water-dispute",
  category: "conflict",
  phases: ["middle", "late"],
  cooldownDays: 3,
  repeatable: false,
  // Eligibility, choices, and reusable effects
} satisfies EventDefinition;
```

Prefer TypeScript over external JSON for the MVP because event conditions and effects require constrained executable logic. Content definitions should call a small library of reusable predicates and effects rather than embedding large arbitrary functions in each event.

Simulation state stores event IDs, choice IDs, and plain effect parameters. It never stores references to content functions, which keeps automatic saves serializable.

An interactive event template contains choices. The 12-15-template MVP total includes root and interactive follow-up templates. Every displayed root or follow-up template counts as one of the target 8-10 event decisions for that run. An automatic delayed effect has no choices, is stored as a `ScheduledEffect`, and counts as neither a template nor a decision.

The event scheduler owns:

- Last regular-event simulation time
- Earliest next regular-event time
- A deadline for the next regular event
- Per-template cooldowns and used-template IDs
- Pending authored follow-ups
- At most one active unresolved event

Regular events normally use at least 0.75 in-game days of spacing. A fallback pool of broadly eligible events prevents gaps longer than two in-game days. Pending interactive follow-ups consume a normal event slot and participate in this spacing unless their definition marks them as an emergency. Emergency events may bypass regular spacing, but if an event is already active they queue at most one documented interactive follow-up or convert their effect into an automatic scheduled consequence.

Run phases are derived from day ranges: early on days 1-4, middle on days 5-10, and late on days 11-14. Phases affect eligibility and weights, not core simulation rates unless a tuning rule explicitly says otherwise.

Define low, moderate, and high risk probability ranges centrally. Event copy may describe contextual consequences, but it must not assign inconsistent probability meanings to the same label.

## 10. Automatic Save And Resume

Use one fixed storage key, one current schema version, and one build-time rules version. Increment `rulesVersion` whenever simulation logic, tuning values, island definitions, traits, or event content change in a way that could alter an in-progress run. A minimal load sequence is:

1. Read the string from `localStorage` inside a guarded adapter.
2. Parse JSON inside error handling.
3. Validate the envelope schema version, rules version, and required top-level state fields.
4. Validate the stored `GameConfig` and all referenced content IDs before offering Resume.
5. Restore the state and all random-stream states without advancing simulation time.
6. If the restored state is terminal, present its ending again rather than advancing it.
7. Clear or quarantine invalid data and allow New Game.

Do not add a runtime schema-validation dependency solely for this internal envelope. Implement focused validators for the small persisted boundary and test them with missing, malformed, stale, and oversized input.

No migration is required before the first shipped schema or rules change. Once a version has been released to players, a later incompatible change must either provide an explicit migration or present a clear safe-reset message rather than failing silently.

Saving on document hide is best effort. Correctness must rely on the most recent completed checkpoint, not on browsers guaranteeing a final hidden or unload callback.

## 11. Styling And Responsive Layout

Use CSS Grid for the desktop simulation shell and switch to a stacked layout on narrow screens. Design around three survivor cards rather than a variable-length list of up to eight cards.

Recommended browser baseline:

- Current evergreen Chrome, Firefox, Safari, and Edge on desktop
- Current and previous major Safari iOS and Chrome Android releases
- Minimum layout width of 360 CSS pixels

Avoid a general-purpose UI component library. The game needs a distinctive visual language, while native HTML controls and project-specific CSS will be smaller and easier to customize.

Use:

- CSS custom properties for color, spacing, typography, and condition severity
- `prefers-reduced-motion`
- Visible focus styles
- Text or icons alongside color status
- Minimum 44 by 44 CSS-pixel touch targets
- An ARIA live region for critical events, used selectively to avoid excessive announcements
- Responsive survivor detail disclosure that keeps critical states visible at narrow widths

Camp-priority controls must expose selected state semantically and explain why another change is unavailable. Automatic-save feedback must not continuously announce routine checkpoints.

## 12. Testing Stack

### 12.1 Vitest Simulation Tests

Test the pure simulation for:

- Need accumulation and health damage
- Nighttime scheduling and emergency overrides
- Stored-resource gathering and consumption
- Source depletion, reservations, caps, and replenishment
- Reservation release after completion, interruption, invalidation, and death
- Shelter decay, repair, and protection
- Behavior priorities, rotating assignment, and explanation reason codes
- Camp-priority bias, opportunity costs, critical overrides, and daily change limit
- Trait modifiers
- Event eligibility, participants, phase weighting, spacing, cooldowns, and fallback selection
- Root and interactive-follow-up template counting
- Immediate and automatic delayed effects
- Final-tick ordering among scheduled effects, death, rescue, and terminal entry
- Victory, defeat, and ending quality
- Independent-stream seed reproduction
- JSON round trips of authoritative state

Simulation tests advance explicit fixed steps. They do not test named runtime speeds because speed is a controller concern.

### 12.2 Vitest Runtime And Persistence Tests

Test the runtime controller for:

- Equivalent fixed-step counts and outcomes under `1x`, `3x`, and `8x` accumulator schedules
- Catch-up caps without variable-size steps
- Immediate stopping at decision boundaries
- Visibility pause and accumulator reset
- Snapshot publication below animation-frame frequency
- Save requests at designated checkpoints
- Playtest timing buckets for speed, event decisions, manual pause, and hidden time

Test persistence for:

- Save and restore round trips, including `GameConfig` and every random stream
- Resume from running, decision, event-result, victory, and defeat states
- Corrupt JSON, unsupported schema or rules versions, missing fields, and unknown content IDs
- Unavailable and quota-exceeded storage
- Saving terminal transitions before ending presentation
- Preserving then clearing a terminal save when its ending is acknowledged

Use fake wall-clock time only around the runtime controller and persistence metadata. The simulation itself never needs fake time.

### 12.3 Headless Balance Runner

Build a Node-executable harness around the same simulation package. Automated play requires an explicit strategy:

```ts
interface SimulationPolicy {
  id: string;
  version: string;
  chooseCampPriority(snapshot: GameSnapshot): CampPriority | null;
  chooseEventChoice(event: ActiveEvent, snapshot: GameSnapshot): ChoiceId;
}
```

Provide at least these policies:

- Conservative: Responds to projected critical shortages and generally chooses lower-risk outcomes.
- Resource-greedy: Prioritizes the currently scarcest stored resource and accepts moderate opportunities.
- Random/fuzz: Chooses among valid commands with a policy-owned deterministic PRNG to explore state combinations; it is not used for target win rates.

Policy randomness is separate from every game RNG stream. Derive its seed from the manifest game seed, policy ID, and policy version. A simulation report stores those values and the resulting command trace so a failure can be replayed exactly without relying on ambient `Math.random()`.

The release batch uses a checked-in, versioned manifest definition for 10,000 deterministic seeds. Use the same seeds for every policy and retain the manifest across tuning changes. Run the full batch and report results separately by policy:

- At-least-one-survivor and all-survivor rescue rates
- Causes and simulation days of deaths
- Stored-resource and source-availability minimums
- Camp-priority selection frequency
- Root-event, interactive-follow-up, automatic-effect, and choice frequencies
- Decision count and maximum decision gap
- Damage and resource loss by event template
- Stuck, idle, invalid, and conflicting reservation states
- Initial-state validation and simulation-invariant failures
- Policy ID, policy version, policy seed, and command trace for failed runs
- Ending-quality distributions

The runner also performs leave-one-template-out sensitivity batches for each non-fallback event and reports the change in at-least-one-survivor rescue rate. This provides a reproducible event-dominance signal without trying to infer whether a later starvation death was indirectly caused by one earlier event.

The runner produces machine-readable JSON plus a concise console summary. It evaluates the provisional balance ranges in the MVP plan for the conservative policy, while keeping random-policy results diagnostic rather than treating them as a desired victory percentage.

### 12.4 Playwright Browser Tests

Cover a small number of high-value browser flows:

- Start a seeded game and show exactly three survivors
- Complete a deterministic shortened test run
- Change camp priority and enforce its daily limit
- Verify that decisions pause, show a result, and resume
- Operate the game with a keyboard
- Operate the game in a 360-pixel mobile touch viewport
- Pause on browser-tab visibility changes without catch-up
- Resume running, decision, event-result, victory, and defeat checkpoints after reload
- Handle invalid local save data, including a mismatched rules version, and start a new game
- Reach victory and defeat, restart, and replay the same seed
- Load the production build under static-hosting path rules

Do not make pixel-perfect Canvas screenshots the primary strategy. Assert simulation state exposed through test adapters and accessible HTML output; reserve visual snapshots for a few stable screens.

## 13. Development Commands

Provide these standard commands:

```text
npm run dev
npm run build
npm run preview
npm run typecheck
npm run lint
npm run format
npm run test
npm run test:watch
npm run test:e2e
npm run simulate
```

Continuous integration should run type checking, linting, unit tests, a production build, and a short deterministic Playwright suite. A small fixed-seed simulation batch may run in CI for invariants; large balance batches should remain a separate command or scheduled job.

## 14. Technical Spike

Before the end-to-end slice, implement a minimal integrated spike that proves:

1. A fixed-step simulation advances identically at normal, fast, and very-fast speeds.
2. Three survivors interpolate smoothly between authored waypoints.
3. Canvas remains smooth on a 360-pixel mobile viewport at a capped device pixel ratio.
4. Resizing and orientation changes preserve rendering without changing simulation coordinates.
5. Hiding the tab pauses simulation without a catch-up burst on return.
6. React UI updates do not run at animation-frame frequency.
7. Simulation tests run in Node without DOM mocks.
8. One representative `GameState` survives schema- and rules-compatible serialization and restoration with identical configuration and RNG stream states.

Suggested initial speed values are `0x`, `1x`, `3x`, and `8x`, with a 100 ms fixed simulation step. Suggested day length is 60-75 seconds at `1x`. These remain centralized tuning constants until the proof-of-fun slice is playtested.

The spike does not need final art, procedural geography, a complete event system, or production save migration support.

## 15. Dependencies To Avoid Initially

Do not add these unless a concrete requirement appears:

- Phaser or another full game engine
- Redux, Zustand, or XState
- A physics or pathfinding library
- A procedural map-generation library
- A UI component framework
- Tailwind CSS
- Runtime schema-validation libraries for internal TypeScript content
- A database or backend
- Service workers or offline/PWA support
- Asset-pipeline plugins beyond what Vite provides
- A general persistence framework, multiple save slots, or cloud synchronization

The small hand-written local-save adapter is intentional and is not a reason to introduce application-wide state or persistence infrastructure.

## 16. Final Recommendation

Use **TypeScript, Vite, React, native Canvas 2D, Vitest, and Playwright**, with the simulation isolated as a deterministic, browser-independent core.

Implement one authored island layout, exactly three survivors, one 14-day rescue duration, a once-per-day camp-priority command, capped resource sources, 12-15 event templates, and one versioned automatic local resume point.

Keep procedural gameplay geography, variable survivor counts, alternate rescue durations, signal, and sickness outside the MVP. Build a one-survivor technical slice first, then require the three-survivor proof-of-fun gate before investing in final content and presentation.
