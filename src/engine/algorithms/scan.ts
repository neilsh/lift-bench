import type { BuildingWorld, ElevatorCar, SimConfig, SimState } from '../../types/simulation';
import {
  advanceCarTowardFloor,
  alightPassengersAtFloor,
  isCarUnderFireAlarm,
  recordTripBoarding,
  startCarMoving,
  stepFireRecallCar,
} from '../worldHelpers';

function pickNextStandardFloor(
  cfg: SimConfig,
  world: BuildingWorld,
  car: ElevatorCar
): number | null {
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
            if (
              otherDist < myDist - 0.1 ||
              (Math.abs(otherDist - myDist) <= 0.1 && other.id < car.id)
            ) {
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
  let transfers = alightPassengersAtFloor(sim, world, car, floor);

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
  for (let i = 0; i < q.length && car.passengers.length < cap;) {
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

export function stepStandardWorld(sim: SimState, cfg: SimConfig, world: BuildingWorld, dt: number) {
  const cars = world.cars;
  const cap = cfg.carCapacity;
  const stopPenalty = cfg.stopPenalty;

  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    if (isCarUnderFireAlarm(car)) {
      stepFireRecallCar(sim.simTime, world, car, dt);
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
        for (let k = 0; k < q.length && car.passengers.length < cap;) {
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
        if (nextFloor !== null && nextFloor !== curFloor) {
          startCarMoving(sim, world, car, curFloor, nextFloor, [nextFloor]);
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
          startCarMoving(sim, world, car, Math.round(car.floor), nextFloor, [nextFloor]);
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
      if (advanceCarTowardFloor(world, car, nextFloor, dt) === 'ARRIVED') {
        beginStandardStop(sim, cfg, world, car, nextFloor, stopPenalty);
      }
    }
  }
}
