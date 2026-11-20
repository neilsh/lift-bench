import { describe, expect, it } from 'vitest';
import {
  ALGORITHM_META,
  ALGORITHM_ORDER,
  buildTelemetrySnapshot,
  computeSectorBands,
  countTotalWaiting,
  createSimulation,
  DEFAULT_CONFIG,
  FIXED_DT,
  spawnBurstPassengers,
  stepTwinSimulation,
  toggleFireAlarmState,
} from '../elevatorSim';
import type { DispatchAlgorithm, DistributionMode, SimConfig } from '../../types/simulation';

function makeConfig(overrides: Partial<SimConfig> = {}): SimConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
  };
}

function advanceSeconds(
  sim: ReturnType<typeof createSimulation>,
  cfg: SimConfig,
  seconds: number,
  onStep?: () => void
) {
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    stepTwinSimulation(sim, cfg, FIXED_DT);
    if (onStep) onStep();
  }
}

describe('Elevator Dispatch Algorithms', () => {
  it('registers metadata for every dispatch algorithm', () => {
    expect(ALGORITHM_ORDER).toHaveLength(6);
    for (const algo of ALGORITHM_ORDER) {
      expect(ALGORITHM_META[algo]).toBeDefined();
      expect(ALGORITHM_META[algo].id).toBe(algo);
      expect(ALGORITHM_META[algo].name.length).toBeGreaterThan(2);
      expect(ALGORITHM_META[algo].shortName.length).toBeGreaterThan(1);
      expect(ALGORITHM_META[algo].description.length).toBeGreaterThan(10);
    }
  });

  describe('Determinism & Twin Symmetry', () => {
    it.each(ALGORITHM_ORDER)(
      'produces bit-for-bit identical results on both towers for %s with the same seed',
      (algo: DispatchAlgorithm) => {
        const cfg = makeConfig({
          leftAlgorithm: algo,
          rightAlgorithm: algo,
          arrivalRate: 40,
          floors: 14,
          cars: 4,
        });

        const simA = createSimulation(cfg, 123456, 90);
        const simB = createSimulation(cfg, 123456, 90);

        const snapA = buildTelemetrySnapshot(simA, cfg);
        const snapB = buildTelemetrySnapshot(simB, cfg);

        // Twin towers running identical algorithms must match identically
        expect(snapA.left.served).toBe(snapA.right.served);
        expect(snapA.left.avgTTD).toBeCloseTo(snapA.right.avgTTD, 8);
        expect(snapA.left.totalStops).toBe(snapA.right.totalStops);
        expect(snapA.left.waitingCount).toBe(snapA.right.waitingCount);

        // Separate runs with same seed must also match identically
        expect(snapA.left.served).toBe(snapB.left.served);
        expect(snapA.left.avgTTD).toBeCloseTo(snapB.left.avgTTD, 8);
        expect(snapA.left.whPerPax).toBeCloseTo(snapB.left.whPerPax, 8);
      }
    );
  });

  describe('Physical Invariants & Traffic Preset Coverage', () => {
    const presets: DistributionMode[] = ['realistic', 'lunch', 'downpeak', 'vip', 'uniform'];

    it.each(ALGORITHM_ORDER)(
      'maintains floor bounds, capacity limits, and delivers passengers across all traffic presets (%s)',
      (algo: DispatchAlgorithm) => {
        for (const preset of presets) {
          const cfg = makeConfig({
            leftAlgorithm: algo,
            rightAlgorithm: algo,
            distributionMode: preset,
            arrivalRate: 36,
            floors: 12,
            cars: 4,
            carCapacity: 6,
          });

          const sim = createSimulation(cfg, 9001, 0);
          advanceSeconds(sim, cfg, 110, () => {
            for (const car of sim.left.cars) {
              expect(car.floor).toBeGreaterThanOrEqual(1 - 1e-6);
              expect(car.floor).toBeLessThanOrEqual(cfg.floors + 1e-6);
              expect(car.passengers.length).toBeLessThanOrEqual(cfg.carCapacity);
            }
          });

          const snap = buildTelemetrySnapshot(sim, cfg);
          expect(snap.left.served).toBeGreaterThan(10);
          expect(snap.left.throughput).toBeGreaterThan(5);
          expect(Number.isFinite(snap.left.avgTTD)).toBe(true);
          expect(Number.isFinite(snap.left.p95TTD)).toBe(true);
          expect(Number.isFinite(snap.left.whPerPax)).toBe(true);
          expect(snap.left.avgTTD).toBeGreaterThan(0);
        }
      }
    );

    it.each(ALGORITHM_ORDER)(
      'drains a large passenger burst cleanly to zero with no lost or stranded riders (%s)',
      (algo: DispatchAlgorithm) => {
        const cfg = makeConfig({
          leftAlgorithm: algo,
          rightAlgorithm: algo,
          arrivalRate: 10,
          floors: 12,
          cars: 4,
          carCapacity: 5,
        });

        const sim = createSimulation(cfg, 424242, 0);
        // Disable background arrivals after spawning an explicit burst
        sim.nextSpawnTime = Number.POSITIVE_INFINITY;
        spawnBurstPassengers(sim, cfg, 16, 1);
        spawnBurstPassengers(sim, cfg, 8, 9);

        expect(countTotalWaiting(sim.left)).toBe(24);

        advanceSeconds(sim, cfg, 240, () => {
          for (const car of sim.left.cars) {
            expect(car.passengers.length).toBeLessThanOrEqual(cfg.carCapacity);
          }
        });

        const remainingOnboard = sim.left.cars.reduce((acc, c) => acc + c.passengers.length, 0);
        expect(countTotalWaiting(sim.left)).toBe(0);
        expect(remainingOnboard).toBe(0);
        expect(sim.left.completed.count).toBe(24);
      }
    );

    it.each(ALGORITHM_ORDER)(
      'handles extreme building sizes (8fl/2cars and 24fl/5cars) safely (%s)',
      (algo: DispatchAlgorithm) => {
        const smallCfg = makeConfig({
          leftAlgorithm: algo,
          rightAlgorithm: algo,
          floors: 8,
          cars: 2,
          carCapacity: 4,
          arrivalRate: 24,
        });
        const largeCfg = makeConfig({
          leftAlgorithm: algo,
          rightAlgorithm: algo,
          floors: 24,
          cars: 5,
          carCapacity: 16,
          arrivalRate: 60,
        });

        const smallSim = createSimulation(smallCfg, 77, 90);
        const largeSim = createSimulation(largeCfg, 77, 90);

        expect(smallSim.left.completed.count).toBeGreaterThan(5);
        expect(largeSim.left.completed.count).toBeGreaterThan(15);
      }
    );
  });

  describe('Algorithm-Specific Behaviors & Comparisons', () => {
    it('Static Zoning (sector) partitions upper floors into contiguous non-overlapping bands and routes lobby riders to their sector car', () => {
      const bands = computeSectorBands(14, 4);
      expect(bands).toEqual([
        { min: 2, max: 4 },
        { min: 5, max: 7 },
        { min: 8, max: 10 },
        { min: 11, max: 14 },
      ]);

      // Verify contiguous non-overlapping coverage [2..floors] across multiple building sizes
      for (const [floors, cars] of [
        [8, 2],
        [14, 3],
        [18, 4],
        [24, 5],
      ] as const) {
        const b = computeSectorBands(floors, cars);
        expect(b).toHaveLength(cars);
        expect(b[0].min).toBe(2);
        expect(b[b.length - 1].max).toBe(floors);
        for (let i = 1; i < b.length; i++) {
          expect(b[i].min).toBe(b[i - 1].max + 1);
        }
      }

      const cfg = makeConfig({
        leftAlgorithm: 'sector',
        rightAlgorithm: 'sector',
        floors: 14,
        cars: 4,
      });
      const sim = createSimulation(cfg, 101, 0);
      sim.nextSpawnTime = Number.POSITIVE_INFINITY;
      spawnBurstPassengers(sim, cfg, 20, 1);

      for (const pax of sim.left.waitingQueues[1]) {
        expect(pax.assignedCarId).not.toBeNull();
        const car = sim.left.cars[pax.assignedCarId!];
        expect(pax.dest).toBeGreaterThanOrEqual(car.sectorMin!);
        expect(pax.dest).toBeLessThanOrEqual(car.sectorMax!);
      }
    });

    it('Destination Dispatch outperforms Standard Collective SCAN in stops/trip and ATTD under heavy up-peak traffic', () => {
      const cfg = makeConfig({
        leftAlgorithm: 'standard',
        rightAlgorithm: 'destination',
        distributionMode: 'uniform',
        arrivalRate: 54,
        floors: 16,
        cars: 4,
        stopPenalty: 6.0,
        carCapacity: 8,
      });

      const sim = createSimulation(cfg, 20261118, 220);
      const snap = buildTelemetrySnapshot(sim, cfg);

      expect(snap.right.stopsPerTrip).toBeLessThan(snap.left.stopsPerTrip);
      expect(snap.right.avgTTD).toBeLessThan(snap.left.avgTTD);
    });

    it('Nearest Car (ETA) assigns every waiting passenger to a valid healthy car and delivers smoothly under mixed lunch traffic', () => {
      const cfg = makeConfig({
        leftAlgorithm: 'nearest',
        rightAlgorithm: 'standard',
        distributionMode: 'lunch',
        arrivalRate: 38,
        floors: 14,
        cars: 4,
      });

      const sim = createSimulation(cfg, 5150, 0);
      sim.nextSpawnTime = Number.POSITIVE_INFINITY;
      spawnBurstPassengers(sim, cfg, 10, 1);
      spawnBurstPassengers(sim, cfg, 10, 8);

      for (let f = 1; f <= cfg.floors; f++) {
        for (const p of sim.left.waitingQueues[f]) {
          expect(p.assignedCarId).not.toBeNull();
          expect(p.assignedCarId!).toBeGreaterThanOrEqual(0);
          expect(p.assignedCarId!).toBeLessThan(cfg.cars);
        }
      }

      advanceSeconds(sim, cfg, 180);
      expect(sim.left.completed.count).toBe(20);
    });

    it('Eco Batching uses less shaft mileage and estimated Wh/pax than FIFO Baseline under moderate traffic', () => {
      const cfg = makeConfig({
        leftAlgorithm: 'fcfs',
        rightAlgorithm: 'eco',
        distributionMode: 'realistic',
        arrivalRate: 30,
        floors: 14,
        cars: 4,
        stopPenalty: 5.0,
        carCapacity: 8,
      });

      const sim = createSimulation(cfg, 31415, 220);
      const snap = buildTelemetrySnapshot(sim, cfg);

      expect(snap.right.whPerPax).toBeLessThan(snap.left.whPerPax);
      expect(snap.right.floorsPerPax).toBeLessThan(snap.left.floorsPerPax);
      expect(snap.right.served).toBeGreaterThan(40);
    });

    it('FIFO Baseline delivers the earliest passenger request without detouring for later intermediate hall calls', () => {
      const cfg = makeConfig({
        leftAlgorithm: 'fcfs',
        rightAlgorithm: 'fcfs',
        floors: 12,
        cars: 1,
        carCapacity: 4,
        stopPenalty: 2.0,
      });

      const sim = createSimulation(cfg, 99, 0);
      sim.nextSpawnTime = Number.POSITIVE_INFINITY;

      // Spawn a passenger at Floor 1 going to Floor 12
      sim.left.waitingQueues[1].push({
        id: 1,
        spawnTime: 0,
        origin: 1,
        dest: 12,
        dir: 1,
        color: { fill: '#f43f5e', stroke: '#fff', isLobby: false },
        assignedCarId: null,
        boardTime: null,
        stopOverhead: 0,
      });

      // Spawn a later passenger on intermediate Floor 5 going to Floor 10
      sim.left.waitingQueues[5].push({
        id: 2,
        spawnTime: 1,
        origin: 5,
        dest: 10,
        dir: 1,
        color: { fill: '#38bdf8', stroke: '#fff', isLobby: false },
        assignedCarId: null,
        boardTime: null,
        stopOverhead: 0,
      });

      // Advance until passenger 1 is delivered
      let deliveredFirst = false;
      advanceSeconds(sim, cfg, 30, () => {
        if (sim.left.completed.count === 1 && !deliveredFirst) {
          deliveredFirst = true;
          // Intermediate floor 5 passenger must still be waiting while car delivered passenger 1 straight to 12
          expect(sim.left.waitingQueues[5].length).toBe(1);
        }
      });

      expect(deliveredFirst).toBe(true);
      // Eventually passenger 2 is also picked up and delivered
      advanceSeconds(sim, cfg, 40);
      expect(sim.left.completed.count).toBe(2);
    });
  });

  describe('Phase I Fire Alarm Recall & Recovery', () => {
    it.each(ALGORITHM_ORDER)(
      'recalls all cars to Floor 1, locks them out, evacuates riders, and resumes cleanly after clearing alarm (%s)',
      (algo: DispatchAlgorithm) => {
        const cfg = makeConfig({
          leftAlgorithm: algo,
          rightAlgorithm: algo,
          arrivalRate: 42,
          floors: 14,
          cars: 4,
        });

        const sim = createSimulation(cfg, 8080, 60);

        // Pull Fire Alarm
        toggleFireAlarmState(sim, cfg);
        expect(sim.fireAlarmActive).toBe(true);

        // Allow ample time for all cars to descend nonstop to Floor 1
        advanceSeconds(sim, cfg, 25);

        for (const car of sim.left.cars) {
          expect(car.state).toBe('FIRE_LOCKED');
          expect(car.floor).toBeCloseTo(1, 2);
          expect(car.passengers.length).toBe(0);
        }

        const servedBeforeClear = sim.left.completed.count;

        // Clear Fire Alarm and verify normal service resumes
        toggleFireAlarmState(sim, cfg);
        expect(sim.fireAlarmActive).toBe(false);

        advanceSeconds(sim, cfg, 60);
        expect(sim.left.completed.count).toBeGreaterThan(servedBeforeClear);
      }
    );
  });
});
