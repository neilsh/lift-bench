import type {
  AlgorithmMetadata,
  ConfigFieldLimit,
  DestinationColor,
  DispatchAlgorithm,
  DistributionMode,
  SimConfig,
} from '../types/simulation';

export const FIXED_DT = 0.05; // 50ms deterministic physics step
export const CRUISE_SPEED = 2.4; // floors per second
export const THROUGHPUT_WINDOW_SEC = 120;

export const CONFIG_LIMITS = {
  arrivalRate: { min: 10, max: 90, step: 2 },
  floors: { min: 8, max: 24, step: 1 },
  cars: { min: 2, max: 5, step: 1 },
  stopPenalty: { min: 2, max: 10, step: 0.5 },
  carCapacity: { min: 4, max: 16, step: 1 },
} as const satisfies Record<
  'arrivalRate' | 'floors' | 'cars' | 'stopPenalty' | 'carCapacity',
  ConfigFieldLimit
>;

export const DEFAULT_CONFIG: SimConfig = {
  arrivalRate: 42,
  floors: 14,
  cars: 4,
  stopPenalty: 5.0,
  carCapacity: 8,
  distributionMode: 'realistic',
  leftAlgorithm: 'standard',
  rightAlgorithm: 'destination',
};

export const ALGORITHM_ORDER: readonly DispatchAlgorithm[] = [
  'standard',
  'destination',
  'nearest',
  'sector',
  'eco',
  'fcfs',
];

export const PRESET_ORDER: readonly DistributionMode[] = [
  'realistic',
  'lunch',
  'downpeak',
  'vip',
  'uniform',
];

export const ALGORITHM_META: Record<DispatchAlgorithm, AlgorithmMetadata> = {
  standard: {
    id: 'standard',
    name: 'Collective SCAN',
    shortName: 'SCAN',
    description:
      'Classic up/down directional sweep; cars collect same-direction hall calls en route.',
    howItWorks:
      'Each car sweeps continuously in one direction like a disk head, stopping for every onboard destination and matching-direction hall call until no calls remain ahead, then reverses.',
    bestFor: 'Moderate mixed traffic and simple two-button halls without destination keypads.',
    tradeOff:
      'Lobby cars often collect riders bound for many different floors, increasing stops per trip under heavy up-peak demand.',
  },
  destination: {
    id: 'destination',
    name: 'Destination Dispatch',
    shortName: 'Dest. DD',
    description:
      'Wave-aware SDF cost function with express lobby clustering, downward sweep & homing.',
    howItWorks:
      'Riders enter their destination floor in the lobby before boarding. The dispatcher scores every car using ETA, wave capacity, stop-delay factor (SDF), and destination band clustering, grouping riders bound for nearby floors.',
    bestFor: 'Morning rush up-peak, Sky Bar express traffic, and multi-car high-rise shafts.',
    tradeOff:
      'Riders may wait a few extra seconds for their assigned group car in exchange for dramatically fewer intermediate stops.',
  },
  nearest: {
    id: 'nearest',
    name: 'Nearest Car (ETA)',
    shortName: 'Nearest',
    description:
      'Group hall-call allocator assigning each floor call to the single lowest-ETA car.',
    howItWorks:
      'When a hall call arrives, the controller estimates every car’s arrival time (factoring in current direction, remaining stops, and projected load) and assigns the call to the lowest-cost car.',
    bestFor: 'Balanced inter-floor and lunch traffic where quick initial pickup matters most.',
    tradeOff:
      'Without destination knowledge before boarding, lobby cars still accumulate dispersed drop-off stops.',
  },
  sector: {
    id: 'sector',
    name: 'Static Zoning',
    shortName: 'Zoning',
    description:
      'Partitions upper floors into dedicated vertical bands, one exclusive zone per car.',
    howItWorks:
      'Upper floors are divided into contiguous non-overlapping bands—one per elevator shaft. Lobby riders board only the car serving their destination band, creating natural express runs to upper zones.',
    bestFor: 'Predictable morning up-peak and evening down-peak traffic in taller buildings.',
    tradeOff:
      'Cannot dynamically rebalance spare cars when one hotspot zone (such as the cafeteria or penthouse) surges.',
  },
  eco: {
    id: 'eco',
    name: 'Eco Batching',
    shortName: 'Eco DD',
    description:
      'Energy-saving destination batching; holds briefly for fuller loads & parks in place.',
    howItWorks:
      'Builds on Destination Dispatch by penalizing empty deadhead shaft travel, parking idle cars on upper floors instead of homing to the lobby, and holding lobby cars briefly to consolidate fuller batches.',
    bestFor: 'Reducing motor starts, shaft mileage, and Wh/pax energy consumption.',
    tradeOff:
      'Trades slightly longer average wait times during light/moderate lulls to avoid half-empty express trips.',
  },
  fcfs: {
    id: 'fcfs',
    name: 'FIFO Baseline',
    shortName: 'FIFO',
    description:
      'Strict arrival-order dispatch serving one origin-to-destination batch without pickups.',
    howItWorks:
      'Idle cars claim the oldest unassigned passenger in strict arrival order, pick up same-floor companions, and run straight to their destinations without stopping for intermediate hall calls.',
    bestFor:
      'Establishing a naive baseline to measure how much smarter collective and destination scheduling perform.',
    tradeOff:
      'Heavy empty deadheading and missed en-route pickups cause rapid queue saturation under load.',
  },
};

