import { describe, expect, it } from 'vitest';
import {
  addWaitingPassenger,
  advanceSeconds,
  advanceUntil,
  createQuietSimulation,
  makeAlgoConfig,
  parkCar,
} from '../../../test/simHarness';
import { describeSharedEdgeCases } from '../../../test/sharedAlgorithmEdgeCases';

// Standard collective control (SCAN): no assignment, cars answer hall calls in their direction.
describeSharedEdgeCases('standard');

describe('standard collective (SCAN)', () => {
  it('leaves every hall call unassigned', () => {
    const cfg = makeAlgoConfig('standard', { floors: 10, cars: 3 });
    const sim = createQuietSimulation(cfg);
    const p = addWaitingPassenger(sim, cfg, sim.left, 4, 9);
    expect(p.assignedCarId).toBeNull();
  });

  it('answers same-direction calls on the way up and leaves opposite calls for the way down', () => {
    const cfg = makeAlgoConfig('standard', { floors: 12, cars: 1, carCapacity: 8 });
    const sim = createQuietSimulation(cfg);
    const world = sim.left;
    addWaitingPassenger(sim, cfg, world, 1, 10);

    advanceUntil(sim, cfg, () => world.cars[0].state === 'MOVING' && world.cars[0].floor > 1.5, 20);
    const downAt5 = addWaitingPassenger(sim, cfg, world, 5, 2);
    const upAt6 = addWaitingPassenger(sim, cfg, world, 6, 9);

    advanceUntil(sim, cfg, () => world.completed.count >= 1, 60);
    // Lobby rider delivered at 10: the up caller at 6 rode along, the down caller still waits.
    expect(upAt6.boardTime).not.toBeNull();
    expect(world.waitingQueues[5]).toContain(downAt5);

    advanceUntil(sim, cfg, () => world.completed.count === 3, 60);
    expect(world.completed.count).toBe(3);
  });

  // Regression: once one idle car takes a call, the other idle cars must not set off after
  // the same call (they used to, because they only deferred to cars that were still IDLE).
  it('sends only the lower-numbered of two equally close idle cars to a new call', () => {
    const cfg = makeAlgoConfig('standard', { floors: 10, cars: 2 });
    const sim = createQuietSimulation(cfg);
    parkCar(sim.left.cars[0], 1);
    parkCar(sim.left.cars[1], 1);
    addWaitingPassenger(sim, cfg, sim.left, 5, 9);

    advanceSeconds(sim, cfg, 1);
    expect(sim.left.cars[0].state).toBe('MOVING');
    expect(sim.left.cars[1].state).toBe('IDLE');
  });

  it('sends the closer idle car rather than the lower-numbered one', () => {
    const cfg = makeAlgoConfig('standard', { floors: 10, cars: 2 });
    const sim = createQuietSimulation(cfg);
    parkCar(sim.left.cars[0], 1);
    parkCar(sim.left.cars[1], 8);
    addWaitingPassenger(sim, cfg, sim.left, 7, 2);

    advanceSeconds(sim, cfg, 0.3);
    expect(sim.left.cars[0].state).toBe('IDLE');
    expect(sim.left.cars[1].state).toBe('MOVING');

    advanceSeconds(sim, cfg, 20);
    expect(sim.left.completed.count).toBe(1);
    // Only car 1 ever moved: 1 floor down to the caller, 5 more to floor 2.
    expect(sim.left.totalMotorStarts).toBe(2);
    expect(sim.left.cars[0].floor).toBe(1);
  });
});
