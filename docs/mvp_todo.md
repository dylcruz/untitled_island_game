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
