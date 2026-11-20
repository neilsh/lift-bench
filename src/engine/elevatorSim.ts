import type {
  BuildingWorld,
  DestinationColor,
  DispatchAlgorithm,
  DistributionMode,
  ElevatorCar,
  Passenger,
  SimConfig,
  SimState,
  TelemetrySnapshot,
  TowerSide,
  WorldTelemetry,
} from '../types/simulation';

export const FIXED_DT = 0.05; // 50ms deterministic physics step
export const CRUISE_SPEED = 2.4; // floors per second

export const DEFAULT_CONFIG: SimConfig = {
  arrivalRate: 42,
  floors: 14,
  cars: 4,
  stopPenalty: 5.0,
  carCapacity: 8,
  distributionMode: 'realistic',
  leftAlgorithm: 'standard',
  rightAlgorithm: 'destination',
};

export const ALGORITHM_ORDER: DispatchAlgorithm[] = [
  'standard',
  'destination',
  'nearest',
  'sector',
  'eco',
  'fcfs',
];

export const ALGORITHM_META: Record<
  DispatchAlgorithm,
  {
    id: DispatchAlgorithm;
    name: string;
    shortName: string;
    description: string;
  }
> = {
  standard: {
    id: 'standard',
    name: 'Collective SCAN',
    shortName: 'SCAN',
    description: 'Classic up/down directional sweep; cars collect same-direction hall calls en route.',
  },
  destination: {
    id: 'destination',
    name: 'Destination Dispatch',
    shortName: 'Dest. DD',
    description: 'Wave-aware SDF cost function with express lobby clustering, downward sweep & homing.',
  },
  nearest: {
    id: 'nearest',
    name: 'Nearest Car (ETA)',
    shortName: 'Nearest',
    description: 'Group hall-call allocator assigning each floor call to the single lowest-ETA car.',
  },
  sector: {
    id: 'sector',
    name: 'Static Zoning',
    shortName: 'Zoning',
    description: 'Partitions upper floors into dedicated vertical bands, one exclusive zone per car.',
  },
  eco: {
    id: 'eco',
    name: 'Eco Batching',
    shortName: 'Eco DD',
    description: 'Energy-saving destination batching; holds briefly for fuller loads & parks in place.',
  },
  fcfs: {
    id: 'fcfs',
    name: 'FIFO Baseline',
    shortName: 'FIFO',
    description: 'Strict arrival-order dispatch serving one origin-to-destination batch without pickups.',
  },
};

export const PRESET_META: Record<
  DistributionMode,
  {
    name: string;
    shortLabel: string;
    emoji: string;
    desc: string;
    hotspotIcon: string;
  }
> = {
  realistic: {
    name: 'Morning Rush',
    shortLabel: 'Morning',
    emoji: '🌅',
    desc: 'Morning Rush · 82% Up / 10% Down / 8% Inter-floor',
    hotspotIcon: '★',
  },
  lunch: {
    name: 'Lunch Crunch',
    shortLabel: 'Lunch',
    emoji: '🥪',
    desc: 'Lunch Crunch · 42% Up / 42% Down / 16% Inter-floor (Heavy Cafeteria)',
    hotspotIcon: '★',
  },
  downpeak: {
    name: '5 PM Exodus',
    shortLabel: '5 PM',
    emoji: '🌆',
    desc: '5 PM Exodus · 84% Down to Lobby / 10% Up / 6% Inter-floor',
    hotspotIcon: '★',
  },
  vip: {
    name: 'Sky Bar / VIP',
    shortLabel: 'Sky Bar',
    emoji: '🥂',
    desc: 'Sky Bar · Heavy Top-Floor Express & Penthouse Shuttle',
    hotspotIcon: '♛',
  },
  uniform: {
    name: 'Uniform Up-Peak',
    shortLabel: 'Uniform',
    emoji: '📐',
    desc: 'Uniform Up-Peak · 100% Up from Lobby (Equal Floor Weights)',
    hotspotIcon: '',
  },
};

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getDestinationColor(destFloor: number, totalFloors: number): DestinationColor {
  if (destFloor === 1) {
    return { fill: '#818cf8', stroke: '#ffffff', isLobby: true };
  }
  const ratio = totalFloors <= 2 ? 0.5 : (destFloor - 2) / (totalFloors - 2);
  const hue = Math.round(205 - ratio * 201);
  return {
    fill: `hsl(${hue}, 86%, 56%)`,
    stroke: `hsl(${hue}, 86%, 82%)`,
    isLobby: false,
  };
}

export function computeSectorBands(
  floors: number,
  carCount: number
): Array<{ min: number; max: number }> {
  const bands: Array<{ min: number; max: number }> = [];
  const upperCount = Math.max(1, floors - 1);
  for (let i = 0; i < carCount; i++) {
    const rawMin = 2 + Math.floor((i * upperCount) / carCount);
    const rawMax = 2 + Math.floor(((i + 1) * upperCount) / carCount) - 1;
    const min = Math.min(floors, rawMin);
    const max = Math.min(floors, Math.max(min, rawMax));
    bands.push({ min, max });
  }
  return bands;
}

export function computeFloorWeights(floors: number, mode: DistributionMode) {
  const weights = new Array<number>(floors + 1).fill(0);
  const cafeteriaFloor = Math.max(3, Math.floor(floors * 0.55));
  const anchorLow = Math.max(3, Math.floor(floors * 0.35));
  const anchorHigh = Math.min(floors - 1, anchorLow + 1);
  let hotspotFloor = cafeteriaFloor;

  for (let f = 2; f <= floors; f++) {
    if (mode === 'uniform') {
      weights[f] = 1.0;
      hotspotFloor = -1;
    } else if (mode === 'lunch') {
      let w = 0.9;
      if (f === 2) w = 0.4;
      else if (f === cafeteriaFloor) w = 3.5;
      else if (f === anchorLow || f === anchorHigh) w = 1.3;
      else if (f === floors) w = 1.1;
      weights[f] = w;
      hotspotFloor = cafeteriaFloor;
    } else if (mode === 'downpeak') {
      let w = 1.05;
      if (f === 2) w = 0.5;
      else if (f === cafeteriaFloor) w = 1.65;
      else if (f === anchorLow || f === anchorHigh) w = 1.5;
      else if (f === floors) w = 1.35;
      weights[f] = w;
      hotspotFloor = cafeteriaFloor;
    } else if (mode === 'vip') {
      let w = 0.65;
      if (f === 2) w = 0.3;
      else if (f === floors) w = 3.8;
      else if (f === floors - 1) w = 2.2;
      else if (f === cafeteriaFloor) w = 1.15;
      weights[f] = w;
      hotspotFloor = floors;
    } else {
      let w = 1.0;
      if (f === 2) w = 0.45;
      else if (f === cafeteriaFloor) w = 2.2;
      else if (f === anchorLow || f === anchorHigh) w = 1.45;
      else if (f === floors) w = 1.35;
      else if (f > Math.floor(floors * 0.7)) w = 0.85;
      weights[f] = w;
      hotspotFloor = cafeteriaFloor;
    }
  }

  return { weights, cafeteriaFloor, anchorLow, anchorHigh, hotspotFloor };
}

function pickWeightedFloor(rng: () => number, weights: number[], excludeFloor = -1): number {
  let total = 0;
  for (let f = 2; f < weights.length; f++) {
    if (f !== excludeFloor) total += weights[f];
  }
  let r = rng() * total;
  for (let f = 2; f < weights.length; f++) {
    if (f === excludeFloor) continue;
    r -= weights[f];
    if (r <= 0) return f;
  }
  return weights.length - 1;
}

export function isCarUnderFireAlarm(car: ElevatorCar): boolean {
  return car.state === 'FIRE_RECALL' || car.state === 'FIRE_LOCKED';
}

function createBuildingWorld(
  side: TowerSide,
  algorithm: DispatchAlgorithm,
  cfg: SimConfig
): BuildingWorld {
  const sectorBands = computeSectorBands(cfg.floors, cfg.cars);
  const cars: ElevatorCar[] = [];
  for (let i = 0; i < cfg.cars; i++) {
    const band = sectorBands[i];
    cars.push({
      id: i,
      floor: 1,
      direction: 0,
      state: 'IDLE',
      dwellTimer: 0,
      dwellDuration: 0,
      departing: false,
      departFloor: -1,
      homing: false,
      inTrip: false,
      tripPeakLoad: 0,
      passengers: [],
      targetFloors: [],
      totalStops: 0,
      trips: 0,
      sectorMin: band.min,
      sectorMax: band.max,
      batchHoldUsed: 0,
    });
  }

  const waitingQueues: Passenger[][] = Array.from({ length: cfg.floors + 1 }, () => []);

  return {
    side,
    algorithm,
    cars,
    waitingQueues,
    completed: {
      count: 0,
      waitSum: 0,
      travelSum: 0,
      stopSum: 0,
    },
    completionTimes: [],
    ttdSamples: [],
    waitSamples: [],
    totalDistanceFloors: 0,
    totalMotorStarts: 0,
    totalBoardedOnTrips: 0,
    evacuatedCount: 0,
    maxQueue: 0,
    queueHistory: [],
    lastHistorySample: -1,
    deliveryEffects: [],
  };
}

function recordTripBoarding(world: BuildingWorld, car: ElevatorCar) {
  if (car.passengers.length === 0) return;
  if (!car.inTrip) {
    car.inTrip = true;
    car.trips++;
    car.tripPeakLoad = car.passengers.length;
    world.totalBoardedOnTrips += car.passengers.length;
  } else if (car.passengers.length > car.tripPeakLoad) {
    world.totalBoardedOnTrips += car.passengers.length - car.tripPeakLoad;
    car.tripPeakLoad = car.passengers.length;
  }
}

function recordPassengerDelivery(sim: SimState, world: BuildingWorld, p: Passenger) {
  const waitTime = (p.boardTime ?? sim.simTime) - p.spawnTime;
  const directTravel = Math.abs(p.dest - p.origin) / CRUISE_SPEED;
  const totalDuration = sim.simTime - p.spawnTime;
  const stopTime = Math.max(0, totalDuration - waitTime - directTravel);

  world.completed.count++;
  world.completed.waitSum += waitTime;
  world.completed.travelSum += directTravel;
  world.completed.stopSum += stopTime;
  world.completionTimes.push(sim.simTime);

  world.ttdSamples.push(totalDuration);
  if (world.ttdSamples.length > 250) world.ttdSamples.shift();
  world.waitSamples.push(waitTime);
  if (world.waitSamples.length > 250) world.waitSamples.shift();
}

function addDeliveryEffect(
  world: BuildingWorld,
  carId: number,
  floor: number,
  count: number,
  labelPrefix = '✓'
) {
  if (count <= 0) return;
  world.deliveryEffects.push({
    carId,
    floor,
    count,
    labelPrefix,
    born: nowMs(),
    duration: labelPrefix === 'EVAC ' ? 1200 : 900,
  });
  if (world.deliveryEffects.length > 28) world.deliveryEffects.shift();
}

