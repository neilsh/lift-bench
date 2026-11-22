import { describe, expect, it } from 'vitest';
import { buildTelemetrySnapshot, createSimulation, toggleFireAlarmState } from '../../elevatorSim';
import { assignPassengerDestinationDispatch } from '../destination';
import {
  accountedPassengers,
  addWaitingPassenger,
  advanceSeconds,
  advanceUntil,
  allWaitingPassengers,
  countOnboard,
  countWaiting,
  createQuietSimulation,
  expectPhysicalInvariants,
  makeAlgoConfig,
  makeConfig,
  makePassenger,
  parkCar,
} from '../../../test/simHarness';
import { describeSharedEdgeCases } from '../../../test/sharedAlgorithmEdgeCases';

// Destination dispatch and eco batching share one implementation (`ecoMode` flag), so most
// behaviour is checked for both. Eco-only and destination-only behaviour is split out below.
const MODES = [
  { algo: 'destination', eco: false },
  { algo: 'eco', eco: true },
] as const;

describeSharedEdgeCases('destination');
describeSharedEdgeCases('eco');

describe.each(MODES)('destination dispatch assignment ($algo)', ({ algo, eco }) => {
  it('assigns no car when every car is under fire recall', () => {
    const cfg = makeAlgoConfig(algo, { floors: 10, cars: 3 });
    const sim = createQuietSimulation(cfg);
    for (const c of sim.left.cars) c.state = 'FIRE_LOCKED';

    const pax = makePassenger(1, 6, { assignedCarId: 2 });
    assignPassengerDestinationDispatch(sim, cfg, sim.left, pax, eco);
    expect(pax.assignedCarId).toBeNull();
  });

  it('skips cars that are recalled or locked out by the fire alarm', () => {
    const cfg = makeAlgoConfig(algo, { floors: 10, cars: 3 });
    const sim = createQuietSimulation(cfg);
    sim.left.cars[0].state = 'FIRE_RECALL';
    sim.left.cars[1].state = 'FIRE_LOCKED';

    for (const [o, d] of [
      [1, 6],
      [8, 2],
      [5, 9],
    ] as const) {
      const pax = makePassenger(o, d);
      assignPassengerDestinationDispatch(sim, cfg, sim.left, pax, eco);
      expect(pax.assignedCarId).toBe(2);
    }
  });

  it('always picks the only car in a single-shaft building', () => {
    const cfg = makeAlgoConfig(algo, { floors: 8, cars: 1 });
    const sim = createQuietSimulation(cfg);
    for (let o = 1; o <= 8; o++) {
      const pax = makePassenger(o, o === 1 ? 8 : 1);
      assignPassengerDestinationDispatch(sim, cfg, sim.left, pax, eco);
      expect(pax.assignedCarId).toBe(0);
    }
  });

  it('prefers the car parked closest to an upper-floor caller', () => {
    const cfg = makeAlgoConfig(algo, { floors: 14, cars: 2 });
    const sim = createQuietSimulation(cfg);
    parkCar(sim.left.cars[0], 1);
    parkCar(sim.left.cars[1], 12);

    const pax = makePassenger(11, 2);
    assignPassengerDestinationDispatch(sim, cfg, sim.left, pax, eco);
    expect(pax.assignedCarId).toBe(1);
  });

  it('groups a lobby rider with an existing batch heading to the same floor', () => {
    const cfg = makeAlgoConfig(algo, { floors: 14, cars: 2, carCapacity: 8 });
    const sim = createQuietSimulation(cfg);
    for (let i = 0; i < 3; i++) {
      sim.left.waitingQueues[1].push(makePassenger(1, 9, { assignedCarId: 1 }));
    }

    const pax = makePassenger(1, 9);
    assignPassengerDestinationDispatch(sim, cfg, sim.left, pax, eco);
    expect(pax.assignedCarId).toBe(1);
  });

  it('sends the next lobby rider to another car once a car’s batch is already full', () => {
    const cfg = makeAlgoConfig(algo, { floors: 14, cars: 2, carCapacity: 4 });
    const sim = createQuietSimulation(cfg);
    for (let i = 0; i < cfg.carCapacity; i++) {
      sim.left.waitingQueues[1].push(makePassenger(1, 9, { assignedCarId: 0 }));
    }

    // Same destination, so only the full-batch "wave" penalty can push it off car 0.
    const pax = makePassenger(1, 9);
    assignPassengerDestinationDispatch(sim, cfg, sim.left, pax, eco);
    expect(pax.assignedCarId).toBe(1);
  });
});

