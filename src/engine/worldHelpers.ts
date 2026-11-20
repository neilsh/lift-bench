import type {
  BuildingWorld,
  DispatchAlgorithm,
  ElevatorCar,
  Passenger,
  SimConfig,
  SimState,
  TowerSide,
} from '../types/simulation';
import {
  computeSectorBands,
  CRUISE_SPEED,
  PASSENGER_SAMPLE_CAP,
  ROUND_TRIP_SAMPLE_CAP,
} from './constants';

export function isCarUnderFireAlarm(car: ElevatorCar): boolean {
  return car.state === 'FIRE_RECALL' || car.state === 'FIRE_LOCKED';
}

export function resetCarCycle(car: ElevatorCar) {
  car.cycleStartTime = null;
  car.cycleStartedAtLobby = false;
  car.cyclePeakFloor = Math.max(1, Math.round(car.floor));
  car.cycleUpperStops = 0;
  car.cyclePeakLoad = 0;
}

export function recordCarStop(car: ElevatorCar, floor: number) {
  car.totalStops++;
  if (car.cycleStartTime !== null) {
    const rounded = Math.round(floor);
    if (rounded > car.cyclePeakFloor) {
      car.cyclePeakFloor = rounded;
    }
    if (rounded > 1) {
      car.cycleUpperStops++;
    }
  }
}

export function closeCarRoundTrip(
  simTime: number,
  world: BuildingWorld,
  car: ElevatorCar,
  nominalExtraSec = 0
) {
  if (car.cycleStartTime === null) return;

  const rttSec = simTime - car.cycleStartTime + Math.max(0, nominalExtraSec);
  const hasPayload = car.cyclePeakLoad > 0 && car.cyclePeakFloor > 1;
  if (hasPayload && rttSec >= 2 && rttSec <= 600) {
    world.roundTripSamples.push({
      rttSec,
      reversalFloor: car.cyclePeakFloor,
      stops: Math.max(1, car.cycleUpperStops),
      loadFactorPct: Math.min(100, (car.cyclePeakLoad / Math.max(1, world.carCapacity)) * 100),
    });
    if (world.roundTripSamples.length > ROUND_TRIP_SAMPLE_CAP) {
      world.roundTripSamples.shift();
    }
  }

  resetCarCycle(car);
}

export function handleCarIdleAtFloor(simTime: number, world: BuildingWorld, car: ElevatorCar) {
  if (car.cycleStartTime === null || car.passengers.length > 0) return;

  if (car.cycleStartedAtLobby && car.cyclePeakFloor > 1 && car.cyclePeakLoad > 0) {
    const nominalReturnSec = Math.max(0, car.floor - 1) / CRUISE_SPEED;
    closeCarRoundTrip(simTime, world, car, nominalReturnSec);
    return;
  }

  if (!car.cycleStartedAtLobby && car.cyclePeakFloor > 1 && car.cycleUpperStops >= 1) {
    closeCarRoundTrip(simTime, world, car, 0);
    return;
  }

  resetCarCycle(car);
}

export function createBuildingWorld(
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
      cycleStartTime: null,
      cycleStartedAtLobby: false,
      cyclePeakFloor: 1,
      cycleUpperStops: 0,
      cyclePeakLoad: 0,
    });
  }

  const waitingQueues: Passenger[][] = Array.from({ length: cfg.floors + 1 }, () => []);

  return {
    side,
    algorithm,
    carCapacity: cfg.carCapacity,
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
    transitSamples: [],
    roundTripSamples: [],
    lobbyDepartTimes: [],
    totalDistanceFloors: 0,
    totalMotorStarts: 0,
    totalBoardedOnTrips: 0,
    evacuatedCount: 0,
    maxQueue: 0,
    queueHistory: [],
    telemetryHistory: [],
    lastHistorySample: -1,
    deliveryEffects: [],
  };
}

export function recordTripBoarding(world: BuildingWorld, car: ElevatorCar, simTime?: number) {
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

  if (simTime !== undefined) {
    const curFloor = Math.max(1, Math.round(car.floor));
    if (car.cycleStartTime === null) {
      car.cycleStartTime = simTime;
      car.cycleStartedAtLobby = curFloor === 1;
      car.cyclePeakFloor = curFloor;
      car.cycleUpperStops = 0;
      car.cyclePeakLoad = car.passengers.length;
    } else {
      if (curFloor > car.cyclePeakFloor) car.cyclePeakFloor = curFloor;
      if (car.passengers.length > car.cyclePeakLoad) {
        car.cyclePeakLoad = car.passengers.length;
      }
    }
  }
}

