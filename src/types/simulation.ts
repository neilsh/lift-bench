export type DistributionMode = 'realistic' | 'lunch' | 'downpeak' | 'vip' | 'uniform';

export type DispatchAlgorithm = 'standard' | 'nearest' | 'sector' | 'destination' | 'eco' | 'fcfs';

export type TowerSide = 'left' | 'right';

export type CarState = 'IDLE' | 'MOVING' | 'DWELLING' | 'FIRE_RECALL' | 'FIRE_LOCKED';

export type CibseGrade = 'A' | 'B' | 'C' | 'D' | 'F' | '—';

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
  lobbyDepartTimes: number[];
  totalDistanceFloors: number;
  totalMotorStarts: number;
  totalBoardedOnTrips: number;
  evacuatedCount: number;
  maxQueue: number;
  queueHistory: number[];
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
  avgTravel: number;
  avgStop: number;
  p50TTD: number;
  p95TTD: number;
  p95Wait: number;
  maxCurrentWait: number;
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
  saturated: boolean;
  cibseGrade: CibseGrade;
  cibseLabel: string;
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
  leftHistory: number[];
  rightHistory: number[];
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
