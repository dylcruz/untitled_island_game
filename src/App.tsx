import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { createGame, createSnapshot } from './game/simulation';
import type { GameSnapshot, Speed } from './game/types';
import { SPEEDS } from './game/types';
import { GameController } from './runtime/GameController';
import { CanvasRenderer, waypointSummary } from './rendering/CanvasRenderer';

function speedLabel(speed: Speed): string {
  return String(speed) + 'x';
}

interface CanvasViewProps {
  controller: GameController;
  snapshot: GameSnapshot;
}

function CanvasView({ controller, snapshot }: CanvasViewProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snapshotRef = useRef(snapshot);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const renderer = new CanvasRenderer(canvas);
    let frameHandle = 0;
    const draw = (): void => {
      renderer.render(snapshotRef.current);
      frameHandle = window.requestAnimationFrame(draw);
    };
    draw();
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(() => renderer.render(snapshotRef.current));
    resizeObserver?.observe(canvas);
    return () => {
      window.cancelAnimationFrame(frameHandle);
      resizeObserver?.disconnect();
    };
  }, [controller]);

  return (
    <canvas
      ref={canvasRef}
      className="island-canvas"
      role="img"
      aria-describedby="island-summary"
      aria-label="Authored island map with three moving survivor placeholders"
    />
  );
}

export default function App(): ReactElement {
  const initialState = useMemo(() => createGame(), []);
  const controller = useMemo(() => new GameController(initialState), [initialState]);
  const [snapshot, setSnapshot] = useState<GameSnapshot>(() => createSnapshot(initialState));
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const unsubscribe = controller.subscribe(setSnapshot);
    return () => {
      unsubscribe();
      controller.destroy();
    };
  }, [controller]);

  const begin = (): void => {
    if (started) controller.resume();
    else controller.start();
    setStarted(true);
  };

  const reset = (): void => {
    controller.dispatch({ type: 'reset-run' });
    setStarted(false);
  };

  const selectSpeed = (speed: Speed): void => {
    controller.setSpeed(speed);
    if (speed !== 0 && snapshot.status === 'running') setStarted(true);
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="eyebrow">Technical foundation · seeded island simulation</p>
        <h1>Untitled Island</h1>
        <p className="lede">
          Three survivors follow a fixed waypoint route while the deterministic simulation keeps
          advancing in 100 ms steps.
        </p>
      </header>

      <section className="game-layout" aria-label="Island simulation">
        <div className="map-card">
          <CanvasView controller={controller} snapshot={snapshot} />
          <p id="island-summary" className="map-summary">
            Fixed locations: {waypointSummary()}.
          </p>
        </div>

        <aside className="control-card" aria-label="Simulation controls">
          <div className="status-row">
            <span className="status-label">Simulation</span>
            <strong aria-live="polite">
              {started && snapshot.status === 'running' ? 'Running' : snapshot.status}
            </strong>
          </div>
          <p data-testid="time-status">
            Day {snapshot.clock.day}, step {snapshot.clock.tick.toLocaleString()} of{' '}
            {snapshot.config.rescueTick.toLocaleString()}
          </p>
          <div className="button-row">
            <button
              type="button"
              onClick={begin}
              disabled={started && snapshot.status === 'running'}
            >
              {started ? 'Resume' : 'Begin'}
            </button>
            <button type="button" className="secondary" onClick={reset}>
              New seed
            </button>
          </div>
          <fieldset>
            <legend>Simulation speed</legend>
            <div className="speed-grid">
              {SPEEDS.map((speed) => {
                const selected = controller.getSpeed() === speed;
                return (
                  <button
                    key={speed}
                    type="button"
                    className={selected ? 'speed selected' : 'speed'}
                    aria-pressed={selected}
                    onClick={() => selectSpeed(speed)}
                  >
                    {speedLabel(speed)}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <h2>Survivors</h2>
          <ul className="survivor-list">
            {snapshot.survivors.map((survivor) => (
              <li key={survivor.id}>
                <span className="survivor-dot" style={{ backgroundColor: survivor.color }} />
                <span>
                  <strong>{survivor.name}</strong>
                  <small>
                    {survivor.currentWaypoint} → {survivor.targetWaypoint}
                  </small>
                </span>
              </li>
            ))}
          </ul>
          <p className="assistive-note">
            The map is decorative; survivor names, locations, and routes are listed above for screen
            readers and keyboard users.
          </p>
        </aside>
      </section>
    </main>
  );
}
