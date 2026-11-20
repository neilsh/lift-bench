import type { DistributionMode, SimConfig, SimState } from '../types/simulation';
import { getDestinationColor } from './constants';

export function computeFloorWeights(floors: number, mode: DistributionMode) {
  const weights = Array.from({ length: floors + 1 }, () => 0);
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

export function pickWeightedFloor(rng: () => number, weights: number[], excludeFloor = -1): number {
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

export function generatePassengerSpec(
  sim: SimState,
  cfg: SimConfig,
  forcedOrigin: number | null = null
) {
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