describe.each(MODES)('destination dispatch car behaviour ($algo)', ({ algo }) => {
  it('batches unassigned lobby riders by shared destination when loading', () => {
    const cfg = makeAlgoConfig(algo, { floors: 12, cars: 1, carCapacity: 4 });
    const sim = createQuietSimulation(cfg);
    const lobby = sim.left.waitingQueues[1];
    for (const dest of [3, 10, 3, 10, 3, 10, 3, 10]) {
      lobby.push(makePassenger(1, dest, { assignedCarId: null, floors: cfg.floors }));
    }

    advanceSeconds(sim, cfg, 0.1);
    const car = sim.left.cars[0];
    expect(car.passengers).toHaveLength(4);
    expect(new Set(car.passengers.map((p) => p.dest))).toEqual(new Set([3]));
    expect(lobby.every((p) => p.dest === 10)).toBe(true);
  });

  it('only boards riders travelling in the car’s committed direction at an upper floor', () => {
    const cfg = makeAlgoConfig(algo, { floors: 12, cars: 1, carCapacity: 6 });
    const sim = createQuietSimulation(cfg);
    const world = sim.left;
    addWaitingPassenger(sim, cfg, world, 1, 11);

    advanceUntil(sim, cfg, () => world.cars[0].state === 'MOVING', 10);
    const down = addWaitingPassenger(sim, cfg, world, 6, 2);
    const up = addWaitingPassenger(sim, cfg, world, 6, 10);

    const car = world.cars[0];
    let boardedDownWhileUp = false;
    advanceUntil(
      sim,
      cfg,
      () => world.completed.count >= 2,
      60,
      () => {
        if (car.direction === 1 && car.passengers.includes(down)) boardedDownWhileUp = true;
      }
    );

    expect(boardedDownWhileUp).toBe(false);
    expect(up.boardTime).not.toBeNull();

    advanceUntil(sim, cfg, () => world.completed.count === 3, 60);
    expect(world.completed.count).toBe(3);
  });

  it('keeps every rider accounted for under heavy load with small cars', () => {
    const cfg = makeAlgoConfig(algo, {
      floors: 16,
      cars: 3,
      carCapacity: 4,
      arrivalRate: 70,
      distributionMode: 'uniform',
    });
    const sim = createSimulation(cfg, 777, 0);
    let spawned = 0;
    let lastId = sim.nextPassengerId;

    advanceSeconds(sim, cfg, 150, () => {
      expectPhysicalInvariants(sim.left, cfg);
      spawned += sim.nextPassengerId - lastId;
      lastId = sim.nextPassengerId;
    });

    expect(accountedPassengers(sim.left)).toBe(spawned);
    expect(sim.left.completed.count).toBeGreaterThan(40);
  });
});

describe('destination dispatch under fire alarm', () => {
  it('re-dispatches every stranded waiting rider to a healthy car when the alarm clears', () => {
    const cfg = makeAlgoConfig('destination', { floors: 14, cars: 3, arrivalRate: 50 });
    const sim = createSimulation(cfg, 909, 40);

    toggleFireAlarmState(sim, cfg);
    advanceSeconds(sim, cfg, 2);

    // Riders reaching a hall panel during the alarm get no car.
    const during = addWaitingPassenger(sim, cfg, sim.left, 4, 12);
    expect(during.assignedCarId).toBeNull();

    toggleFireAlarmState(sim, cfg);
    const waiting = allWaitingPassengers(sim.left);
    expect(waiting.length).toBeGreaterThan(0);
    for (const p of waiting) {
      expect(p.assignedCarId).not.toBeNull();
      expect(sim.left.cars[p.assignedCarId!].state).toBe('IDLE');
    }
  });

  it('survives the alarm toggling twice within one trip', () => {
    const cfg = makeAlgoConfig('destination', { floors: 12, cars: 2, carCapacity: 6 });
    const sim = createQuietSimulation(cfg, 5);
    const world = sim.left;
    for (let i = 0; i < 6; i++) addWaitingPassenger(sim, cfg, world, 1, 8 + (i % 4));
    // evacuatedCount resets each time an alarm starts, so keep a running total across alarms.
    let evacuatedEarlier = 0;
    const expectAllAccounted = (expected: number) =>
      expect(accountedPassengers(world) + evacuatedEarlier).toBe(expected);

    advanceUntil(sim, cfg, () => world.cars.some((c) => c.floor > 4), 30);
    toggleFireAlarmState(sim, cfg);
    advanceSeconds(sim, cfg, 0.5);
    toggleFireAlarmState(sim, cfg);
    sim.nextSpawnTime = Number.POSITIVE_INFINITY;

    // A car caught between floors resumes from where it stopped descending.
    for (const c of world.cars) {
      expect(c.state).toBe('IDLE');
      expect(c.passengers.length).toBeLessThanOrEqual(cfg.carCapacity);
    }

    expectAllAccounted(6);
    advanceUntil(sim, cfg, () => world.cars.some((c) => c.floor > 1.5), 10);
    evacuatedEarlier += world.evacuatedCount;
    toggleFireAlarmState(sim, cfg);
    advanceUntil(sim, cfg, () => world.cars.every((c) => c.state === 'FIRE_LOCKED'), 30);
    expect(world.cars.every((c) => c.state === 'FIRE_LOCKED' && c.floor === 1)).toBe(true);
    toggleFireAlarmState(sim, cfg);
    sim.nextSpawnTime = Number.POSITIVE_INFINITY;
    const completedBefore = world.completed.count;
    addWaitingPassenger(sim, cfg, world, 1, 10);
    addWaitingPassenger(sim, cfg, world, 9, 1);

    advanceUntil(
      sim,
      cfg,
      () => countWaiting(world) === 0 && countOnboard(world) === 0,
      120,
      () => expectPhysicalInvariants(world, cfg)
    );
    expect(countWaiting(world) + countOnboard(world)).toBe(0);
    expect(world.completed.count).toBe(completedBefore + 2);
    expectAllAccounted(8);
  });
});

