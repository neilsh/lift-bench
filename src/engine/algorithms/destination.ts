import type {
  BuildingWorld,
  ElevatorCar,
  Passenger,
  SimConfig,
  SimState,
} from '../../types/simulation';
import { CRUISE_SPEED } from '../constants';
import {
  advanceCarTowardFloor,
  alightPassengersAtFloor,
  buildAssignedByCarMap,
  buildRoutePreview,
  countTotalWaiting,
  estimateCarEtaToFloor,
  getAssignedPassengersForCar,
  handleCarIdleAtFloor,
  isCarAtFloorReady,
  isCarUnderFireAlarm,
  recordCarStop,
  recordTripBoarding,
  startCarMoving,
  stepFireRecallCar,
} from '../worldHelpers';

export function assignPassengerDestinationDispatch(
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

  const estCycleTime = (2 * Math.max(4, cfg.floors * 0.65)) / CRUISE_SPEED + 3.2 * stopPenalty;

  const totalWaiting = countTotalWaiting(world);
  const fleetCap = Math.max(1, healthyCars.length * cap);
  const trafficLoad = Math.min(1, Math.max(totalWaiting / (fleetCap * 0.6), cfg.arrivalRate / 55));
  const assignedByCar = buildAssignedByCarMap(world);

  let bestCar = healthyCars[0];
  let bestCost = Infinity;

  for (let i = 0; i < healthyCars.length; i++) {
    const car = healthyCars[i];
    const waitingAssigned = assignedByCar.get(car.id) ?? [];

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

  const healthyCount = Math.max(1, world.cars.filter((c) => !isCarUnderFireAlarm(c)).length);
  const baseZoneSpan = Math.max(2, Math.ceil((cfg.floors - 1) / healthyCount));
  const lobbyHeavy = lobbyQ.length >= cap;
  const maxSpan =
    otherReadyLobbyCars > 0 && !lobbyHeavy ? Math.max(2, baseZoneSpan - 1) : baseZoneSpan + 1;
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

      const distFromBand = p.dest < minD ? minD - p.dest : p.dest > maxD ? p.dest - maxD : 0;
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

      const assignedCar = p.assignedCarId !== null ? world.cars[p.assignedCarId] : null;
      const myEta = Math.abs(car.floor - f) / CRUISE_SPEED;
      const otherEta = assignedCar ? estimateCarEtaToFloor(cfg, assignedCar, f, -1) : Infinity;

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

  if (
    !ecoMode &&
    car.floor > 1.05 &&
    (cfg.distributionMode !== 'downpeak' || world.waitingQueues[1].length > 0)
  ) {
    return 1;
  }

  return null;
}

function beginDestinationStop(
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

  if (floor === 1 && car.passengers.length < cap) {
    transfers += pullClusterBatchAtLobby(sim, cfg, world, car);
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
  car.homing = false;
  car.batchHoldUsed = 0;
  car.state = 'DWELLING';
}

export function stepDestinationWorld(
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
      stepFireRecallCar(sim.simTime, world, car, dt);
      continue;
    }

    let assignedWaiting = getAssignedPassengersForCar(world, car.id);

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

        if (curFloor === 1 && car.passengers.length < cap) {
          extraBoarded += pullClusterBatchAtLobby(sim, cfg, world, car);
        }
      }

      if (extraBoarded > 0) {
        recordTripBoarding(world, car, sim.simTime);
        car.dwellTimer = Math.max(car.dwellTimer, extraBoarded * 0.35);
      }

      car.dwellTimer -= dt;

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
          startCarMoving(
            sim,
            world,
            car,
            curFloor,
            nextFloor,
            buildRoutePreview(car, assignedWaiting)
          );
        } else if (
          !ecoMode &&
          car.passengers.length === 0 &&
          curFloor > 1 &&
          (cfg.distributionMode !== 'downpeak' || world.waitingQueues[1].length > 0)
        ) {
          car.homing = true;
          startCarMoving(sim, world, car, curFloor, 1, [1]);
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
          startCarMoving(sim, world, car, Math.round(car.floor), 1, [1]);
          continue;
        }
      }

      const nextFloor = pickNextDestinationFloor(cfg, world, car, assignedWaiting, ecoMode);
      if (nextFloor !== null) {
        if (Math.abs(nextFloor - car.floor) < 0.05) {
          car.floor = nextFloor;
          beginDestinationStop(sim, cfg, world, car, nextFloor, stopPenalty);
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
        handleCarIdleAtFloor(sim.simTime, world, car);
        continue;
      }

      car.targetFloors = buildRoutePreview(car, assignedWaiting);
      if (advanceCarTowardFloor(world, car, nextFloor, dt) === 'ARRIVED') {
        beginDestinationStop(sim, cfg, world, car, nextFloor, stopPenalty);
      }
    }
  }
}
