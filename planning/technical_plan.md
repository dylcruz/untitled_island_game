# Island Survival Simulation: Technical Plan

## 1. Recommended Stack

| Area | Choice | Rationale |
| --- | --- | --- |
| Language | TypeScript with strict mode | Deterministic simulation and data-driven events benefit from strong types |
| Build tool | Vite | Fast development, simple static production output, and first-class TypeScript support |
| Interface | React | Setup, survivor panels, decisions, logs, and endings have enough stateful UI to justify a framework |
| Island rendering | Native Canvas 2D | Eight survivors and a compact island do not require a game engine or WebGL renderer |
| Styling | Plain CSS with CSS Modules | Supports responsive, accessible, project-specific design without a component-library dependency |
| Unit testing | Vitest | Integrates directly with Vite and supports fast deterministic simulation tests |
| Browser testing | Playwright | Covers complete runs, keyboard controls, touch viewports, visibility changes, and static builds |
| Formatting and linting | Prettier and ESLint | Standardizes TypeScript, React, and accessibility checks |
| Package manager | npm | Sufficient for a single-package application and requires no additional tooling |
| Deployment | Static hosting | The generated `dist/` can run on GitHub Pages, Cloudflare Pages, Netlify, or equivalent hosting |

Use the current active Node.js LTS release and pin dependencies through `package-lock.json`.

## 2. Rendering Decision

Start with native Canvas 2D rather than PixiJS or Phaser.

The expected rendering workload is modest:

- One compact island
- Six or seven static locations
- At most eight moving survivors
- Basic task poses, particles, and day/night effects
- Pointer interaction primarily handled through accessible HTML

Canvas avoids introducing a second scene or state framework and keeps the simulation independent from rendering. React renders all interactive controls, dialogs, status displays, and accessible descriptions.

Adopt PixiJS only if the technical spike demonstrates a concrete Canvas problem, such as:

- Sprite batching or animation code becoming difficult to maintain
- Required effects performing poorly on representative mobile hardware
- Camera, masking, or asset-management needs expanding substantially

Phaser is not recommended because its integrated physics, scene, and game-state systems exceed the MVP's requirements and encourage coupling simulation logic to rendering.

## 3. Application Architecture

Use four distinct layers:

```text
Input/UI -> Commands -> Simulation -> Read-only snapshots -> UI/Renderer
```

### 3.1 Simulation

Implement the simulation in pure TypeScript with no React, Canvas, DOM, or wall-clock dependencies.

Responsibilities include:

- Fixed-step time advancement
- Survivor needs and health
- Priority-based task selection
- Movement along a waypoint graph
- Resource production and consumption
- Event selection and outcomes
- Delayed consequences
- Victory, defeat, and ending quality
- Seeded generation

The simulation accepts explicit commands such as:

```ts
startGame(config);
advanceStep();
selectEventChoice(eventId, choiceId);
```

It must not read `Date.now()`, `Math.random()`, browser dimensions, or React state directly.

### 3.2 Runtime Controller

A small imperative controller owns:

- `requestAnimationFrame`
- The fixed-step accumulator
- Pause and speed state
- Catch-up limits
- Browser visibility handling
- Publishing UI snapshots
- Dispatching commands from React

Render animation can run every frame while React receives snapshots at a lower rate, approximately five to ten times per second. This prevents normal simulation updates from rerendering the complete interface every frame.

Speed controls change how many fixed simulation steps are processed, not the size of a simulation step.

### 3.3 Canvas Renderer

The renderer receives read-only state plus interpolation data.

Responsibilities include:

- Island shape and decoration
- Location markers
- Survivor positions and poses
- Movement interpolation
- Day/night overlay
- Important visual feedback

It must not decide tasks, consume resources, trigger events, or otherwise mutate game state.

Use a high-DPI canvas scaled by `devicePixelRatio`, but cap the effective pixel ratio if mobile profiling shows excessive fill cost.

### 3.4 React Interface

React owns presentation state, not authoritative game rules.

Screens and components include:

- New-game setup
- Main status interface
- Survivor cards
- Time controls
- Activity log
- Decision dialog and result state
- First-run introduction
- Ending summary

Use semantic HTML buttons, dialogs, headings, lists, and progress indicators. Canvas content must have an adjacent textual summary so critical information is not available only visually.

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
    generation/
    endings/
    random/
  runtime/
    GameController.ts
    fixedStepLoop.ts
  rendering/
    CanvasRenderer.ts
    island/
    survivors/
  content/
    traits.ts
    events/
    names.ts
  styles/
  test/
    fixtures/
    simulation/
  main.tsx

e2e/
  setup.spec.ts
  complete-run.spec.ts
  controls.spec.ts
  accessibility.spec.ts
