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

    let car1Moved = false;
    advanceUntil(
      sim,
      cfg,
      () => sim.left.completed.count === 1,
      30,
      () => {
        if (sim.left.cars[1].state !== 'IDLE') car1Moved = true;
      }
    );
    expect(sim.left.completed.count).toBe(1);
    expect(car1Moved).toBe(false);
    expect(sim.left.cars[1].floor).toBe(1);
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

  it('still sends an idle car when the car heading to that floor is loaded the other way', () => {
    const cfg = makeAlgoConfig('standard', { floors: 10, cars: 2, carCapacity: 8 });
    const sim = createQuietSimulation(cfg);
    const world = sim.left;
    parkCar(world.cars[0], 9);
    parkCar(world.cars[1], 1);
    addWaitingPassenger(sim, cfg, world, 9, 5);
    addWaitingPassenger(sim, cfg, world, 9, 2);

    // Car 0 picks both riders up at 9 and sets off down, next stop floor 5.
    advanceUntil(sim, cfg, () => world.cars[0].state === 'MOVING', 20);
    expect(world.cars[0].passengers).toHaveLength(2);
    expect(world.cars[0].targetFloors).toEqual([5]);
    expect(world.cars[1].state).toBe('IDLE');

    // An up caller at 5 can't board car 0, which keeps going down after its stop there.
    const upCaller = addWaitingPassenger(sim, cfg, world, 5, 9);
    advanceSeconds(sim, cfg, 0.2);
    expect(world.cars[1].state).toBe('MOVING');

    advanceUntil(sim, cfg, () => world.completed.count === 3, 60);
    expect(world.completed.count).toBe(3);
    expect(world.waitingQueues[5]).not.toContain(upCaller);
  });
});
