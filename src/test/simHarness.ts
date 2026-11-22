import { expect } from 'vitest';
import {
  createSimulation,
  DEFAULT_CONFIG,
  DISPATCH_STRATEGIES,
  FIXED_DT,
  getDestinationColor,
  stepTwinSimulation,
} from '../engine/elevatorSim';
import type {
  BuildingWorld,
  DispatchAlgorithm,
  ElevatorCar,
  Passenger,
  SimConfig,
  SimState,
} from '../types/simulation';

/** Shared helpers for engine and per-algorithm test suites. */

export function makeConfig(overrides: Partial<SimConfig> = {}): SimConfig {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
  };
}

/** Same algorithm in both towers, so left/right stay comparable. */
export function makeAlgoConfig(
  algo: DispatchAlgorithm,
  overrides: Partial<SimConfig> = {}
): SimConfig {
  return makeConfig({ leftAlgorithm: algo, rightAlgorithm: algo, ...overrides });
}

export function advanceSeconds(
  sim: SimState,
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

/**
 * Steps until `predicate` holds or `maxSeconds` elapse. Returns the sim time at which the
 * predicate first held, or null if it never did.
 */
export function advanceUntil(
  sim: SimState,
  cfg: SimConfig,
  predicate: () => boolean,
  maxSeconds: number,
  onStep?: () => void
): number | null {
  const steps = Math.round(maxSeconds / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    stepTwinSimulation(sim, cfg, FIXED_DT);
    if (onStep) onStep();
    if (predicate()) return sim.simTime;
  }
  return null;
}

/** A fresh sim with no warm-up and random arrivals switched off, for hand-built scenarios. */
export function createQuietSimulation(cfg: SimConfig, seed = 1): SimState {
  const sim = createSimulation(cfg, seed, 0);
  sim.nextSpawnTime = Number.POSITIVE_INFINITY;
  return sim;
}

let manualPassengerId = 100_000;

export function makePassenger(
  origin: number,
  dest: number,
  opts: { spawnTime?: number; assignedCarId?: number | null; floors?: number } = {}
): Passenger {
  return {
    id: manualPassengerId++,
    spawnTime: opts.spawnTime ?? 0,
    origin,
    dest,
    dir: dest > origin ? 1 : -1,
    color: getDestinationColor(dest, opts.floors ?? DEFAULT_CONFIG.floors),
    assignedCarId: opts.assignedCarId ?? null,
    boardTime: null,
    stopOverhead: 0,
  };
}

/**
 * Queues a passenger in one tower and runs that tower's own assignment strategy, the same
 * way a spawned passenger is handled. Pass `assign: false` to keep `assignedCarId` as given.
 */
export function addWaitingPassenger(
  sim: SimState,
  cfg: SimConfig,
  world: BuildingWorld,
  origin: number,
  dest: number,
  opts: { spawnTime?: number; assign?: boolean; assignedCarId?: number | null } = {}
): Passenger {
  const pax = makePassenger(origin, dest, {
    spawnTime: opts.spawnTime ?? sim.simTime,
    assignedCarId: opts.assignedCarId ?? null,
    floors: cfg.floors,
  });
  if (opts.assign !== false && !sim.fireAlarmActive) {
    DISPATCH_STRATEGIES[world.algorithm].assignPassenger(sim, cfg, world, pax);
  }
  world.waitingQueues[origin].push(pax);
  return pax;
}

/** Puts a car at rest on a floor, as if it had just gone idle there. */
export function parkCar(car: ElevatorCar, floor: number) {
  car.floor = floor;
  car.state = 'IDLE';
  car.direction = 0;
  car.dwellTimer = 0;
  car.dwellDuration = 0;
  car.departing = false;
  car.departFloor = -1;
  car.homing = false;
  car.targetFloors = [];
}

export function countOnboard(world: BuildingWorld): number {
  return world.cars.reduce((acc, c) => acc + c.passengers.length, 0);
}

export function countWaiting(world: BuildingWorld): number {
  let n = 0;
  for (let f = 1; f < world.waitingQueues.length; f++) n += world.waitingQueues[f].length;
  return n;
}

/** Every passenger is exactly one of: waiting, riding, delivered or evacuated. */
export function accountedPassengers(world: BuildingWorld): number {
  return countWaiting(world) + countOnboard(world) + world.completed.count + world.evacuatedCount;
}

export function expectPhysicalInvariants(world: BuildingWorld, cfg: SimConfig) {
  for (const car of world.cars) {
    expect(car.floor).toBeGreaterThanOrEqual(1 - 1e-6);
    expect(car.floor).toBeLessThanOrEqual(cfg.floors + 1e-6);
    expect(car.passengers.length).toBeLessThanOrEqual(world.carCapacity);
  }
}

export function allWaitingPassengers(world: BuildingWorld): Passenger[] {
  const out: Passenger[] = [];
  for (let f = 1; f < world.waitingQueues.length; f++) out.push(...world.waitingQueues[f]);
  return out;
}
