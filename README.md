# Untitled Island

Can your camp hold together until rescue? Untitled Island is a short,
replayable browser survival story about three autonomous survivors stranded on
an island. You control the pace, set the camp's daily priority, and make the
decisions that shape a 14-day run.

## Play the loop

Start or resume a seeded expedition, read the camp's current pressures, and
choose how the group should spend its effort. Survivors then travel the island
on their own to gather supplies, repair shelter, rest, or recover. Time moves
through day and night until an event pauses the run. Choose a response, read
the immediate result, and continue until rescue or defeat.

The current production build includes:

- Three distinct survivors with needs, traits, morale, injuries, and
  autonomous activities.
- Five camp priorities—Balanced, Secure water, Find food, Build and repair,
  and Recover—with at most one successful change per in-game day.
- Thirteen authored event templates, including two interactive follow-ups,
  with visible risk, cost, impact, and result context.
- One authored island with six fixed waypoints and four seeded,
  cosmetic-only scenery variants.
- Seeded setup, guarded local save/resume, ending summaries, and restart with
  the same or a new seed.
- No backend, cloud save, or telemetry. Runtime timing stays on the device.

For architecture and the remaining MVP work, see
[`docs/architecture.md`](docs/architecture.md) and
[`docs/mvp_todo.md`](docs/mvp_todo.md).

## Current status

The automated release-candidate scope is complete. The remaining release
gates are external: human timing, blind and final-content playtests,
representative desktop/mobile hardware performance, the full browser/device
matrix, the manual acceptance matrix, and final release signoff. Automated
results do not close those gates or claim a finished release.

## Run locally

Use Node.js 24 and npm. The repository pins the Node major version in
[`.nvmrc`](.nvmrc); with nvm, run `nvm use` before installing dependencies.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite, normally
<http://localhost:5173/>. The setup screen lets you begin, enter or copy a
seed, resume a compatible local checkpoint, or confirm a replacement run.

### Gameplay controls

- `0x` pauses; `1x` is normal speed; `3x` and `8x` accelerate the fixed-step
  simulation.
- Choose one camp priority and change it at most once per in-game day. The
  priority guides the group; survivors still handle their own urgent needs
  and nighttime schedule.
- Event decisions pause time. Choose a response, acknowledge its result, and
  continue.
- Use the semantic controls with a mouse, touch, or keyboard.

The shortened `?mode=slice` view is developer-only regression coverage, not a
player-facing game mode. It is available at
<http://localhost:5173/?mode=slice> during local development.

Runs are deterministic only when the rules/configuration and seed are the
same, and the same commands are applied at the same simulation ticks. Core
transitions at a given tick are independent of rendering and viewport size, but
live speed, frame stalls, visibility changes, and input timing can change which
tick receives a command; different command ticks can change the outcome.

## Developer checks

Install Chromium before browser checks:

```sh
npx playwright install --with-deps chromium
```

The repository's scripts are defined in [`package.json`](package.json). A
local verification ladder is:

```sh
npm run typecheck
npm run lint
npm run format
npm test -- --run
npm run build
npm run simulate:ci
npm run test:e2e:short
```

`npm run format` runs Prettier in check mode (`prettier --check .`); it reports
formatting drift and does not rewrite files. To run the configured full
Playwright suite locally, use `npm run test:e2e`.

CI runs on Node.js 24 after `npm ci` and Chromium installation. It checks
typechecking, linting, formatting, unit tests, the production build, a
one-seed all-policy simulation matrix, and the short Playwright suite on
Chromium Desktop Chrome and emulated Pixel 7. It does not claim Firefox,
WebKit/Safari, or physical-device coverage.

## Headless simulation

The simulation runner prints a machine-readable JSON report to stdout and a
short defeat/invariant summary to stderr. Reports include policy and version,
seeds, scenarios, rescue and ending rates, resources, events, decision gaps,
and invariant failures. The matrix uses conservative, resource-greedy, and
random-fuzz policies; reports retain policy IDs, versions, and failure traces.
Invariant failures and invalid CLI arguments produce a nonzero exit status.

```sh
# Local prefix-seed batch (10 runs).
npm run simulate -- --runs=10 --seed=local-check

# CI-sized, one-seed matrix across all named policies.
npm run simulate:ci

# Checked-in 10,000-seed manifest across all named policies (expensive).
npm run simulate:release

# Baseline plus leave-one-event-template-out scenarios (expensive).
npm run simulate:sensitivity
```

The release and sensitivity batches are separate manual or scheduled
validation; they are deliberately outside pull-request CI.

## Repository map

- `src/game/` — pure simulation, island, traits, events, endings, and rules.
- `src/runtime/` — fixed-step loop, speed/pause handling, visibility, and
  checkpoint callbacks.
- `src/rendering/` — authored Canvas island and survivor presentation.
- `src/persistence/` — guarded, versioned local save/resume.
- `src/App.tsx` and `src/styles.css` — browser interface and layout.
- `scripts/` — headless policies, manifest, and simulation reports.
- `e2e/` and `src/test/` — browser and simulation tests.
