# Issue #4: resolved event outcomes

Validated 2026-09-09 (America/Los_Angeles), Node 24.20.0, against base
`3dfbd773bd6d0ff93c777661672f39006e702637`. Implementation and test build are
identified by the commit containing this report on
`fix/issue-4-resolved-event-outcomes`.

Effect application records conditional branches, exact numeric before/after
values and deltas, injury replacements, and injury morale loss. The result UI,
choice records, history, and ending turning points share derived outcome prose.
Scheduled effects remain separate; their history describes actual application
when due. Schema 2 rejects schema 1 through the existing recovery UI because
historical rolls and caps cannot be reconstructed safely.

Regression scenarios in `src/test/resolved-outcomes.test.ts` cover:

- Synthetic `fallen-palm/reach`, seed `result-review-1`: food gain, no injury,
  and no false sprain claim in result/history/ending.
- Synthetic `fallen-palm/reach`, seed `issue4-roll-2`: sprain severity 2 and
  the participant's actual morale loss. Twenty seeded rolls exercise both paths.
- Food starting at 0, 19, and 20: applied gains +3, +1, and 0.
- All authored choices: global/group/participant scope, numeric survivor changes,
  and separation of immediate effects from scheduled consequences.
- Detached active/history/snapshot nested records, result save/resume and
  acknowledgement, malformed outcome/prose/delta rejection, state agreement,
  and safe schema-1 incompatibility.

`e2e/m4-browser.spec.ts` covers both named injury branches with capped food,
result prose, applied details, and repeated reload from the result checkpoint.
Both Desktop Chrome and emulated Pixel 7 projects pass these scenarios.

Validation:

| Command                       | Result                                       |
| ----------------------------- | -------------------------------------------- |
| `npm run typecheck`           | Pass                                         |
| `npm run lint`                | Pass                                         |
| `npm run format` (check only) | Pass                                         |
| `npm test -- --run`           | 118 tests pass                               |
| `npm run build`               | Pass                                         |
| `npm run simulate:ci`         | Three scenarios, zero invariant-failure runs |
| `npm run test:e2e`            | 45 pass, 1 existing skip                     |
| `git diff --check`            | Pass                                         |

[Current CI simulation report](simulate-ci.json) and
[base-commit report](baseline-ci.json) retain policy IDs/versions, seeds,
invariants, and failed-game command traces. The reports match exactly except
`serializedStateBytes` in the random-fuzz defeat trace (larger with outcome
records). The defeat is a game result, not an invariant failure.

Simulation used the unchanged `mvp-arc-1` rules and policies conservative,
resource-greedy, and random-fuzz version 1.0.0 with `--batch=matrix --runs=1
--seed=ci`. Base comparison command: `node --import tsx
/tmp/issue4-baseline/scripts/simulate.ts --batch=matrix --runs=1 --seed=ci`,
using an archive of the base commit and the same locked dependencies.

No tuning, event definitions, risk probabilities, eligibility, policy identities,
or random draw order changed. Full `simulate:release` and
`simulate:sensitivity` were not rerun: this change records and presents existing
outcomes rather than changing them; the `m5-release-v1` manifest is unchanged.
This evidence does not replace those full balance batches, human playtesting,
or physical-device testing.

Environment notes: sandbox restrictions prevented the initial tsx IPC socket
and Vite server startup. Both checks passed outside the sandbox. Playwright's
initial probe of an unopened local port stalled; starting the same configured
Vite server directly allowed the complete suite to run. No test assertions or
repository server configuration were weakened.
