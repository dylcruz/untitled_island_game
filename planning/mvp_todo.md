# MVP Implementation TODO

This checklist translates `mvp_project_plan.md` and `technical_plan.md` into the
current implementation path. Milestones 0 and 1 are complete. Milestone 2's
software implementation and automated verification are complete; its required
five-person blind-playtest gate remains open. Milestone 3's verified software
scope is complete; final content playtesting and release validation remain open.
Milestone 4 implementation is active on `feature/milestone-4-browser-experience`.

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
- [x] Run the foundation Playwright flows in Chromium desktop and emulated
  360 CSS-pixel mobile environments.
- [ ] Manually confirm smooth rendering on representative desktop and physical
  mobile hardware.
- [x] Add `node_modules/`, `dist/`, `test-results/`, and Playwright reports to
  `.gitignore` before staging repository changes.

## Milestone 1: Shortened Technical End-To-End Slice

Goal: prove the complete simulation-to-UI pipeline with one survivor, a short
rescue clock, and three placeholder events. This is a development/test slice,
not a change to the final three-survivor product configuration.

### Configuration And State

- [x] Add an internal test/slice configuration path that permits one survivor
  and a shortened rescue clock without exposing either as an MVP player option.
- [x] Keep the production/default and persisted MVP contract fixed at three
  survivors and 14 days.
- [x] Expand `GameState` with stored food, water, and materials; survivor health,
  hunger, thirst, and energy; active tasks; reservations; active event; scheduled
  effects; event schedule; and meaningful history entries.
- [x] Keep all new state plain, serializable data with stable IDs rather than
  object or function references.
- [x] Centralize all initial capacities, rates, thresholds, task durations,
  yields, and shortened-slice values in typed tuning/configuration.
- [x] Increment the rules version when the authoritative simulation/content
  contract changes, and update persistence validation accordingly.

### Time, Needs, And Resources

- [x] Implement derived time of day, daylight/nighttime phases, dawn boundaries,
  and exact rescue-tick handling using integer ticks.
- [x] Accumulate hunger, thirst, and energy deterministically.
- [x] Consume stored food and water through explicit self-care tasks.
- [x] Apply health damage only after documented critical need thresholds.
- [x] Model source availability separately from stored resources.
- [x] Replenish fresh water and forage at dawn up to their caps.
- [x] Replenish forest materials slowly and keep wreckage finite.
- [x] Guarantee that gathering never consumes or yields more than available,
  unreserved source output.

### Autonomous Tasks And Movement

- [x] Implement basic task selection for drinking, eating, resting/sleeping, and
  gathering food, water, or materials.
- [x] Enforce nighttime return-to-camp and sleep, with critical self-care as the
  documented override.
- [x] Store a structured reason code and display parameters for every selected
  task.
- [x] Create reservations containing stable IDs, task/source targets, and
  expected yields.
- [x] Release reservations on completion, interruption, invalidation, and death.
- [x] Preserve the rule that ordinary policy changes do not reverse valid travel
  already underway.
- [x] Verify that movement cannot strand a survivor or prevent critical
  self-care.

### Placeholder Event Flow

- [x] Define three strictly typed placeholder event templates.
- [x] Implement eligibility, deterministic selection, one active unresolved
  event, and automatic simulation pause at the decision boundary.
- [x] Add `select-event-choice` and `acknowledge-event-result` commands with
  typed rejection reasons.
- [x] Show an immediate result state before resuming simulation.
- [x] Make at least one choice schedule a plain-data delayed consequence.
- [x] Resolve delayed effects, health/death, rescue, and terminal entry in the
  documented within-tick order.
- [x] Implement both rescue victory and survivor-death defeat in the shortened
  slice.

### Minimal Player Interface

- [x] Display day/time, rescue countdown, stored resources, source availability,
  survivor needs/health, current task/destination/reason, and recent history.
- [x] Present the placeholder decision and result states with semantic HTML and
  keyboard/touch-operable choices.
- [x] Disable or explain invalid commands using simulation-provided rejection
  reasons rather than duplicated React rules.
- [x] Checkpoint saves at new-game start, day boundaries, event activation,
  choice, result acknowledgement, terminal entry, and visibility loss.
- [x] Play a complete shortened run from setup through victory or defeat without
  developer intervention.

### Milestone 1 Verification Gate