export function recordPassengerDelivery(sim: SimState, world: BuildingWorld, p: Passenger) {
  const waitTime = (p.boardTime ?? sim.simTime) - p.spawnTime;
  const directTravel = Math.abs(p.dest - p.origin) / CRUISE_SPEED;
  const totalDuration = sim.simTime - p.spawnTime;
  const stopTime = Math.max(0, totalDuration - waitTime - directTravel);
  const transitTime = Math.max(0, totalDuration - waitTime);

  world.completed.count++;
  world.completed.waitSum += waitTime;
  world.completed.travelSum += directTravel;
  world.completed.stopSum += stopTime;
  world.completionTimes.push(sim.simTime);

  world.ttdSamples.push(totalDuration);
  if (world.ttdSamples.length > PASSENGER_SAMPLE_CAP) world.ttdSamples.shift();
  world.waitSamples.push(waitTime);
  if (world.waitSamples.length > PASSENGER_SAMPLE_CAP) world.waitSamples.shift();
  world.transitSamples.push(transitTime);
  if (world.transitSamples.length > PASSENGER_SAMPLE_CAP) world.transitSamples.shift();
}

export function recordLobbyDeparture(
  sim: SimState,
  world: BuildingWorld,
  car: ElevatorCar,
  fromFloor: number,
  nextFloor: number
) {
  if (fromFloor === 1 && nextFloor > 1 && car.passengers.length > 0) {
    world.lobbyDepartTimes.push(sim.simTime);
    if (world.lobbyDepartTimes.length > 24) {
      world.lobbyDepartTimes.shift();
    }
  }
}

export function startCarMoving(
  sim: SimState,
  world: BuildingWorld,
  car: ElevatorCar,
  fromFloor: number,
  nextFloor: number,
  targetFloors: number[]
) {
  recordLobbyDeparture(sim, world, car, fromFloor, nextFloor);

  if (fromFloor === 1 && nextFloor > 1) {
    if (car.cycleStartTime !== null && car.cycleStartedAtLobby && car.cyclePeakFloor > 1) {
      closeCarRoundTrip(sim.simTime, world, car, 0);
    }
    if (car.cycleStartTime === null) {
      car.cycleStartTime = sim.simTime;
      car.cycleStartedAtLobby = true;
      car.cyclePeakFloor = Math.max(1, Math.round(nextFloor));
      car.cycleUpperStops = 0;
      car.cyclePeakLoad = car.passengers.length;
    }
  } else if (car.cycleStartTime !== null) {
    const peak = Math.max(Math.round(car.floor), Math.round(nextFloor));
    if (peak > car.cyclePeakFloor) car.cyclePeakFloor = peak;
    if (car.passengers.length > car.cyclePeakLoad) {
      car.cyclePeakLoad = car.passengers.length;
    }
  }

  car.direction = nextFloor > car.floor ? 1 : -1;
  car.state = 'MOVING';
  world.totalMotorStarts++;
  car.targetFloors = targetFloors;
}

export function addDeliveryEffect(
  simTime: number,
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
    bornSimTime: simTime,
    durationSimSec: labelPrefix === 'EVAC ' ? 2.4 : 1.6,
  });
  if (world.deliveryEffects.length > 28) world.deliveryEffects.shift();
}

export function alightPassengersAtFloor(
  sim: SimState,
  world: BuildingWorld,
  car: ElevatorCar,
  floor: number
): number {
  let alighted = 0;
  for (let i = car.passengers.length - 1; i >= 0; i--) {
    const p = car.passengers[i];
    if (p.dest === floor) {
      car.passengers.splice(i, 1);
      alighted++;
      recordPassengerDelivery(sim, world, p);
    }
  }
  if (alighted > 0) {
    addDeliveryEffect(sim.simTime, world, car.id, floor, alighted);
  }

  if (car.cycleStartTime !== null) {
    const rounded = Math.round(floor);
    if (rounded > car.cyclePeakFloor) car.cyclePeakFloor = rounded;
    if (rounded <= 1 && car.passengers.length === 0 && car.cyclePeakFloor > 1) {
      closeCarRoundTrip(sim.simTime, world, car, 0);
    }
  }

  return alighted;
}

