# MVP Implementation TODO

This checklist translates `mvp_project_plan.md` and `technical_plan.md` into a
continuation path from the verified Milestone 0 foundation. It is intended to be
the starting document for future implementation sessions.

## Current Baseline

- [x] Scaffold strict TypeScript, Vite, React, Vitest, Playwright, ESLint, and
  Prettier with the standard npm commands.
- [x] Establish a pure Node-importable `src/game/` boundary with explicit
  state-in/state-out functions.
- [x] Implement 100 ms fixed simulation steps and `0x`, `1x`, `3x`, and `8x`
  runtime speeds.
- [x] Implement five independently seeded and serializable PRNG streams.
- [x] Add the six-location authored island and deterministic movement for three
  placeholder survivors.
- [x] Add responsive high-DPI Canvas rendering and an adjacent semantic text
  summary.
- [x] Implement visibility-safe pause behavior, catch-up limits, wall-time
  snapshot throttling, and immediate terminal-state publication.
- [x] Add a guarded schema/rules-versioned local-save envelope and adapter.
- [x] Pass the current typecheck, lint, format, unit-test, production-build, and
  headless-simulation checks.
- [ ] Run the four existing Playwright foundation tests in a Chromium-capable
  environment and manually confirm smooth desktop and 360 CSS-pixel rendering.
- [ ] Add `node_modules/`, `dist/`, `test-results/`, and Playwright reports to
  `.gitignore` before staging repository changes.

## Milestone 1: Shortened Technical End-To-End Slice

Goal: prove the complete simulation-to-UI pipeline with one survivor, a short
rescue clock, and three placeholder events. This is a development/test slice,
not a change to the final three-survivor product configuration.

### Configuration And State

- [ ] Add an internal test/slice configuration path that permits one survivor
  and a shortened rescue clock without exposing either as an MVP player option.
- [ ] Keep the production/default and persisted MVP contract fixed at three
  survivors and 14 days.
- [ ] Expand `GameState` with stored food, water, and materials; survivor health,
  hunger, thirst, and energy; active tasks; reservations; active event; scheduled
  effects; event schedule; and meaningful history entries.
- [ ] Keep all new state plain, serializable data with stable IDs rather than
  object or function references.
- [ ] Centralize all initial capacities, rates, thresholds, task durations,
  yields, and shortened-slice values in typed tuning/configuration.
- [ ] Increment the rules version when the authoritative simulation/content
  contract changes, and update persistence validation accordingly.

### Time, Needs, And Resources

- [ ] Implement derived time of day, daylight/nighttime phases, dawn boundaries,
  and exact rescue-tick handling using integer ticks.
- [ ] Accumulate hunger, thirst, and energy deterministically.
- [ ] Consume stored food and water through explicit self-care tasks.
- [ ] Apply health damage only after documented critical need thresholds.
- [ ] Model source availability separately from stored resources.
- [ ] Replenish fresh water and forage at dawn up to their caps.
- [ ] Replenish forest materials slowly and keep wreckage finite.
- [ ] Guarantee that gathering never consumes or yields more than available,
  unreserved source output.

### Autonomous Tasks And Movement

- [ ] Implement basic task selection for drinking, eating, resting/sleeping, and
  gathering food, water, or materials.
- [ ] Enforce nighttime return-to-camp and sleep, with critical self-care as the
  documented override.
- [ ] Store a structured reason code and display parameters for every selected
  task.
- [ ] Create reservations containing stable IDs, task/source targets, and
  expected yields.
- [ ] Release reservations on completion, interruption, invalidation, and death.
- [ ] Preserve the rule that ordinary policy changes do not reverse valid travel
  already underway.
- [ ] Verify that movement cannot strand a survivor or prevent critical
  self-care.

### Placeholder Event Flow

- [ ] Define three strictly typed placeholder event templates.
- [ ] Implement eligibility, deterministic selection, one active unresolved
  event, and automatic simulation pause at the decision boundary.
- [ ] Add `select-event-choice` and `acknowledge-event-result` commands with
  typed rejection reasons.
- [ ] Show an immediate result state before resuming simulation.
- [ ] Make at least one choice schedule a plain-data delayed consequence.
- [ ] Resolve delayed effects, health/death, rescue, and terminal entry in the
  documented within-tick order.
- [ ] Implement both rescue victory and survivor-death defeat in the shortened
  slice.

### Minimal Player Interface

- [ ] Display day/time, rescue countdown, stored resources, source availability,
  survivor needs/health, current task/destination/reason, and recent history.
- [ ] Present the placeholder decision and result states with semantic HTML and
  keyboard/touch-operable choices.
