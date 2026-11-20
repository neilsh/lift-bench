import type {
  BuildingWorld,
  CibseAnalyticalBenchmark,
  CibseComplianceBreakdown,
  CibseComplianceStatus,
  CibseGrade,
  SimConfig,
  SimState,
  TelemetrySnapshot,
  WorldTelemetry,
} from '../types/simulation';
import {
  CRUISE_SPEED,
  HC5_WINDOW_SEC,
  OCCUPANTS_PER_UPPER_FLOOR,
  THROUGHPUT_WINDOW_SEC,
  TRANSFER_TIME_PER_PAX_SEC,
} from './constants';

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

export function computeCibseBenchmark(cfg: SimConfig): CibseAnalyticalBenchmark {
  const upperFloors = Math.max(1, cfg.floors - 1);
  const cars = Math.max(1, cfg.cars);
  const buildingPopulation = upperFloors * OCCUPANTS_PER_UPPER_FLOOR;
  const designLoadP = 0.8 * Math.max(1, cfg.carCapacity);
  const tv = 1 / CRUISE_SPEED;

  let probBelowSum = 0;
  for (let i = 1; i < upperFloors; i++) {
    probBelowSum += Math.pow(i / upperFloors, designLoadP);
  }
  const expectedReversalRise = upperFloors - probBelowSum;
  const expectedReversalFloor = 1 + expectedReversalRise;
  const expectedStopsS = upperFloors * (1 - Math.pow(1 - 1 / upperFloors, designLoadP));

  const theoreticalRTT =
    2 * expectedReversalRise * tv +
    (expectedStopsS + 1) * cfg.stopPenalty +
    2 * designLoadP * TRANSFER_TIME_PER_PAX_SEC;
  const theoreticalInterval = theoreticalRTT / cars;
  const theoreticalHC5Pax = (300 * designLoadP) / Math.max(0.1, theoreticalInterval);
  const theoreticalHC5Pct = (theoreticalHC5Pax / buildingPopulation) * 100;

  const demandHC5Pax = 5 * cfg.arrivalRate;
  const demandHC5Pct = (demandHC5Pax / buildingPopulation) * 100;

  return {
    buildingPopulation,
    designLoadP,
    expectedReversalRise,
    expectedReversalFloor,
    expectedStopsS,
    theoreticalRTT,
    theoreticalInterval,
    theoreticalHC5Pax,
    theoreticalHC5Pct,
    demandHC5Pax,
    demandHC5Pct,
  };
}

export function computeCibseCompliance(params: {
  avgWait: number;
  avgTransit: number;
  lobbyInterval: number;
  hc5Pct: number;
  demandHC5Pct: number;
  saturated: boolean;
  sampleCount: number;
  served: number;
  simTime: number;
}): CibseComplianceBreakdown {
  const {
    avgWait,
    avgTransit,
    lobbyInterval,
    hc5Pct,
    demandHC5Pct,
    saturated,
    sampleCount,
    served,
    simTime,
  } = params;

  const awt: CibseComplianceStatus =
    sampleCount === 0 ? 'pending' : avgWait <= 25 ? 'pass' : avgWait <= 35 ? 'warn' : 'fail';

  const att: CibseComplianceStatus =
    sampleCount === 0 ? 'pending' : avgTransit <= 60 ? 'pass' : avgTransit <= 90 ? 'warn' : 'fail';

  const interval: CibseComplianceStatus =
    lobbyInterval <= 0
      ? 'pending'
      : lobbyInterval <= 30
        ? 'pass'
        : lobbyInterval <= 40
          ? 'warn'
          : 'fail';

  let hc5: CibseComplianceStatus = 'pending';
  if (simTime >= 15 && served > 0) {
    if (saturated) {
      hc5 = 'fail';
    } else {
      const target = Math.min(12, demandHC5Pct * 0.92);
      if (target <= 0.1 || hc5Pct >= target) {
        hc5 = 'pass';
      } else if (hc5Pct >= target * 0.8) {
        hc5 = 'warn';
      } else {
        hc5 = 'fail';
      }
    }
  }

  return { awt, att, interval, hc5 };
}

