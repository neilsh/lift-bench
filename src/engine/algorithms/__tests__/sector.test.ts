import { describe, expect, it } from 'vitest';
import { computeSectorBands, spawnBurstPassengers } from '../../elevatorSim';
import { assignPassengerSector } from '../sector';
import {
  advanceSeconds,
  createQuietSimulation,
  makeAlgoConfig,
  makePassenger,
} from '../../../test/simHarness';
import { describeSharedEdgeCases } from '../../../test/sharedAlgorithmEdgeCases';

describeSharedEdgeCases('sector');

describe('static zoning (sector)', () => {
  it('partitions upper floors into contiguous non-overlapping bands', () => {
    expect(computeSectorBands(14, 4)).toEqual([
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
  });

  it('gives a single-shaft building one band covering every upper floor', () => {
    expect(computeSectorBands(10, 1)).toEqual([{ min: 2, max: 10 }]);
  });

  it('routes lobby riders to the car whose sector holds their destination', () => {
    const cfg = makeAlgoConfig('sector', { floors: 14, cars: 4 });
    const sim = createQuietSimulation(cfg, 101);
    spawnBurstPassengers(sim, cfg, 20, 1);

    for (const pax of sim.left.waitingQueues[1]) {
      expect(pax.assignedCarId).not.toBeNull();
      const car = sim.left.cars[pax.assignedCarId!];
      expect(pax.dest).toBeGreaterThanOrEqual(car.sectorMin!);
      expect(pax.dest).toBeLessThanOrEqual(car.sectorMax!);
    }
  });

  it('routes upper-floor callers by their origin floor', () => {
    const cfg = makeAlgoConfig('sector', { floors: 14, cars: 4 });
    const sim = createQuietSimulation(cfg);
    const pax = makePassenger(12, 1);
    assignPassengerSector(sim.left, pax);
    expect(pax.assignedCarId).toBe(3);
  });

  it('falls back to the nearest healthy sector when the home car is recalled', () => {
    const cfg = makeAlgoConfig('sector', { floors: 14, cars: 4 });
    const sim = createQuietSimulation(cfg);
    sim.left.cars[3].state = 'FIRE_LOCKED';

    const pax = makePassenger(1, 13);
    assignPassengerSector(sim.left, pax);
    expect(pax.assignedCarId).toBe(2);

    for (const c of sim.left.cars) c.state = 'FIRE_LOCKED';
    assignPassengerSector(sim.left, pax);
    expect(pax.assignedCarId).toBeNull();
  });

  it('reassigns a waiting rider whose sector car is locked out', () => {
    const cfg = makeAlgoConfig('sector', { floors: 14, cars: 4 });
    const sim = createQuietSimulation(cfg);
    const pax = makePassenger(1, 13, { assignedCarId: 3 });
    sim.left.waitingQueues[1].push(pax);
    sim.left.cars[3].state = 'FIRE_LOCKED';

    advanceSeconds(sim, cfg, 0.05);
    expect(pax.assignedCarId).toBe(2);
  });

  it('parks idle cars at the middle of their sector during down-peak', () => {
    const cfg = makeAlgoConfig('sector', { floors: 14, cars: 4, distributionMode: 'downpeak' });
    const sim = createQuietSimulation(cfg);
    advanceSeconds(sim, cfg, 20);

    for (const car of sim.left.cars) {
      const mid = Math.round((car.sectorMin! + car.sectorMax!) * 0.5);
      // Parking stops within the 0.08-floor rest tolerance.
      expect(Math.abs(car.floor - mid)).toBeLessThanOrEqual(0.08 + 1e-9);
    }
  });
});