describe('destination vs eco differences', () => {
  it('eco holds a lightly loaded car at the lobby to batch riders; destination does not', () => {
    const departAt: Record<string, number | null> = {};
    for (const algo of ['destination', 'eco'] as const) {
      const cfg = makeAlgoConfig(algo, { floors: 12, cars: 1, carCapacity: 8, stopPenalty: 3 });
      const sim = createQuietSimulation(cfg);
      addWaitingPassenger(sim, cfg, sim.left, 1, 9);
      departAt[algo] = advanceUntil(sim, cfg, () => sim.left.cars[0].floor > 1.05, 20);
    }

    expect(departAt.destination).not.toBeNull();
    expect(departAt.eco).not.toBeNull();
    // Eco's lobby hold is capped at 3.5 s.
    expect(departAt.eco! - departAt.destination!).toBeGreaterThan(2);
    expect(departAt.eco! - departAt.destination!).toBeLessThan(4);
  });

  it('eco lets a hold end early once riders have waited too long', () => {
    const cfg = makeAlgoConfig('eco', { floors: 12, cars: 1, carCapacity: 8, stopPenalty: 3 });
    const sim = createQuietSimulation(cfg);
    sim.simTime = 50;
    addWaitingPassenger(sim, cfg, sim.left, 1, 9, { spawnTime: 30 });

    const car = sim.left.cars[0];
    let maxHold = 0;
    const departAt = advanceUntil(
      sim,
      cfg,
      () => car.floor > 1.05,
      20,
      () => {
        maxHold = Math.max(maxHold, car.batchHoldUsed ?? 0);
      }
    );
    expect(departAt).not.toBeNull();
    expect(maxHold).toBe(0);
    expect(departAt! - 50).toBeLessThan(cfg.stopPenalty + 1.5);
  });

  it.each([
    ['destination', 1],
    ['eco', 8],
  ] as const)('an empty %s car idling upstairs parks at floor %i', (algo, expectedFloor) => {
    const cfg = makeAlgoConfig(algo, { floors: 12, cars: 1, distributionMode: 'realistic' });
    const sim = createQuietSimulation(cfg);
    parkCar(sim.left.cars[0], 8);

    advanceSeconds(sim, cfg, 10);
    // Homing ends within the 0.05-floor lobby tolerance rather than snapping exactly to 1.
    expect(Math.abs(sim.left.cars[0].floor - expectedFloor)).toBeLessThan(0.05);
    expect(sim.left.cars[0].state).toBe('IDLE');
  });

  it('destination does not home to the lobby during down-peak when the lobby is empty', () => {
    const cfg = makeAlgoConfig('destination', {
      floors: 12,
      cars: 1,
      distributionMode: 'downpeak',
    });
    const sim = createQuietSimulation(cfg);
    parkCar(sim.left.cars[0], 8);

    advanceSeconds(sim, cfg, 10);
    expect(sim.left.cars[0].floor).toBe(8);
  });
});

describe('destination dispatch adopting down calls en route', () => {
  it('an idle car upstairs takes over a down call from a busier assigned car', () => {
    const cfg = makeAlgoConfig('destination', { floors: 14, cars: 2, carCapacity: 8 });
    const sim = createQuietSimulation(cfg);
    const world = sim.left;
    parkCar(world.cars[0], 13);
    parkCar(world.cars[1], 1);
    // Keep car 1 busy at the lobby so its ETA to floor 9 stays long.
    world.cars[1].state = 'DWELLING';
    world.cars[1].dwellTimer = 30;

    const pax = makePassenger(9, 2, { assignedCarId: 1, floors: cfg.floors });
    world.waitingQueues[9].push(pax);

    advanceSeconds(sim, cfg, 0.1);
    expect(pax.assignedCarId).toBe(0);

    advanceUntil(sim, cfg, () => world.completed.count === 1, 40);
    expect(world.completed.count).toBe(1);
  });
});

describe('destination dispatch benchmark', () => {
  it('beats standard collective SCAN on stops/trip and ATTD under heavy up-peak traffic', () => {
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

  it('eco batching uses less shaft mileage and Wh/pax than the FIFO baseline', () => {
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
});
