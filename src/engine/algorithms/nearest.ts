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
  buildAssignedByCarMap,
  buildRoutePreview,
  estimateCarEtaToFloor,
  getAssignedPassengersForCar,
  handleCarIdleAtFloor,
  isCarUnderFireAlarm,
  recordCarStop,
  recordTripBoarding,
  startCarMoving,
  stepFireRecallCar,
} from '../worldHelpers';

export function assignPassengerNearestCar(
  cfg: SimConfig,
  world: BuildingWorld,
  pax: Passenger,
  excludeCarId = -1
) {
  const healthyCars = world.cars.filter((c) => !isCarUnderFireAlarm(c) && c.id !== excludeCarId);
  const pool =
    healthyCars.length > 0 ? healthyCars : world.cars.filter((c) => !isCarUnderFireAlarm(c));

  if (pool.length === 0) {
    pax.assignedCarId = null;
    return;
  }

  const cap = cfg.carCapacity;
  const assignedByCar = buildAssignedByCarMap(world);
  let bestCar = pool[0];
  let bestScore = Infinity;

  for (let i = 0; i < pool.length; i++) {
    const car = pool[i];
    const assigned = assignedByCar.get(car.id) ?? [];
    let assignedSameCall = 0;
    const totalAssigned = assigned.length;
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
    const sameCallBonus = assignedSameCall > 0 && projectedLoad < cap ? -2.2 : 0;

    const score = eta + loadPenalty + fullPenalty + sameCallBonus;
    if (score < bestScore) {
      bestScore = score;
      bestCar = car;
    }
  }

  pax.assignedCarId = bestCar.id;
}

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
  let transfers = alightPassengersAtFloor(sim, world, car, floor);

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

  for (let pass = 0; pass < 2 && car.passengers.length < cap; pass++) {
    for (let i = 0; i < q.length && car.passengers.length < cap;) {
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
    recordTripBoarding(world, car, sim.simTime);
  }

  if (transfers > 0 || car.passengers.length > 0) {
    recordCarStop(car, floor);
  }

  const dwell = stopPenalty + transfers * 0.35;
  car.dwellDuration = dwell;
  car.dwellTimer = dwell;
  car.departing = false;
  car.departFloor = -1;
  car.state = 'DWELLING';
}

export function stepNearestWorld(sim: SimState, cfg: SimConfig, world: BuildingWorld, dt: number) {
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
          assignPassengerNearestCar(cfg, world, p);
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

      if (!car.departing && car.passengers.length < cap && q.length > 0) {
        if (car.direction === 0) {
          const mine = q.find((p) => p.assignedCarId === car.id);
          car.direction = (mine ?? q[0]).dir;
        }
        for (let k = 0; k < q.length && car.passengers.length < cap;) {
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
          recordTripBoarding(world, car, sim.simTime);
          car.dwellTimer = Math.max(car.dwellTimer, extraBoarded * 0.35);
        }
      }

      car.dwellTimer -= dt;
      if (car.dwellTimer <= 0) {
        car.dwellTimer = 0;

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
          startCarMoving(sim, world, car, curFloor, nextFloor, buildRoutePreview(car, refreshed));
        } else {
          car.direction = 0;
          car.state = 'IDLE';
          car.departing = false;
          car.departFloor = -1;
          car.targetFloors = [];
          handleCarIdleAtFloor(sim.simTime, world, car);
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

      const nextFloor = pickNextNearestFloor(cfg, car, assignedWaiting);
      if (nextFloor === null) {
        car.state = 'IDLE';
        car.direction = 0;
        car.departing = false;
        car.departFloor = -1;
        car.targetFloors = [];
        handleCarIdleAtFloor(sim.simTime, world, car);
        continue;
      }

      car.targetFloors = buildRoutePreview(car, assignedWaiting);
      if (advanceCarTowardFloor(world, car, nextFloor, dt) === 'ARRIVED') {
        beginNearestStop(sim, cfg, world, car, nextFloor, stopPenalty);
      }
    }
  }
}