- [ ] Disable or explain invalid commands using simulation-provided rejection
  reasons rather than duplicated React rules.
- [ ] Checkpoint saves at new-game start, day boundaries, event activation,
  choice, result acknowledgement, terminal entry, and visibility loss.
- [ ] Play a complete shortened run from setup through victory or defeat without
  developer intervention.

### Milestone 1 Verification Gate

- [ ] Unit-test need accumulation, resource consumption, gathering,
  replenishment, and health damage.
- [ ] Unit-test reservation limits and release on every required path.
- [ ] Unit-test nighttime scheduling and critical overrides.
- [ ] Unit-test event trigger, choice, result, resume, and delayed consequence.
- [ ] Unit-test final-tick ordering among delayed effects, death, and rescue.
- [ ] Prove identical outcomes for equivalent commands at equivalent ticks under
  `1x`, `3x`, and `8x` schedules.
- [ ] Add a deterministic headless policy that can finish the shortened run.
- [ ] Add Playwright coverage for a complete shortened run and decision pause.
- [ ] Run `npm run typecheck`, `npm run lint`, `npm run format`,
  `npm test -- --run`, `npm run build`, `npm run simulate`, and
  `npm run test:e2e`.

## Milestone 2: Three-Survivor Proof Of Fun

- [ ] Replace the slice configuration with the representative three-survivor,
  14-day production game.
- [ ] Generate three distinct survivors with stable IDs and visual variation.
- [ ] Implement at least six compatible traits and assign two per survivor.
- [ ] Add morale, temporary injury, recovery, and trait modifiers.
- [ ] Implement shelter condition, decay, nighttime protection/recovery, and
  repair material costs.
- [ ] Implement all five camp priorities: Balanced, Secure Water, Find Food,
  Build And Repair, and Recover.
- [ ] Enforce one successful priority change per numbered in-game day.
- [ ] Implement deterministic rotating assignment order and group-aware source
  and task reservations.
- [ ] Add all critical self-care and nighttime hard constraints before policy
  scoring.
- [ ] Implement early (days 1–4), middle (days 5–10), and late (days 11–14)
  derived run phases.
- [ ] Add eight representative events across resource, exploration, conflict,
  injury, shelter, trait, and follow-up categories.
- [ ] Reference at least one earlier choice in a later event or ending.
- [ ] Add a survivor-specific ending summary and basic ending quality.
- [ ] Instrument event counts, maximum decision gaps, task reasons, speed usage,
  pause/hidden time, and run duration without feeding telemetry into simulation.
- [ ] Run invariant simulations across many fixed seeds and verify no stuck
  movement, idle loops, invalid tasks, or conflicting reservations.
- [ ] Complete the five-person blind-playtest gate from the MVP plan before
  investing in final content or cosmetic polish.

## Milestone 3: Event Content And Presentation

- [ ] Complete data-driven event eligibility, phase weighting, cooldowns,
  repeatability, participant selection, and fallback scheduling.
- [ ] Define consistent centralized probability ranges for low, moderate, and
  high risk.
- [ ] Expand to 12–15 total interactive templates.
- [ ] Include at least two interactive follow-up templates in that total.
- [ ] Include at least three root templates that schedule an automatic delayed
  effect or unlock a follow-up.
- [ ] Ensure a typical completed run presents 8–10 decisions.
- [ ] Keep normal event spacing at or above 0.75 days and normal maximum gaps at
  or below two days.
- [ ] Prevent non-repeatable templates from repeating within a run.
- [ ] Discard irrelevant participant-bound delayed effects with a history reason.
- [ ] Expand to the final six-to-eight-trait pool with compatible combinations.
- [ ] Add final fixed-island presentation, seeded cosmetic-only variation,
  portraits, status feedback, and meaningful history/result presentation.
- [ ] Verify that events never contradict resources, participants, phase, or
  prior state.

## Milestone 4: Complete Browser Experience

- [ ] Build the seeded new-game screen and copy/reuse-seed workflow.
- [ ] Offer Resume for compatible running, decision, event-result, victory, and
  defeat checkpoints.
- [ ] Confirm before replacing an existing resumable run.
- [ ] Complete automatic checkpoint wiring and unobtrusive save/failure status.
- [ ] Preserve an unacknowledged terminal checkpoint, then clear it after ending
  acknowledgement.
- [ ] Handle corrupt, oversized, missing, unknown-content, schema-incompatible,
  and rules-incompatible saves safely.
- [ ] Add the first-run introduction covering goals, autonomous behavior,
  resources, camp priority, decisions, save/resume, and time controls.
