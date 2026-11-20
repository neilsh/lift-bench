import type {
  BuildingWorld,
  Passenger,
  SimConfig,
  SimState,
} from '../types/simulation';
import {
  assignPassengerDestinationDispatch,
  stepDestinationWorld,
} from './algorithms/destination';
import { stepFcfsWorld } from './algorithms/fcfs';
import { assignPassengerNearestCar, stepNearestWorld } from './algorithms/nearest';
import { stepStandardWorld } from './algorithms/scan';
import { assignPassengerSector, stepSectorWorld } from './algorithms/sector';
import {
  ALGORITHM_META,
  ALGORITHM_ORDER,
  computeSectorBands,
  createRng,
  CRUISE_SPEED,
  DEFAULT_CONFIG,
  FIXED_DT,
  getDestinationColor,
  nowMs,
  PRESET_META,
} from './constants';
import {
  buildTelemetrySnapshot,
  computeCibseGrade,
  computeWorldTelemetry,
} from './telemetry';
import { computeFloorWeights, generatePassengerSpec } from './traffic';
import {
  countTotalWaiting,
  createBuildingWorld,
  evacuateCarAtLobby,
  isCarUnderFireAlarm,
} from './worldHelpers';

export {
  ALGORITHM_META,
  ALGORITHM_ORDER,
  buildTelemetrySnapshot,
  computeCibseGrade,
  computeFloorWeights,
  computeSectorBands,
  computeWorldTelemetry,
  countTotalWaiting,
  createRng,
  CRUISE_SPEED,
  DEFAULT_CONFIG,
  FIXED_DT,
  getDestinationColor,
  isCarUnderFireAlarm,
  PRESET_META,
};

function assignPassengerForWorld(
  sim: SimState,
  cfg: SimConfig,
  world: BuildingWorld,
  pax: Passenger
) {
  if (sim.fireAlarmActive) {
    pax.assignedCarId = null;
    return;
  }
  switch (world.algorithm) {
    case 'destination':
      assignPassengerDestinationDispatch(sim, cfg, world, pax, false);
      break;
    case 'eco':
      assignPassengerDestinationDispatch(sim, cfg, world, pax, true);
      break;
    case 'nearest':
      assignPassengerNearestCar(cfg, world, pax);
      break;
    case 'sector':
      assignPassengerSector(world, pax);
      break;
    case 'standard':
    case 'fcfs':
    default:
      pax.assignedCarId = null;
      break;
  }
}

function spawnPassengerPair(
  sim: SimState,
  cfg: SimConfig,
  spec: ReturnType<typeof generatePassengerSpec>
) {
  const leftPax: Passenger = {
    ...spec,
    assignedCarId: null,
    boardTime: null,
    stopOverhead: 0,
  };
  assignPassengerForWorld(sim, cfg, sim.left, leftPax);
  sim.left.waitingQueues[spec.origin].push(leftPax);

  const rightPax: Passenger = {
    ...spec,
    assignedCarId: null,
    boardTime: null,
    stopOverhead: 0,
  };
  assignPassengerForWorld(sim, cfg, sim.right, rightPax);
  sim.right.waitingQueues[spec.origin].push(rightPax);
}

export function spawnBurstPassengers(
  sim: SimState,
  cfg: SimConfig,
  count = 12,
  forcedOrigin: number | null = null
) {
  for (let i = 0; i < count; i++) {
    spawnPassengerPair(sim, cfg, generatePassengerSpec(sim, cfg, forcedOrigin));
  }
  if (forcedOrigin !== null) {
    sim.floorRipples.push({
      floor: forcedOrigin,
      born: nowMs(),
      duration: 750,
    });
  }
}

export function createSimulation(
  cfg: SimConfig,
  seed: number,
  warmUpSeconds = 75
): SimState {
  const rng = createRng(seed);
  const floorMeta = computeFloorWeights(cfg.floors, cfg.distributionMode);

  const sim: SimState = {
    simTime: 0,
    rng,
    nextSpawnTime: 0.2,
    nextPassengerId: 1,
    floorWeights: floorMeta.weights,
    cafeteriaFloor: floorMeta.cafeteriaFloor,
    anchorLow: floorMeta.anchorLow,
    anchorHigh: floorMeta.anchorHigh,
    hotspotFloor: floorMeta.hotspotFloor,
    fireAlarmActive: false,
    stairEvacTimer: 0,
    floorRipples: [],
    left: createBuildingWorld('left', cfg.leftAlgorithm, cfg),
    right: createBuildingWorld('right', cfg.rightAlgorithm, cfg),
  };

  const warmSteps = Math.floor(warmUpSeconds / FIXED_DT);
  for (let i = 0; i < warmSteps; i++) {
    stepTwinSimulation(sim, cfg, FIXED_DT);
  }

  sim.left.deliveryEffects = [];
  sim.right.deliveryEffects = [];

  return sim;
}

