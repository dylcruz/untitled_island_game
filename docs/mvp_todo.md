# MVP Remaining Work

This is the public, remaining-only MVP checklist. The automated
balance/release-candidate scope is verified, but the MVP and release are still
open until the human, environment, browser/device, manual-test, and signoff
gates below are evidenced.

Canonical sources: the [MVP project plan](../planning/mvp_project_plan.md),
including its [proof-of-fun criteria](../planning/mvp_project_plan.md#milestone-2-three-survivor-proof-of-fun),
[manual test matrix](../planning/mvp_project_plan.md#manual-test-matrix), and
[MVP acceptance criteria](../planning/mvp_project_plan.md#17-mvp-acceptance-criteria),
and the [implementation TODO](../planning/mvp_todo.md).

## Verified baseline

The following software and automated evidence is complete and should not be
repeated as historical implementation work in this checklist:

- 100 unit tests, typecheck, lint, formatting, and production build passed. The
  local `simulate:ci`/CI-sized simulation passed. The CI workflow is configured,
  but no remote workflow result is being claimed.
- Configured Playwright verification: 41 tests passed with one intentional skip
  across Desktop Chrome and Pixel 7 projects.
- The 30,000-run release policy matrix has zero invariant failures; the
  conservative policy reports 85.27% at-least-one-survivor rescue and 42.19%
  all-survivor rescue.
- The 140,000-run sensitivity batch has zero invariant failures and a maximum
  3.0 percentage-point rescue-rate exclusion delta.

These results provide balancing and regression evidence; they do not replace
human playtesting or target-environment validation.

## Gameplay review follow-ups (2026-09-05)

Review basis: planning documents, current architecture, and implementation at
`90ea151`. The fixed three-survivor scope, pure simulation, independent random
streams, guarded saves, and shared browser/headless core provide a strong MVP
foundation. The highest-value next work is making the existing decisions and
survivors matter throughout the run. Keep procedural geography, configurable
parties, crafting, and relationship systems deferred as the plan specifies.

The findings below supplement the existing gates. Resolve the confirmed pacing
and presentation issues before final signoff; use the optional experiments only
when blind playtesting supports them. Historical automated results above remain
historical evidence, with the measurement limitation described below.

### Priority 1: Sustain decisions and report consequences accurately

- [ ] Spread the existing 8–10 decisions across the full 14-day arc and reserve
      room for late events and promised follow-ups. In six production runs
      (`ci`, `review-1` through `review-5`) using `conservative` policy `1.0.0`,
      all ten decisions occurred by tick 4,590 (7.65 elapsed days), leaving
      6.35 days without an event before rescue. The reported maximum gap was
      only 0.8 days because it measures gaps between decisions, excluding the
      final stretch. Extend pacing measurements to include start-to-first and
      last-to-ending intervals, decisions per run phase, and follow-ups lost
      to the cap. Preserve minimum spacing and the decision budget; verify
      full-length runs have no unexplained interval over two days, including
      the ending interval. See `activateEvent`, `regularEventSpacingTicks`,
      and result acknowledgement in [simulation.ts](../src/game/simulation.ts),
      [tuning.ts](../src/game/tuning.ts), and [simulate.ts](../scripts/simulate.ts).
- [ ] Show resolved event outcomes and actual applied changes. The result
      panel currently repeats authored effects, including conditional ones,
      and stores a fixed result string. A synthetic `fallen-palm` / `reach`
      decision using seed `result-review-1` produced no injury but reported
      “a painful sprain”; that text also enters history and turning points.
      Record which effects occurred and their actual deltas after caps, and
      derive result/history/ending text from that record. Verify both injury
      roll outcomes, capped resource gains, and save/resume of the result.
      See `selectEventChoice` in [simulation.ts](../src/game/simulation.ts)
      and the result panel in [App.tsx](../src/App.tsx).
- [ ] Audit event promises and risk labels against their effects. In
      [events.ts](../src/game/events.ts), “Test them cautiously” grants 2 food,
      while “Trust the hunch” grants 0.25 food plus morale despite describing
      the cautious portion as smaller. “Leave the marker” immediately grants
      water without retaining a future reserve; “Leave it for later” does not
      retain the driftwood opportunity. Signal choices affect morale, with
      rescue still guaranteed on the fixed date if anyone lives. Rewrite
      these descriptions or explicitly model their promises within existing
      systems. Distinguish certain costs from probabilistic setbacks: the UI
      shows a 10–30% risk window even for choices without a random effect,
      and night watch labels a morale setback as severe. Acceptance: players
      can identify the cost, possible setback, and any future commitment
      without inferring an unimplemented resource or rescue mechanic.
- [ ] Make fractional supplies and affordability readable. `formatValue` in
      [App.tsx](../src/App.tsx) rounds all stocks and sources: 0.25 food reads
      as 0, while 1.6 materials reads as 2 but cannot pay a two-material cost.
      Use compact fractional formatting that does not hide positive stock or
      imply an affordable choice. Explain unaffordable choices before a click
      while retaining authoritative command validation. Verify fractional
      gains, near-cost boundaries, and depleted/low labels agree with state.

### Priority 2: Make all three survivors and camp priorities legible

- [ ] Distribute event participation among eligible survivors using a
      deterministic rule that accounts for context and recent participation.
      `participantsFor` takes the first eligible survivor(s) in array order;
      in the six runs above, survivor 1 participated in 9–10 decisions and
      survivor 3 in none in five runs. Preserve trait, availability, and
      prior-choice constraints, and retain original participants for personal
      follow-ups when appropriate. Report participation by survivor and
      verify no fixed array position systematically owns the story. Keep
      group-wide consequences distinct from participant-specific memories.
      See [simulation.ts](../src/game/simulation.ts).
- [ ] Reconcile the six existing traits with their descriptions before adding
      more. [traits.ts](../src/game/traits.ts) describes Forager as finding
      more food, while `workTicksFor` accelerates collection. Cautious declares
      a dangerous-area modifier that current tasks do not consume, and
      Hot-headed's morale multiplier applies to ongoing losses but not the
      conflict event's direct morale effects. Audit each claimed benefit and
      drawback, then correct the text or behavior. Expose short trait
      explanations from survivor cards (currently names only), with keyboard
      and touch access. Acceptance: each trait has a demonstrable effect that
      matches its explanation and can be noticed during a run.
- [ ] Add a concise, state-derived camp outlook to support the once-per-day
      priority decision: stored versus incoming supplies, source output still
      available after reservations, next replenishment, and the most urgent
      survivor need. Current stock labels use fixed thresholds and do not
      account for living population or incoming tasks. Explain when a chosen
      priority is waiting on existing work or overridden by critical needs.
      Present estimates as estimates; derive them from existing rules rather
      than introducing another economy model. Acceptance: blind testers can
      choose a priority and explain why it may not immediately change a task.
      See `taskScores` in [simulation.ts](../src/game/simulation.ts) and camp
      status/priority presentation in [App.tsx](../src/App.tsx).
- [ ] Preserve a readable story and explain losses. Recent history displays
      only the last eight entries, and frequent task messages can displace
      decisions; endings concatenate turning points and select the last five
      choices, while death text only says a survivor died. Add a compact
      significant-event view using existing choice records and turning points,
      keep routine activity secondary, and select a few meaningful moments
      per survivor. Record observed causes of death and link consequences to
      actual prior choices where supported, without inventing causation.
      Verify an early choice remains discoverable near rescue and players
      can explain a loss. See [App.tsx](../src/App.tsx),
      [endings.ts](../src/game/endings.ts), and
      [simulation.ts](../src/game/simulation.ts).

### Optional experiments after the blind gate

- [ ] Measure the benefit of player agency using paired seeds: hold event
      strategy constant while comparing Balanced throughout against adaptive
      priorities, then hold priorities constant while comparing choices.
      Existing named policies change both factors, and the conservative
      policy uses a fixed per-event choice table. Report survivor count,
      condition, recovery from shortages, and endings as well as rescue rate.
      Use this to find weak priorities or choices that are almost always best;
      confirm suspected problems with humans before retuning. See
      [policies.ts](../scripts/simulation/policies.ts).
- [ ] Try a brief, non-blocking dawn recap showing yesterday's significant
      consequence, today's pressure, and the renewed priority opportunity.
      Use named survivors and existing state for personality; avoid extra
      mandatory decisions. Keep it only if testers understand the daily loop
      better without increasing interruption fatigue or missing timing goals.
- [ ] During the existing hardware profiling pass, evaluate movement at the
      current 8 Hz snapshot cadence. Canvas redraws the latest positions on
      animation frames without interpolation. If motion feels jerky, prototype
      render-only interpolation and simple task poses, respecting reduced
      motion. Verify speed changes, event pauses, visibility, and resume never
      advance or alter authoritative state. See
      [architecture.md](architecture.md#runtime-boundary).

Review diagnostics used the installed Node `v26.7.0` and local `tsx` through
`node --import tsx --input-type=module -e`. For each sampled seed, create a
production game and conservative policy, request its priority while the day's
change is available, choose and acknowledge each event immediately, and advance
explicit ticks until terminal. Read decision ticks and participants from
`choiceRecords`; compare the last tick with `rescueTick`. The injury check used
an in-memory synthetic decision state, not a naturally encountered event.
These targeted checks are not a release batch, browser playtest, human timing
sample, or verification under the repository's pinned Node 24 environment.
Apply the existing evidence and rerun conditions when implementing these tasks.

## Remaining gates, in dependency order

### 1. Decide and prepare the validation environment

- [ ] Agree and record the supported browser, browser-version, operating-system,
      viewport, and device targets. The plan names Chrome/Edge, Firefox,
      Safari/WebKit, iOS Safari, and Android Chrome; record the exact targets used
      for signoff.
- [ ] Install Playwright Firefox and WebKit with their system dependencies:
      `npx playwright install --with-deps firefox webkit`.
- [ ] Make Chrome/Chromium DevTools performance profiling and Lighthouse
      available for the performance/accessibility pass.
- [ ] Obtain at least one representative physical iOS Safari device and one
      Android Chrome device. Emulation does not fully prove touch, visibility,
      resizing, Canvas performance, or interruption behavior.

### 2. Close the blind proof-of-fun gate

Run a blind round with at least five people before treating final content or
cosmetic work as settled. Record the build, seeds, prompt/script, participant
count, and uncoached responses.

- [ ] At least four of the same participants can both explain how camp priority
      affected the group and identify one consequential choice.
- [ ] In the same round, at least four participants can recall a
      survivor-specific turning point after finishing.
- [ ] If any criterion fails, revise the core loop, agency, pacing, or
      presentation and rerun this gate before proceeding to final content or
      cosmetic work.

### 3. Revisit final content and traits

- [ ] During final content playtesting, decide whether the six-trait baseline
      should remain or expand to seven or eight. Expand only if it improves replay
      variation without obscuring survivor roles; record the decision and rationale.
- [ ] Record any content, trait, risk, or pacing changes and apply the rerun
      conditions below before final signoff.

### 4. Complete the human rescue-timing sample

- [ ] Collect at least 10 eligible, successful, non-debug rescue runs. Start
      timing after `Begin` is selected and stop when the ending appears.
- [ ] Count event-reading and policy-interaction time. Exclude explicit manual
      pauses and time spent in a hidden tab. Mark a run eligible only when at least
      75% of its unpaused simulation time is at normal speed and it uses no
      very-fast speed.
- [ ] Pass the timing gate only when at least 80% of eligible runs and the
      sample median are within 15–25 minutes. Report early defeats separately;
      they may be shorter. Fast and very-fast play intentionally shorten runs.
- [ ] For every run, record seed, build, outcome, start/end timestamps, speed
      usage, pause/hidden intervals, eligibility, and the resulting duration.

### 5. Profile desktop and mobile performance

- [ ] Profile Canvas rendering, React snapshot cadence, memory, and input
      responsiveness on representative desktop and mobile hardware.
- [ ] Record hardware, OS/browser, viewport, build, profiling method, observed
      measurements, and any issue or disposition. The release build must perform
      acceptably on the agreed supported desktop and mobile targets.

### 6. Validate target browsers and physical devices

- [ ] Test the agreed current targets: Chrome/Edge, Firefox, Safari/WebKit,
      iOS Safari, and Android Chrome.
- [ ] On the physical iOS and Android devices, test touch input, visibility and
      interruption handling, resizing, Canvas performance, and restoration flows.
- [ ] Record target/version/device, viewport, seed/build, scenarios exercised,
      pass/fail result, and reproducible issue details.

### 7. Execute the full manual matrix

- [ ] Test multiple seeds, including same-seed replays.
- [ ] Test every camp-priority option and the once-per-day change limit.
- [ ] Run conservative, balanced, and risky decision styles.
- [ ] Test desktop mouse and keyboard input, and mobile touch at 360 CSS
      pixels and larger.
- [ ] Test pause and every speed setting, including tab hiding and restoration.
- [ ] Test automatic resume after day boundaries, event decisions, policy
      changes, and visibility changes.
- [ ] Test automatic resume from unacknowledged victory and defeat states.
- [ ] Test invalid or incompatible local saves.
- [ ] Test victory with three, two, and one survivor, plus defeat with none.
- [ ] Test restart, new game, and same-seed replay.
- [ ] Record a matrix row for each scenario with target, seed/build, expected
      and observed result, and issue reference where applicable.

### 8. Re-run acceptance and obtain signoff

- [ ] Re-run every criterion in the plan's [MVP acceptance
      list](../planning/mvp_project_plan.md#17-mvp-acceptance-criteria) against the
      release candidate and attach evidence for each criterion. Do not treat the
      automated baseline above as proof of the human or environment gates.
- [ ] Confirm no known issue blocks setup, resume, camp priority, decisions,
      time controls, victory, defeat, or restarting.
- [ ] Assemble the release evidence package: software checks, policy/versioned
      balance and sensitivity reports, blind-playtest results, trait/content
      decision, timing sample, performance profiles, browser/device results, and
      manual matrix.
- [ ] Record release-candidate build/commit, evidence locations, unresolved
      risks, and owner/date for each exception.
- [ ] Obtain final MVP/release signoff only after every required gate passes.

## Evidence and rerun conditions

For every automated or manual result, retain the build/commit, target or policy
ID and version, seed(s), command/scenario trace, date, pass/fail result, and
the durable report or issue reference. Automated reports must identify policy
identity rather than presenting a context-free rescue rate; failed simulation
runs must retain the game seed, policy seed, and command trace.

- If the blind gate fails, revise core loop, agency, pacing, or presentation
  and repeat the blind round before final content/cosmetic work.
- If simulation rules, event eligibility/weights/cooldowns/phases, traits,
  risks, policy behavior, or other outcome-affecting content changes, rerun
  focused tests plus the release and sensitivity batches against the same
  `m5-release-v1` manifest. Preserve policy IDs/versions and update the
  balance evidence.
- If provisional balance ranges are revised after proof-of-fun playtests,
  document the reason before release-candidate balancing begins.
- For any behavior or public-contract change, repeat focused tests and the
  relevant typecheck, lint, formatting, unit, build, headless, browser, and
  acceptance checks before signoff.

## Recommended, not a blocker listed above

- [ ] Add `@axe-core/playwright` for repeatable automated accessibility checks.
      It supplements, but does not replace, keyboard, screen-reader,
      color/contrast, and touch testing.
