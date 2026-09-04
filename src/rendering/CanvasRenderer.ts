import type { DayPhase, GameSnapshot, SurvivorState, Waypoint, WaypointId } from '../game/types';
import { AUTHORED_ROUTES, AUTHORED_WAYPOINTS, waypoint, waypointPosition } from '../game/island';
import { deriveTime } from '../game/simulation';

const MAX_DEVICE_PIXEL_RATIO = 2;
const MAP_PADDING = 0.035;

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
  return {
    x: MAP_PADDING * width + point.x * width * (1 - MAP_PADDING * 2),
    y: MAP_PADDING * height + point.y * height * (1 - MAP_PADDING * 2),
  };
}

function drawOcean(context: CanvasRenderingContext2D, width: number, height: number): void {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#163f58');
  gradient.addColorStop(0.48, '#28758a');
  gradient.addColorStop(1, '#164e6a');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.save();
  context.globalAlpha = 0.15;
  context.strokeStyle = '#c6f1eb';
  context.lineWidth = Math.max(1, width * 0.002);
  for (let row = 0; row < 7; row += 1) {
    const y = height * (0.1 + row * 0.14);
    context.beginPath();
    for (let x = -width * 0.05; x <= width * 1.05; x += width * 0.08) {
      const waveY = y + Math.sin((x / width) * Math.PI * 2 + row) * height * 0.008;
      if (x === -width * 0.05) context.moveTo(x, waveY);
      else context.lineTo(x, waveY);
    }
    context.stroke();
  }
  context.restore();
}

