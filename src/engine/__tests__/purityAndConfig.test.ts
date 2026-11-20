import { describe, expect, it } from 'vitest';
import {
  ALGORITHM_ORDER,
  assertNever,
  buildTelemetrySnapshot,
  CONFIG_LIMITS,
  createSimulation,
  DEFAULT_CONFIG,
  DISPATCH_STRATEGIES,
  FIXED_DT,
  isDispatchAlgorithm,
  isDistributionMode,
  PRESET_ORDER,
  sanitizeSimConfig,
  spawnBurstPassengers,
  stepTwinSimulation,
} from '../elevatorSim';
import type { DispatchAlgorithm, DistributionMode } from '../../types/simulation';

describe('Engine Purity, Strategy Registry & Config Sanitization', () => {
  it('registers a complete Strategy object for every algorithm in ALGORITHM_ORDER', () => {
    for (const algo of ALGORITHM_ORDER) {
      const strategy = DISPATCH_STRATEGIES[algo];
      expect(strategy).toBeDefined();
      expect(strategy.id).toBe(algo);
      expect(typeof strategy.assignPassenger).toBe('function');
      expect(typeof strategy.stepWorld).toBe('function');
    }
  });

  it('validates dispatch algorithms, distribution presets, and assertNever exhaustiveness', () => {
    for (const algo of ALGORITHM_ORDER) {
      expect(isDispatchAlgorithm(algo)).toBe(true);
    }
    expect(isDispatchAlgorithm('unknown_algo')).toBe(false);

    for (const mode of PRESET_ORDER) {
      expect(isDistributionMode(mode)).toBe(true);
    }
    expect(isDistributionMode('weekend')).toBe(false);

    expect(() => assertNever('bogus' as never, 'Invalid state')).toThrowError(
      'Invalid state: bogus'
    );
  });

  it('clamps, rounds, and falls back safely in sanitizeSimConfig', () => {
    const sanitized = sanitizeSimConfig({
      arrivalRate: 999,
      floors: 2.7,
      cars: 0,
      stopPenalty: 5.24,
      carCapacity: Number.NaN,
      distributionMode: 'invalid' as DistributionMode,
      leftAlgorithm: 'invalid' as DispatchAlgorithm,
      rightAlgorithm: 'eco',
    });

    expect(sanitized.arrivalRate).toBe(CONFIG_LIMITS.arrivalRate.max);
    expect(sanitized.floors).toBe(CONFIG_LIMITS.floors.min);
    expect(sanitized.cars).toBe(1);
    expect(sanitized.stopPenalty).toBe(5.0);
    expect(sanitized.carCapacity).toBe(DEFAULT_CONFIG.carCapacity);
    expect(sanitized.distributionMode).toBe(DEFAULT_CONFIG.distributionMode);
    expect(sanitized.leftAlgorithm).toBe(DEFAULT_CONFIG.leftAlgorithm);
    expect(sanitized.rightAlgorithm).toBe('eco');
  });

  it('builds telemetry snapshots purely without mutating SimState arrays', () => {
    const sim = createSimulation(DEFAULT_CONFIG, 4242, 160);
    spawnBurstPassengers(sim, DEFAULT_CONFIG, 6, 3);

    const completionLenBefore = sim.left.completionTimes.length;
    const ripplesLenBefore = sim.floorRipples.length;
    const effectsLenBefore = sim.left.deliveryEffects.length;
    const simTimeBefore = sim.simTime;

    const snapA = buildTelemetrySnapshot(sim, DEFAULT_CONFIG);
    const snapB = buildTelemetrySnapshot(sim, DEFAULT_CONFIG);

    expect(snapA).toEqual(snapB);
    expect(sim.left.completionTimes.length).toBe(completionLenBefore);
    expect(sim.floorRipples.length).toBe(ripplesLenBefore);
    expect(sim.left.deliveryEffects.length).toBe(effectsLenBefore);
    expect(sim.simTime).toBe(simTimeBefore);
  });

  it('expires floor ripples and delivery effects deterministically via simTime', () => {
    const sim = createSimulation(DEFAULT_CONFIG, 1337, 0);
    spawnBurstPassengers(sim, DEFAULT_CONFIG, 4, 2);
    expect(sim.floorRipples).toHaveLength(1);
    expect(sim.floorRipples[0].bornSimTime).toBe(0);

    const steps = Math.ceil(2.0 / FIXED_DT);
    for (let i = 0; i < steps; i++) {
      stepTwinSimulation(sim, DEFAULT_CONFIG, FIXED_DT);
    }

    expect(sim.floorRipples).toHaveLength(0);
  });
});
