import type { GameSnapshot, SurvivorState, Waypoint } from '../game/types';
import { AUTHORED_WAYPOINTS, waypointPosition } from '../game/island';

const MAX_DEVICE_PIXEL_RATIO = 2;

function canvasSize(canvas: HTMLCanvasElement): { width: number; height: number } {
  const bounds = canvas.getBoundingClientRect();
  return {
    width: Math.max(1, bounds.width),
    height: Math.max(1, bounds.height),
  };
}

function mapPoint(
  point: { x: number; y: number },
  width: number,
  height: number,
): { x: number; y: number } {
  return { x: point.x * width, y: point.y * height };
}

function drawIsland(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.save();
  context.fillStyle = '#9ed7c4';
  context.beginPath();
  context.ellipse(width * 0.5, height * 0.52, width * 0.43, height * 0.37, -0.08, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = 'rgba(21, 70, 64, 0.48)';
  context.lineWidth = Math.max(2, width * 0.006);
  context.stroke();
  context.fillStyle = 'rgba(255, 255, 255, 0.24)';
  context.beginPath();
  context.ellipse(width * 0.49, height * 0.53, width * 0.38, height * 0.32, -0.08, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawWaypoint(
  context: CanvasRenderingContext2D,
  waypoint: Waypoint,
  width: number,
  height: number,
): void {
  const point = mapPoint(waypoint, width, height);
  context.save();
  context.fillStyle = waypoint.id === 'camp' ? '#e57c59' : '#376f69';
  context.beginPath();
  context.arc(point.x, point.y, Math.max(4, width * 0.012), 0, Math.PI * 2);
  context.fill();
  context.font = '600 ' + Math.max(10, width * 0.022) + 'px system-ui, sans-serif';
  context.textAlign = 'center';
  context.fillStyle = '#173c3a';
  context.fillText(waypoint.label, point.x, point.y - Math.max(8, width * 0.022));
  context.restore();
}

function drawSurvivor(
  context: CanvasRenderingContext2D,
  survivor: SurvivorState,
  width: number,
  height: number,
): void {
  const point = mapPoint(survivor.position, width, height);
  context.save();
  context.fillStyle = survivor.color;
  context.strokeStyle = '#173c3a';
  context.lineWidth = Math.max(1.5, width * 0.004);
  context.beginPath();
  context.arc(point.x, point.y, Math.max(7, width * 0.021), 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.font = '700 ' + Math.max(10, width * 0.024) + 'px system-ui, sans-serif';
  context.textAlign = 'center';
  context.fillStyle = '#173c3a';
  context.fillText(survivor.name, point.x, point.y + Math.max(18, width * 0.05));
  context.restore();
}

export function configureCanvas(canvas: HTMLCanvasElement): void {
  const { width, height } = canvasSize(canvas);
  const ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
  const pixelWidth = Math.round(width * ratio);
  const pixelHeight = Math.round(height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
}

/** Read-only Canvas 2D renderer for the authored M0 island and placeholders. */
export class CanvasRenderer {
  public constructor(private readonly canvas: HTMLCanvasElement) {}

  public render(snapshot: GameSnapshot): void {
    configureCanvas(this.canvas);
    const { width, height } = canvasSize(this.canvas);
    const ratio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    const context = this.canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#c7e5df';
    context.fillRect(0, 0, width, height);
    drawIsland(context, width, height);
    for (const authoredWaypoint of AUTHORED_WAYPOINTS) {
      drawWaypoint(context, authoredWaypoint, width, height);
    }
    for (const survivor of snapshot.survivors) {
      drawSurvivor(context, survivor, width, height);
    }
  }
}

export function waypointSummary(): string {
  return AUTHORED_WAYPOINTS.map((entry) => {
    const point = waypointPosition(entry.id);
    return (
      entry.label + ' (' + Math.round(point.x * 100) + '%, ' + Math.round(point.y * 100) + '%)'
    );
  }).join(', ');
}