- [x] Unit-test need accumulation, resource consumption, gathering,
  replenishment, and health damage.
- [x] Unit-test reservation limits and release on every required path.
- [x] Unit-test nighttime scheduling and critical overrides.
- [x] Unit-test event trigger, choice, result, resume, and delayed consequence.
- [x] Unit-test final-tick ordering among delayed effects, death, and rescue.
- [x] Prove identical outcomes for equivalent commands at equivalent ticks under
  `1x`, `3x`, and `8x` schedules.
- [x] Add a deterministic headless policy that can finish the shortened run.
- [x] Add Playwright coverage for a complete shortened run and decision pause.
- [x] Run `npm run typecheck`, `npm run lint`, `npm run format`,
  `npm test -- --run`, `npm run build`, `npm run simulate`, and
  `npm run test:e2e`.

## Milestone 2: Three-Survivor Proof Of Fun

- [x] Promote the representative three-survivor, 14-day game to the default
  production path while retaining the internal slice for regression coverage.
- [x] Generate three distinct survivors with stable IDs and visual variation.
- [x] Implement at least six compatible traits and assign two per survivor.
- [x] Add morale, temporary injury, recovery, and trait modifiers.
- [x] Implement shelter condition, decay, nighttime protection/recovery, and
  repair material costs.
- [x] Implement all five camp priorities: Balanced, Secure Water, Find Food,
  Build And Repair, and Recover.
- [x] Enforce one successful priority change per numbered in-game day.
- [x] Implement deterministic rotating assignment order and group-aware source
  and task reservations.
- [x] Add all critical self-care and nighttime hard constraints before policy
  scoring.
- [x] Implement early (days 1–4), middle (days 5–10), and late (days 11–14)
  derived run phases.
- [x] Add eight representative events across resource, exploration, conflict,
  injury, shelter, trait, and follow-up categories.
- [x] Reference at least one earlier choice in a later event or ending.
- [x] Add a survivor-specific ending summary and basic ending quality.
- [x] Instrument event counts, maximum decision gaps, task reasons, speed usage,
  pause/hidden time, and run duration without feeding telemetry into simulation.
- [x] Run invariant simulations across many fixed seeds and verify no stuck
  movement, idle loops, invalid tasks, or conflicting reservations.
- [ ] Complete the five-person blind-playtest gate from the MVP plan before
  investing in final content or cosmetic polish.

## Milestone 3: Event Content And Presentation

M2 supplied the representative event architecture and initial content. This
milestone completes and tunes the final content pool.

- [x] Implement data-driven eligibility, phase weighting, repeatability,
  participant selection, and deadline-aware fallback scheduling for the
  representative M2 pool.
- [x] Add per-template cooldowns and finalize scheduling behavior for the
  expanded content pool.
- [x] Define consistent centralized probability ranges for low, moderate, and
  high risk.
- [x] Expand to 12–15 total interactive templates (13 production templates).
- [x] Include at least two interactive follow-up templates in that total.
- [x] Include at least three root templates that schedule an automatic delayed
  effect or unlock a follow-up.
- [x] Ensure a typical completed run presents 8–10 decisions (10 in the fresh
  100-seed verification batch).
- [x] Keep normal event spacing at or above 0.75 days and normal maximum gaps at
  or below two days.
- [x] Prevent non-repeatable templates from repeating within a run.
- [x] Discard irrelevant participant-bound delayed effects with a history reason.
- [x] Establish a six-trait baseline with compatible combinations.
- [ ] Revisit trait breadth and tuning during final content playtesting; expand
  to seven or eight only if it improves replay variation without obscuring
  survivor roles.
- [x] Add final fixed-island Canvas presentation with four seeded
  cosmetic-only variants, phase lighting, routes, location symbols,
  activity/status feedback, deterministic unique portraits, meters, meaningful
  production history, and risk/cost/impact/result provenance.
- [x] Re-run resource, participant, phase, and prior-state consistency checks
  across the expanded final event pool; the fresh 100-seed batch produced
  exactly 10 decisions per run, 480-tick (0.8-day) spacing, zero invariant
  failures, and 100/100 wins with all survivors alive.

### Milestone 3 Verification Gate

- [x] Verify the `m3-events-1` rules contract, 13 production templates, two
  interactive follow-ups, four delayed-effect/follow-up roots, per-template
  cooldowns and phase weights, and centralized typed risk ranges.
