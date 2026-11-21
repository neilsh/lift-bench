import { describe, expect, it } from 'vitest';
import {
  addWaitingPassenger,
  advanceSeconds,
  createQuietSimulation,
  makeAlgoConfig,
  parkCar,
} from '../../../test/simHarness';
import { describeSharedEdgeCases } from '../../../test/sharedAlgorithmEdgeCases';

describeSharedEdgeCases('fcfs');

describe('FIFO baseline (fcfs)', () => {
  it('delivers the earliest request without detouring for a later intermediate hall call', () => {
    const cfg = makeAlgoConfig('fcfs', { floors: 12, cars: 1, carCapacity: 4, stopPenalty: 2.0 });
    const sim = createQuietSimulation(cfg, 99);
    const world = sim.left;
    addWaitingPassenger(sim, cfg, world, 1, 12, { spawnTime: 0 });
    addWaitingPassenger(sim, cfg, world, 5, 10, { spawnTime: 1 });

    let deliveredFirst = false;
    advanceSeconds(sim, cfg, 30, () => {
      if (world.completed.count === 1 && !deliveredFirst) {
        deliveredFirst = true;
        expect(world.waitingQueues[5].length).toBe(1);
      }
    });

    expect(deliveredFirst).toBe(true);
    advanceSeconds(sim, cfg, 40);
    expect(world.completed.count).toBe(2);
  });

  it('sends only one of two equally close idle cars to the oldest call', () => {
    const cfg = makeAlgoConfig('fcfs', { floors: 10, cars: 2 });
    const sim = createQuietSimulation(cfg);
    parkCar(sim.left.cars[0], 1);
    parkCar(sim.left.cars[1], 1);
    const p = addWaitingPassenger(sim, cfg, sim.left, 6, 2);

    advanceSeconds(sim, cfg, 0.2);
    expect(p.assignedCarId).toBe(0);
    expect(sim.left.cars[0].state).toBe('MOVING');
    expect(sim.left.cars[1].state).toBe('IDLE');
  });

  it('serves callers strictly in arrival order with a single car', () => {
    const cfg = makeAlgoConfig('fcfs', { floors: 10, cars: 1, carCapacity: 4 });
    const sim = createQuietSimulation(cfg);
    const world = sim.left;
    const order = [
      addWaitingPassenger(sim, cfg, world, 8, 2, { spawnTime: 0 }),
      addWaitingPassenger(sim, cfg, world, 3, 9, { spawnTime: 1 }),
      addWaitingPassenger(sim, cfg, world, 6, 1, { spawnTime: 2 }),
    ];

    advanceSeconds(sim, cfg, 120);
    expect(world.completed.count).toBe(3);
    const boardTimes = order.map((p) => p.boardTime!);
    expect(boardTimes[0]).toBeLessThan(boardTimes[1]);
    expect(boardTimes[1]).toBeLessThan(boardTimes[2]);
  });

  it('lets same-direction riders at the pickup floor share the car', () => {
    const cfg = makeAlgoConfig('fcfs', { floors: 10, cars: 1, carCapacity: 4 });
    const sim = createQuietSimulation(cfg);
    const world = sim.left;
    addWaitingPassenger(sim, cfg, world, 1, 9, { spawnTime: 0 });
    addWaitingPassenger(sim, cfg, world, 1, 4, { spawnTime: 0.1 });
    addWaitingPassenger(sim, cfg, world, 1, 6, { spawnTime: 0.2 });

    advanceSeconds(sim, cfg, 0.1);
    expect(world.cars[0].passengers).toHaveLength(3);
  });
});
