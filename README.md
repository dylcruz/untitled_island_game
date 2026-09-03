# Untitled Island

A deterministic browser survival game about three autonomous survivors waiting
14 in-game days for rescue. Players control time, choose a daily camp priority,
and respond to events while managing supplies, shelter, injuries, and morale.

The current build contains the Milestone 2 proof-of-fun implementation. Final
content, player-facing save/resume, and release balancing are still in progress.

## Run locally

Prerequisites: a current Node.js release and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite, normally <http://localhost:5173/>. Choose
**Begin**, use the `0x`, `1x`, `3x`, and `8x` controls to manage time, and change
the camp priority at most once per in-game day. Event decisions pause the
simulation until a choice is resolved and acknowledged.

For the shortened internal regression game, open
<http://localhost:5173/?mode=slice>.

## Human playtesting

Play the default production game through rescue or defeat. Afterward, record
whether the player can:

- explain how their camp-priority changes affected the group;
- identify one consequential event choice; and
- recall a survivor-specific turning point.

Milestone 2's blind-playtest gate requires at least four of five participants
to satisfy those checks.

## Development checks

```sh
npm run typecheck
npm run lint
npm run format
npm run test -- --run
npm run build
npm run simulate -- --runs=100 --seed=m2-check
npm run test:e2e
```
