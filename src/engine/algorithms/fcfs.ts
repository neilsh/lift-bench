import type {
  BuildingWorld,
  ElevatorCar,
  Passenger,
  SimConfig,
  SimState,
} from '../../types/simulation';
import {
  advanceCarTowardFloor,
  alightPassengersAtFloor,
  getAssignedPassengersForCar,
  isCarUnderFireAlarm,
  recordTripBoarding,
  startCarMoving,
  stepFireRecallCar,
} from '../worldHelpers';

function claimOldestUnassignedPassenger(
  world: BuildingWorld,
  car: ElevatorCar
): Passenger | null {
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

  const myDist = Math.abs(car.floor - oldest.origin);
  for (let i = 0; i < world.cars.length; i++) {
    const other = world.cars[i];
    if (other.id !== car.id && other.state === 'IDLE') {
      const otherDist = Math.abs(other.floor - oldest.origin);
      if (
        otherDist < myDist - 0.05 ||
        (Math.abs(otherDist - myDist) <= 0.05 && other.id < car.id)
      ) {
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
  let transfers = alightPassengersAtFloor(sim, world, car, floor);

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

export function stepFcfsWorld(
  sim: SimState,
  cfg: SimConfig,
  world: BuildingWorld,
  dt: number
) {
  const cars = world.cars;
  const stopPenalty = cfg.stopPenalty;

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
          startCarMoving(
            sim,
            world,
            car,
            Math.round(car.floor),
            nextDest,
            Array.from(new Set(car.passengers.map((p) => p.dest)))
          );
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
          startCarMoving(sim, world, car, Math.round(car.floor), target, [target]);
        }
      }
      continue;
    }

    if (car.state === 'MOVING') {
      let nextFloor: number | null = null;
      if (car.passengers.length > 0) {
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

      if (advanceCarTowardFloor(world, car, nextFloor, dt) === 'ARRIVED') {
        beginFcfsStop(sim, cfg, world, car, nextFloor, stopPenalty);
      }
    }
  }
}
