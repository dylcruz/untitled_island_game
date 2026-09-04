# Untitled Island

A deterministic browser survival game about three autonomous survivors waiting
14 in-game days for rescue. Players control time, choose a daily camp priority,
and respond to events while managing supplies, shelter, injuries, and morale.

The current build is the Milestone 5 balance and release-candidate
implementation. It includes the production event system, deterministic
headless policies, machine-readable simulation reports, versioned save/resume,
seeded presentation, and Chromium browser coverage. Automated implementation
checks are in place; release is not complete. Blind and final-content
playtesting, timing, representative-hardware performance, and the full browser
and device matrix remain external gates.

## Run locally

Use Node.js 24 (Active LTS) and npm. The repository pins the major version in
[`.nvmrc`](.nvmrc); with nvm, run `nvm use` before installing dependencies.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite, normally <http://localhost:5173/>. Choose
**Begin**, use the `0x`, `1x`, `3x`, and `8x` controls to manage time, and change
the camp priority at most once per in-game day. Event decisions pause the
simulation until a choice is resolved and acknowledged.

For the shortened internal regression game, open
<http://localhost:5173/?mode=slice>. It is a test path, not a player-facing
configuration.

## Development checks

The standard local verification ladder is:

```sh
npm run typecheck
npm run lint
npm run format
npm test -- --run
npm run build
npm run simulate:ci
npm run test:e2e:short
```

The GitHub Actions workflow runs this same typecheck, lint, format check, unit
test, production build, deterministic simulation, and short browser suite on
pushes and pull requests. CI installs Chromium and covers the configured
Chromium Desktop Chrome and emulated Pixel 7 projects. It does not claim
Firefox, WebKit/Safari, or physical-device coverage.

## Headless simulation modes

`npm run simulate` keeps the legacy single-run interface. The M5 runner also
accepts `--batch=matrix`, `--batch=release`, and `--batch=sensitivity`:

```sh
# Small, deterministic all-policy invariant batch (used by CI).
npm run simulate:ci

# Checked-in 10,000-seed manifest under every named policy (expensive).
npm run simulate:release

# Leave-one-event-template-out sensitivity batch (expensive).
npm run simulate:sensitivity

# Single run, or an explicit legacy batch.
npm run simulate -- --runs=10 --seed=local-check
```

The matrix uses the conservative, resource-greedy, and deterministic
random/fuzz policies. Policy-owned random streams are separate from game RNG
streams. Reports include seeds, policy IDs and versions, traces for failed
runs, resources, events, decision gaps, endings, and invariant failures. A
nonzero exit status is used for invariant failures (and invalid CLI arguments).
Release and sensitivity commands are documented for manual or scheduled
validation and are deliberately not part of pull-request CI.

## Open release gates

The following require external evidence and are not implied by automated CI:

- the required blind playtests and final-content playtest revisit;
- the ten-run human timing sample and its 15–25 minute target;
- Canvas, React, memory, and input performance on representative desktop and
  mobile hardware;
- current Chrome/Edge, Firefox, Safari/WebKit, iOS Safari, and Android Chrome
  validation; and
- the full manual matrix of seeds, policies, risk styles, speeds, visibility,
  saves, endings, restart, mouse, keyboard, and touch.

No release completion or balance-target signoff is claimed until those gates
have been run and recorded.
