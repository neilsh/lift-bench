export type DistributionMode = 'realistic' | 'lunch' | 'downpeak' | 'vip' | 'uniform';

export type DispatchAlgorithm = 'standard' | 'nearest' | 'sector' | 'destination' | 'eco' | 'fcfs';

export type TowerSide = 'left' | 'right';

export type CarState = 'IDLE' | 'MOVING' | 'DWELLING' | 'FIRE_RECALL' | 'FIRE_LOCKED';

export type CibseGrade = 'A' | 'B' | 'C' | 'D' | 'F' | '—';

export type CibseComplianceStatus = 'pass' | 'warn' | 'fail' | 'pending';

export interface CibseComplianceBreakdown {
  awt: CibseComplianceStatus;
  att: CibseComplianceStatus;
  interval: CibseComplianceStatus;
  hc5: CibseComplianceStatus;
}

export interface CibseAnalyticalBenchmark {
  buildingPopulation: number;
  designLoadP: number;
  expectedReversalRise: number;
  expectedReversalFloor: number;
  expectedStopsS: number;
  theoreticalRTT: number;
  theoreticalInterval: number;
  theoreticalHC5Pax: number;
  theoreticalHC5Pct: number;
  demandHC5Pax: number;
  demandHC5Pct: number;
}

export interface RoundTripSample {
  rttSec: number;
  reversalFloor: number;
  stops: number;
  loadFactorPct: number;
}

export interface TelemetryHistoryPoint {
  simTime: number;
  queue: number;
  avgWait: number;
  avgTransit: number;
  avgTTD: number;
  avgRTT: number;
  lobbyInterval: number;
  hc5Pct: number;
  throughput: number;
  whPerPax: number;
}

export interface DistributionSamples {
  wait: number[];
  transit: number[];
  ttd: number[];
}

export interface AlgorithmMetadata {
  id: DispatchAlgorithm;
  name: string;
  shortName: string;
  description: string;
  howItWorks: string;
  bestFor: string;
  tradeOff: string;
}

export interface DestinationColor {
  fill: string;
  stroke: string;
  isLobby: boolean;
}

export interface Passenger {
  id: number;
  spawnTime: number;
  origin: number;
  dest: number;
  dir: 1 | -1;
  color: DestinationColor;
  assignedCarId: number | null;
  boardTime: number | null;
  stopOverhead: number;
}

export interface ElevatorCar {
  id: number;
  floor: number;
  direction: 1 | -1 | 0;
  state: CarState;
  dwellTimer: number;
  dwellDuration: number;
  departing: boolean;
  departFloor: number;
  homing: boolean;
  inTrip: boolean;
  tripPeakLoad: number;
  passengers: Passenger[];
  targetFloors: number[];
  totalStops: number;
  trips: number;
  sectorMin?: number;
  sectorMax?: number;
  batchHoldUsed?: number;
  cycleStartTime: number | null;
  cycleStartedAtLobby: boolean;
  cyclePeakFloor: number;
  cycleUpperStops: number;
  cyclePeakLoad: number;
}

export interface DeliveryEffect {
  carId: number;
  floor: number;
  count: number;
  labelPrefix: string;
  bornSimTime: number;
  durationSimSec: number;
}

export interface FloorRipple {
  floor: number;
  bornSimTime: number;
  durationSimSec: number;
}

export interface BuildingWorld {
  side: TowerSide;
  algorithm: DispatchAlgorithm;
  carCapacity: number;
  cars: ElevatorCar[];
  waitingQueues: Passenger[][];
  completed: {
    count: number;
    waitSum: number;
    travelSum: number;
    stopSum: number;
  };
  completionTimes: number[];
  ttdSamples: number[];
  waitSamples: number[];
  transitSamples: number[];
  roundTripSamples: RoundTripSample[];
  lobbyDepartTimes: number[];
  totalDistanceFloors: number;
  totalMotorStarts: number;
  totalBoardedOnTrips: number;
  evacuatedCount: number;
  maxQueue: number;
  queueHistory: number[];
  telemetryHistory: TelemetryHistoryPoint[];
  lastHistorySample: number;
  deliveryEffects: DeliveryEffect[];
}