- [x] Verify participant-bound delayed effects record their source event and
  choice, discard correctly when no original participant remains alive, and
  preserve participant and global effect behavior.
- [x] Run 89/89 unit tests, typecheck, lint, format, production build, 14/14
  Chromium desktop/mobile Playwright checks, and 3/3 shortened-slice checks.

## Milestone 4: Complete Browser Experience

- [ ] Rework the wide-desktop presentation to use the available browser window
  and keep all survivor cards plus recent history visible without avoidable page
  scrolling, while preserving the single-column mobile layout.

- [ ] Build the seeded new-game screen and copy/reuse-seed workflow.
- [ ] Offer Resume for compatible running, decision, event-result, victory, and
  defeat checkpoints.
- [ ] Confirm before replacing an existing resumable run.
- [x] Wire automatic checkpoints for new game, day boundaries, priorities,
  event activation/choice/result, terminal entry, and visibility loss.
- [ ] Add unobtrusive player-facing save/failure status.
- [ ] Preserve an unacknowledged terminal checkpoint, then clear it after ending
  acknowledgement.
- [x] Reject corrupt, missing, unknown-content, schema-incompatible, and
  rules-incompatible save data safely in the persistence adapter.
- [x] Add an oversized-save guard that rejects over-limit reads before parsing
  and over-limit writes before storage.
- [ ] Add a player-facing invalid-save recovery flow.
- [ ] Add the first-run introduction covering goals, autonomous behavior,
  resources, camp priority, decisions, save/resume, and time controls.
- [x] Complete the current production layout for desktop and 360 CSS-pixel
  mobile viewports.
- [x] Ensure current controls work with keyboard and emulated touch, have
  visible focus, and meet 44-by-44 CSS-pixel touch targets.
- [x] Ensure critical meaning never depends on Canvas or color alone.
- [ ] Add selective ARIA live announcements for injury, death, depletion,
  shelter damage, decisions, and rescue approach.
- [x] Respect `prefers-reduced-motion`.
- [ ] Implement same-seed restart, randomized new game, and ending acknowledgement.
- [ ] Run Playwright flows for setup, complete run, priority limit, decisions,
  visibility, resume states, invalid saves, endings, keyboard, 360px touch, and
  production static-host paths.

## Milestone 5: Balance And Release Candidate

- [x] Implement the versioned deterministic M2 conservative headless policy.
- [ ] Add resource-greedy and deterministic random/fuzz policies using
  policy-owned RNG streams.
- [ ] Check in a stable manifest of 10,000 seeds and retain it across tuning
  changes.
- [ ] Record game seed, policy ID/version/seed, and command trace for every
  invariant failure or failed run.
- [x] Produce machine-readable JSON for production/slice results, policy use,
  resources, events, gaps, task reasons, invariants, command traces, and endings.
- [ ] Add the final concise aggregate console report, death analysis, and
  release-batch reporting required by the completed policy matrix.
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

- [x] Install Playwright Chromium and its Linux system dependencies. Preferred
  command: `npx playwright install --with-deps chromium`.
- [x] Run Playwright/Vite browser checks with permission to bind the local test
  server.
- [x] Run `npm run test:e2e` after Chromium is installed to close the outstanding
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

The following checks passed for the M2 software handoff and must be repeated for
each later milestone.

- [x] Preserve the pure deterministic `src/game/` boundary: no DOM, Canvas,
  React, storage, wall clock, or ambient randomness.
- [x] Preserve unrelated user work and do not weaken existing tests or
  assertions.
- [x] Update focused unit tests for every behavior or public-contract change.
- [x] Run typecheck, lint, formatting validation, unit tests, production build,
  and the relevant headless/browser checks.
- [x] Remove generated `dist/` and test-report artifacts unless they are
  intentionally retained outside version control.
- [x] Update durable `agent_docs/` handoff documentation after substantive
  Medium/Heavy deployments.

## Explicit Non-Goals

Do not add procedural geography, variable player-facing survivor counts,
alternate rescue durations, difficulty modes, sickness, signal management,
individual inventories or job assignment, crafting trees, combat, multiplayer,
accounts, cloud saves, save slots, a backend, a game engine, a state-management
library, or a general persistence framework unless the approved MVP plan is
explicitly revised.
