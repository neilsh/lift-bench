import type { Passenger, WaitHeatmapSample, WaitHeatmapSeverity } from '../types/simulation';

export const WAIT_HEATMAP_ELEVATED_SEC = 20;
export const WAIT_HEATMAP_MID_SEC = 35;
export const WAIT_HEATMAP_CRITICAL_SEC = 45;

interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const EMERALD_RGB: RgbColor = { r: 16, g: 185, b: 129 };
const AMBER_RGB: RgbColor = { r: 245, g: 158, b: 11 };
const CRIMSON_RGB: RgbColor = { r: 225, g: 29, b: 72 };

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function lerpNumber(start: number, end: number, t: number): number {
  return start + (end - start) * clampUnit(t);
}

function lerpRgb(from: RgbColor, to: RgbColor, t: number): RgbColor {
  const ratio = clampUnit(t);
  return {
    r: Math.round(lerpNumber(from.r, to.r, ratio)),
    g: Math.round(lerpNumber(from.g, to.g, ratio)),
    b: Math.round(lerpNumber(from.b, to.b, ratio)),
  };
}

function formatRgba(rgb: RgbColor, alpha: number): string {
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha.toFixed(3)})`;
}

export function getFloorLongestWaitSec(queue: readonly Passenger[], simTime: number): number {
  let longest = 0;
  for (let i = 0; i < queue.length; i++) {
    const wait = Math.max(0, simTime - queue[i].spawnTime);
    if (wait > longest) {
      longest = wait;
    }
  }
  return longest;
}

export function classifyWaitSeverity(
  longestWaitSec: number,
  hasWaitingPassengers: boolean
): WaitHeatmapSeverity {
  if (!hasWaitingPassengers) return 'idle';
  if (longestWaitSec < WAIT_HEATMAP_ELEVATED_SEC) return 'nominal';
  if (longestWaitSec < WAIT_HEATMAP_MID_SEC) return 'elevated';
  return 'critical';
}

export function formatWaitSeverityLabel(severity: WaitHeatmapSeverity): string {
  switch (severity) {
    case 'idle':
      return 'Idle';
    case 'nominal':
      return 'Nominal';
    case 'elevated':
      return 'Elevated';
    case 'critical':
      return 'Critical';
  }
}

export function computeWaitHeatmapSample(
  queue: readonly Passenger[],
  simTime: number
): WaitHeatmapSample {
  if (queue.length === 0) {
    return {
      longestWaitSec: 0,
      intensity: 0,
      severity: 'idle',
      fillStyle: null,
      edgeStyle: null,
    };
  }

  const longestWaitSec = getFloorLongestWaitSec(queue, simTime);
  const intensity = clampUnit(longestWaitSec / WAIT_HEATMAP_CRITICAL_SEC);
  const severity = classifyWaitSeverity(longestWaitSec, true);

  let rgb: RgbColor;
  let fillAlpha: number;
  let edgeAlpha: number;

  if (longestWaitSec <= WAIT_HEATMAP_ELEVATED_SEC) {
    const t = longestWaitSec / WAIT_HEATMAP_ELEVATED_SEC;
    rgb = EMERALD_RGB;
    fillAlpha = lerpNumber(0.11, 0.21, t);
    edgeAlpha = lerpNumber(0.45, 0.65, t);
  } else if (longestWaitSec <= WAIT_HEATMAP_MID_SEC) {
    const t =
      (longestWaitSec - WAIT_HEATMAP_ELEVATED_SEC) /
      (WAIT_HEATMAP_MID_SEC - WAIT_HEATMAP_ELEVATED_SEC);
    rgb = lerpRgb(EMERALD_RGB, AMBER_RGB, t);
    fillAlpha = lerpNumber(0.21, 0.3, t);
    edgeAlpha = lerpNumber(0.65, 0.8, t);
  } else {
    const t =
      (longestWaitSec - WAIT_HEATMAP_MID_SEC) / (WAIT_HEATMAP_CRITICAL_SEC - WAIT_HEATMAP_MID_SEC);
    rgb = lerpRgb(AMBER_RGB, CRIMSON_RGB, t);
    fillAlpha = lerpNumber(0.3, 0.4, t);
    edgeAlpha = lerpNumber(0.8, 0.95, t);
  }

  return {
    longestWaitSec,
    intensity,
    severity,
    fillStyle: formatRgba(rgb, fillAlpha),
    edgeStyle: formatRgba(rgb, edgeAlpha),
  };
}