export function countTotalWaiting(world: BuildingWorld): number {
  let sum = 0;
  for (let f = 1; f < world.waitingQueues.length; f++) {
    sum += world.waitingQueues[f].length;
  }
  return sum;
}

export function createSimulation(cfg: SimConfig, seed: number, warmUpSeconds = 75): SimState {
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

function evacuateCarAtLobby(world: BuildingWorld, car: ElevatorCar) {
  car.floor = 1;
  car.direction = 0;
  car.state = 'FIRE_LOCKED';
  car.dwellTimer = 0;
  car.dwellDuration = 0;
  car.departing = false;
  car.departFloor = -1;
  car.homing = false;
  car.inTrip = false;
  car.tripPeakLoad = 0;
  car.batchHoldUsed = 0;
  car.targetFloors = [];

  if (car.passengers.length > 0) {
    const evacCount = car.passengers.length;
    world.evacuatedCount += evacCount;
    car.passengers = [];
    addDeliveryEffect(world, car.id, 1, evacCount, 'EVAC ');
  }
}

function stepFireRecallCar(world: BuildingWorld, car: ElevatorCar, dt: number) {
  if (car.state === 'FIRE_LOCKED') {
    car.floor = 1;
    car.direction = 0;
    car.targetFloors = [];
    return;
  }

  car.targetFloors = [1];
  if (car.floor <= 1.02) {
    evacuateCarAtLobby(world, car);
    return;
  }

  car.direction = -1;
  const stepDist = CRUISE_SPEED * dt;
  const travel = Math.min(stepDist, car.floor - 1);
  world.totalDistanceFloors += travel;
  car.floor -= travel;

  if (car.floor <= 1.02) {
    evacuateCarAtLobby(world, car);
  }
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

function generatePassengerSpec(sim: SimState, cfg: SimConfig, forcedOrigin: number | null = null) {
  const rng = sim.rng;
  const floors = cfg.floors;
  const mode = cfg.distributionMode;
  let origin = 1;
  let dest = 2;

  if (forcedOrigin !== null) {
    origin = Math.max(1, Math.min(floors, forcedOrigin));
    if (origin === 1) {
      dest =
        mode === 'uniform'
          ? 2 + Math.floor(rng() * (floors - 1))
          : pickWeightedFloor(rng, sim.floorWeights);
    } else {
      dest = rng() < 0.72 ? 1 : pickWeightedFloor(rng, sim.floorWeights, origin);
    }
  } else if (mode === 'uniform') {
    origin = 1;
    dest = 2 + Math.floor(rng() * (floors - 1));
  } else if (mode === 'lunch') {
    const roll = rng();
    if (roll < 0.42) {
      origin = 1;
      dest = pickWeightedFloor(rng, sim.floorWeights);
    } else if (roll < 0.84) {
      origin = pickWeightedFloor(rng, sim.floorWeights);
      dest = 1;
    } else {
      if (rng() < 0.5) {
        origin = pickWeightedFloor(rng, sim.floorWeights, sim.cafeteriaFloor);
        dest = sim.cafeteriaFloor;
      } else {
        origin = sim.cafeteriaFloor;
        dest = pickWeightedFloor(rng, sim.floorWeights, sim.cafeteriaFloor);
      }
    }
  } else if (mode === 'downpeak') {
    const roll = rng();
    if (roll < 0.84) {
      origin = pickWeightedFloor(rng, sim.floorWeights);
      dest = 1;
    } else if (roll < 0.94) {
      origin = 1;
      dest = pickWeightedFloor(rng, sim.floorWeights);
    } else {
      origin = pickWeightedFloor(rng, sim.floorWeights);
      dest = pickWeightedFloor(rng, sim.floorWeights, origin);
    }
  } else if (mode === 'vip') {
    const roll = rng();
    if (roll < 0.74) {
      origin = 1;
      dest = pickWeightedFloor(rng, sim.floorWeights);
    } else if (roll < 0.92) {
      origin = pickWeightedFloor(rng, sim.floorWeights);
      dest = 1;
    } else {
      origin = pickWeightedFloor(rng, sim.floorWeights);
      dest =
        origin !== floors && rng() < 0.65
          ? floors
          : pickWeightedFloor(rng, sim.floorWeights, origin);
    }
  } else {
    const roll = rng();
    if (roll < 0.82) {
      origin = 1;
      dest = pickWeightedFloor(rng, sim.floorWeights);
    } else if (roll < 0.92) {
      origin = pickWeightedFloor(rng, sim.floorWeights);
      dest = 1;
    } else {
      origin = pickWeightedFloor(rng, sim.floorWeights);
      if (origin !== sim.cafeteriaFloor && rng() < 0.55) {
        dest = sim.cafeteriaFloor;
      } else {
        dest = pickWeightedFloor(rng, sim.floorWeights, origin);
      }
    }
  }

  const id = sim.nextPassengerId++;
  const color = getDestinationColor(dest, floors);
  const dir: 1 | -1 = dest > origin ? 1 : -1;

  return {
    id,
    spawnTime: sim.simTime,
    origin,
    dest,
    dir,
    color,
  };
}

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

function getAssignedPassengersForCar(world: BuildingWorld, carId: number): Passenger[] {
  const assigned: Passenger[] = [];
  for (let f = 1; f < world.waitingQueues.length; f++) {
    const q = world.waitingQueues[f];
    for (let i = 0; i < q.length; i++) {
      if (q[i].assignedCarId === carId) {
        assigned.push(q[i]);
      }
    }
  }
  return assigned;
}

function isCarAtFloorReady(world: BuildingWorld, carId: number | null, floor: number): boolean {
  if (carId === null || carId === undefined) return false;
  const c = world.cars[carId];
  if (!c || isCarUnderFireAlarm(c) || c.departing) return false;
  return (
    Math.abs(c.floor - floor) < 0.08 &&
    (c.state === 'DWELLING' || c.state === 'IDLE')
  );
}

function estimateCarEtaToFloor(
  cfg: SimConfig,
  car: ElevatorCar,
  targetFloor: number,
  targetDir: 1 | -1
): number {
  if (!car || isCarUnderFireAlarm(car)) return 999;
  const stopPenalty = cfg.stopPenalty;
  const atFloorNow = Math.abs(car.floor - targetFloor) < 0.08 && !car.departing;

  if (car.state === 'IDLE') {
    return Math.abs(car.floor - targetFloor) / CRUISE_SPEED;
  }

  if (car.state === 'DWELLING') {
    const dirConflict =
      car.passengers.length > 0 &&
      car.direction !== 0 &&
      car.direction !== targetDir;

    if (atFloorNow && !dirConflict) {
      return 0;
    }

    if (car.passengers.length > 0 && car.direction !== 0) {
      const stopSet = new Set<number>();
      let extremeFloor = car.floor;
      for (const p of car.passengers) {
        stopSet.add(p.dest);
        if (car.direction === 1 && p.dest > extremeFloor) extremeFloor = p.dest;
        if (car.direction === -1 && p.dest < extremeFloor) extremeFloor = p.dest;
      }
      const alignedEnRoute =
        !dirConflict &&
        ((car.direction === 1 && targetFloor > car.floor && targetFloor <= extremeFloor) ||
          (car.direction === -1 && targetFloor < car.floor && targetFloor >= extremeFloor));

      if (alignedEnRoute) {
        let stopsBefore = 0;
        for (const s of stopSet) {
          if (
            (car.direction === 1 && s > car.floor && s < targetFloor) ||
            (car.direction === -1 && s < car.floor && s > targetFloor)
          ) {
            stopsBefore++;
          }
        }
        return (
          car.dwellTimer +
          Math.abs(targetFloor - car.floor) / CRUISE_SPEED +
          stopsBefore * stopPenalty
        );
      }

      return (
        car.dwellTimer +
        (Math.abs(extremeFloor - car.floor) + Math.abs(extremeFloor - targetFloor)) /
          CRUISE_SPEED +
        stopSet.size * stopPenalty
      );
    }

    return car.dwellTimer + Math.abs(car.floor - targetFloor) / CRUISE_SPEED;
  }

  const stopSet = new Set<number>();
  let extremeFloor = car.floor;
  for (const p of car.passengers) {
    stopSet.add(p.dest);
    if (car.direction === 1 && p.dest > extremeFloor) extremeFloor = p.dest;
    if (car.direction === -1 && p.dest < extremeFloor) extremeFloor = p.dest;
  }

  const movingToward =
    (car.direction === 1 && targetFloor >= car.floor - 0.05) ||
    (car.direction === -1 && targetFloor <= car.floor + 0.05);
  const dirCompatible =
    car.passengers.length === 0 ||
    car.direction === 0 ||
    car.direction === targetDir;

  if (movingToward && dirCompatible) {
    let stopsBefore = 0;
    for (const s of stopSet) {
      if (
        (car.direction === 1 && s > car.floor && s < targetFloor) ||
        (car.direction === -1 && s < car.floor && s > targetFloor)
      ) {
        stopsBefore++;
      }
    }
    return (
      Math.abs(targetFloor - car.floor) / CRUISE_SPEED +
      stopsBefore * stopPenalty
    );
  }

  return (
    (Math.abs(extremeFloor - car.floor) + Math.abs(extremeFloor - targetFloor)) /
      CRUISE_SPEED +
    stopSet.size * stopPenalty
  );
}

// --- Destination Dispatch & Eco Batching Cost Assigner ---
function assignPassengerDestinationDispatch(
  _sim: SimState,
  cfg: SimConfig,
  world: BuildingWorld,
  pax: Passenger,
  ecoMode: boolean
) {
  const cars = world.cars;
  const cap = cfg.carCapacity;
  const stopPenalty = cfg.stopPenalty;

  const healthyCars = cars.filter((c) => !isCarUnderFireAlarm(c));
  if (healthyCars.length === 0) {
    pax.assignedCarId = null;
    return;
  }

  const estCycleTime =
    (2 * Math.max(4, cfg.floors * 0.65)) / CRUISE_SPEED + 3.2 * stopPenalty;

  const totalWaiting = countTotalWaiting(world);
  const fleetCap = Math.max(1, healthyCars.length * cap);
  const trafficLoad = Math.min(1, Math.max(totalWaiting / (fleetCap * 0.6), cfg.arrivalRate / 55));

  let bestCar = healthyCars[0];
  let bestCost = Infinity;

  for (let i = 0; i < healthyCars.length; i++) {
    const car = healthyCars[i];
    const waitingAssigned = getAssignedPassengersForCar(world, car.id);

    const atOriginReady =
      Math.abs(car.floor - pax.origin) < 0.08 &&
      !car.departing &&
      (car.state === 'DWELLING' || car.state === 'IDLE') &&
      (car.passengers.length === 0 || car.direction === 0 || car.direction === pax.dir);

    const sameOriginSameDir: Passenger[] = [];
    for (let k = 0; k < waitingAssigned.length; k++) {
      const w = waitingAssigned[k];
      if (w.origin === pax.origin && w.dir === pax.dir) {
        sameOriginSameDir.push(w);
      }
    }

    let etaOrigin = estimateCarEtaToFloor(cfg, car, pax.origin, pax.dir);

    if (car.departing && Math.abs(car.floor - pax.origin) < 0.15) {
      etaOrigin = Math.max(etaOrigin, estCycleTime * 0.85);
    }

    let tripHeadcount = 0;
    if (atOriginReady) {
      tripHeadcount = car.passengers.length + sameOriginSameDir.length;
    } else if (pax.origin === 1) {
      tripHeadcount = sameOriginSameDir.length;
    } else {
      const alignedOnboard = car.direction === pax.dir ? car.passengers.length : 0;
      tripHeadcount = alignedOnboard + sameOriginSameDir.length;
    }

    const wave = Math.floor(tripHeadcount / cap);
    if (wave > 0) {
      etaOrigin += wave * estCycleTime;
    }

    const batchDests: number[] = [];
    const plannedStops = new Set<number>();

    if (wave === 0) {
      if (atOriginReady) {
        for (const p of car.passengers) {
          batchDests.push(p.dest);
          plannedStops.add(p.dest);
        }
      } else if (pax.origin > 1 && car.direction === pax.dir) {
        for (const p of car.passengers) {
          batchDests.push(p.dest);
          plannedStops.add(p.dest);
        }
      }
      for (const p of sameOriginSameDir) {
        batchDests.push(p.dest);
        plannedStops.add(p.dest);
      }
    }

    const directRide = Math.abs(pax.dest - pax.origin) / CRUISE_SPEED;
    const minF = Math.min(pax.origin, pax.dest);
    const maxF = Math.max(pax.origin, pax.dest);

    let intermediateStops = 0;
    for (const s of plannedStops) {
      if (s > minF && s < maxF) intermediateStops++;
    }

    const addsStop = !plannedStops.has(pax.dest) ? 1 : 0;

    let delayedExistingRiders = 0;
    if (addsStop) {
      for (let b = 0; b < batchDests.length; b++) {
        const d = batchDests[b];
        if ((pax.dir === 1 && d > pax.dest) || (pax.dir === -1 && d < pax.dest)) {
          delayedExistingRiders++;
        }
      }
    }

    const sdfWeight = 0.78 - 0.35 * trafficLoad;
    const trueSDF = delayedExistingRiders * stopPenalty * sdfWeight;

    let bandPenalty = 0;
    let clusterBonus = 0;

    if (pax.dir === 1 && batchDests.length > 0) {
      let minD = Infinity;
      let maxD = -Infinity;
      for (let b = 0; b < batchDests.length; b++) {
        const d = batchDests[b];
        if (d < minD) minD = d;
        if (d > maxD) maxD = d;
      }
      const oldSpan = maxD - minD;
      const newSpan = Math.max(maxD, pax.dest) - Math.min(minD, pax.dest);
      const spanDelta = newSpan - oldSpan;

      bandPenalty = spanDelta * (1.25 - 0.4 * trafficLoad);

      if (!addsStop) {
        clusterBonus = ecoMode ? -5.0 : -3.6;
      } else if (pax.dest > minD && pax.dest < maxD) {
        clusterBonus = ecoMode ? -2.2 : -1.2;
      }
    } else if (!addsStop && batchDests.length > 0) {
      clusterBonus = ecoMode ? -3.8 : -2.5;
    }

    const cycleExtensionCost = addsStop * stopPenalty * 0.32;
    const futureUncertainty =
      !atOriginReady && batchDests.length === 0 ? stopPenalty * 0.45 * trafficLoad : 0;

    let detourPenalty = 0;
    if (pax.origin > 1 && pax.dir === 1 && car.homing && world.waitingQueues[1].length > 0) {
      detourPenalty = 14.0;
    }

    // Eco mode conserves motor starts & empty shaft repositioning
    let ecoPenalty = 0;
    if (ecoMode) {
      const deadheadFloors = Math.abs(car.floor - pax.origin);
      ecoPenalty += deadheadFloors * 0.75;
      if (car.state === 'IDLE' && !atOriginReady && batchDests.length === 0) {
        ecoPenalty += 4.2;
      }
      if (atOriginReady && car.passengers.length > 0 && car.passengers.length < cap) {
        ecoPenalty -= 3.5;
      }
    }

    const totalCost =
      etaOrigin +
      directRide +
      intermediateStops * stopPenalty +
      trueSDF +
      bandPenalty +
      clusterBonus +
      cycleExtensionCost +
      futureUncertainty +
      detourPenalty +
      ecoPenalty;

    if (totalCost < bestCost) {
      bestCost = totalCost;
      bestCar = car;
    }
  }

  pax.assignedCarId = bestCar.id;
}

// --- Nearest Car (ETA Hall Call) Assigner ---
function assignPassengerNearestCar(
  cfg: SimConfig,
  world: BuildingWorld,
  pax: Passenger,
  excludeCarId = -1
) {
  const healthyCars = world.cars.filter(
    (c) => !isCarUnderFireAlarm(c) && c.id !== excludeCarId
  );
  const pool =
    healthyCars.length > 0
      ? healthyCars
      : world.cars.filter((c) => !isCarUnderFireAlarm(c));

  if (pool.length === 0) {
    pax.assignedCarId = null;
    return;
  }

  const cap = cfg.carCapacity;
  let bestCar = pool[0];
  let bestScore = Infinity;

  for (let i = 0; i < pool.length; i++) {
    const car = pool[i];
    const assigned = getAssignedPassengersForCar(world, car.id);
    let assignedSameCall = 0;
    let totalAssigned = assigned.length;
    for (let k = 0; k < assigned.length; k++) {
      if (assigned[k].origin === pax.origin && assigned[k].dir === pax.dir) {
        assignedSameCall++;
      }
    }

    const eta = estimateCarEtaToFloor(cfg, car, pax.origin, pax.dir);
    const projectedLoad =
      (car.direction === 0 || car.direction === pax.dir ? car.passengers.length : 0) +
      assignedSameCall;

    const fullPenalty = projectedLoad >= cap ? 24 + (projectedLoad - cap) * 6 : 0;
    const loadPenalty = (car.passengers.length + totalAssigned) * 1.1;
    // Slight preference to consolidate hall calls at the same floor onto the same approaching car if it has room
    const sameCallBonus = assignedSameCall > 0 && projectedLoad < cap ? -2.2 : 0;

    const score = eta + loadPenalty + fullPenalty + sameCallBonus;
    if (score < bestScore) {
      bestScore = score;
      bestCar = car;
    }
  }

  pax.assignedCarId = bestCar.id;
}

// --- Static Zoning (Sectoring) Assigner ---
function assignPassengerSector(world: BuildingWorld, pax: Passenger) {
  const healthyCars = world.cars.filter((c) => !isCarUnderFireAlarm(c));
  if (healthyCars.length === 0) {
    pax.assignedCarId = null;
    return;
  }

  // Lobby up-calls route by destination sector; upper-floor calls route by origin sector
  const keyFloor = pax.origin === 1 ? pax.dest : pax.origin;
  let matchedCar: ElevatorCar | null = null;

  for (let i = 0; i < healthyCars.length; i++) {
    const car = healthyCars[i];
    const min = car.sectorMin ?? 2;
    const max = car.sectorMax ?? 2;
    if (keyFloor >= min && keyFloor <= max) {
      matchedCar = car;
      break;
    }
  }

  if (!matchedCar) {
    // Fallback to nearest sector center
    let minDiff = Infinity;
    for (let i = 0; i < healthyCars.length; i++) {
      const car = healthyCars[i];
      const mid = ((car.sectorMin ?? 2) + (car.sectorMax ?? 2)) * 0.5;
      const diff = Math.abs(keyFloor - mid);
      if (diff < minDiff) {
        minDiff = diff;
        matchedCar = car;
      }
    }
  }

  pax.assignedCarId = matchedCar ? matchedCar.id : healthyCars[0].id;
}

// --- Main Twin Simulation Step ---
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

function stepWorldByAlgorithm(sim: SimState, cfg: SimConfig, world: BuildingWorld, dt: number) {
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

// =========================================================================
// 1. Standard Collective SCAN Controller
// =========================================================================
function stepStandardWorld(sim: SimState, cfg: SimConfig, world: BuildingWorld, dt: number) {
  const cars = world.cars;
  const cap = cfg.carCapacity;
  const stopPenalty = cfg.stopPenalty;

  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    if (isCarUnderFireAlarm(car)) {
      stepFireRecallCar(world, car, dt);
      continue;
    }

    if (car.state === 'DWELLING') {
      const curFloor = Math.round(car.floor);

      if (car.passengers.length < cap && world.waitingQueues[curFloor].length > 0) {
        if (car.direction === 0) {
          car.direction = world.waitingQueues[curFloor][0].dir;
        }
        const q = world.waitingQueues[curFloor];
        let extraBoarded = 0;
        for (let k = 0; k < q.length && car.passengers.length < cap; ) {
          if (q[k].dir === car.direction) {
            const boarded = q.splice(k, 1)[0];
            boarded.boardTime = sim.simTime;
            car.passengers.push(boarded);
            extraBoarded++;
          } else {
            k++;
          }
        }
        if (extraBoarded > 0) {
          recordTripBoarding(world, car);
          car.dwellTimer = Math.max(car.dwellTimer, extraBoarded * 0.35);
        }
      }

      car.dwellTimer -= dt;
      if (car.dwellTimer <= 0) {
        car.dwellTimer = 0;
        const nextFloor = pickNextStandardFloor(cfg, world, car);
        if (nextFloor !== null && nextFloor !== Math.round(car.floor)) {
          car.direction = nextFloor > car.floor ? 1 : -1;
          car.state = 'MOVING';
          world.totalMotorStarts++;
          car.targetFloors = [nextFloor];
        } else {
          car.direction = 0;
          car.state = 'IDLE';
          car.targetFloors = [];
        }
      }
      continue;
    }

    if (car.state === 'IDLE') {
      const nextFloor = pickNextStandardFloor(cfg, world, car);
      if (nextFloor !== null) {
        if (Math.abs(nextFloor - car.floor) < 0.05) {
          car.floor = nextFloor;
          beginStandardStop(sim, cfg, world, car, nextFloor, stopPenalty);
        } else {
          car.direction = nextFloor > car.floor ? 1 : -1;
          car.state = 'MOVING';
          world.totalMotorStarts++;
          car.targetFloors = [nextFloor];
        }
      }
      continue;
    }

    if (car.state === 'MOVING') {
      const nextFloor = pickNextStandardFloor(cfg, world, car);
      if (nextFloor === null) {
        car.state = 'IDLE';
        car.direction = 0;
        car.targetFloors = [];
        continue;
      }

      car.targetFloors = [nextFloor];
      const delta = nextFloor - car.floor;
      if (Math.abs(delta) < 0.02) {
        car.floor = nextFloor;
        beginStandardStop(sim, cfg, world, car, nextFloor, stopPenalty);
        continue;
      }

      car.direction = delta > 0 ? 1 : -1;
      const stepDist = CRUISE_SPEED * dt;
      if (Math.abs(delta) <= stepDist) {
        world.totalDistanceFloors += Math.abs(delta);
        car.floor = nextFloor;
        beginStandardStop(sim, cfg, world, car, nextFloor, stopPenalty);
      } else {
        world.totalDistanceFloors += stepDist;
        car.floor += car.direction * stepDist;
      }
    }
  }
}

function pickNextStandardFloor(cfg: SimConfig, world: BuildingWorld, car: ElevatorCar): number | null {
  const floors = cfg.floors;
  const cap = cfg.carCapacity;
  const upBound = Math.ceil(car.floor - 0.02);
  const downBound = Math.floor(car.floor + 0.02);

  const stopSet = new Set<number>();
  for (const p of car.passengers) {
    stopSet.add(p.dest);
  }

  if (car.passengers.length < cap) {
    for (let f = 1; f <= floors; f++) {
      const q = world.waitingQueues[f];
      if (q.length === 0) continue;

      if (car.direction === 1 && f >= upBound && q.some((p) => p.dir === 1)) {
        stopSet.add(f);
      } else if (car.direction === -1 && f <= downBound && q.some((p) => p.dir === -1)) {
        stopSet.add(f);
      } else if (car.direction === 0) {
        let betterIdleExists = false;
        const myDist = Math.abs(car.floor - f);
        for (const other of world.cars) {
          if (other.id !== car.id && other.state === 'IDLE') {
            const otherDist = Math.abs(other.floor - f);
            if (otherDist < myDist - 0.1 || (Math.abs(otherDist - myDist) <= 0.1 && other.id < car.id)) {
              betterIdleExists = true;
              break;
            }
          }
        }
        if (!betterIdleExists) {
          stopSet.add(f);
        }
      }
    }
  }

  if (stopSet.size === 0 && car.direction !== 0) {
    for (let f = 1; f <= floors; f++) {
      if (world.waitingQueues[f].length > 0) {
        stopSet.add(f);
      }
    }
  }

  if (stopSet.size === 0) return null;

  if (car.direction === 1) {
    let bestUp = Infinity;
    for (const f of stopSet) {
      if (f >= upBound && f < bestUp) bestUp = f;
    }
    if (bestUp !== Infinity) return bestUp;

    let highestDown = -Infinity;
    for (const f of stopSet) {
      if (f > highestDown) highestDown = f;
    }
    return highestDown !== -Infinity ? highestDown : null;
  }

  if (car.direction === -1) {
    let bestDown = -Infinity;
    for (const f of stopSet) {
      if (f <= downBound && f > bestDown) bestDown = f;
    }
    if (bestDown !== -Infinity) return bestDown;

    let lowestUp = Infinity;
    for (const f of stopSet) {
      if (f < lowestUp) lowestUp = f;
    }
    return lowestUp !== Infinity ? lowestUp : null;
  }

  let nearest: number | null = null;
  let minDist = Infinity;
  for (const f of stopSet) {
    const d = Math.abs(f - car.floor);
    if (d < minDist) {
      minDist = d;
      nearest = f;
    }
  }
  return nearest;
}

function beginStandardStop(
  sim: SimState,
  cfg: SimConfig,
  world: BuildingWorld,
  car: ElevatorCar,
  floor: number,
  stopPenalty: number
) {
  let transfers = 0;
  let alighted = 0;

  for (let i = car.passengers.length - 1; i >= 0; i--) {
    const p = car.passengers[i];
    if (p.dest === floor) {
      car.passengers.splice(i, 1);
      transfers++;
      alighted++;
      recordPassengerDelivery(sim, world, p);
    }
  }

  if (alighted > 0) {
    addDeliveryEffect(world, car.id, floor, alighted);
  }

  if (car.passengers.length === 0) {
    car.inTrip = false;
    car.tripPeakLoad = 0;

    const q = world.waitingQueues[floor];
    if (q.length > 0) {
      const hasSameDir = car.direction !== 0 && q.some((p) => p.dir === car.direction);
      if (!hasSameDir) {
        car.direction = q[0].dir;
      }
    } else {
      let aboveCalls = false;
      let belowCalls = false;
      for (let f = floor + 1; f <= cfg.floors; f++) {
        if (world.waitingQueues[f].length > 0) aboveCalls = true;
      }
      for (let f = 1; f < floor; f++) {
        if (world.waitingQueues[f].length > 0) belowCalls = true;
      }
      if (car.direction === 1 && !aboveCalls && belowCalls) car.direction = -1;
      else if (car.direction === -1 && !belowCalls && aboveCalls) car.direction = 1;
      else if (!aboveCalls && !belowCalls) car.direction = 0;
    }
  }

  const q = world.waitingQueues[floor];
  const cap = cfg.carCapacity;
  for (let i = 0; i < q.length && car.passengers.length < cap; ) {
    if (car.direction === 0 || q[i].dir === car.direction) {
      const boarded = q.splice(i, 1)[0];
      if (car.direction === 0) car.direction = boarded.dir;
      boarded.boardTime = sim.simTime;
      car.passengers.push(boarded);
      transfers++;
    } else {
      i++;
    }
  }

  if (car.passengers.length > 0) {
    recordTripBoarding(world, car);
  }

  if (transfers > 0 || car.passengers.length > 0) {
    car.totalStops++;
  }

  const dwell = stopPenalty + transfers * 0.35;
  car.dwellDuration = dwell;
  car.dwellTimer = dwell;
  car.state = 'DWELLING';
}

// =========================================================================
// 2 & 3. Destination Dispatch & Eco Batching Controllers
// =========================================================================
function pullClusterBatchAtLobby(
  sim: SimState,
  cfg: SimConfig,
  world: BuildingWorld,
  car: ElevatorCar
): number {
  const cap = cfg.carCapacity;
  if (car.passengers.length >= cap) return 0;

  const lobbyQ = world.waitingQueues[1];
  if (lobbyQ.length === 0) return 0;

  const isEligible = (p: Passenger) =>
    p.assignedCarId === car.id || !isCarAtFloorReady(world, p.assignedCarId, 1);

  let otherReadyLobbyCars = 0;
  for (let i = 0; i < world.cars.length; i++) {
    const other = world.cars[i];
    if (other.id !== car.id && isCarAtFloorReady(world, other.id, 1)) {
      otherReadyLobbyCars++;
    }
  }

  let boardedCount = 0;

  if (car.passengers.length === 0) {
    let seedIdx = -1;
    for (let i = 0; i < lobbyQ.length; i++) {
      if (isEligible(lobbyQ[i])) {
        seedIdx = i;
        break;
      }
    }
    if (seedIdx === -1) return 0;

    const seed = lobbyQ.splice(seedIdx, 1)[0];
    seed.assignedCarId = car.id;
    seed.boardTime = sim.simTime;
    car.direction = seed.dir;
    car.passengers.push(seed);
    boardedCount++;
  }

  const healthyCount = Math.max(
    1,
    world.cars.filter((c) => !isCarUnderFireAlarm(c)).length
  );
  const baseZoneSpan = Math.max(2, Math.ceil((cfg.floors - 1) / healthyCount));
  const lobbyHeavy = lobbyQ.length >= cap;
  const maxSpan =
    otherReadyLobbyCars > 0 && !lobbyHeavy
      ? Math.max(2, baseZoneSpan - 1)
      : baseZoneSpan + 1;
  const maxUniqueStops =
    otherReadyLobbyCars > 0 && !lobbyHeavy
      ? Math.min(3, baseZoneSpan)
      : Math.min(4, baseZoneSpan + 1);

  while (car.passengers.length < cap) {
    let minD = Infinity;
    let maxD = -Infinity;
    const stopSet = new Set<number>();
    for (let i = 0; i < car.passengers.length; i++) {
      const d = car.passengers[i].dest;
      stopSet.add(d);
      if (d < minD) minD = d;
      if (d > maxD) maxD = d;
    }

    let bestIdx = -1;
    let bestScore = Infinity;

    for (let i = 0; i < lobbyQ.length; i++) {
      const p = lobbyQ[i];
      if (!isEligible(p) || p.dir !== car.direction) continue;

      const alreadyStop = stopSet.has(p.dest);
      const newMin = Math.min(minD, p.dest);
      const newMax = Math.max(maxD, p.dest);
      const newSpan = newMax - newMin;
      const newStops = stopSet.size + (alreadyStop ? 0 : 1);
      const waitAge = sim.simTime - p.spawnTime;

      if (!alreadyStop && waitAge < 18) {
        if (newSpan > maxSpan || newStops > maxUniqueStops) {
          continue;
        }
      }

      const distFromBand =
        p.dest < minD ? minD - p.dest : p.dest > maxD ? p.dest - maxD : 0;
      const score =
        (alreadyStop ? -22 : 0) +
        distFromBand * 4.5 +
        (newStops - stopSet.size) * 3.0 -
        Math.min(10, waitAge * 0.25);

      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break;

    const chosen = lobbyQ.splice(bestIdx, 1)[0];
    chosen.assignedCarId = car.id;
    chosen.boardTime = sim.simTime;
    car.passengers.push(chosen);
    boardedCount++;
  }

  return boardedCount;
}

function adoptDownwardEnRouteCalls(cfg: SimConfig, world: BuildingWorld, car: ElevatorCar) {
  const cap = cfg.carCapacity;
  let reserved = car.passengers.length;
  const topFloor = Math.min(cfg.floors, Math.floor(car.floor + 0.05));

  for (let f = topFloor; f >= 2; f--) {
    const q = world.waitingQueues[f];
    for (let i = 0; i < q.length; i++) {
      if (q[i].assignedCarId === car.id && q[i].dir === -1) reserved++;
    }
  }

  for (let f = topFloor; f >= 2 && reserved < cap; f--) {
    const q = world.waitingQueues[f];
    for (let i = 0; i < q.length && reserved < cap; i++) {
      const p = q[i];
      if (p.dir !== -1 || p.assignedCarId === car.id) continue;

      const assignedCar =
        p.assignedCarId !== null ? world.cars[p.assignedCarId] : null;
      const myEta = Math.abs(car.floor - f) / CRUISE_SPEED;
      const otherEta = assignedCar
        ? estimateCarEtaToFloor(cfg, assignedCar, f, -1)
        : Infinity;

      if (myEta + 2.0 < otherEta) {
        p.assignedCarId = car.id;
        reserved++;
      }
    }
  }
}

function pickNextDestinationFloor(
  cfg: SimConfig,
  world: BuildingWorld,
  car: ElevatorCar,
  assignedWaiting: Passenger[],
  ecoMode: boolean
): number | null {
  const cap = cfg.carCapacity;
  const upBound = Math.ceil(car.floor - 0.02);
  const downBound = Math.floor(car.floor + 0.02);

  const dropStops = new Set<number>();
  for (const p of car.passengers) {
    dropStops.add(p.dest);
  }

  const pickupStops = new Set<number>();
  if (!car.departing && car.passengers.length < cap) {
    for (const p of assignedWaiting) {
      if (car.departFloor !== -1 && p.origin === car.departFloor) continue;

      if (car.passengers.length > 0) {
        if (car.direction === 0 || p.dir === car.direction) {
          pickupStops.add(p.origin);
        }
      } else if (car.direction === -1) {
        if (p.origin === 1 || (p.dir === -1 && p.origin <= downBound)) {
          pickupStops.add(p.origin);
        }
      } else {
        pickupStops.add(p.origin);
      }
    }
  }

  if (car.passengers.length > 0) {
    const activeStops = new Set([...dropStops, ...pickupStops]);
    if (car.direction === 1) {
      let bestUp = Infinity;
      for (const f of activeStops) {
        if (f >= upBound && f < bestUp) bestUp = f;
      }
      if (bestUp !== Infinity) return bestUp;
    }
    if (car.direction === -1) {
      let bestDown = -Infinity;
      for (const f of activeStops) {
        if (f <= downBound && f > bestDown) bestDown = f;
      }
      if (bestDown !== -Infinity) return bestDown;
    }

    let nearestDrop: number | null = null;
    let minDist = Infinity;
    for (const f of dropStops) {
      const d = Math.abs(f - car.floor);
      if (d < minDist) {
        minDist = d;
        nearestDrop = f;
      }
    }
    return nearestDrop;
  }

  if (car.floor > 1.05 && (car.homing || car.direction === -1)) {
    let highestDownBelow = -Infinity;
    for (const p of assignedWaiting) {
      if (p.dir === -1 && p.origin <= downBound && p.origin > highestDownBelow) {
        highestDownBelow = p.origin;
      }
    }
    if (highestDownBelow !== -Infinity) return highestDownBelow;
    if (!ecoMode && (world.waitingQueues[1].length > 0 || car.homing)) return 1;
  }

  if (assignedWaiting.length > 0) {
    let oldest = assignedWaiting[0];
    for (let i = 1; i < assignedWaiting.length; i++) {
      if (assignedWaiting[i].spawnTime < oldest.spawnTime) {
        oldest = assignedWaiting[i];
      }
    }
    return oldest.origin;
  }

  // Eco mode parks idle cars in place instead of burning energy returning empty to Lobby
  if (
    !ecoMode &&
    car.floor > 1.05 &&
    (cfg.distributionMode !== 'downpeak' || world.waitingQueues[1].length > 0)
  ) {
    return 1;
  }

  return null;
}

function buildDestinationRoutePreview(car: ElevatorCar, assignedWaiting: Passenger[]): number[] {
  const stops = new Set<number>();
  for (const p of car.passengers) stops.add(p.dest);
  for (const p of assignedWaiting) {
    stops.add(p.origin);
    stops.add(p.dest);
  }
  return Array.from(stops).sort((a, b) => a - b);
}

function stepDestinationWorld(
  sim: SimState,
  cfg: SimConfig,
  world: BuildingWorld,
  dt: number,
  ecoMode: boolean
) {
  const cars = world.cars;
  const cap = cfg.carCapacity;
  const stopPenalty = cfg.stopPenalty;

  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    if (isCarUnderFireAlarm(car)) {
      stepFireRecallCar(world, car, dt);
      continue;
    }

    let assignedWaiting = getAssignedPassengersForCar(world, car.id);

    if (car.state === 'DWELLING') {
      const curFloor = Math.round(car.floor);
      const q = world.waitingQueues[curFloor];
      let extraBoarded = 0;

      if (!car.departing && car.passengers.length < cap) {
        for (let k = 0; k < q.length && car.passengers.length < cap; ) {
          const cand = q[k];
          const dirOk =
            car.passengers.length === 0 ||
            car.direction === 0 ||
            cand.dir === car.direction;
          if (cand.assignedCarId === car.id && dirOk) {
            const boarded = q.splice(k, 1)[0];
            if (car.direction === 0) car.direction = boarded.dir;
            boarded.boardTime = sim.simTime;
            car.passengers.push(boarded);
            extraBoarded++;
          } else {
            k++;
          }
        }

        if (curFloor === 1 && car.passengers.length < cap) {
          extraBoarded += pullClusterBatchAtLobby(sim, cfg, world, car);
        }
      }

      if (extraBoarded > 0) {
        recordTripBoarding(world, car);
        car.dwellTimer = Math.max(car.dwellTimer, extraBoarded * 0.35);
      }

      car.dwellTimer -= dt;

      // Eco Batching: briefly hold partially filled lobby cars to consolidate fuller, lower-Wh runs
      if (ecoMode && car.dwellTimer <= 0 && curFloor === 1 && car.passengers.length > 0) {
        const targetLoad = Math.min(cap, Math.max(3, Math.ceil(cap * 0.65)));
        let maxOnboardAge = 0;
        for (let pIdx = 0; pIdx < car.passengers.length; pIdx++) {
          const age = sim.simTime - car.passengers[pIdx].spawnTime;
          if (age > maxOnboardAge) maxOnboardAge = age;
        }
        const holdUsed = car.batchHoldUsed ?? 0;
        if (car.passengers.length < targetLoad && maxOnboardAge < 12 && holdUsed < 3.5) {
          car.batchHoldUsed = holdUsed + dt;
          car.dwellTimer = 0.01;
          continue;
        }
      }

      if (car.dwellTimer <= 0) {
        car.dwellTimer = 0;
        car.batchHoldUsed = 0;

        if (car.passengers.length > 0) {
          car.departing = true;
          car.departFloor = curFloor;
          car.homing = false;
        } else {
          car.departing = false;
          car.departFloor = -1;
        }

        if (
          car.passengers.length < cap &&
          curFloor > 1 &&
          (car.passengers.length === 0 || car.direction === -1)
        ) {
          adoptDownwardEnRouteCalls(cfg, world, car);
          assignedWaiting = getAssignedPassengersForCar(world, car.id);
        }

        const nextFloor = pickNextDestinationFloor(cfg, world, car, assignedWaiting, ecoMode);
        if (nextFloor !== null && nextFloor !== curFloor) {
          car.direction = nextFloor > car.floor ? 1 : -1;
          car.state = 'MOVING';
          world.totalMotorStarts++;
          car.targetFloors = buildDestinationRoutePreview(car, assignedWaiting);
        } else if (
          !ecoMode &&
          car.passengers.length === 0 &&
          curFloor > 1 &&
          (cfg.distributionMode !== 'downpeak' || world.waitingQueues[1].length > 0)
        ) {
          car.homing = true;
          car.direction = -1;
          car.state = 'MOVING';
          world.totalMotorStarts++;
          car.targetFloors = [1];
        } else {
          car.direction = 0;
          car.state = 'IDLE';
          car.departing = false;
          car.departFloor = -1;
          car.targetFloors = [];
        }
      }
      continue;
    }

    if (car.state === 'IDLE') {
      if (Math.abs(car.floor - 1) < 0.05 && world.waitingQueues[1].length > 0) {
        const hasUnservedLobby = world.waitingQueues[1].some(
          (p) => p.assignedCarId === car.id || !isCarAtFloorReady(world, p.assignedCarId, 1)
        );
        if (hasUnservedLobby) {
          car.floor = 1;
          beginDestinationStop(sim, cfg, world, car, 1, stopPenalty);
          continue;
        }
      }

      if (
        !ecoMode &&
        car.passengers.length === 0 &&
        car.floor > 1.05 &&
        (cfg.distributionMode !== 'downpeak' || world.waitingQueues[1].length > 0)
      ) {
        adoptDownwardEnRouteCalls(cfg, world, car);
        assignedWaiting = getAssignedPassengersForCar(world, car.id);
        if (assignedWaiting.length === 0) {
          car.homing = true;
          car.direction = -1;
          car.state = 'MOVING';
          world.totalMotorStarts++;
          car.targetFloors = [1];
          continue;
        }
      }

      const nextFloor = pickNextDestinationFloor(cfg, world, car, assignedWaiting, ecoMode);
      if (nextFloor !== null) {
        if (Math.abs(nextFloor - car.floor) < 0.05) {
          car.floor = nextFloor;
          beginDestinationStop(sim, cfg, world, car, nextFloor, stopPenalty);
        } else {
          car.direction = nextFloor > car.floor ? 1 : -1;
          car.state = 'MOVING';
          world.totalMotorStarts++;
          car.targetFloors = buildDestinationRoutePreview(car, assignedWaiting);
        }
      }
      continue;
    }

    if (car.state === 'MOVING') {
      if (car.departFloor !== -1 && Math.abs(car.floor - car.departFloor) > 0.25) {
        car.departing = false;
        car.departFloor = -1;
      }

      if (car.homing && Math.abs(car.floor - 1) < 0.05) {
        car.homing = false;
      }

      if (car.passengers.length < cap && car.direction === -1 && car.floor > 1.5) {
        adoptDownwardEnRouteCalls(cfg, world, car);
        assignedWaiting = getAssignedPassengersForCar(world, car.id);
      }

      const nextFloor = pickNextDestinationFloor(cfg, world, car, assignedWaiting, ecoMode);
      if (nextFloor === null) {
        car.state = 'IDLE';
        car.direction = 0;
        car.departing = false;
        car.departFloor = -1;
        car.homing = false;
        car.targetFloors = [];
        continue;
      }

      car.targetFloors = buildDestinationRoutePreview(car, assignedWaiting);
      const delta = nextFloor - car.floor;
      if (Math.abs(delta) < 0.02) {
        car.floor = nextFloor;
        beginDestinationStop(sim, cfg, world, car, nextFloor, stopPenalty);
        continue;
      }

      car.direction = delta > 0 ? 1 : -1;
      const stepDist = CRUISE_SPEED * dt;
      if (Math.abs(delta) <= stepDist) {
        world.totalDistanceFloors += Math.abs(delta);
        car.floor = nextFloor;
        beginDestinationStop(sim, cfg, world, car, nextFloor, stopPenalty);
      } else {
        world.totalDistanceFloors += stepDist;
        car.floor += car.direction * stepDist;
      }
    }
  }
}

function beginDestinationStop(
  sim: SimState,
  cfg: SimConfig,
  world: BuildingWorld,
  car: ElevatorCar,
  floor: number,
  stopPenalty: number
) {
  let transfers = 0;
  let alighted = 0;

  for (let i = car.passengers.length - 1; i >= 0; i--) {
    const p = car.passengers[i];
    if (p.dest === floor) {
      car.passengers.splice(i, 1);
      transfers++;
      alighted++;
      recordPassengerDelivery(sim, world, p);
    }
  }

  if (alighted > 0) {
    addDeliveryEffect(world, car.id, floor, alighted);
  }

  const q = world.waitingQueues[floor];
  const cap = cfg.carCapacity;

  if (car.passengers.length === 0) {
    car.inTrip = false;
    car.tripPeakLoad = 0;

    let firstAssigned: Passenger | null = null;
    for (let i = 0; i < q.length; i++) {
      if (q[i].assignedCarId === car.id) {
        firstAssigned = q[i];
        break;
      }
    }
    if (firstAssigned) {
      car.direction = firstAssigned.dir;
    } else if (floor === 1 && q.length > 0) {
      car.direction = 1;
    } else {
      car.direction = 0;
    }
  }

  for (let i = 0; i < q.length && car.passengers.length < cap; ) {
    const cand = q[i];
    if (
      cand.assignedCarId === car.id &&
      (car.direction === 0 || cand.dir === car.direction)
    ) {
      const boarded = q.splice(i, 1)[0];
      if (car.direction === 0) car.direction = boarded.dir;
      boarded.boardTime = sim.simTime;
      car.passengers.push(boarded);
      transfers++;
    } else {
      i++;
    }
  }

  if (floor === 1 && car.passengers.length < cap) {
    transfers += pullClusterBatchAtLobby(sim, cfg, world, car);
  }

  if (car.passengers.length > 0) {
    recordTripBoarding(world, car);
  }

  if (transfers > 0 || car.passengers.length > 0) {
    car.totalStops++;
  }

  const dwell = stopPenalty + transfers * 0.35;
  car.dwellDuration = dwell;
  car.dwellTimer = dwell;
  car.departing = false;
  car.departFloor = -1;
  car.homing = false;
  car.batchHoldUsed = 0;
  car.state = 'DWELLING';
}

// =========================================================================
// 4. Nearest Car (ETA Hall-Call Allocator) Controller
// =========================================================================
function pickNextNearestFloor(
  cfg: SimConfig,
  car: ElevatorCar,
  assignedWaiting: Passenger[]
): number | null {
  const cap = cfg.carCapacity;
  const upBound = Math.ceil(car.floor - 0.02);
  const downBound = Math.floor(car.floor + 0.02);

  const dropStops = new Set<number>();
  for (const p of car.passengers) dropStops.add(p.dest);

  const pickupStops = new Set<number>();
  if (!car.departing && car.passengers.length < cap) {
    for (const p of assignedWaiting) {
      if (car.departFloor !== -1 && p.origin === car.departFloor) continue;
      if (car.passengers.length > 0) {
        if (car.direction === 0 || p.dir === car.direction) {
          pickupStops.add(p.origin);
        }
      } else {
        pickupStops.add(p.origin);
      }
    }
  }

  if (car.passengers.length > 0) {
    const activeStops = new Set([...dropStops, ...pickupStops]);
    if (car.direction === 1) {
      let bestUp = Infinity;
      for (const f of activeStops) {
        if (f >= upBound && f < bestUp) bestUp = f;
      }
      if (bestUp !== Infinity) return bestUp;
    }
    if (car.direction === -1) {
      let bestDown = -Infinity;
      for (const f of activeStops) {
        if (f <= downBound && f > bestDown) bestDown = f;
      }
      if (bestDown !== -Infinity) return bestDown;
    }

    let nearestDrop: number | null = null;
    let minDist = Infinity;
    for (const f of dropStops) {
      const d = Math.abs(f - car.floor);
      if (d < minDist) {
        minDist = d;
        nearestDrop = f;
      }
    }
    return nearestDrop;
  }

  if (assignedWaiting.length === 0) return null;

  // Prefer nearest assigned floor unless an assigned passenger has waited > 18s
  let oldest = assignedWaiting[0];
  for (let i = 1; i < assignedWaiting.length; i++) {
    if (assignedWaiting[i].spawnTime < oldest.spawnTime) {
      oldest = assignedWaiting[i];
    }
  }

  let nearestFloor = oldest.origin;
  let minDist = Infinity;
  for (let i = 0; i < assignedWaiting.length; i++) {
    const d = Math.abs(assignedWaiting[i].origin - car.floor);
    if (d < minDist) {
      minDist = d;
      nearestFloor = assignedWaiting[i].origin;
    }
  }

  return nearestFloor;
}

function beginNearestStop(
  sim: SimState,
  cfg: SimConfig,
  world: BuildingWorld,
  car: ElevatorCar,
  floor: number,
  stopPenalty: number
) {
  let transfers = 0;
  let alighted = 0;

  for (let i = car.passengers.length - 1; i >= 0; i--) {
    const p = car.passengers[i];
    if (p.dest === floor) {
      car.passengers.splice(i, 1);
      transfers++;
      alighted++;
      recordPassengerDelivery(sim, world, p);
    }
  }

  if (alighted > 0) {
    addDeliveryEffect(world, car.id, floor, alighted);
  }

  const q = world.waitingQueues[floor];
  const cap = cfg.carCapacity;

  if (car.passengers.length === 0) {
    car.inTrip = false;
    car.tripPeakLoad = 0;

    const assignedHere = q.find((p) => p.assignedCarId === car.id);
    if (assignedHere) {
      car.direction = assignedHere.dir;
    } else if (q.length > 0) {
      car.direction = q[0].dir;
    } else {
      car.direction = 0;
    }
  }

  // Board assigned riders first, then opportunistic same-direction riders at this stop
  for (let pass = 0; pass < 2 && car.passengers.length < cap; pass++) {
    for (let i = 0; i < q.length && car.passengers.length < cap; ) {
      const cand = q[i];
      const matchPass = pass === 0 ? cand.assignedCarId === car.id : true;
      const dirOk = car.direction === 0 || cand.dir === car.direction;
      if (matchPass && dirOk) {
        const boarded = q.splice(i, 1)[0];
        if (car.direction === 0) car.direction = boarded.dir;
        boarded.assignedCarId = car.id;
        boarded.boardTime = sim.simTime;
        car.passengers.push(boarded);
        transfers++;
      } else {
        i++;
      }
    }
  }

  if (car.passengers.length > 0) {
    recordTripBoarding(world, car);
  }

  if (transfers > 0 || car.passengers.length > 0) {
    car.totalStops++;
  }

  const dwell = stopPenalty + transfers * 0.35;
  car.dwellDuration = dwell;
  car.dwellTimer = dwell;
  car.departing = false;
  car.departFloor = -1;
  car.state = 'DWELLING';
}

function stepNearestWorld(sim: SimState, cfg: SimConfig, world: BuildingWorld, dt: number) {
  const cars = world.cars;
  const cap = cfg.carCapacity;
  const stopPenalty = cfg.stopPenalty;

  // Ensure any orphaned waiting passenger has a valid healthy car assignment
  if (!sim.fireAlarmActive) {
    for (let f = 1; f <= cfg.floors; f++) {
      const q = world.waitingQueues[f];
      for (let i = 0; i < q.length; i++) {
        const p = q[i];
        const assignedCar = p.assignedCarId !== null ? cars[p.assignedCarId] : null;
        if (!assignedCar || isCarUnderFireAlarm(assignedCar)) {
          assignPassengerNearestCar(cfg, world, p);
        }
      }
    }
  }

  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    if (isCarUnderFireAlarm(car)) {
      stepFireRecallCar(world, car, dt);
      continue;
    }

    const assignedWaiting = getAssignedPassengersForCar(world, car.id);

    if (car.state === 'DWELLING') {
      const curFloor = Math.round(car.floor);
      const q = world.waitingQueues[curFloor];
      let extraBoarded = 0;

      if (!car.departing && car.passengers.length < cap && q.length > 0) {
        if (car.direction === 0) {
          const mine = q.find((p) => p.assignedCarId === car.id);
          car.direction = (mine ?? q[0]).dir;
        }
        for (let k = 0; k < q.length && car.passengers.length < cap; ) {
          if (q[k].dir === car.direction) {
            const boarded = q.splice(k, 1)[0];
            boarded.assignedCarId = car.id;
            boarded.boardTime = sim.simTime;
            car.passengers.push(boarded);
            extraBoarded++;
          } else {
            k++;
          }
        }
        if (extraBoarded > 0) {
          recordTripBoarding(world, car);
          car.dwellTimer = Math.max(car.dwellTimer, extraBoarded * 0.35);
        }
      }

      car.dwellTimer -= dt;
      if (car.dwellTimer <= 0) {
        car.dwellTimer = 0;

        // Reassign any riders left behind at curFloor who were assigned to this departing full car
        if (q.length > 0 && car.passengers.length >= cap) {
          for (let k = 0; k < q.length; k++) {
            if (q[k].assignedCarId === car.id) {
              assignPassengerNearestCar(cfg, world, q[k], car.id);
            }
          }
        }

        if (car.passengers.length > 0) {
          car.departing = true;
          car.departFloor = curFloor;
        } else {
          car.departing = false;
          car.departFloor = -1;
        }

        const refreshed = getAssignedPassengersForCar(world, car.id);
        const nextFloor = pickNextNearestFloor(cfg, car, refreshed);
        if (nextFloor !== null && nextFloor !== curFloor) {
          car.direction = nextFloor > car.floor ? 1 : -1;
          car.state = 'MOVING';
          world.totalMotorStarts++;
          car.targetFloors = buildDestinationRoutePreview(car, refreshed);
        } else {
          car.direction = 0;
          car.state = 'IDLE';
          car.departing = false;
          car.departFloor = -1;
          car.targetFloors = [];
        }
      }
      continue;
    }

    if (car.state === 'IDLE') {
      const nextFloor = pickNextNearestFloor(cfg, car, assignedWaiting);
      if (nextFloor !== null) {
        if (Math.abs(nextFloor - car.floor) < 0.05) {
          car.floor = nextFloor;
          beginNearestStop(sim, cfg, world, car, nextFloor, stopPenalty);
        } else {
          car.direction = nextFloor > car.floor ? 1 : -1;
          car.state = 'MOVING';
          world.totalMotorStarts++;
          car.targetFloors = buildDestinationRoutePreview(car, assignedWaiting);
        }
      }
      continue;
    }

    if (car.state === 'MOVING') {
      if (car.departFloor !== -1 && Math.abs(car.floor - car.departFloor) > 0.25) {
        car.departing = false;
        car.departFloor = -1;
      }

      const nextFloor = pickNextNearestFloor(cfg, car, assignedWaiting);
      if (nextFloor === null) {
        car.state = 'IDLE';
        car.direction = 0;
        car.departing = false;
        car.departFloor = -1;
        car.targetFloors = [];
        continue;
      }

      car.targetFloors = buildDestinationRoutePreview(car, assignedWaiting);
      const delta = nextFloor - car.floor;
      if (Math.abs(delta) < 0.02) {
        car.floor = nextFloor;
        beginNearestStop(sim, cfg, world, car, nextFloor, stopPenalty);
        continue;
      }

      car.direction = delta > 0 ? 1 : -1;
      const stepDist = CRUISE_SPEED * dt;
      if (Math.abs(delta) <= stepDist) {
        world.totalDistanceFloors += Math.abs(delta);
        car.floor = nextFloor;
        beginNearestStop(sim, cfg, world, car, nextFloor, stopPenalty);
      } else {
        world.totalDistanceFloors += stepDist;
        car.floor += car.direction * stepDist;
      }
    }
  }
}

// =========================================================================
// 5. Static Zoning (Sectoring) Controller
// =========================================================================
function pickNextSectorFloor(
  cfg: SimConfig,
  car: ElevatorCar,
  assignedWaiting: Passenger[]
): number | null {
  const cap = cfg.carCapacity;
  const upBound = Math.ceil(car.floor - 0.02);
  const downBound = Math.floor(car.floor + 0.02);

  const dropStops = new Set<number>();
  for (const p of car.passengers) dropStops.add(p.dest);

  const pickupStops = new Set<number>();
  if (!car.departing && car.passengers.length < cap) {
    for (const p of assignedWaiting) {
      if (car.departFloor !== -1 && p.origin === car.departFloor) continue;
      if (car.passengers.length > 0) {
        if (car.direction === 0 || p.dir === car.direction) {
          pickupStops.add(p.origin);
        }
      } else {
        pickupStops.add(p.origin);
      }
    }
  }

  if (car.passengers.length > 0) {
    const activeStops = new Set([...dropStops, ...pickupStops]);
    if (car.direction === 1) {
      let bestUp = Infinity;
      for (const f of activeStops) {
        if (f >= upBound && f < bestUp) bestUp = f;
      }
      if (bestUp !== Infinity) return bestUp;
    }
    if (car.direction === -1) {
      let bestDown = -Infinity;
      for (const f of activeStops) {
        if (f <= downBound && f > bestDown) bestDown = f;
      }
      if (bestDown !== -Infinity) return bestDown;
    }

    let nearestDrop: number | null = null;
    let minDist = Infinity;
    for (const f of dropStops) {
      const d = Math.abs(f - car.floor);
      if (d < minDist) {
        minDist = d;
        nearestDrop = f;
      }
    }
    return nearestDrop;
  }

  if (assignedWaiting.length > 0) {
    // If descending through own sector, sweep downward calls before going to lobby
    if (car.floor > 1.05 && car.direction === -1) {
      let highestDownBelow = -Infinity;
      for (const p of assignedWaiting) {
        if (p.dir === -1 && p.origin <= downBound && p.origin > highestDownBelow) {
          highestDownBelow = p.origin;
        }
      }
      if (highestDownBelow !== -Infinity) return highestDownBelow;
    }

    // Serve oldest waiting passenger assigned to this sector
    let oldest = assignedWaiting[0];
    for (let i = 1; i < assignedWaiting.length; i++) {
      if (assignedWaiting[i].spawnTime < oldest.spawnTime) {
        oldest = assignedWaiting[i];
      }
    }
    return oldest.origin;
  }

  // Park in sector midpoint during 5 PM down-peak, or return to Lobby otherwise
  const restFloor =
    cfg.distributionMode === 'downpeak'
      ? Math.round(((car.sectorMin ?? 2) + (car.sectorMax ?? 2)) * 0.5)
      : 1;
  if (Math.abs(car.floor - restFloor) > 0.08) {
    return restFloor;
  }

  return null;
}

function beginSectorStop(
  sim: SimState,
  cfg: SimConfig,
  world: BuildingWorld,
  car: ElevatorCar,
  floor: number,
  stopPenalty: number
) {
  let transfers = 0;
  let alighted = 0;

  for (let i = car.passengers.length - 1; i >= 0; i--) {
    const p = car.passengers[i];
    if (p.dest === floor) {
      car.passengers.splice(i, 1);
      transfers++;
      alighted++;
      recordPassengerDelivery(sim, world, p);
    }
  }

  if (alighted > 0) {
    addDeliveryEffect(world, car.id, floor, alighted);
  }

  const q = world.waitingQueues[floor];
  const cap = cfg.carCapacity;

  if (car.passengers.length === 0) {
    car.inTrip = false;
    car.tripPeakLoad = 0;
    const mine = q.find((p) => p.assignedCarId === car.id);
    if (mine) {
      car.direction = mine.dir;
    } else {
      car.direction = 0;
    }
  }

  // Strictly board passengers belonging to this car's sector
  for (let i = 0; i < q.length && car.passengers.length < cap; ) {
    const cand = q[i];
    if (
      cand.assignedCarId === car.id &&
      (car.direction === 0 || cand.dir === car.direction)
    ) {
      const boarded = q.splice(i, 1)[0];
      if (car.direction === 0) car.direction = boarded.dir;
      boarded.boardTime = sim.simTime;
      car.passengers.push(boarded);
      transfers++;
    } else {
      i++;
    }
  }

  if (car.passengers.length > 0) {
    recordTripBoarding(world, car);
  }

  if (transfers > 0 || car.passengers.length > 0) {
    car.totalStops++;
  }

  const dwell = stopPenalty + transfers * 0.35;
  car.dwellDuration = dwell;
  car.dwellTimer = dwell;
  car.departing = false;
  car.departFloor = -1;
  car.state = 'DWELLING';
}

function stepSectorWorld(sim: SimState, cfg: SimConfig, world: BuildingWorld, dt: number) {
  const cars = world.cars;
  const cap = cfg.carCapacity;
  const stopPenalty = cfg.stopPenalty;

  if (!sim.fireAlarmActive) {
    for (let f = 1; f <= cfg.floors; f++) {
      const q = world.waitingQueues[f];
      for (let i = 0; i < q.length; i++) {
        const p = q[i];
        const assignedCar = p.assignedCarId !== null ? cars[p.assignedCarId] : null;
        if (!assignedCar || isCarUnderFireAlarm(assignedCar)) {
          assignPassengerSector(world, p);
        }
      }
    }
  }

  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    if (isCarUnderFireAlarm(car)) {
      stepFireRecallCar(world, car, dt);
      continue;
    }

    const assignedWaiting = getAssignedPassengersForCar(world, car.id);

    if (car.state === 'DWELLING') {
      const curFloor = Math.round(car.floor);
      const q = world.waitingQueues[curFloor];
      let extraBoarded = 0;

      if (!car.departing && car.passengers.length < cap) {
        for (let k = 0; k < q.length && car.passengers.length < cap; ) {
          const cand = q[k];
          const dirOk =
            car.passengers.length === 0 ||
            car.direction === 0 ||
            cand.dir === car.direction;
          if (cand.assignedCarId === car.id && dirOk) {
            const boarded = q.splice(k, 1)[0];
            if (car.direction === 0) car.direction = boarded.dir;
            boarded.boardTime = sim.simTime;
            car.passengers.push(boarded);
            extraBoarded++;
          } else {
            k++;
          }
        }
        if (extraBoarded > 0) {
          recordTripBoarding(world, car);
          car.dwellTimer = Math.max(car.dwellTimer, extraBoarded * 0.35);
        }
      }

      car.dwellTimer -= dt;
      if (car.dwellTimer <= 0) {
        car.dwellTimer = 0;
        if (car.passengers.length > 0) {
          car.departing = true;
          car.departFloor = curFloor;
        } else {
          car.departing = false;
          car.departFloor = -1;
        }

        const refreshed = getAssignedPassengersForCar(world, car.id);
        const nextFloor = pickNextSectorFloor(cfg, car, refreshed);
        if (nextFloor !== null && nextFloor !== curFloor) {
          car.direction = nextFloor > car.floor ? 1 : -1;
          car.state = 'MOVING';
          world.totalMotorStarts++;
          car.targetFloors = buildDestinationRoutePreview(car, refreshed);
        } else {
          car.direction = 0;
          car.state = 'IDLE';
          car.departing = false;
          car.departFloor = -1;
          car.targetFloors = [];
        }
      }
      continue;
    }

    if (car.state === 'IDLE') {
      const nextFloor = pickNextSectorFloor(cfg, car, assignedWaiting);
      if (nextFloor !== null) {
        if (Math.abs(nextFloor - car.floor) < 0.05) {
          car.floor = nextFloor;
          if (assignedWaiting.some((p) => p.origin === nextFloor)) {
            beginSectorStop(sim, cfg, world, car, nextFloor, stopPenalty);
          }
        } else {
          car.direction = nextFloor > car.floor ? 1 : -1;
          car.state = 'MOVING';
          world.totalMotorStarts++;
          car.targetFloors = buildDestinationRoutePreview(car, assignedWaiting);
        }
      }
      continue;
    }

    if (car.state === 'MOVING') {
      if (car.departFloor !== -1 && Math.abs(car.floor - car.departFloor) > 0.25) {
        car.departing = false;
        car.departFloor = -1;
      }

      const nextFloor = pickNextSectorFloor(cfg, car, assignedWaiting);
      if (nextFloor === null) {
        car.state = 'IDLE';
        car.direction = 0;
        car.departing = false;
        car.departFloor = -1;
        car.targetFloors = [];
        continue;
      }

      car.targetFloors = buildDestinationRoutePreview(car, assignedWaiting);
      const delta = nextFloor - car.floor;
      if (Math.abs(delta) < 0.02) {
        car.floor = nextFloor;
        if (
          car.passengers.some((p) => p.dest === nextFloor) ||
          assignedWaiting.some((p) => p.origin === nextFloor)
        ) {
          beginSectorStop(sim, cfg, world, car, nextFloor, stopPenalty);
        } else {
          car.state = 'IDLE';
          car.direction = 0;
          car.targetFloors = [];
        }
        continue;
      }

      car.direction = delta > 0 ? 1 : -1;
      const stepDist = CRUISE_SPEED * dt;
      if (Math.abs(delta) <= stepDist) {
        world.totalDistanceFloors += Math.abs(delta);
        car.floor = nextFloor;
        if (
          car.passengers.some((p) => p.dest === nextFloor) ||
          assignedWaiting.some((p) => p.origin === nextFloor)
        ) {
          beginSectorStop(sim, cfg, world, car, nextFloor, stopPenalty);
        } else {
          car.state = 'IDLE';
          car.direction = 0;
          car.targetFloors = [];
        }
      } else {
        world.totalDistanceFloors += stepDist;
        car.floor += car.direction * stepDist;
      }
    }
  }
}

