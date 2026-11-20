import { describe, expect, it } from 'vitest';
import {
  ALGORITHM_META,
  ALGORITHM_ORDER,
  buildTelemetrySnapshot,
  computeCibseGrade,
  computeFloorWeights,
  computeSectorBands,
  CONFIG_LIMITS,
  countTotalWaiting,
  createRng,
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

describe('Elevator Dispatch Algorithms & Engineering Telemetry', () => {
  it('registers complete guide metadata for every dispatch algorithm', () => {
    expect(ALGORITHM_ORDER).toHaveLength(6);
    for (const algo of ALGORITHM_ORDER) {
      const meta = ALGORITHM_META[algo];
      expect(meta).toBeDefined();
      expect(meta.id).toBe(algo);
      expect(meta.name.length).toBeGreaterThan(2);
      expect(meta.shortName.length).toBeGreaterThan(1);
      expect(meta.description.length).toBeGreaterThan(10);
      expect(meta.howItWorks.length).toBeGreaterThan(20);
      expect(meta.bestFor.length).toBeGreaterThan(10);
      expect(meta.tradeOff.length).toBeGreaterThan(10);
    }
  });

  describe('PRNG & Traffic Weights', () => {
    it('produces deterministic Mulberry32 sequences bounded in [0, 1)', () => {
      const rngA = createRng(98765);
      const rngB = createRng(98765);
      for (let i = 0; i < 50; i++) {
        const a = rngA();
        const b = rngB();
        expect(a).toBe(b);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThan(1);
      }
    });

    it('computes valid floor weights and hotspot floors across all presets', () => {
      const uniform = computeFloorWeights(14, 'uniform');
      expect(uniform.hotspotFloor).toBe(-1);
      for (let f = 2; f <= 14; f++) {
        expect(uniform.weights[f]).toBe(1);
      }

      const vip = computeFloorWeights(14, 'vip');
      expect(vip.hotspotFloor).toBe(14);
      expect(vip.weights[14]).toBeGreaterThan(vip.weights[2]);

      const lunch = computeFloorWeights(14, 'lunch');
      expect(lunch.hotspotFloor).toBe(lunch.cafeteriaFloor);
      expect(lunch.weights[lunch.cafeteriaFloor]).toBeGreaterThan(lunch.weights[2]);
    });
  });

  describe('CIBSE Guide D Grading & Lobby Dispatch Interval', () => {
    it('maps AWT, ATTD, and saturation to exact CIBSE Guide D grades A–F', () => {
      expect(computeCibseGrade(0, 0, false, 0)).toEqual({ grade: '—', label: 'Pending' });
      expect(computeCibseGrade(18, 42, false, 20)).toEqual({ grade: 'A', label: 'Excellent' });
      expect(computeCibseGrade(24, 58, false, 20)).toEqual({ grade: 'B', label: 'Good' });
      expect(computeCibseGrade(29, 72, false, 20)).toEqual({ grade: 'C', label: 'Fair' });
      expect(computeCibseGrade(36, 82, false, 20)).toEqual({ grade: 'D', label: 'Poor' });
      expect(computeCibseGrade(48, 88, false, 20)).toEqual({ grade: 'F', label: 'Overloaded' });
      expect(computeCibseGrade(15, 38, true, 20)).toEqual({ grade: 'F', label: 'Overloaded' });
    });

    it('records rolling lobby dispatch interval during steady-state service', () => {
      const cfg = makeConfig({
        leftAlgorithm: 'standard',
        rightAlgorithm: 'destination',
        arrivalRate: 48,
        floors: 14,
        cars: 4,
      });
      const sim = createSimulation(cfg, 20261118, 90);
      const snap = buildTelemetrySnapshot(sim, cfg);

      expect(snap.left.lobbyInterval).toBeGreaterThan(1);
      expect(snap.right.lobbyInterval).toBeGreaterThan(1);
      expect(['A', 'B', 'C', 'D', 'F']).toContain(snap.left.cibseGrade);
      expect(['A', 'B', 'C', 'D', 'F']).toContain(snap.right.cibseGrade);
    });
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

        expect(snapA.left.served).toBe(snapA.right.served);
        expect(snapA.left.avgTTD).toBeCloseTo(snapA.right.avgTTD, 8);
        expect(snapA.left.totalStops).toBe(snapA.right.totalStops);
        expect(snapA.left.waitingCount).toBe(snapA.right.waitingCount);
        expect(snapA.left.lobbyInterval).toBeCloseTo(snapA.right.lobbyInterval, 8);
        expect(snapA.left.cibseGrade).toBe(snapA.right.cibseGrade);

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
      'handles extreme building sizes (4fl/1car and 40fl/8cars) safely (%s)',
      (algo: DispatchAlgorithm) => {
        const smallCfg = makeConfig({
          leftAlgorithm: algo,
          rightAlgorithm: algo,
          floors: CONFIG_LIMITS.floors.min,
          cars: CONFIG_LIMITS.cars.min,
          carCapacity: 4,
          arrivalRate: 24,
        });
        const largeCfg = makeConfig({
          leftAlgorithm: algo,
          rightAlgorithm: algo,
          floors: CONFIG_LIMITS.floors.max,
          cars: CONFIG_LIMITS.cars.max,
          carCapacity: 16,
          arrivalRate: 72,
        });

        const smallSim = createSimulation(smallCfg, 77, 90);
        const largeSim = createSimulation(largeCfg, 77, 140);

        expect(smallSim.left.cars).toHaveLength(1);
        expect(smallSim.left.completed.count).toBeGreaterThan(5);
        expect(largeSim.left.cars).toHaveLength(8);
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

      for (const [floors, cars] of [
        [4, 1],
        [8, 2],
        [14, 3],
        [18, 4],
        [24, 5],
        [40, 8],
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

      let deliveredFirst = false;
      advanceSeconds(sim, cfg, 30, () => {
        if (sim.left.completed.count === 1 && !deliveredFirst) {
          deliveredFirst = true;
          expect(sim.left.waitingQueues[5].length).toBe(1);
        }
      });

      expect(deliveredFirst).toBe(true);
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

        toggleFireAlarmState(sim, cfg);
        expect(sim.fireAlarmActive).toBe(true);

        advanceSeconds(sim, cfg, 25);

        for (const car of sim.left.cars) {
          expect(car.state).toBe('FIRE_LOCKED');
          expect(car.floor).toBeCloseTo(1, 2);
          expect(car.passengers.length).toBe(0);
        }

        const servedBeforeClear = sim.left.completed.count;

        toggleFireAlarmState(sim, cfg);
        expect(sim.fireAlarmActive).toBe(false);

        advanceSeconds(sim, cfg, 60);
        expect(sim.left.completed.count).toBeGreaterThan(servedBeforeClear);
      }
    );
  });

  describe('Live Config Synchronization', () => {
    it('updates carCapacity on both left and right worlds when stepped with a new config', () => {
      const cfg = makeConfig({ carCapacity: 8 });
      const sim = createSimulation(cfg, 20261118, 0);

      expect(sim.left.carCapacity).toBe(8);
      expect(sim.right.carCapacity).toBe(8);

      stepTwinSimulation(sim, { ...cfg, carCapacity: 12 }, FIXED_DT);

      expect(sim.left.carCapacity).toBe(12);
      expect(sim.right.carCapacity).toBe(12);
    });
  });
});
