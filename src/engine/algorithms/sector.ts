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
  buildRoutePreview,
  getAssignedPassengersForCar,
  isCarUnderFireAlarm,
  recordTripBoarding,
  startCarMoving,
  stepFireRecallCar,
} from '../worldHelpers';

export function assignPassengerSector(world: BuildingWorld, pax: Passenger) {
  const healthyCars = world.cars.filter((c) => !isCarUnderFireAlarm(c));
  if (healthyCars.length === 0) {
    pax.assignedCarId = null;
    return;
  }

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
    if (car.floor > 1.05 && car.direction === -1) {
      let highestDownBelow = -Infinity;
      for (const p of assignedWaiting) {
        if (p.dir === -1 && p.origin <= downBound && p.origin > highestDownBelow) {
          highestDownBelow = p.origin;
        }
      }
      if (highestDownBelow !== -Infinity) return highestDownBelow;
    }

    let oldest = assignedWaiting[0];
    for (let i = 1; i < assignedWaiting.length; i++) {
      if (assignedWaiting[i].spawnTime < oldest.spawnTime) {
        oldest = assignedWaiting[i];
      }
    }
    return oldest.origin;
  }

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
  let transfers = alightPassengersAtFloor(sim, world, car, floor);

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

  for (let i = 0; i < q.length && car.passengers.length < cap;) {
    const cand = q[i];
    if (cand.assignedCarId === car.id && (car.direction === 0 || cand.dir === car.direction)) {
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

export function stepSectorWorld(sim: SimState, cfg: SimConfig, world: BuildingWorld, dt: number) {
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
      stepFireRecallCar(sim.simTime, world, car, dt);
      continue;
    }

    const assignedWaiting = getAssignedPassengersForCar(world, car.id);

    if (car.state === 'DWELLING') {
      const curFloor = Math.round(car.floor);
      const q = world.waitingQueues[curFloor];
      let extraBoarded = 0;

      if (!car.departing && car.passengers.length < cap) {
        for (let k = 0; k < q.length && car.passengers.length < cap;) {
          const cand = q[k];
          const dirOk =
            car.passengers.length === 0 || car.direction === 0 || cand.dir === car.direction;
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
          startCarMoving(sim, world, car, curFloor, nextFloor, buildRoutePreview(car, refreshed));
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
          startCarMoving(
            sim,
            world,
            car,
            Math.round(car.floor),
            nextFloor,
            buildRoutePreview(car, assignedWaiting)
          );
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

      car.targetFloors = buildRoutePreview(car, assignedWaiting);
      if (advanceCarTowardFloor(world, car, nextFloor, dt) === 'ARRIVED') {
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
      }
    }
  }
}