export function toggleFireAlarmState(sim: SimState, cfg: SimConfig) {
  if (!sim.fireAlarmActive) {
    sim.fireAlarmActive = true;
    sim.stairEvacTimer = 1.6;

    [sim.left, sim.right].forEach((world) => {
      world.evacuatedCount = 0;
      for (let i = 0; i < world.cars.length; i++) {
        const car = world.cars[i];
        car.dwellTimer = 0;
        car.dwellDuration = 0;
        car.departing = false;
        car.departFloor = -1;
        car.homing = false;
        car.batchHoldUsed = 0;

        if (car.floor <= 1.05) {
          evacuateCarAtLobby(world, car);
        } else {
          car.state = 'FIRE_RECALL';
          car.direction = -1;
          car.targetFloors = [1];
          world.totalMotorStarts++;
        }
      }
    });
  } else {
    sim.fireAlarmActive = false;
    sim.nextSpawnTime = sim.simTime + 0.35;

    [sim.left, sim.right].forEach((world) => {
      for (let i = 0; i < world.cars.length; i++) {
        const car = world.cars[i];
        if (isCarUnderFireAlarm(car)) {
          car.state = 'IDLE';
          car.direction = 0;
          car.departing = false;
          car.departFloor = -1;
          car.homing = false;
          car.batchHoldUsed = 0;
          car.targetFloors = [];
        }
      }

      for (let f = 1; f <= cfg.floors; f++) {
        const q = world.waitingQueues[f];
        for (let i = 0; i < q.length; i++) {
          q[i].assignedCarId = null;
          assignPassengerForWorld(sim, cfg, world, q[i]);
        }
      }
    });
  }
}

function stepWorldByAlgorithm(
  sim: SimState,
  cfg: SimConfig,
  world: BuildingWorld,
  dt: number
) {
  switch (world.algorithm) {
    case 'standard':
      stepStandardWorld(sim, cfg, world, dt);
      break;
    case 'destination':
      stepDestinationWorld(sim, cfg, world, dt, false);
      break;
    case 'eco':
      stepDestinationWorld(sim, cfg, world, dt, true);
      break;
    case 'nearest':
      stepNearestWorld(sim, cfg, world, dt);
      break;
    case 'sector':
      stepSectorWorld(sim, cfg, world, dt);
      break;
    case 'fcfs':
      stepFcfsWorld(sim, cfg, world, dt);
      break;
  }
}

export function stepTwinSimulation(sim: SimState, cfg: SimConfig, dt: number) {
  sim.simTime += dt;

  if (!sim.fireAlarmActive) {
    if (sim.simTime >= sim.nextSpawnTime) {
      spawnPassengerPair(sim, cfg, generatePassengerSpec(sim, cfg));
      const ratePerSec = cfg.arrivalRate / 60;
      const u = Math.max(1e-6, sim.rng());
      const interArrival = -Math.log(u) / ratePerSec;
      sim.nextSpawnTime = sim.simTime + Math.min(interArrival, 12);
    }
  } else {
    sim.stairEvacTimer -= dt;
    if (sim.stairEvacTimer <= 0) {
      sim.stairEvacTimer = 1.1;
      [sim.left, sim.right].forEach((world) => {
        for (let f = cfg.floors; f >= 1; f--) {
          const q = world.waitingQueues[f];
          if (q.length > 0) {
            q.shift();
            world.evacuatedCount++;
            break;
          }
        }
      });
    }
  }

  stepWorldByAlgorithm(sim, cfg, sim.left, dt);
  stepWorldByAlgorithm(sim, cfg, sim.right, dt);

  const secFloor = Math.floor(sim.simTime);
  if (secFloor > sim.left.lastHistorySample) {
    sim.left.lastHistorySample = secFloor;
    sim.right.lastHistorySample = secFloor;

    const leftQ = countTotalWaiting(sim.left);
    const rightQ = countTotalWaiting(sim.right);
    if (leftQ > sim.left.maxQueue) sim.left.maxQueue = leftQ;
    if (rightQ > sim.right.maxQueue) sim.right.maxQueue = rightQ;

    sim.left.queueHistory.push(leftQ);
    sim.right.queueHistory.push(rightQ);

    if (sim.left.queueHistory.length > 90) {
      sim.left.queueHistory.shift();
      sim.right.queueHistory.shift();
    }
  }
}