```

Keep `game/` importable in Node without browser globals. This enables unit tests and thousands of headless balance simulations without Canvas or React.

## 5. State Model

Use ordinary typed objects and discriminated unions rather than a state-management library.

The authoritative state should follow this general shape:

```ts
interface GameState {
  seed: string;
  rngState: number;
  status: "running" | "decision" | "victory" | "defeat";
  clock: GameClock;
  island: IslandState;
  resources: ResourceState;
  survivors: SurvivorState[];
  activeEvent: ActiveEvent | null;
  scheduledEffects: ScheduledEffect[];
  history: HistoryEntry[];
}
```

State design rules:

- Store IDs rather than object references across subsystems.
- Represent resources and conditions with explicit bounded values.
- Record meaningful history entries rather than every simulation tick.
- Include RNG state in simulation state so runs remain reproducible.
- Derive display values where practical rather than duplicating them.
- Keep tuning values in centralized typed configuration objects.

A separate global store such as Redux, Zustand, or XState is unnecessary for the MVP. The simulation itself is already the state machine.

## 6. Randomness and Reproducibility

Provide a small deterministic PRNG abstraction:

```ts
interface RandomSource {
  next(): number;
  integer(min: number, max: number): number;
  pickWeighted<T>(options: WeightedOption<T>[]): T;
  shuffle<T>(values: readonly T[]): T[];
}
```

All procedural generation, survivor creation, task tie-breaking, and event outcomes must use this abstraction. Game logic must never use `Math.random()`.

Derive independent random streams from the user seed for:

- Island generation
- Survivor generation
- Runtime simulation and events

Independent streams prevent changes to cosmetic generation from silently changing event outcomes.

## 7. Content Format

Define traits and events as TypeScript data using `satisfies` against strict types.

```ts
export const waterDispute = {
  id: "water-dispute",
  category: "conflict",
  cooldownDays: 3,
  // Event content and effects
} satisfies EventDefinition;
```

Prefer TypeScript over external JSON for the MVP because event conditions and effects require constrained executable logic. This provides compile-time validation without designing a custom expression language.

Content definitions should call a small library of reusable predicates and effects rather than embedding large arbitrary functions in each event. This keeps behavior testable and understandable.

## 8. Styling and Responsive Layout

Use CSS Grid for the desktop simulation shell and switch to a stacked layout on narrow screens.

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

## 9. Testing Stack

### 9.1 Vitest Unit Tests

Test the pure simulation for:

- Need accumulation and health damage
- Resource gathering and consumption
- Behavior priorities and explanations
- Trait modifiers
- Event eligibility, weighting, and cooldowns
- Immediate and delayed effects
- Victory and defeat
- Seed reproduction
- Island validation and reachability
- Fixed-step consistency at every speed

Use fake time only around the runtime controller. Simulation tests should advance explicit steps.

### 9.2 Headless Balance Runner

Build a Node-executable harness around the same simulation package. It should run large seed batches and report:

- Victory rates by group size and rescue duration
- Causes and timing of deaths
- Resource minimums
- Event frequencies
- Long gaps between decisions
- Stuck or idle survivor states
- Run duration and ending distributions

The runner should produce machine-readable JSON and a concise console summary. It is balance instrumentation, not a test that asserts one exact victory percentage.

### 9.3 Playwright Browser Tests

Cover a small number of high-value browser flows:

- Configure and start a game
- Complete a deterministic short run
- Verify that decisions pause and resume the simulation
- Operate the game with a keyboard
- Operate the game in a mobile touch viewport
- Pause on browser-tab visibility changes
- Reach victory and defeat, restart, and replay the same seed
- Load the production build under static-hosting rules

Do not make pixel-perfect Canvas screenshots the primary test strategy. Assert simulation state and accessible HTML output; reserve visual snapshots for a few stable screens.

## 10. Development Commands

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

Continuous integration should run type checking, linting, unit tests, a production build, and a short deterministic Playwright suite.

## 11. Technical Spike

Before the vertical slice, implement a minimal integrated spike that proves:

1. A fixed-step simulation advances identically at normal, fast, and very-fast speeds.
2. Eight survivors interpolate smoothly between waypoints.
3. Canvas remains smooth on a 360-pixel mobile viewport at a capped device pixel ratio.
4. Resizing and orientation changes preserve rendering correctly.
5. Hiding the tab pauses simulation without a catch-up burst on return.
6. React UI updates do not run at animation-frame frequency.
7. Pointer and touch location selection works if direct island inspection is retained.
8. Simulation tests run in Node without DOM mocks.

Suggested initial speed values are `0x`, `1x`, `3x`, and `8x`, with a 100 ms fixed simulation step. Both remain tuning constants until the vertical slice is playtested.

## 12. Dependencies to Avoid Initially

Do not add these unless a concrete requirement appears:

- Phaser or another full game engine
- Redux, Zustand, or XState
- A physics or pathfinding library
- A UI component framework
- Tailwind CSS
- Runtime schema validation for internal TypeScript content
- A database or backend
- Service workers or offline/PWA support
- Asset pipeline plugins beyond what Vite provides
- Save-state serialization infrastructure

## 13. Final Recommendation

Use **TypeScript, Vite, React, native Canvas 2D, Vitest, and Playwright**, with the simulation isolated as a deterministic, browser-independent core.

This stack keeps the application lightweight while providing enough structure for the interface, procedural generation, data-driven events, deterministic testing, and headless balance simulations required by the MVP.
