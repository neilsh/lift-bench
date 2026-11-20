import { describe, expect, it } from 'vitest';
import type { Passenger } from '../../types/simulation';
import {
  classifyWaitSeverity,
  computeWaitHeatmapSample,
  formatWaitSeverityLabel,
  getFloorLongestWaitSec,
  WAIT_HEATMAP_CRITICAL_SEC,
  WAIT_HEATMAP_ELEVATED_SEC,
  WAIT_HEATMAP_MID_SEC,
} from '../waitHeatmap';

function makePassenger(id: number, spawnTime: number): Passenger {
  return {
    id,
    spawnTime,
    origin: 1,
    dest: 5,
    dir: 1,
    color: {
      fill: 'hsl(205, 85%, 56%)',
      stroke: 'hsl(205, 85%, 70%)',
      isLobby: false,
    },
    assignedCarId: null,
    boardTime: null,
    stopOverhead: 0,
  };
}

function parseRgba(rgba: string | null): [number, number, number, number] {
  if (!rgba) {
    throw new Error('Expected non-null RGBA color string');
  }
  const match = rgba.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  if (!match) {
    throw new Error(`Invalid RGBA string: ${rgba}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
}

describe('Wait-Time Heatmap Calculations', () => {
  it('returns idle sample with null fills when queue is empty', () => {
    const sample = computeWaitHeatmapSample([], 120);
    expect(sample).toEqual({
      longestWaitSec: 0,
      intensity: 0,
      severity: 'idle',
      fillStyle: null,
      edgeStyle: null,
    });
    expect(getFloorLongestWaitSec([], 120)).toBe(0);
    expect(classifyWaitSeverity(0, false)).toBe('idle');
    expect(formatWaitSeverityLabel('idle')).toBe('Idle');
  });

  it('uses strictly the longest waiting passenger in an unsorted queue and clamps negative ages', () => {
    const queue = [makePassenger(1, 95), makePassenger(2, 62), makePassenger(3, 88)];
    expect(getFloorLongestWaitSec(queue, 100)).toBe(38);
    expect(getFloorLongestWaitSec([makePassenger(4, 150)], 100)).toBe(0);
  });

  it('classifies severity tiers across CIBSE thresholds', () => {
    expect(classifyWaitSeverity(0, true)).toBe('nominal');
    expect(classifyWaitSeverity(WAIT_HEATMAP_ELEVATED_SEC - 0.1, true)).toBe('nominal');
    expect(classifyWaitSeverity(WAIT_HEATMAP_ELEVATED_SEC, true)).toBe('elevated');
    expect(classifyWaitSeverity(WAIT_HEATMAP_MID_SEC - 0.1, true)).toBe('elevated');
    expect(classifyWaitSeverity(WAIT_HEATMAP_MID_SEC, true)).toBe('critical');
    expect(formatWaitSeverityLabel('nominal')).toBe('Nominal');
    expect(formatWaitSeverityLabel('elevated')).toBe('Elevated');
    expect(formatWaitSeverityLabel('critical')).toBe('Critical');
  });

  it('interpolates from emerald to amber to crimson and clamps at critical ceiling', () => {
    const s0 = computeWaitHeatmapSample([makePassenger(1, 100)], 100);
    const s20 = computeWaitHeatmapSample([makePassenger(1, 80)], 100);
    const s35 = computeWaitHeatmapSample([makePassenger(1, 65)], 100);
    const s45 = computeWaitHeatmapSample([makePassenger(1, 55)], 100);
    const s120 = computeWaitHeatmapSample([makePassenger(1, -20)], 100);

    expect(s0.severity).toBe('nominal');
    expect(s20.severity).toBe('elevated');
    expect(s35.severity).toBe('critical');
    expect(s45.severity).toBe('critical');

    const [r0, g0, b0, a0] = parseRgba(s0.fillStyle);
    const [r20, g20, b20, a20] = parseRgba(s20.fillStyle);
    const [r35, g35, b35, a35] = parseRgba(s35.fillStyle);
    const [r45, g45, b45, a45] = parseRgba(s45.fillStyle);

    // Emerald stop at 0s -> 20s
    expect([r0, g0, b0]).toEqual([16, 185, 129]);
    expect([r20, g20, b20]).toEqual([16, 185, 129]);
    // Amber stop at 35s
    expect([r35, g35, b35]).toEqual([245, 158, 11]);
    // Crimson stop at 45s+
    expect([r45, g45, b45]).toEqual([225, 29, 72]);

    // Alpha increases monotonically with wait time
    expect(a0).toBeLessThan(a20);
    expect(a20).toBeLessThan(a35);
    expect(a35).toBeLessThan(a45);

    // Intensity and colors clamp cleanly beyond 45s
    expect(s45.intensity).toBe(1);
    expect(s120.intensity).toBe(1);
    expect(s120.longestWaitSec).toBe(120);
    expect(s120.fillStyle).toBe(s45.fillStyle);
    expect(s120.edgeStyle).toBe(s45.edgeStyle);
    expect(WAIT_HEATMAP_CRITICAL_SEC).toBe(45);
  });
});