export interface ConfigFieldLimit {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

export interface SimConfig {
  arrivalRate: number;
  floors: number;
  cars: number;
  stopPenalty: number;
  carCapacity: number;
  distributionMode: DistributionMode;
  leftAlgorithm: DispatchAlgorithm;
  rightAlgorithm: DispatchAlgorithm;
}

export interface PlaybackState {
  paused: boolean;
  speed: 1 | 3 | 8;
  seed: number;
}

export interface SimState {
  simTime: number;
  rng: () => number;
  nextSpawnTime: number;
  nextPassengerId: number;
  floorWeights: number[];
  cafeteriaFloor: number;
  anchorLow: number;
  anchorHigh: number;
  hotspotFloor: number;
  fireAlarmActive: boolean;
  stairEvacTimer: number;
  floorRipples: FloorRipple[];
  left: BuildingWorld;
  right: BuildingWorld;
}

export interface WorldTelemetry {
  avgTTD: number;
  avgWait: number;
  avgTransit: number;
  avgTravel: number;
  avgStop: number;
  p25Wait: number;
  p50Wait: number;
  p75Wait: number;
  p90Wait: number;
  p95Wait: number;
  p50Transit: number;
  p95Transit: number;
  p25TTD: number;
  p50TTD: number;
  p75TTD: number;
  p90TTD: number;
  p95TTD: number;
  maxCurrentWait: number;
  longWait30Pct: number;
  longWait60Pct: number;
  avgRTT: number;
  p95RTT: number;
  avgReversalFloor: number;
  avgStopsPerRoundTrip: number;
  stopsPerTrip: number;
  totalStops: number;
  avgPaxPerTrip: number;
  utilizationPct: number;
  floorsPerPax: number;
  whPerPax: number;
  waitingCount: number;
  maxQueue: number;
  served: number;
  throughput: number;
  hc5Pax: number;
  hc5Pct: number;
  demandSaturationRatio: number;
  saturated: boolean;
  cibseGrade: CibseGrade;
  cibseLabel: string;
  cibseCompliance: CibseComplianceBreakdown;
  lobbyInterval: number;
}

export interface TelemetrySnapshot {
  simTime: number;
  clockText: string;
  fireAlarmActive: boolean;
  lockedCount: number;
  totalCars: number;
  totalEvac: number;
  leftAlgorithm: DispatchAlgorithm;
  rightAlgorithm: DispatchAlgorithm;
  left: WorldTelemetry;
  right: WorldTelemetry;
  cibseBenchmark: CibseAnalyticalBenchmark;
  leftHistory: number[];
  rightHistory: number[];
  leftSeries: TelemetryHistoryPoint[];
  rightSeries: TelemetryHistoryPoint[];
  leftSamples: DistributionSamples;
  rightSamples: DistributionSamples;
}

export interface CanvasLayout {
  W: number;
  H: number;
  topPad: number;
  botPad: number;
  usableH: number;
  leftQueueX: number;
  leftBankX: number;
  spineX: number;
  spineW: number;
  rightBankX: number;
  rightQueueX: number;
  bankW: number;
  shaftW: number;
  queueZoneW: number;
  floorH: number;
  floors: number;
  cars: number;
}

export type CanvasHoverTarget =
  | { kind: 'car'; side: TowerSide; carId: number }
  | { kind: 'floor'; side: TowerSide; floor: number }
  | { kind: 'spine'; floor: number };

export type WaitHeatmapSeverity = 'idle' | 'nominal' | 'elevated' | 'critical';

export interface WaitHeatmapSample {
  longestWaitSec: number;
  intensity: number;
  severity: WaitHeatmapSeverity;
  fillStyle: string | null;
  edgeStyle: string | null;
}

export type HoverInspection =
  | {
      kind: 'car';
      side: TowerSide;
      shaftLetter: string;
      stateLabel: string;
      floor: number;
      load: number;
      capacity: number;
      targetFloors: number[];
    }
  | {
      kind: 'floor';
      side: TowerSide;
      floor: number;
      waitingCount: number;
      longestWaitSec: number;
      severity: WaitHeatmapSeverity;
    }
  | {
      kind: 'spine';
      floor: number;
      leftWaiting: number;
      rightWaiting: number;
    };