// =========================================================================
// 6. First-Come First-Served (FIFO Baseline) Controller
// =========================================================================
function claimOldestUnassignedPassenger(world: BuildingWorld, car: ElevatorCar): Passenger | null {
  let oldest: Passenger | null = null;
  for (let f = 1; f < world.waitingQueues.length; f++) {
    const q = world.waitingQueues[f];
    for (let i = 0; i < q.length; i++) {
      const p = q[i];
      if (p.assignedCarId !== null) continue;
      if (!oldest || p.spawnTime < oldest.spawnTime) {
        oldest = p;
      }
    }
  }
  if (!oldest) return null;

  // Let the closest idle car claim the oldest waiting passenger
  const myDist = Math.abs(car.floor - oldest.origin);
  for (let i = 0; i < world.cars.length; i++) {
    const other = world.cars[i];
    if (other.id !== car.id && other.state === 'IDLE') {
      const otherDist = Math.abs(other.floor - oldest.origin);
      if (otherDist < myDist - 0.05 || (Math.abs(otherDist - myDist) <= 0.05 && other.id < car.id)) {
        return null;
      }
    }
  }

  oldest.assignedCarId = car.id;
  return oldest;
}

function beginFcfsStop(
  sim: SimState,
  cfg: SimConfig,
  world: BuildingWorld,
  car: ElevatorCar,
  floor: number,
  stopPenalty: number
) {
  let transfers = 0;
  let alighted = 0;

  for (let i = car.passengers.length - 1; i >= 0; i--) {
    const p = car.passengers[i];
    if (p.dest === floor) {
      car.passengers.splice(i, 1);
      transfers++;
      alighted++;
      recordPassengerDelivery(sim, world, p);
    }
  }

  if (alighted > 0) {
    addDeliveryEffect(world, car.id, floor, alighted);
  }

  // Only board waiting passengers if car is empty (strict FIFO: no intermediate pickups!)
  if (car.passengers.length === 0) {
    car.inTrip = false;
    car.tripPeakLoad = 0;

    const q = world.waitingQueues[floor];
    const cap = cfg.carCapacity;
    const claimedIdx = q.findIndex((p) => p.assignedCarId === car.id);
    if (claimedIdx !== -1) {
      const first = q.splice(claimedIdx, 1)[0];
      first.boardTime = sim.simTime;
      car.direction = first.dir;
      car.passengers.push(first);
      transfers++;

      // Board same-floor, same-direction FIFO companions waiting right behind
      for (let i = 0; i < q.length && car.passengers.length < cap; ) {
        if (
          q[i].dir === car.direction &&
          (q[i].assignedCarId === null || q[i].assignedCarId === car.id)
        ) {
          const companion = q.splice(i, 1)[0];
          companion.assignedCarId = car.id;
          companion.boardTime = sim.simTime;
          car.passengers.push(companion);
          transfers++;
        } else {
          i++;
        }
      }
    } else {
      car.direction = 0;
    }
  }

  if (car.passengers.length > 0) {
    recordTripBoarding(world, car);
  }

  if (transfers > 0 || car.passengers.length > 0) {
    car.totalStops++;
  }

  const dwell = stopPenalty + transfers * 0.35;
  car.dwellDuration = dwell;
  car.dwellTimer = dwell;
  car.state = 'DWELLING';
}