function drawIslandTerrain(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  variant: number,
): void {
  const center = { x: width * 0.5, y: height * 0.51 };
  const shoreColor = ['#e8c982', '#dcb875', '#efcf91', '#d7c487'][variant % 4] ?? '#e8c982';
  const groundColor = ['#5eaa79', '#66a96e', '#6eae75', '#5ca184'][variant % 4] ?? '#5eaa79';

  context.save();
  context.fillStyle = 'rgba(7, 37, 54, 0.3)';
  context.beginPath();
  context.ellipse(
    center.x,
    center.y + height * 0.018,
    width * 0.43,
    height * 0.36,
    -0.08,
    0,
    Math.PI * 2,
  );
  context.fill();

  context.fillStyle = shoreColor;
  context.beginPath();
  context.ellipse(center.x, center.y, width * 0.43, height * 0.37, -0.08, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = groundColor;
  context.beginPath();
  context.ellipse(center.x, center.y, width * 0.405, height * 0.345, -0.08, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = 'rgba(20, 62, 59, 0.72)';
  context.lineWidth = Math.max(2, width * 0.006);
  context.stroke();
  context.restore();
}

function drawRoutePaths(context: CanvasRenderingContext2D, width: number, height: number): void {
  const drawnRoutes = new Set<string>();
  context.save();
  context.strokeStyle = 'rgba(250, 239, 190, 0.78)';
  context.lineWidth = Math.max(2, width * 0.006);
  context.setLineDash([Math.max(4, width * 0.014), Math.max(3, width * 0.01)]);
  for (const [fromId, destinations] of Object.entries(AUTHORED_ROUTES) as [
    WaypointId,
    readonly WaypointId[],
  ][]) {
    for (const toId of destinations) {
      const key = [fromId, toId].sort().join(':');
      if (drawnRoutes.has(key)) continue;
      drawnRoutes.add(key);
      const start = mapPoint(waypointPosition(fromId), width, height);
      const end = mapPoint(waypointPosition(toId), width, height);
      const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.quadraticCurveTo(
        midpoint.x + (toId.charCodeAt(0) - fromId.charCodeAt(0)) * width * 0.004,
        midpoint.y + (fromId.charCodeAt(0) - toId.charCodeAt(0)) * height * 0.004,
        end.x,
        end.y,
      );
      context.stroke();
    }
  }
  context.setLineDash([]);
  context.restore();
}

function drawVegetation(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  variant: number,
): void {
  const accent = ['#2f7355', '#3b7150', '#326d59', '#417a52'][variant % 4] ?? '#2f7355';
  const placements = [
    [0.71, 0.68],
    [0.75, 0.72],
    [0.68, 0.71],
    [0.36, 0.31],
    [0.41, 0.29],
    [0.83, 0.35],
  ] as const;
  context.save();
  context.fillStyle = accent;
  for (const [x, y] of placements) {
    const point = mapPoint({ x, y }, width, height);
    const size = Math.max(7, width * 0.02);
    context.beginPath();
    context.moveTo(point.x, point.y - size);
    context.lineTo(point.x - size * 0.66, point.y + size * 0.66);
    context.lineTo(point.x + size * 0.66, point.y + size * 0.66);
    context.closePath();
    context.fill();
    context.fillRect(point.x - size * 0.1, point.y + size * 0.45, size * 0.2, size * 0.55);
  }
  if (variant % 2 === 1) {
    context.fillStyle = '#b56b50';
    for (const [x, y] of [
      [0.3, 0.42],
      [0.58, 0.61],
      [0.61, 0.33],
    ] as const) {
      const point = mapPoint({ x, y }, width, height);
      context.beginPath();
      context.arc(point.x, point.y, Math.max(3, width * 0.009), 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}

function drawLocationSymbol(
  context: CanvasRenderingContext2D,
  waypointValue: Waypoint,
  width: number,
  height: number,
): void {
  const point = mapPoint(waypointValue, width, height);
  const size = Math.max(7, width * 0.023);
  context.save();
  context.lineWidth = Math.max(1.5, width * 0.004);
  context.strokeStyle = '#153d43';
  context.fillStyle = waypointValue.id === 'camp' ? '#e27f58' : '#f4e7bd';
  context.beginPath();
  if (waypointValue.id === 'camp') {
    context.moveTo(point.x - size, point.y + size * 0.5);
    context.lineTo(point.x, point.y - size * 0.75);
    context.lineTo(point.x + size, point.y + size * 0.5);
    context.closePath();
    context.fill();
    context.stroke();
    context.fillStyle = '#153d43';
    context.fillRect(point.x - size * 0.13, point.y - size * 0.05, size * 0.26, size * 0.55);
  } else if (waypointValue.id === 'water') {
    context.moveTo(point.x, point.y - size);
    context.bezierCurveTo(
      point.x + size * 0.75,
      point.y - size * 0.1,
      point.x + size * 0.6,
      point.y + size,
      point.x,
      point.y + size,
    );
    context.bezierCurveTo(
      point.x - size * 0.6,
      point.y + size,
      point.x - size * 0.75,
      point.y - size * 0.1,
      point.x,
      point.y - size,
    );
    context.closePath();
    context.fill();
    context.stroke();
  } else if (waypointValue.id === 'forest') {
    context.moveTo(point.x, point.y - size);
    context.lineTo(point.x - size * 0.78, point.y + size * 0.7);
    context.lineTo(point.x + size * 0.78, point.y + size * 0.7);
    context.closePath();
    context.fill();
    context.stroke();
  } else if (waypointValue.id === 'wreckage') {
    context.rect(point.x - size * 0.8, point.y - size * 0.55, size * 1.6, size * 1.1);
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(point.x - size * 0.7, point.y - size * 0.4);
    context.lineTo(point.x + size * 0.7, point.y + size * 0.4);
    context.moveTo(point.x + size * 0.7, point.y - size * 0.4);
    context.lineTo(point.x - size * 0.7, point.y + size * 0.4);
    context.stroke();
  } else if (waypointValue.id === 'forage') {
    context.ellipse(point.x, point.y, size * 0.72, size * 0.4, -0.4, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(point.x - size * 0.6, point.y + size * 0.6);
    context.lineTo(point.x + size * 0.55, point.y - size * 0.6);
    context.stroke();
  } else {
    context.moveTo(point.x, point.y - size);
    context.lineTo(point.x + size, point.y + size * 0.7);
    context.lineTo(point.x - size, point.y + size * 0.7);
    context.closePath();
    context.fill();
    context.stroke();
  }
  context.font = `700 ${Math.max(10, width * 0.021)}px system-ui, sans-serif`;
  context.textAlign = 'center';
  context.fillStyle = '#102f39';
  context.fillText(waypointValue.label, point.x, point.y - size * 1.25);
  context.restore();
}

function drawPhaseLighting(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  phase: DayPhase,
): void {
  if (phase === 'daylight' || phase === 'dawn') {
    context.save();
    context.globalAlpha = phase === 'dawn' ? 0.14 : 0.07;
    context.fillStyle = phase === 'dawn' ? '#f6ae69' : '#ffe7a1';
    context.fillRect(0, 0, width, height);
    context.restore();
    return;
  }
  context.save();
  context.globalAlpha = phase === 'dusk' ? 0.18 : 0.37;
  context.fillStyle = '#10274d';
  context.fillRect(0, 0, width, height);
  context.globalAlpha = phase === 'night' ? 0.8 : 0.42;
  context.fillStyle = '#f5dc8a';
  for (const [x, y] of [
    [0.08, 0.16],
    [0.18, 0.11],
    [0.87, 0.18],
    [0.93, 0.32],
    [0.12, 0.8],
  ] as const) {
    context.beginPath();
    context.arc(width * x, height * y, Math.max(1.2, width * 0.003), 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawSurvivor(
  context: CanvasRenderingContext2D,
  survivor: SurvivorState,
  width: number,
  height: number,
  phase: DayPhase,
): void {
  const point = mapPoint(survivor.position, width, height);
  const radius = Math.max(8, width * 0.022);
  const variant = survivor.visualVariant % 3;
  const isMoving =
    survivor.activeTask?.phase === 'travel' || survivor.currentWaypoint !== survivor.targetWaypoint;
  const isCritical = !survivor.alive || survivor.needs.health <= 25 || survivor.needs.thirst >= 85;
  context.save();
  if (isCritical) {
    context.strokeStyle = '#f4c15d';
    context.lineWidth = Math.max(2, width * 0.007);
    context.beginPath();
    context.arc(point.x, point.y, radius * 1.55, 0, Math.PI * 2);
    context.stroke();
  }
  context.fillStyle = survivor.alive ? survivor.color : '#5d696d';
  context.strokeStyle = '#102f39';
  context.lineWidth = Math.max(1.5, width * 0.004);
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillStyle = '#f9e4be';
  if (variant === 0)
    context.fillRect(point.x - radius * 0.46, point.y - radius * 0.3, radius * 0.92, radius * 0.28);
  else if (variant === 1) {
    context.beginPath();
    context.arc(point.x, point.y - radius * 0.35, radius * 0.45, Math.PI, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    context.moveTo(point.x - radius * 0.55, point.y - radius * 0.25);
    context.lineTo(point.x, point.y - radius * 0.72);
    context.lineTo(point.x + radius * 0.55, point.y - radius * 0.25);
    context.closePath();
    context.fill();
  }

  context.font = `900 ${Math.max(10, width * 0.023)}px system-ui, sans-serif`;
  context.textAlign = 'center';
  context.fillStyle = '#102f39';
  context.fillText(survivor.name.slice(0, 1), point.x, point.y + radius * 0.38);
  context.font = `700 ${Math.max(9, width * 0.018)}px system-ui, sans-serif`;
  context.fillText(survivor.name, point.x, point.y + radius * 2.35);

  const marker = !survivor.alive
    ? '×'
    : survivor.injury
      ? '!'
      : isMoving
        ? '→'
        : survivor.activeTask
          ? '•'
          : '✓';
  context.fillStyle = survivor.injury || isCritical ? '#9f422d' : '#f5e3a4';
  context.strokeStyle = '#102f39';
  context.lineWidth = Math.max(1, width * 0.002);
  context.beginPath();
  context.arc(point.x + radius * 1.05, point.y - radius * 0.92, radius * 0.48, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = '#102f39';
  context.font = `900 ${Math.max(9, width * 0.018)}px system-ui, sans-serif`;
  context.fillText(marker, point.x + radius * 1.05, point.y - radius * 0.74);
  if (phase === 'night' && survivor.alive) {
    context.fillStyle = '#f5dc8a';
    context.beginPath();
    context.arc(
      point.x - radius * 0.95,
      point.y - radius * 0.95,
      Math.max(1.5, width * 0.004),
      0,
      Math.PI * 2,
    );
    context.fill();
  }
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

/** Read-only renderer for the fixed authored island, seeded cosmetics, and live survivor activity. */
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
    const time = deriveTime(snapshot);
    drawOcean(context, width, height);
    drawIslandTerrain(context, width, height, snapshot.island.cosmeticVariant);
    drawRoutePaths(context, width, height);
    drawVegetation(context, width, height, snapshot.island.cosmeticVariant);
    for (const authoredWaypoint of AUTHORED_WAYPOINTS) {
      drawLocationSymbol(context, authoredWaypoint, width, height);
    }
    for (const survivor of snapshot.survivors) {
      drawSurvivor(context, survivor, width, height, time.phase);
    }
    drawPhaseLighting(context, width, height, time.phase);
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

export function cosmeticVariantLabel(variant: number): string {
  return (
    ['Palm shade', 'Red-earth ridge', 'Bright shallows', 'Wind-carved shore'][variant % 4] ??
    'Palm shade'
  );
}

export function waypointLabel(id: WaypointId): string {
  return waypoint(id).label;
}
