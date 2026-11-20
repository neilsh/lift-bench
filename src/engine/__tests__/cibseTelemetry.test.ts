import { describe, expect, it } from 'vitest';
import {
  ALGORITHM_ORDER,
  buildTelemetrySnapshot,
  computeCibseBenchmark,
  createSimulation,
  DEFAULT_CONFIG,
  FIXED_DT,
  stepTwinSimulation,
  toggleFireAlarmState,
} from '../elevatorSim';
import { buildDistributionBins, computeNiceAxisMax } from '../../utils/cibse';
import { serializeTelemetryCsv, serializeTelemetryJson } from '../../utils/telemetryExport';
import type { DispatchAlgorithm, DistributionMode, SimConfig } from '../../types/simulation';

function advanceSeconds(sim: ReturnType<typeof createSimulation>, cfg: SimConfig, seconds: number) {
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    stepTwinSimulation(sim, cfg, FIXED_DT);
  }
}

describe('CIBSE Guide D Engineering Telemetry, History & Export', () => {
  it('computes accurate Barney analytical up-peak benchmarks across default and extreme configs', () => {
    const benchmark = computeCibseBenchmark(DEFAULT_CONFIG);
    expect(benchmark.buildingPopulation).toBe(1300);
    expect(benchmark.designLoadP).toBeCloseTo(6.4, 5);
    expect(benchmark.expectedReversalFloor).toBeGreaterThan(11);
    expect(benchmark.expectedReversalFloor).toBeLessThan(14);
    expect(benchmark.expectedStopsS).toBeGreaterThan(4.5);
    expect(benchmark.expectedStopsS).toBeLessThan(6.0);
    expect(benchmark.theoreticalRTT).toBeGreaterThan(40);
    expect(benchmark.theoreticalRTT).toBeLessThan(50);
    expect(benchmark.theoreticalInterval).toBeGreaterThan(10);
    expect(benchmark.theoreticalInterval).toBeLessThan(13);
    expect(benchmark.theoreticalHC5Pct).toBeGreaterThan(11);
    expect(benchmark.theoreticalHC5Pct).toBeLessThan(15);

    const small = computeCibseBenchmark({
      ...DEFAULT_CONFIG,
      floors: 4,
      cars: 1,
      carCapacity: 4,
    });
    const large = computeCibseBenchmark({
      ...DEFAULT_CONFIG,
      floors: 40,
      cars: 8,
      carCapacity: 16,
    });

    for (const val of [
      small.theoreticalRTT,
      small.theoreticalInterval,
      small.theoreticalHC5Pct,
      large.theoreticalRTT,
      large.theoreticalInterval,
      large.theoreticalHC5Pct,
    ]) {
      expect(Number.isFinite(val)).toBe(true);
      expect(val).toBeGreaterThan(0);
    }
  });

  it.each(ALGORITHM_ORDER)(
    'records empirical RTT, H, S, HC5, and SLA metrics across steady-state runs (%s)',
    (algo: DispatchAlgorithm) => {
      const presets: DistributionMode[] = ['realistic', 'downpeak'];
      for (const preset of presets) {
        const cfg: SimConfig = {
          ...DEFAULT_CONFIG,
          distributionMode: preset,
          leftAlgorithm: algo,
          rightAlgorithm: algo,
          arrivalRate: 36,
        };
        const sim = createSimulation(cfg, 20261119, 140);
        const snap = buildTelemetrySnapshot(sim, cfg);

        expect(snap.left.avgRTT).toBeGreaterThan(0);
        expect(snap.left.avgReversalFloor).toBeGreaterThanOrEqual(2);
        expect(snap.left.avgStopsPerRoundTrip).toBeGreaterThanOrEqual(1);
        expect(snap.left.hc5Pax).toBeGreaterThan(0);
        expect(snap.left.hc5Pct).toBeGreaterThan(0);
        expect(snap.left.avgTransit).toBeGreaterThanOrEqual(0);
        expect(snap.left.avgTTD).toBeCloseTo(snap.left.avgWait + snap.left.avgTransit, 5);
        expect(snap.left.longWait60Pct).toBeLessThanOrEqual(snap.left.longWait30Pct + 1e-6);
        expect(snap.left.longWait30Pct).toBeLessThanOrEqual(100);
        expect(snap.left.avgRTT).toBeCloseTo(snap.right.avgRTT, 8);
      }
    }
  );

  it('caps telemetryHistory at 180 points with monotonic simTime and resets car cycles on fire alarm', () => {
    const sim = createSimulation(DEFAULT_CONFIG, 777, 210);
    const snap = buildTelemetrySnapshot(sim, DEFAULT_CONFIG);

    expect(snap.leftSeries).toHaveLength(180);
    expect(snap.rightSeries).toHaveLength(180);
    for (let i = 1; i < snap.leftSeries.length; i++) {
      expect(snap.leftSeries[i].simTime).toBeGreaterThan(snap.leftSeries[i - 1].simTime);
    }

    toggleFireAlarmState(sim, DEFAULT_CONFIG);
    advanceSeconds(sim, DEFAULT_CONFIG, 20);
    for (const car of sim.left.cars) {
      expect(car.cycleStartTime).toBeNull();
      expect(car.cyclePeakLoad).toBe(0);
    }
  });

  it('bins wait and TTD distributions accurately with monotonic CDF and clean nice axis scaling', () => {
    const bins = buildDistributionBins([2, 12, 22, 65], [4, 8, 19, 31], 5, 13);
    expect(bins).toHaveLength(13);
    expect(bins.reduce((acc, b) => acc + b.leftCount, 0)).toBe(4);
    expect(bins.reduce((acc, b) => acc + b.rightCount, 0)).toBe(4);
    expect(bins[0].leftCount).toBe(1);
    expect(bins[12].leftCount).toBe(1);
    expect(bins[12].leftCdfPct).toBeCloseTo(100, 5);
    expect(bins[12].rightCdfPct).toBeCloseTo(100, 5);
    for (let i = 1; i < bins.length; i++) {
      expect(bins[i].leftCdfPct).toBeGreaterThanOrEqual(bins[i - 1].leftCdfPct);
    }

    expect(computeNiceAxisMax(11, 10)).toBe(15);
    expect(computeNiceAxisMax(43, 10)).toBe(50);
  });

  it('serializes valid CSV rows and parseable JSON reports from TelemetrySnapshot', () => {
    const sim = createSimulation(DEFAULT_CONFIG, 4242, 90);
    const snap = buildTelemetrySnapshot(sim, DEFAULT_CONFIG);

    const csv = serializeTelemetryCsv(snap);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toContain('sim_time_sec,clock,left_queue,right_queue');
    expect(lines.length).toBe(snap.leftSeries.length + 1);

    const jsonText = serializeTelemetryJson(snap, DEFAULT_CONFIG);
    const parsed = JSON.parse(jsonText);
    expect(parsed.config).toEqual(DEFAULT_CONFIG);
    expect(parsed.cibseBenchmark.buildingPopulation).toBe(1300);
    expect(parsed.history.left).toHaveLength(snap.leftSeries.length);
  });
});
