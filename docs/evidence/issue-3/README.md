# Issue #3: full 14-day decision arc

Implemented on `feat/issue-3-full-arc-pacing`, based on
`853eea89668e774ad2b686ca39821fe13a0a05ee` (also the historical review commit).
Validation date: 2026-09-08 America/Los_Angeles. Runtime: Node 24.20.0.
Rules: `mvp-arc-1`; report format: 2. Policy implementations and the
`m5-release-v1` seed manifest are unchanged. File and build fingerprints are in
[build.json](build.json). The 2026-09-09 review verified every source, policy,
manifest, and build fingerprint against the tested files before committing.

## Allocation and promise handling

The design was established before scheduling changes: ten shared root/follow-up
slots, allocated 3/4/3 to early (days 1–4), middle (5–10), and late (11–14).
Slots open at elapsed days 0.45, 1.85, 3.25, 4.65, 6.05, 7.45, 8.85, 10.25,
11.65, and 13.05. Unused slots carry forward when content is unavailable.
The existing 0.8-day minimum spacing still applies after delayed decisions;
the existing two-day fallback remains available. Eligibility can delay slots,
so 3/4/3 is the planned allocation, not a forced content selection quota.

Ready promised follow-ups take the next slot before roots. Every queued promise
reserves one remaining decision; a root with a possible follow-up also needs
one additional slot and enough time before rescue. This prevents spending the
last slot on a new promise. Follow-ups count toward ten, including when they
cross a phase boundary. Early defeat ends the arc without filling unused slots.
The defensive cap cleanup remains, and the runner now counts both queued
follow-ups discarded at the cap and selected promises suppressed by the cap.

No serialized fields or schema version changed. The rules-version bump makes
older saves explicitly incompatible through the existing guarded-save path.
Exactly three production survivors, rescue at tick 8,400, slice behavior,
independent RNG streams, and the shared pure core remain intact.

## Historical reproduction and current baseline

The historical six-run diagnosis reproduces on the untouched base using Node 24
and conservative policy 1.0.0. It is separate from the new working-tree results.
Every baseline run has ten decisions at ticks 270 through 4,590 in increments
of 480: early/middle/late counts 5/5/0, initial gap 270, ending gap 3,810
(6.35 days). The old report's maximum of 480 omitted both boundaries.

Commands (with the Node 24 `bin` directory prepended to `PATH`):

```sh
node --import tsx scripts/simulate.ts --runs=1 --seed=ci --policy=conservative
node --import tsx scripts/simulate.ts --runs=5 --seed=review --policy=conservative
```

These exact commands were run before and after implementation:
[baseline ci](baseline-ci.json), [baseline review](baseline-review.json),
[current ci](current-ci.json), [current review](current-review.json).
Each report retains game seed, policy seed/version, and the command trace.

| Seeds                                      | Decisions | Phases | First gap | Last decision | Ending gap | Maximum gap |
| ------------------------------------------ | --------- | ------ | --------- | ------------- | ---------- | ----------- |
| ci, review-1, review-2, review-4, review-5 | 10        | 3/4/3  | 270       | 7,830         | 570        | 840         |
| review-3                                   | 10        | 3/4/3  | 270       | 8,190         | 210        | 1,200       |

All six reach rescue, each with a seep follow-up and zero cap losses. Review-1
and review-5 rescue two survivors; the others rescue three. Changed timing
changes survival outcomes, so these six runs do not establish release balance.

## Reporting and regression coverage

`maxDecisionGapTicks` in report format 2 includes start and ending boundaries.
Each result also retains decision ticks, per-phase counts, each interval,
start-to-first and last-to-ending gaps, full-length status, and cap-loss counts.
Zero-decision runs have null first/last decision fields and a single start-to-end
interval. Aggregate reports retain boundary maxima and summed phase counts.

Overdue running intervals can be explained only by observed absence of eligible
content, checking the same resource, participant, prior-choice, earliest-time,
and cooldown rules as the core, including its phase-relaxed deadline fallback.
The report retains those tick ranges as `no-eligible-content`. Budget exhaustion
and slot reservation are deliberately excluded from that exception. Any
unexplained full-length interval over two days fails the runner. Full-length
runs must also have 8–10 decisions covering all phases; early defeat waives
only the minimum count/phase requirement. Cap losses fail the runner.

