import type {
  BuildingWorld,
  CibseGrade,
  SimConfig,
  SimState,
  TelemetrySnapshot,
  WorldTelemetry,
} from '../types/simulation';
import { CRUISE_SPEED } from './constants';

export function computePercentile(arr: number[], pct: number): number {
  if (!arr || arr.length === 0) return 0;
  const sorted = arr.toSorted((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * pct)));
  return sorted[idx];
}

export function computeCibseGrade(
  avgWait: number,
  avgTTD: number,
  saturated: boolean,
  sampleCount: number
): { grade: CibseGrade; label: string } {
  if (sampleCount === 0) {
    return { grade: '—', label: 'Pending' };
  }
  if (saturated || avgWait > 45 || avgTTD > 95) {
    return { grade: 'F', label: 'Overloaded' };
  }
  if (avgWait <= 20 && avgTTD <= 45) {
    return { grade: 'A', label: 'Excellent' };
  }
  if (avgWait <= 25 && avgTTD <= 60) {
    return { grade: 'B', label: 'Good' };
  }
  if (avgWait <= 30 && avgTTD <= 75) {
    return { grade: 'C', label: 'Fair' };
  }
  return { grade: 'D', label: 'Poor' };
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

  const { grade: cibseGrade, label: cibseLabel } = computeCibseGrade(
    avgWait,
    avgTTD,
    saturated,
    sampleCount
  );

  const departs = world.lobbyDepartTimes;
  const lobbyInterval =
    departs.length >= 2
      ? (departs[departs.length - 1] - departs[0]) / (departs.length - 1)
      : 0;

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
    cibseGrade,
    cibseLabel,
    lobbyInterval,
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