function stepFcfsWorld(sim: SimState, cfg: SimConfig, world: BuildingWorld, dt: number) {
  const cars = world.cars;
  const stopPenalty = cfg.stopPenalty;

  // Release any claim held by a car that is no longer coming for it (e.g., busy delivering)
  for (let f = 1; f <= cfg.floors; f++) {
    const q = world.waitingQueues[f];
    for (let i = 0; i < q.length; i++) {
      const p = q[i];
      if (p.assignedCarId !== null) {
        const assignedCar = cars[p.assignedCarId];
        if (!assignedCar || isCarUnderFireAlarm(assignedCar) || assignedCar.passengers.length > 0) {
          p.assignedCarId = null;
        }
      }
    }
  }

  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    if (isCarUnderFireAlarm(car)) {
      stepFireRecallCar(world, car, dt);
      continue;
    }

    if (car.state === 'DWELLING') {
      car.dwellTimer -= dt;
      if (car.dwellTimer <= 0) {
        car.dwellTimer = 0;
        if (car.passengers.length > 0) {
          const nextDest = car.passengers[0].dest;
          car.direction = nextDest > car.floor ? 1 : -1;
          car.state = 'MOVING';
          world.totalMotorStarts++;
          car.targetFloors = Array.from(new Set(car.passengers.map((p) => p.dest)));
        } else {
          car.direction = 0;
          car.state = 'IDLE';
          car.targetFloors = [];
        }
      }
      continue;
    }

    if (car.state === 'IDLE') {
      let claimed: Passenger | null = getAssignedPassengersForCar(world, car.id)[0] ?? null;
      if (!claimed) {
        claimed = claimOldestUnassignedPassenger(world, car);
      }
      if (claimed) {
        const target = claimed.origin;
        if (Math.abs(target - car.floor) < 0.05) {
          car.floor = target;
          beginFcfsStop(sim, cfg, world, car, target, stopPenalty);
        } else {
          car.direction = target > car.floor ? 1 : -1;
          car.state = 'MOVING';
          world.totalMotorStarts++;
          car.targetFloors = [target];
        }
      }
      continue;
    }

    if (car.state === 'MOVING') {
      let nextFloor: number | null = null;
      if (car.passengers.length > 0) {
        // Strict FIFO delivery order: first boarded passenger's destination first
        nextFloor = car.passengers[0].dest;
        car.targetFloors = Array.from(new Set(car.passengers.map((p) => p.dest)));
      } else {
        const claimed = getAssignedPassengersForCar(world, car.id)[0] ?? null;
        if (claimed) {
          nextFloor = claimed.origin;
          car.targetFloors = [nextFloor];
        }
      }

      if (nextFloor === null) {
        car.state = 'IDLE';
        car.direction = 0;
        car.targetFloors = [];
        continue;
      }

      const delta = nextFloor - car.floor;
      if (Math.abs(delta) < 0.02) {
        car.floor = nextFloor;
        beginFcfsStop(sim, cfg, world, car, nextFloor, stopPenalty);
        continue;
      }

      car.direction = delta > 0 ? 1 : -1;
      const stepDist = CRUISE_SPEED * dt;
      if (Math.abs(delta) <= stepDist) {
        world.totalDistanceFloors += Math.abs(delta);
        car.floor = nextFloor;
        beginFcfsStop(sim, cfg, world, car, nextFloor, stopPenalty);
      } else {
        world.totalDistanceFloors += stepDist;
        car.floor += car.direction * stepDist;
      }
    }
  }
}