export function advanceCarTowardFloor(
  world: BuildingWorld,
  car: ElevatorCar,
  targetFloor: number,
  dt: number
): 'ARRIVED' | 'MOVING' {
  const delta = targetFloor - car.floor;
  if (Math.abs(delta) < 0.02) {
    car.floor = targetFloor;
    if (car.cycleStartTime !== null && Math.round(car.floor) > car.cyclePeakFloor) {
      car.cyclePeakFloor = Math.round(car.floor);
    }
    return 'ARRIVED';
  }

  car.direction = delta > 0 ? 1 : -1;
  const stepDist = CRUISE_SPEED * dt;
  if (Math.abs(delta) <= stepDist) {
    world.totalDistanceFloors += Math.abs(delta);
    car.floor = targetFloor;
    if (car.cycleStartTime !== null && Math.round(car.floor) > car.cyclePeakFloor) {
      car.cyclePeakFloor = Math.round(car.floor);
    }
    return 'ARRIVED';
  }

  world.totalDistanceFloors += stepDist;
  car.floor += car.direction * stepDist;
  if (car.cycleStartTime !== null && Math.round(car.floor) > car.cyclePeakFloor) {
    car.cyclePeakFloor = Math.round(car.floor);
  }
  return 'MOVING';
}

export function buildRoutePreview(car: ElevatorCar, assignedWaiting: Passenger[]): number[] {
  const stops = new Set<number>();
  for (const p of car.passengers) stops.add(p.dest);
  for (const p of assignedWaiting) {
    stops.add(p.origin);
    stops.add(p.dest);
  }
  return Array.from(stops).toSorted((a, b) => a - b);
}

export function countTotalWaiting(world: BuildingWorld): number {
  let sum = 0;
  for (let f = 1; f < world.waitingQueues.length; f++) {
    sum += world.waitingQueues[f].length;
  }
  return sum;
}

export function getAssignedPassengersForCar(world: BuildingWorld, carId: number): Passenger[] {
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

export function buildAssignedByCarMap(world: BuildingWorld): Map<number, Passenger[]> {
  const map = new Map<number, Passenger[]>();
  for (let i = 0; i < world.cars.length; i++) {
    map.set(world.cars[i].id, []);
  }
  for (let f = 1; f < world.waitingQueues.length; f++) {
    const q = world.waitingQueues[f];
    for (let i = 0; i < q.length; i++) {
      const p = q[i];
      if (p.assignedCarId !== null) {
        const list = map.get(p.assignedCarId);
        if (list) list.push(p);
      }
    }
  }
  return map;
}

export function isCarAtFloorReady(
  world: BuildingWorld,
  carId: number | null,
  floor: number
): boolean {
  if (carId === null || carId === undefined) return false;
  const c = world.cars[carId];
  if (!c || isCarUnderFireAlarm(c) || c.departing) return false;
  return Math.abs(c.floor - floor) < 0.08 && (c.state === 'DWELLING' || c.state === 'IDLE');
}

export function estimateCarEtaToFloor(
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
      car.passengers.length > 0 && car.direction !== 0 && car.direction !== targetDir;

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
        (Math.abs(extremeFloor - car.floor) + Math.abs(extremeFloor - targetFloor)) / CRUISE_SPEED +
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
    car.passengers.length === 0 || car.direction === 0 || car.direction === targetDir;

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
    return Math.abs(targetFloor - car.floor) / CRUISE_SPEED + stopsBefore * stopPenalty;
  }

  return (
    (Math.abs(extremeFloor - car.floor) + Math.abs(extremeFloor - targetFloor)) / CRUISE_SPEED +
    stopSet.size * stopPenalty
  );
}

export function evacuateCarAtLobby(simTime: number, world: BuildingWorld, car: ElevatorCar) {
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
  resetCarCycle(car);

  if (car.passengers.length > 0) {
    const evacCount = car.passengers.length;
    world.evacuatedCount += evacCount;
    car.passengers = [];
    addDeliveryEffect(simTime, world, car.id, 1, evacCount, 'EVAC ');
  }
}

export function stepFireRecallCar(
  simTime: number,
  world: BuildingWorld,
  car: ElevatorCar,
  dt: number
) {
  if (car.state === 'FIRE_LOCKED') {
    car.floor = 1;
    car.direction = 0;
    car.targetFloors = [];
    return;
  }

  car.targetFloors = [1];
  if (car.floor <= 1.02) {
    evacuateCarAtLobby(simTime, world, car);
    return;
  }

  car.direction = -1;
  const stepDist = CRUISE_SPEED * dt;
  const travel = Math.min(stepDist, car.floor - 1);
  world.totalDistanceFloors += travel;
  car.floor -= travel;

  if (car.floor <= 1.02) {
    evacuateCarAtLobby(simTime, world, car);
  }
}
