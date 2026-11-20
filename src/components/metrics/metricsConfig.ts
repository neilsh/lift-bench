import type { GlossaryKey } from '../../data/metricGlossary';
import type { CibseAnalyticalBenchmark, TelemetryHistoryPoint } from '../../types/simulation';
import type { ChartReferenceLine } from '../charts/TimeSeriesChart';

export type StudioTab = 'overview' | 'trends' | 'distributions' | 'matrix';

export type TrendMetricId =
  | 'avgWait'
  | 'avgTTD'
  | 'hc5Pct'
  | 'avgRTT'
  | 'lobbyInterval'
  | 'queue'
  | 'throughput'
  | 'whPerPax';

export type MatrixCategory = 'all' | 'service' | 'capacity' | 'kinematics' | 'efficiency';

export interface DeltaDisplay {
  text: string;
  className: string;
}

export interface MatrixRow {
  category: Exclude<MatrixCategory, 'all'>;
  glossaryKey: GlossaryKey;
  label: string;
  formulaNote: string;
  leftVal: string;
  rightVal: string;
  target: string;
  delta: DeltaDisplay;
}

export interface TrendChannelConfig {
  id: TrendMetricId;
  glossaryKey: GlossaryKey;
  shortLabel: string;
  title: string;
  unit: string;
  decimals: number;
  minMaxFloor: number;
  lowerIsBetter: boolean;
  accessor: (pt: TelemetryHistoryPoint) => number;
}

export const STUDIO_TABS: ReadonlyArray<{ id: StudioTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'trends', label: 'Live Trends' },
  { id: 'distributions', label: 'Distributions' },
  { id: 'matrix', label: 'Matrix & Export' },
];

export const TREND_CHANNELS: ReadonlyArray<TrendChannelConfig> = [
  {
    id: 'avgWait',
    glossaryKey: 'awt',
    shortLabel: 'AWT',
    title: 'Average Waiting Time (AWT)',
    unit: 's',
    decimals: 1,
    minMaxFloor: 35,
    lowerIsBetter: true,
    accessor: (pt) => pt.avgWait,
  },
  {
    id: 'avgTTD',
    glossaryKey: 'attd',
    shortLabel: 'ATTD',
    title: 'Average Time to Destination (ATTD)',
    unit: 's',
    decimals: 1,
    minMaxFloor: 60,
    lowerIsBetter: true,
    accessor: (pt) => pt.avgTTD,
  },
  {
    id: 'hc5Pct',
    glossaryKey: 'hc5Pct',
    shortLabel: '5-Min %HC',
    title: '5-Minute Handling Capacity (%POP)',
    unit: '%',
    decimals: 1,
    minMaxFloor: 15,
    lowerIsBetter: false,
    accessor: (pt) => pt.hc5Pct,
  },
  {
    id: 'avgRTT',
    glossaryKey: 'rtt',
    shortLabel: 'Mean RTT',
    title: 'Observed Round-Trip Time (RTT)',
    unit: 's',
    decimals: 1,
    minMaxFloor: 45,
    lowerIsBetter: true,
    accessor: (pt) => pt.avgRTT,
  },
  {
    id: 'lobbyInterval',
    glossaryKey: 'interval',
    shortLabel: 'Interval',
    title: 'Lobby Dispatch Interval (INT)',
    unit: 's',
    decimals: 1,
    minMaxFloor: 30,
    lowerIsBetter: true,
    accessor: (pt) => pt.lobbyInterval,
  },
  {
    id: 'queue',
    glossaryKey: 'queue',
    shortLabel: 'Queue',
    title: 'Active Waiting Queue',
    unit: 'pax',
    decimals: 0,
    minMaxFloor: 10,
    lowerIsBetter: true,
    accessor: (pt) => pt.queue,
  },
  {
    id: 'throughput',
    glossaryKey: 'throughput',
    shortLabel: 'Throughput',
    title: 'Rolling Delivery Throughput (120s)',
    unit: 'pax/m',
    decimals: 1,
    minMaxFloor: 20,
    lowerIsBetter: false,
    accessor: (pt) => pt.throughput,
  },
  {
    id: 'whPerPax',
    glossaryKey: 'energy',
    shortLabel: 'Energy',
    title: 'Estimated Energy per Rider',
    unit: 'Wh/p',
    decimals: 1,
    minMaxFloor: 15,
    lowerIsBetter: true,
    accessor: (pt) => pt.whPerPax,
  },
];

export const GRID_CHANNEL_IDS: ReadonlyArray<TrendMetricId> = [
  'avgWait',
  'hc5Pct',
  'avgRTT',
  'queue',
];

export const MATRIX_CATEGORIES: ReadonlyArray<{ id: MatrixCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'service', label: 'Service Quality' },
  { id: 'capacity', label: 'Traffic & Capacity' },
  { id: 'kinematics', label: 'Cycle Kinematics' },
  { id: 'efficiency', label: 'Efficiency' },
];

export function formatDelta(
  sVal: number,
  dVal: number,
  lowerIsBetter = true,
  unit = '%'
): DeltaDisplay {
  if (sVal <= 0.001 && dVal <= 0.001) {
    return { text: '—', className: 'text-slate-500' };
  }
  const diff = dVal - sVal;
  const pct = sVal > 0.001 ? (diff / sVal) * 100 : 0;
  const good = lowerIsBetter ? diff < -0.05 : diff > 0.05;
  const bad = lowerIsBetter ? diff > 0.05 : diff < -0.05;
  const className = good ? 'text-emerald-300' : bad ? 'text-rose-300' : 'text-slate-400';
  const text =
    unit === '%'
      ? `${pct > 0 ? '+' : ''}${Math.round(pct)}%`
      : `${diff > 0 ? '+' : ''}${diff.toFixed(1)}${unit}`;
  return { text, className };
}

export function summarizeChannel(
  series: TelemetryHistoryPoint[],
  accessor: (pt: TelemetryHistoryPoint) => number
): { min: number; avg: number; max: number } {
  if (series.length === 0) return { min: 0, avg: 0, max: 0 };
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (let i = 0; i < series.length; i++) {
    const v = accessor(series[i]);
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, avg: sum / series.length, max };
}

export function buildReferenceLinesByMetric(
  cibseBenchmark: CibseAnalyticalBenchmark
): Record<TrendMetricId, ChartReferenceLine[]> {
  return {
    avgWait: [
      { label: '20s Exc', value: 20, tone: 'emerald' },
      { label: '30s Fair', value: 30, tone: 'amber' },
    ],
    avgTTD: [
      { label: '45s Exc', value: 45, tone: 'emerald' },
      { label: '60s Good', value: 60, tone: 'amber' },
    ],
    hc5Pct: [
      { label: '12% CIBSE Office', value: 12, tone: 'emerald' },
      {
        label: `Demand ${cibseBenchmark.demandHC5Pct.toFixed(1)}%`,
        value: cibseBenchmark.demandHC5Pct,
        tone: 'slate',
      },
    ],
    avgRTT: [
      {
        label: `Barney ${cibseBenchmark.theoreticalRTT.toFixed(1)}s`,
        value: cibseBenchmark.theoreticalRTT,
        tone: 'slate',
      },
    ],
    lobbyInterval: [
      {
        label: `Barney ${cibseBenchmark.theoreticalInterval.toFixed(1)}s`,
        value: cibseBenchmark.theoreticalInterval,
        tone: 'slate',
      },
      { label: '30s CIBSE Max', value: 30, tone: 'amber' },
    ],
    queue: [],
    throughput: [],
    whPerPax: [],
  };
}
