import { describe, expect, it } from 'vitest';
import { spawnBurstPassengers } from '../../elevatorSim';
import { assignPassengerNearestCar } from '../nearest';
import {
  advanceSeconds,
  createQuietSimulation,
  makeConfig,
  makeAlgoConfig,
  makePassenger,
  parkCar,
} from '../../../test/simHarness';
import { describeSharedEdgeCases } from '../../../test/sharedAlgorithmEdgeCases';

describeSharedEdgeCases('nearest');

describe('nearest car (ETA)', () => {
  it('assigns the caller to the closest idle car', () => {
    const cfg = makeAlgoConfig('nearest', { floors: 14, cars: 2 });
    const sim = createQuietSimulation(cfg);
    parkCar(sim.left.cars[0], 1);
    parkCar(sim.left.cars[1], 10);

    const high = makePassenger(9, 2);
    assignPassengerNearestCar(cfg, sim.left, high);
    expect(high.assignedCarId).toBe(1);

    const low = makePassenger(2, 6);
    assignPassengerNearestCar(cfg, sim.left, low);
    expect(low.assignedCarId).toBe(0);
  });

  it('avoids a car whose pickup at that floor is already full', () => {
    const cfg = makeAlgoConfig('nearest', { floors: 14, cars: 2, carCapacity: 4 });
    const sim = createQuietSimulation(cfg);
    parkCar(sim.left.cars[0], 5);
    parkCar(sim.left.cars[1], 14);
    for (let i = 0; i < cfg.carCapacity; i++) {
      sim.left.waitingQueues[5].push(makePassenger(5, 12, { assignedCarId: 0 }));
      // Give car 1 the same total load elsewhere, so only the full-pickup penalty separates them.
      sim.left.waitingQueues[13].push(makePassenger(13, 2, { assignedCarId: 1 }));
    }

    const pax = makePassenger(5, 12);
    assignPassengerNearestCar(cfg, sim.left, pax);
    expect(pax.assignedCarId).toBe(1);
  });

  it('honours excludeCarId unless it is the only healthy car', () => {
    const cfg = makeAlgoConfig('nearest', { floors: 10, cars: 2 });
    const sim = createQuietSimulation(cfg);
    parkCar(sim.left.cars[0], 4);
    parkCar(sim.left.cars[1], 10);

    const pax = makePassenger(4, 8);
    assignPassengerNearestCar(cfg, sim.left, pax, 0);
    expect(pax.assignedCarId).toBe(1);

    sim.left.cars[1].state = 'FIRE_LOCKED';
    assignPassengerNearestCar(cfg, sim.left, pax, 0);
    expect(pax.assignedCarId).toBe(0);

    sim.left.cars[0].state = 'FIRE_LOCKED';
    assignPassengerNearestCar(cfg, sim.left, pax, 0);
    expect(pax.assignedCarId).toBeNull();
  });

  it('assigns every waiting passenger to a valid car and delivers them under mixed lunch traffic', () => {
    const cfg = makeConfig({
      leftAlgorithm: 'nearest',
      rightAlgorithm: 'standard',
      distributionMode: 'lunch',
      arrivalRate: 38,
      floors: 14,
      cars: 4,
    });

    const sim = createQuietSimulation(cfg, 5150);
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
});