- [ ] Complete responsive desktop and 360 CSS-pixel mobile layouts.
- [ ] Ensure all controls work with keyboard and touch, have visible focus, and
  meet 44-by-44 CSS-pixel touch targets.
- [ ] Ensure critical meaning never depends on Canvas or color alone.
- [ ] Add selective ARIA live announcements for injury, death, depletion,
  shelter damage, decisions, and rescue approach.
- [ ] Respect `prefers-reduced-motion`.
- [ ] Implement same-seed restart, randomized new game, and ending acknowledgement.
- [ ] Run Playwright flows for setup, complete run, priority limit, decisions,
  visibility, resume states, invalid saves, endings, keyboard, 360px touch, and
  production static-host paths.

## Milestone 5: Balance And Release Candidate

- [ ] Implement versioned conservative, resource-greedy, and deterministic
  random/fuzz policies using policy-owned RNG streams.
- [ ] Check in a stable manifest of 10,000 seeds and retain it across tuning
  changes.
- [ ] Record game seed, policy ID/version/seed, and command trace for every
  invariant failure or failed run.
- [ ] Produce machine-readable JSON and a concise console report for rescue
  rates, deaths, resources, policy use, events, gaps, reservations, invariants,
  and endings.
- [ ] Run leave-one-event-template-out sensitivity batches.
- [ ] Tune the conservative policy to the documented provisional rescue ranges.
- [ ] Verify zero initial-state and simulation-invariant failures under every
  policy.
- [ ] Run the documented ten-run human timing sample and meet the 15–25 minute
  criteria.
- [ ] Profile Canvas, React snapshot cadence, memory, and input responsiveness on
  representative desktop and mobile hardware.
- [ ] Test current target Chrome/Edge, Firefox, Safari/WebKit, iOS Safari, and
  Android Chrome environments.
- [ ] Run the full manual matrix covering seeds, policies, risk styles, speeds,
  visibility, saves, endings, restart, mouse, keyboard, and touch.
- [ ] Configure CI to run typecheck, lint, unit tests, production build, a small
  deterministic invariant batch, and the short Playwright suite.
- [ ] Re-run every MVP acceptance criterion and record release evidence.

## Testing Tools And Environment Needed

The repository already declares Vitest, Playwright Test, `tsx`, ESLint,
Prettier, TypeScript, and Vite in `package.json`. The following environment
support is still needed:

### Needed Now

- [ ] Install Playwright Chromium and its Linux system dependencies. Preferred
  command: `npx playwright install --with-deps chromium`.
- [ ] Permit Playwright/Vite tests to bind a localhost port such as
  `127.0.0.1:5173`; the current restricted sandbox returns `EPERM` when the test
  server binds.
- [ ] Run `npm run test:e2e` after Chromium is installed to close the outstanding
  Milestone 0 browser gate.
- [ ] Use a supported active Node.js LTS installation for repeatable development
  and CI, and add a repository version pin (`.nvmrc`, Volta, or equivalent) once
  the team selects the exact LTS release.

### Needed Before Browser/Release Validation

- [ ] Install Playwright Firefox and WebKit with their system dependencies:
  `npx playwright install --with-deps firefox webkit`.
- [ ] Provide access to at least one representative physical iOS Safari device
  and one Android Chrome device for touch, visibility, resizing, Canvas
  performance, and interruption checks that emulation cannot fully prove.
- [ ] Make Chrome/Chromium DevTools performance profiling and Lighthouse
  available for the Milestone 5 performance/accessibility pass.

### Recommended Before The Accessibility Gate

- [ ] Add `@axe-core/playwright` for repeatable automated accessibility checks.
  It supplements, but does not replace, keyboard, screen-reader, color/contrast,
  and touch testing.

## Required Checks At Every Milestone Handoff

- [ ] Preserve the pure deterministic `src/game/` boundary: no DOM, Canvas,
  React, storage, wall clock, or ambient randomness.
- [ ] Preserve unrelated user work and do not weaken existing tests or
  assertions.
- [ ] Update focused unit tests for every behavior or public-contract change.
- [ ] Run typecheck, lint, formatting validation, unit tests, production build,
  and the relevant headless/browser checks.
- [ ] Remove generated `dist/` and test-report artifacts unless they are
  intentionally retained outside version control.
- [ ] Update durable `agent_docs/` handoff documentation after substantive
  Medium/Heavy deployments.

## Explicit Non-Goals

Do not add procedural geography, variable player-facing survivor counts,
alternate rescue durations, difficulty modes, sickness, signal management,
individual inventories or job assignment, crafting trees, combat, multiplayer,
accounts, cloud saves, save slots, a backend, a game engine, a state-management
library, or a general persistence framework unless the approved MVP plan is
explicitly revised.