export function computeWorldTelemetry(
  sim: SimState,
  cfg: SimConfig,
  world: BuildingWorld,
  benchmark: CibseAnalyticalBenchmark = computeCibseBenchmark(cfg)
): WorldTelemetry {
  let waitingCount = 0;
  let activeWaitSum = 0;
  let maxCurrentWait = 0;
  const activeWaits: number[] = [];

  for (let f = 1; f < world.waitingQueues.length; f++) {
    const q = world.waitingQueues[f];
    waitingCount += q.length;
    for (let i = 0; i < q.length; i++) {
      const w = Math.max(0, sim.simTime - q[i].spawnTime);
      activeWaitSum += w;
      activeWaits.push(w);
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
  const avgTransit = avgTravel + avgStop;
  const avgTTD = avgWait + avgTransit;

  const p25Wait = computePercentile(world.waitSamples, 0.25);
  const p50Wait = computePercentile(world.waitSamples, 0.5);
  const p75Wait = computePercentile(world.waitSamples, 0.75);
  const p90Wait = computePercentile(world.waitSamples, 0.9);
  const p95Wait = Math.max(computePercentile(world.waitSamples, 0.95), maxCurrentWait * 0.85);

  const p50Transit = computePercentile(world.transitSamples, 0.5);
  const p95Transit = computePercentile(world.transitSamples, 0.95);

  const p25TTD = computePercentile(world.ttdSamples, 0.25);
  const p50TTD = computePercentile(world.ttdSamples, 0.5);
  const p75TTD = computePercentile(world.ttdSamples, 0.75);
  const p90TTD = computePercentile(world.ttdSamples, 0.9);
  const p95TTD = computePercentile(world.ttdSamples, 0.95);

  const totalWaitPoolCount = world.waitSamples.length + activeWaits.length;
  let over30 = 0;
  let over60 = 0;
  for (let i = 0; i < world.waitSamples.length; i++) {
    const w = world.waitSamples[i];
    if (w > 30) over30++;
    if (w > 60) over60++;
  }
  for (let i = 0; i < activeWaits.length; i++) {
    const w = activeWaits[i];
    if (w > 30) over30++;
    if (w > 60) over60++;
  }
  const longWait30Pct = totalWaitPoolCount > 0 ? (over30 / totalWaitPoolCount) * 100 : 0;
  const longWait60Pct = totalWaitPoolCount > 0 ? (over60 / totalWaitPoolCount) * 100 : 0;

  let avgRTT = 0;
  let p95RTT = 0;
  let avgReversalFloor = 0;
  let avgStopsPerRoundTrip = 0;
  if (world.roundTripSamples.length > 0) {
    let rttSum = 0;
    let revSum = 0;
    let stopsSum = 0;
    const rttVals: number[] = [];
    for (let i = 0; i < world.roundTripSamples.length; i++) {
      const s = world.roundTripSamples[i];
      rttSum += s.rttSec;
      revSum += s.reversalFloor;
      stopsSum += s.stops;
      rttVals.push(s.rttSec);
    }
    const n = world.roundTripSamples.length;
    avgRTT = rttSum / n;
    avgReversalFloor = revSum / n;
    avgStopsPerRoundTrip = stopsSum / n;
    p95RTT = computePercentile(rttVals, 0.95);
  }

  const cutoff120 = sim.simTime - THROUGHPUT_WINDOW_SEC;
  const cutoff300 = sim.simTime - HC5_WINDOW_SEC;
  let recentCompletions120 = 0;
  let recentCompletions300 = 0;
  for (let i = world.completionTimes.length - 1; i >= 0; i--) {
    const t = world.completionTimes[i];
    if (t >= cutoff120) {
      recentCompletions120++;
      recentCompletions300++;
    } else if (t >= cutoff300) {
      recentCompletions300++;
    } else {
      break;
    }
  }
  const effectiveWindow120 = Math.max(10, Math.min(THROUGHPUT_WINDOW_SEC, sim.simTime));
  const throughput = (recentCompletions120 / effectiveWindow120) * 60;

  const effectiveWindow300 = Math.max(15, Math.min(HC5_WINDOW_SEC, sim.simTime));
  const hc5Pax = (recentCompletions300 / effectiveWindow300) * HC5_WINDOW_SEC;
  const hc5Pct = (hc5Pax / benchmark.buildingPopulation) * 100;
  const demandSaturationRatio = hc5Pax > 0.1 ? benchmark.demandHC5Pax / hc5Pax : 0;

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
    departs.length >= 2 ? (departs[departs.length - 1] - departs[0]) / (departs.length - 1) : 0;

  const cibseCompliance = computeCibseCompliance({
    avgWait,
    avgTransit,
    lobbyInterval,
    hc5Pct,
    demandHC5Pct: benchmark.demandHC5Pct,
    saturated,
    sampleCount,
    served,
    simTime: sim.simTime,
  });

  return {
    avgTTD,
    avgWait,
    avgTransit,
    avgTravel,
    avgStop,
    p25Wait,
    p50Wait,
    p75Wait,
    p90Wait,
    p95Wait,
    p50Transit,
    p95Transit,
    p25TTD,
    p50TTD,
    p75TTD,
    p90TTD,
    p95TTD,
    maxCurrentWait,
    longWait30Pct,
    longWait60Pct,
    avgRTT,
    p95RTT,
    avgReversalFloor,
    avgStopsPerRoundTrip,
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
    hc5Pax,
    hc5Pct,
    demandSaturationRatio,
    saturated,
    cibseGrade,
    cibseLabel,
    cibseCompliance,
    lobbyInterval,
  };
}

export function buildTelemetrySnapshot(sim: SimState, cfg: SimConfig): TelemetrySnapshot {
  const cibseBenchmark = computeCibseBenchmark(cfg);
  const left = computeWorldTelemetry(sim, cfg, sim.left, cibseBenchmark);
  const right = computeWorldTelemetry(sim, cfg, sim.right, cibseBenchmark);

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
    cibseBenchmark,
    leftHistory: sim.left.queueHistory.slice(),
    rightHistory: sim.right.queueHistory.slice(),
    leftSeries: sim.left.telemetryHistory.slice(),
    rightSeries: sim.right.telemetryHistory.slice(),
    leftSamples: {
      wait: sim.left.waitSamples.slice(),
      transit: sim.left.transitSamples.slice(),
      ttd: sim.left.ttdSamples.slice(),
    },
    rightSamples: {
      wait: sim.right.waitSamples.slice(),
      transit: sim.right.transitSamples.slice(),
      ttd: sim.right.ttdSamples.slice(),
    },
  };
}