// --- Telemetry & Percentile Computation ---
function computePercentile(arr: number[], pct: number): number {
  if (!arr || arr.length === 0) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * pct)));
  return sorted[idx];
}

export function computeWorldTelemetry(
  sim: SimState,
  cfg: SimConfig,
  world: BuildingWorld
): WorldTelemetry {
  let waitingCount = 0;
  let activeWaitSum = 0;
  let maxCurrentWait = 0;

  for (let f = 1; f < world.waitingQueues.length; f++) {
    const q = world.waitingQueues[f];
    waitingCount += q.length;
    for (let i = 0; i < q.length; i++) {
      const w = Math.max(0, sim.simTime - q[i].spawnTime);
      activeWaitSum += w;
      if (w > maxCurrentWait) maxCurrentWait = w;
    }
  }

  let onboardCount = 0;
  let onboardWaitSum = 0;
  let onboardTravelSum = 0;
  let onboardStopSum = 0;

  for (const car of world.cars) {
    for (const p of car.passengers) {
      onboardCount++;
      const wait = (p.boardTime ?? sim.simTime) - p.spawnTime;
      const elapsedRide = Math.max(0, sim.simTime - (p.boardTime ?? sim.simTime));
      const coveredFloors = Math.abs(car.floor - p.origin);
      const directRideSoFar = coveredFloors / CRUISE_SPEED;
      const stopSoFar = Math.max(0, elapsedRide - directRideSoFar);

      onboardWaitSum += wait;
      onboardTravelSum += directRideSoFar;
      onboardStopSum += stopSoFar;
    }
  }

  const sampleCount = world.completed.count + waitingCount + onboardCount;
  const totalWait = world.completed.waitSum + activeWaitSum + onboardWaitSum;
  const totalTravel = world.completed.travelSum + onboardTravelSum;
  const totalStop = world.completed.stopSum + onboardStopSum;

  const avgWait = sampleCount > 0 ? totalWait / sampleCount : 0;
  const avgTravel = sampleCount > 0 ? totalTravel / sampleCount : 0;
  const avgStop = sampleCount > 0 ? totalStop / sampleCount : 0;
  const avgTTD = avgWait + avgTravel + avgStop;

  const p50TTD = computePercentile(world.ttdSamples, 0.5);
  const p95TTD = computePercentile(world.ttdSamples, 0.95);
  const p95Wait = Math.max(computePercentile(world.waitSamples, 0.95), maxCurrentWait * 0.85);

  const windowSec = 120;
  const cutoff = sim.simTime - windowSec;
  while (world.completionTimes.length > 0 && world.completionTimes[0] < cutoff) {
    world.completionTimes.shift();
  }
  const effectiveWindow = Math.max(10, Math.min(windowSec, sim.simTime));
  const throughput = (world.completionTimes.length / effectiveWindow) * 60;

  let totalStops = 0;
  let totalTrips = 0;
  for (const car of world.cars) {
    totalStops += car.totalStops;
    totalTrips += car.trips;
  }
  const stopsPerTrip = totalTrips > 0 ? totalStops / totalTrips : 0;
  const avgPaxPerTrip = totalTrips > 0 ? world.totalBoardedOnTrips / totalTrips : 0;
  const utilizationPct = Math.min(100, (avgPaxPerTrip / cfg.carCapacity) * 100);

  const served = world.completed.count;
  const floorsPerPax = served > 0 ? world.totalDistanceFloors / served : 0;
  const totalWh = world.totalDistanceFloors * 1.8 + world.totalMotorStarts * 4.5;
  const whPerPax = served > 0 ? totalWh / served : 0;

  const hist = world.queueHistory;
  const growing = hist.length >= 10 && hist[hist.length - 1] > hist[hist.length - 10] + 3;
  const saturated = !sim.fireAlarmActive && waitingCount >= 22 && growing;

  return {
    avgTTD,
    avgWait,
    avgTravel,
    avgStop,
    p50TTD,
    p95TTD,
    p95Wait,
    maxCurrentWait,
    stopsPerTrip,
    totalStops,
    avgPaxPerTrip,
    utilizationPct,
    floorsPerPax,
    whPerPax,
    waitingCount,
    maxQueue: Math.max(world.maxQueue, waitingCount),
    served,
    throughput,
    saturated,
  };
}

export function buildTelemetrySnapshot(sim: SimState, cfg: SimConfig): TelemetrySnapshot {
  const left = computeWorldTelemetry(sim, cfg, sim.left);
  const right = computeWorldTelemetry(sim, cfg, sim.right);

  const mins = Math.floor(sim.simTime / 60);
  const secs = Math.floor(sim.simTime % 60);
  const clockText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const allCars = [...sim.left.cars, ...sim.right.cars];
  const lockedCount = allCars.filter((c) => c.state === 'FIRE_LOCKED').length;

  return {
    simTime: sim.simTime,
    clockText,
    fireAlarmActive: sim.fireAlarmActive,
    lockedCount,
    totalCars: allCars.length,
    totalEvac: sim.left.evacuatedCount + sim.right.evacuatedCount,
    leftAlgorithm: sim.left.algorithm,
    rightAlgorithm: sim.right.algorithm,
    left,
    right,
    leftHistory: sim.left.queueHistory.slice(),
    rightHistory: sim.right.queueHistory.slice(),
  };
}