Focused tests cover all six seeds twice, boundary gaps, minimum spacing,
phase coverage, fulfilled promises, save/resume with a queued ninth-decision
promise, roots that could promise a follow-up in the last slot, cap versus
content ineligibility, explained and unexplained gaps, and zero-decision early
defeat. The older full-run fixture now uses `ci`, whose new event sequence
includes the follow-up that test asserts; its minimum count was strengthened
to eight.

## Completed checks

- `npm run typecheck`, `npm run lint`, `npm run format` (check-only),
  `npm test -- --run` (111 passed),
  and `npm run build`: pass on Node 24.
- `npm run simulate:ci`: pass, all three policy scenarios;
  [report](ci.json).
- `node --import tsx scripts/simulate.ts --batch=matrix --runs=100 --seed=issue-3`:
  300 runs, zero invariant failures, all pacing/count checks pass, zero cap
  losses. Rescue counts: conservative 90/100, resource-greedy 100/100,
  random-fuzz 62/100. [Complete report with failure traces](targeted-matrix.json.gz).
- `node --import tsx scripts/simulate.ts --batch=sensitivity --runs=20`:
  first 20 unchanged manifest seeds × 14 scenarios = 280 runs, zero invariant
  failures, all pacing/count checks pass, zero cap losses.
  [Complete report with failure traces](targeted-sensitivity.json.gz).
  The small sample's largest rescue delta is −25 percentage points without
  tide-pools; this is a diagnostic, not a replacement for full balance evidence.
- Full `npm run test:e2e`, with
  `PLAYWRIGHT_BROWSERS_PATH=/tmp/issue-3-browsers`: 39 passed, one intentional
  skip, two failures. Both 1440px dashboard-height assertions also fail on an
  untouched `git archive` of the base (two failed, two 1920px checks passed).
  [Current browser log](browser-current.txt), [base comparison](browser-baseline.txt).
  This predates the scheduling change; no layout or browser test was changed.
  Browser binaries were missing initially and installed into `/tmp`; Chromium
  151 is Playwright's Ubuntu fallback on this host, not physical-device evidence.

JSON `.gz` artifacts can be read with `gzip -dc <path>`.

## Full release and sensitivity review (2026-09-09)

Both final batches completed on 2026-09-08 America/Los_Angeles, using Node
24.20.0 and the final `mvp-arc-1` scheduler/report checks. The reports match the
unchanged 10,000-seed `m5-release-v1` manifest and policy versions 1.0.0.
[Review metadata and report hashes](batch-review.json) retain commands,
completion timestamps, and verification of all 18,286 defeat traces.

- `npm run simulate:release`: **30,000 runs passed**, across all three policies.
  [Summary](release-summary.json), [complete report](release.json.gz).
- `npm run simulate:sensitivity`: **140,000 runs passed**, conservative baseline
  plus all 13 event exclusions. [Summary](sensitivity-summary.json),
  [complete report](sensitivity.json.gz).

Every scenario has zero initial-state/invariant failures, 100% decision and
gap compliance, zero follow-ups lost to the cap, and maximum gap at most
1,200 ticks (two days), including both boundaries. Full-length runs satisfy
the 8–10 decision budget and cover every phase. The initial gap is always 270
ticks. The full reports retain game seed, policy seed/version, and command
trace for every defeat; defeats are game outcomes, not invariant failures.

| Release policy (1.0.0) | At least one rescued | All three rescued |
| ---------------------- | -------------------- | ----------------- |
| conservative           | 89.19%               | 45.14%            |
| resource-greedy        | 99.78%               | 78.01%            |
| random-fuzz            | 59.67%               | 25.02%            |

Conservative results meet the documented provisional ranges of 70–90% rescue
and 30–60% all-survivor rescue. Compared with the historical 85.27% / 42.19%
baseline, these rise by 3.92 / 2.95 percentage points. The maximum absolute
sensitivity rescue-rate delta is **3.43 percentage points** (excluding
`smoke-on-horizon`), within the ten-point target. The largest reduction is
2.39 points without `tide-pools`. The full batch supersedes the small sample's
−25-point tide-pools diagnostic. Greedy and random policy rates remain
diagnostics; these automated targets do not predict human win rates.

The issue #3 source requirement is now checked off. No simulation rerun is
pending: the committed implementation matches the recorded tested source
fingerprints; this review adds only documentation and retained reports.

## Remaining external gates

The two pre-existing browser layout failures remain outside issue #3. Human
playtesting, device coverage, and release signoff remain the existing external
gates; automated timing coverage does not close them.