export const PRESET_META: Record<
  DistributionMode,
  {
    name: string;
    shortLabel: string;
    desc: string;
    hotspotIcon: string;
  }
> = {
  realistic: {
    name: 'Morning Rush',
    shortLabel: 'Morning',
    desc: 'Morning Rush · 82% Up / 10% Down / 8% Inter-floor',
    hotspotIcon: '★',
  },
  lunch: {
    name: 'Lunch Crunch',
    shortLabel: 'Lunch',
    desc: 'Lunch Crunch · 42% Up / 42% Down / 16% Inter-floor (Heavy Cafeteria)',
    hotspotIcon: '★',
  },
  downpeak: {
    name: '5 PM Exodus',
    shortLabel: '5 PM',
    desc: '5 PM Exodus · 84% Down to Lobby / 10% Up / 6% Inter-floor',
    hotspotIcon: '★',
  },
  vip: {
    name: 'Sky Bar / VIP',
    shortLabel: 'Sky Bar',
    desc: 'Sky Bar · Heavy Top-Floor Express & Penthouse Shuttle',
    hotspotIcon: '♛',
  },
  uniform: {
    name: 'Uniform Up-Peak',
    shortLabel: 'Uniform',
    desc: 'Uniform Up-Peak · 100% Up from Lobby (Equal Floor Weights)',
    hotspotIcon: '',
  },
};

const ALGORITHM_SET = new Set<string>(ALGORITHM_ORDER);
const PRESET_SET = new Set<string>(PRESET_ORDER);

export function isDispatchAlgorithm(value: string): value is DispatchAlgorithm {
  return ALGORITHM_SET.has(value);
}

export function isDistributionMode(value: string): value is DistributionMode {
  return PRESET_SET.has(value);
}

export function assertNever(value: never, context = 'Unexpected value'): never {
  throw new Error(`${context}: ${String(value)}`);
}

function clampNumericField(
  raw: number | undefined,
  fallback: number,
  limit: ConfigFieldLimit,
  integerOnly: boolean
): number {
  if (raw === undefined || !Number.isFinite(raw)) {
    return fallback;
  }
  const clamped = Math.min(limit.max, Math.max(limit.min, raw));
  if (integerOnly) {
    return Math.round(clamped);
  }
  const steps = Math.round((clamped - limit.min) / limit.step);
  return Math.min(limit.max, Math.max(limit.min, limit.min + steps * limit.step));
}

export function sanitizeSimConfig(
  partial: Partial<SimConfig>,
  base: SimConfig = DEFAULT_CONFIG
): SimConfig {
  const distributionMode =
    partial.distributionMode && isDistributionMode(partial.distributionMode)
      ? partial.distributionMode
      : base.distributionMode;
  const leftAlgorithm =
    partial.leftAlgorithm && isDispatchAlgorithm(partial.leftAlgorithm)
      ? partial.leftAlgorithm
      : base.leftAlgorithm;
  const rightAlgorithm =
    partial.rightAlgorithm && isDispatchAlgorithm(partial.rightAlgorithm)
      ? partial.rightAlgorithm
      : base.rightAlgorithm;

  return {
    arrivalRate: clampNumericField(
      partial.arrivalRate,
      base.arrivalRate,
      CONFIG_LIMITS.arrivalRate,
      true
    ),
    floors: clampNumericField(partial.floors, base.floors, CONFIG_LIMITS.floors, true),
    cars: clampNumericField(
      partial.cars,
      base.cars,
      { min: 1, max: CONFIG_LIMITS.cars.max, step: CONFIG_LIMITS.cars.step },
      true
    ),
    stopPenalty: clampNumericField(
      partial.stopPenalty,
      base.stopPenalty,
      CONFIG_LIMITS.stopPenalty,
      false
    ),
    carCapacity: clampNumericField(
      partial.carCapacity,
      base.carCapacity,
      CONFIG_LIMITS.carCapacity,
      true
    ),
    distributionMode,
    leftAlgorithm,
    rightAlgorithm,
  };
}

export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getDestinationColor(destFloor: number, totalFloors: number): DestinationColor {
  if (destFloor === 1) {
    return { fill: '#818cf8', stroke: '#ffffff', isLobby: true };
  }
  const ratio = totalFloors <= 2 ? 0.5 : (destFloor - 2) / (totalFloors - 2);
  const hue = Math.round(205 - ratio * 201);
  return {
    fill: `hsl(${hue}, 86%, 56%)`,
    stroke: `hsl(${hue}, 86%, 82%)`,
    isLobby: false,
  };
}

export function computeSectorBands(
  floors: number,
  carCount: number
): Array<{ min: number; max: number }> {
  const bands: Array<{ min: number; max: number }> = [];
  const upperCount = Math.max(1, floors - 1);
  for (let i = 0; i < carCount; i++) {
    const rawMin = 2 + Math.floor((i * upperCount) / carCount);
    const rawMax = 2 + Math.floor(((i + 1) * upperCount) / carCount) - 1;
    const min = Math.min(floors, rawMin);
    const max = Math.min(floors, Math.max(min, rawMax));
    bands.push({ min, max });
  }
  return bands;
}
