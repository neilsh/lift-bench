import { BarChart3, Download, Flame, Pause, Play, X } from 'lucide-react';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { ALGORITHM_META, PRESET_META } from '../engine/elevatorSim';
import { useModalFocus } from '../hooks/useModalFocus';
import type {
  CibseComplianceStatus,
  DistributionMode,
  SimConfig,
  TelemetryHistoryPoint,
  TelemetrySnapshot,
} from '../types/simulation';
import {
  getCibseGradeColorClass,
  getComplianceLabel,
  getComplianceTextClass,
} from '../utils/cibse';
import {
  serializeTelemetryCsv,
  serializeTelemetryJson,
  triggerFileDownload,
} from '../utils/telemetryExport';
import type { GlossaryKey } from '../data/metricGlossary';
import { DistributionChart } from './charts/DistributionChart';
import { TimeSeriesChart } from './charts/TimeSeriesChart';
import type { ChartReferenceLine } from './charts/TimeSeriesChart';
import { InfoPopover } from './InfoPopover';

interface MetricsModalProps {
  open: boolean;
  telemetry: TelemetrySnapshot;
  distributionMode: DistributionMode;
  config?: SimConfig;
  paused?: boolean;
  onTogglePause?: () => void;
  onClose: () => void;
}

type StudioTab = 'overview' | 'trends' | 'distributions' | 'matrix';
type TrendMetricId =
  | 'avgWait'
  | 'avgTTD'
  | 'hc5Pct'
  | 'avgRTT'
  | 'lobbyInterval'
  | 'queue'
  | 'throughput'
  | 'whPerPax';
type MatrixCategory = 'all' | 'service' | 'capacity' | 'kinematics' | 'efficiency';

interface MatrixRow {
  category: Exclude<MatrixCategory, 'all'>;
  glossaryKey: GlossaryKey;
  label: string;
  formulaNote: string;
  leftVal: string;
  rightVal: string;
  target: string;
  delta: { text: string; className: string };
}

const STUDIO_TABS: ReadonlyArray<{ id: StudioTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'trends', label: 'Live Trends' },
  { id: 'distributions', label: 'Distributions' },
  { id: 'matrix', label: 'Matrix & Export' },
];

const TREND_CHANNELS: ReadonlyArray<{
  id: TrendMetricId;
  glossaryKey: GlossaryKey;
  shortLabel: string;
  title: string;
  unit: string;
  decimals: number;
  minMaxFloor: number;
  lowerIsBetter: boolean;
  accessor: (pt: TelemetryHistoryPoint) => number;
}> = [
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

const MATRIX_CATEGORIES: ReadonlyArray<{ id: MatrixCategory; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'service', label: 'Service Quality' },
  { id: 'capacity', label: 'Traffic & Capacity' },
  { id: 'kinematics', label: 'Cycle Kinematics' },
  { id: 'efficiency', label: 'Efficiency' },
];

function formatDelta(
  sVal: number,
  dVal: number,
  lowerIsBetter = true,
  unit = '%'
): { text: string; className: string } {
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

function summarizeChannel(
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

function renderComplianceText(label: string, status: CibseComplianceStatus) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className="text-slate-400">{label}</span>
      <strong className={`font-semibold ${getComplianceTextClass(status)}`}>
        {getComplianceLabel(status)}
      </strong>
    </span>
  );
}

export const MetricsModal = memo(function MetricsModal({
  open,
  telemetry,
  distributionMode,
  config,
  paused = false,
  onTogglePause,
  onClose,
}: MetricsModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const [activeTab, setActiveTab] = useState<StudioTab>('overview');
  const [selectedMetric, setSelectedMetric] = useState<TrendMetricId>('avgWait');
  const [trendsLayout, setTrendsLayout] = useState<'single' | 'grid'>('single');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [distMetric, setDistMetric] = useState<'wait' | 'ttd'>('wait');
  const [distMode, setDistMode] = useState<'histogram' | 'cdf'>('histogram');
  const [hoveredBin, setHoveredBin] = useState<number | null>(null);
  const [matrixCategory, setMatrixCategory] = useState<MatrixCategory>('all');
  const [exportStatus, setExportStatus] = useState<string>('');

  useModalFocus(open, onClose, closeBtnRef, panelRef);

  const handleTabKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      const idx = STUDIO_TABS.findIndex((t) => t.id === activeTab);
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setActiveTab(STUDIO_TABS[(idx + 1) % STUDIO_TABS.length].id);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setActiveTab(STUDIO_TABS[(idx - 1 + STUDIO_TABS.length) % STUDIO_TABS.length].id);
      }
    },
    [activeTab]
  );

  const {
    left,
    right,
    leftAlgorithm,
    rightAlgorithm,
    clockText,
    fireAlarmActive,
    cibseBenchmark,
    leftSeries,
    rightSeries,
    leftSamples,
    rightSamples,
  } = telemetry;

  const referenceLinesByMetric = useMemo<Record<TrendMetricId, ChartReferenceLine[]>>(
    () => ({
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
    }),
    [cibseBenchmark]
  );

  if (!open) return null;

  const meta = PRESET_META[distributionMode] || PRESET_META.realistic;
  const leftMeta = ALGORITHM_META[leftAlgorithm];
  const rightMeta = ALGORITHM_META[rightAlgorithm];

  const leftTot = Math.max(0.1, left.avgTTD);
  const rightTot = Math.max(0.1, right.avgTTD);

  let verdictContent: ReactNode = 'Collecting steady-state samples...';
  if (fireAlarmActive) {
    verdictContent = (
      <span className="inline-flex items-center gap-1.5 text-rose-300 font-semibold">
        <Flame className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>
          Fire Alarm Active: All elevators recalled nonstop to Floor 1 &amp; locked out of service.
        </span>
      </span>
    );
  } else if (left.avgTTD > 1 && right.avgTTD > 1) {
    const ttdPct = Math.round(((right.avgTTD - left.avgTTD) / left.avgTTD) * 100);
    const energyPct =
      left.whPerPax > 0 ? Math.round(((right.whPerPax - left.whPerPax) / left.whPerPax) * 100) : 0;

    if (ttdPct <= -4) {
      verdictContent = (
        <>
          <span className="text-cyan-300 font-semibold">{rightMeta.name} leads</span> by{' '}
          <span className="font-mono text-emerald-200">{Math.abs(ttdPct)}%</span> faster TTD and{' '}
          <span className="font-mono text-cyan-200">
            {energyPct <= 0 ? `${Math.abs(energyPct)}% less` : `${energyPct}% more`}
          </span>{' '}
          energy/rider.
        </>
      );
    } else if (ttdPct >= 4) {
      verdictContent = (
        <>
          <span className="text-amber-300 font-semibold">{leftMeta.name} leads</span> by{' '}
          <span className="font-mono text-amber-200">{ttdPct}%</span> faster TTD under current
          traffic load.
        </>
      );
    } else {
      verdictContent = (
        <>
          <span className="text-slate-200 font-semibold">Neck-and-neck</span> (
          <span className="font-mono">
            {ttdPct > 0 ? '+' : ''}
            {ttdPct}%
          </span>{' '}
          TTD) · {rightMeta.shortName} uses{' '}
          <span className="font-mono text-cyan-200">
            {energyPct > 0 ? `+${energyPct}%` : `${energyPct}%`}
          </span>{' '}
          energy/rider.
        </>
      );
    }
  }

  const overviewRows: Array<
    [GlossaryKey, string, string, string, { text: string; className: string }]
  > = [
    [
      'cibseGrade',
      'CIBSE Guide D Grade',
      `Grade ${left.cibseGrade} (${left.cibseLabel})`,
      `Grade ${right.cibseGrade} (${right.cibseLabel})`,
      { text: '—', className: 'text-slate-500' },
    ],
    [
      'attd',
      'Mean TTD (Total)',
      `${left.avgTTD.toFixed(1)}s`,
      `${right.avgTTD.toFixed(1)}s`,
      formatDelta(left.avgTTD, right.avgTTD, true),
    ],
    [
      'awt',
      'Mean Wait (AWT)',
      `${left.avgWait.toFixed(1)}s`,
      `${right.avgWait.toFixed(1)}s`,
      formatDelta(left.avgWait, right.avgWait, true),
    ],
    [
      'att',
      'Mean Transit (ATT)',
      `${left.avgTransit.toFixed(1)}s`,
      `${right.avgTransit.toFixed(1)}s`,
      formatDelta(left.avgTransit, right.avgTransit, true),
    ],
    [
      'rtt',
      'Mean Round-Trip (RTT)',
      left.avgRTT > 0 ? `${left.avgRTT.toFixed(1)}s` : '—',
      right.avgRTT > 0 ? `${right.avgRTT.toFixed(1)}s` : '—',
      left.avgRTT > 0 && right.avgRTT > 0
        ? formatDelta(left.avgRTT, right.avgRTT, true)
        : { text: '—', className: 'text-slate-500' },
    ],
    [
      'hc5Pct',
      '5-Min Handling (%HC5)',
      `${left.hc5Pct.toFixed(1)}% (${Math.round(left.hc5Pax)})`,
      `${right.hc5Pct.toFixed(1)}% (${Math.round(right.hc5Pax)})`,
      formatDelta(left.hc5Pct, right.hc5Pct, false, 'pp'),
    ],
    [
      'p95Wait',
      'Tail Queue Wait (P95)',
      `${left.p95Wait.toFixed(1)}s`,
      `${right.p95Wait.toFixed(1)}s`,
      formatDelta(left.p95Wait, right.p95Wait, true),
    ],
    [
      'interval',
      'Lobby Dispatch Interval',
      left.lobbyInterval > 0 ? `${left.lobbyInterval.toFixed(1)}s` : '—',
      right.lobbyInterval > 0 ? `${right.lobbyInterval.toFixed(1)}s` : '—',
      left.lobbyInterval > 0 && right.lobbyInterval > 0
        ? formatDelta(left.lobbyInterval, right.lobbyInterval, true)
        : { text: '—', className: 'text-slate-500' },
    ],
    [
      'throughput',
      'Throughput (120s)',
      `${left.throughput.toFixed(1)}/m`,
      `${right.throughput.toFixed(1)}/m`,
      formatDelta(left.throughput, right.throughput, false),
    ],
    [
      'energy',
      'Est. Energy',
      `${left.whPerPax.toFixed(1)} Wh/p`,
      `${right.whPerPax.toFixed(1)} Wh/p`,
      formatDelta(left.whPerPax, right.whPerPax, true),
    ],
  ];

  const matrixRows: MatrixRow[] = [
    {
      category: 'service',
      glossaryKey: 'cibseGrade',
      label: 'CIBSE Guide D Grade',
      formulaNote: 'Composite AWT & ATTD office service band',
      leftVal: `Grade ${left.cibseGrade} (${left.cibseLabel})`,
      rightVal: `Grade ${right.cibseGrade} (${right.cibseLabel})`,
      target: 'Grade A/B',
      delta: { text: '—', className: 'text-slate-500' },
    },
    {
      category: 'service',
      glossaryKey: 'awt',
      label: 'Average Wait Time (AWT)',
      formulaNote: 'Mean hall wait from call to boarding',
      leftVal: `${left.avgWait.toFixed(1)}s`,
      rightVal: `${right.avgWait.toFixed(1)}s`,
      target: '≤ 25.0s',
      delta: formatDelta(left.avgWait, right.avgWait, true),
    },
    {
      category: 'service',
      glossaryKey: 'att',
      label: 'Average Transit Time (ATT)',
      formulaNote: 'In-car ride + intermediate stop dwell',
      leftVal: `${left.avgTransit.toFixed(1)}s`,
      rightVal: `${right.avgTransit.toFixed(1)}s`,
      target: '≤ 60.0s',
      delta: formatDelta(left.avgTransit, right.avgTransit, true),
    },
    {
      category: 'service',
      glossaryKey: 'attd',
      label: 'Mean Time to Destination (ATTD)',
      formulaNote: 'AWT + ATT end-to-end journey duration',
      leftVal: `${left.avgTTD.toFixed(1)}s`,
      rightVal: `${right.avgTTD.toFixed(1)}s`,
      target: '≤ 60.0s',
      delta: formatDelta(left.avgTTD, right.avgTTD, true),
    },
    {
      category: 'service',
      glossaryKey: 'p95TTD',
      label: 'Median / P95 TTD',
      formulaNote: '50th and 95th percentile journey time',
      leftVal: `${left.p50TTD.toFixed(1)}s / ${left.p95TTD.toFixed(1)}s`,
      rightVal: `${right.p50TTD.toFixed(1)}s / ${right.p95TTD.toFixed(1)}s`,
      target: 'P95 ≤ 90s',
      delta: formatDelta(left.p95TTD, right.p95TTD, true),
    },
    {
      category: 'service',
      glossaryKey: 'p95Wait',
      label: 'Tail Queue Wait (P95 / Max)',
      formulaNote: '95th percentile & live oldest waiting rider',
      leftVal: `${left.p95Wait.toFixed(1)}s / ${left.maxCurrentWait.toFixed(0)}s`,
      rightVal: `${right.p95Wait.toFixed(1)}s / ${right.maxCurrentWait.toFixed(0)}s`,
      target: '≤ 45s',
      delta: formatDelta(left.p95Wait, right.p95Wait, true),
    },
    {
      category: 'service',
      glossaryKey: 'longWaitSla',
      label: 'Long-Wait SLA (>30s / >60s)',
      formulaNote: 'Share of riders waiting past 30s & 60s cutoffs',
      leftVal: `${left.longWait30Pct.toFixed(1)}% / ${left.longWait60Pct.toFixed(1)}%`,
      rightVal: `${right.longWait30Pct.toFixed(1)}% / ${right.longWait60Pct.toFixed(1)}%`,
      target: '<15% / <2%',
      delta: formatDelta(left.longWait30Pct, right.longWait30Pct, true, 'pp'),
    },
    {
      category: 'capacity',
      glossaryKey: 'hc5Pct',
      label: '5-Min Handling Capacity (%HC5)',
      formulaNote: `HC5 / U (U = ${cibseBenchmark.buildingPopulation} occupants)`,
      leftVal: `${left.hc5Pct.toFixed(1)}%`,
      rightVal: `${right.hc5Pct.toFixed(1)}%`,
      target: `${cibseBenchmark.theoreticalHC5Pct.toFixed(1)}% (≥12%)`,
      delta: formatDelta(left.hc5Pct, right.hc5Pct, false, 'pp'),
    },
    {
      category: 'capacity',
      glossaryKey: 'hc5Pax',
      label: '5-Min Delivered Volume (HC5)',
      formulaNote: 'Rolling 300s passenger flow rate',
      leftVal: `${Math.round(left.hc5Pax)} pax`,
      rightVal: `${Math.round(right.hc5Pax)} pax`,
      target: `${Math.round(cibseBenchmark.demandHC5Pax)} demand`,
      delta: formatDelta(left.hc5Pax, right.hc5Pax, false),
    },
    {
      category: 'capacity',
      glossaryKey: 'interval',
      label: 'Lobby Dispatch Interval (INT)',
      formulaNote: 'Mean time between loaded lobby departures',
      leftVal: left.lobbyInterval > 0 ? `${left.lobbyInterval.toFixed(1)}s` : '—',
      rightVal: right.lobbyInterval > 0 ? `${right.lobbyInterval.toFixed(1)}s` : '—',
      target: `${cibseBenchmark.theoreticalInterval.toFixed(1)}s (≤30s)`,
      delta:
        left.lobbyInterval > 0 && right.lobbyInterval > 0
          ? formatDelta(left.lobbyInterval, right.lobbyInterval, true)
          : { text: '—', className: 'text-slate-500' },
    },
    {
      category: 'capacity',
      glossaryKey: 'saturation',
      label: 'Demand Saturation Ratio (ρ)',
      formulaNote: 'Arrival demand ÷ observed HC5 capacity',
      leftVal: left.demandSaturationRatio > 0 ? left.demandSaturationRatio.toFixed(2) : '—',
      rightVal: right.demandSaturationRatio > 0 ? right.demandSaturationRatio.toFixed(2) : '—',
      target: '≤ 1.00',
      delta:
        left.demandSaturationRatio > 0 && right.demandSaturationRatio > 0
          ? formatDelta(left.demandSaturationRatio, right.demandSaturationRatio, true)
          : { text: '—', className: 'text-slate-500' },
    },
    {
      category: 'capacity',
      glossaryKey: 'throughput',
      label: 'Throughput (120s) / Delivered',
      formulaNote: '2-min delivery rate & cumulative riders',
      leftVal: `${left.throughput.toFixed(1)}/m · ${left.served}`,
      rightVal: `${right.throughput.toFixed(1)}/m · ${right.served}`,
      target: 'Max flow',
      delta: formatDelta(left.throughput, right.throughput, false),
    },
    {
      category: 'kinematics',
      glossaryKey: 'rtt',
      label: 'Mean / P95 Round-Trip Time (RTT)',
      formulaNote: 'Observed cycle duration lobby-to-lobby',
      leftVal: left.avgRTT > 0 ? `${left.avgRTT.toFixed(1)}s / ${left.p95RTT.toFixed(1)}s` : '—',
      rightVal:
        right.avgRTT > 0 ? `${right.avgRTT.toFixed(1)}s / ${right.p95RTT.toFixed(1)}s` : '—',
      target: `${cibseBenchmark.theoreticalRTT.toFixed(1)}s Barney`,
      delta:
        left.avgRTT > 0 && right.avgRTT > 0
          ? formatDelta(left.avgRTT, right.avgRTT, true)
          : { text: '—', className: 'text-slate-500' },
    },
    {
      category: 'kinematics',
      glossaryKey: 'reversalFloor',
      label: 'Highest Reversal Floor (H)',
      formulaNote: 'Mean peak floor reached per round trip',
      leftVal: left.avgReversalFloor > 0 ? `Fl ${left.avgReversalFloor.toFixed(1)}` : '—',
      rightVal: right.avgReversalFloor > 0 ? `Fl ${right.avgReversalFloor.toFixed(1)}` : '—',
      target: `Fl ${cibseBenchmark.expectedReversalFloor.toFixed(1)}`,
      delta:
        left.avgReversalFloor > 0 && right.avgReversalFloor > 0
          ? formatDelta(left.avgReversalFloor, right.avgReversalFloor, true)
          : { text: '—', className: 'text-slate-500' },
    },
    {
      category: 'kinematics',
      glossaryKey: 'probableStops',
      label: 'Upper Stops / Cycle (S)',
      formulaNote: 'Mean upper-floor stops per round trip',
      leftVal: left.avgStopsPerRoundTrip > 0 ? left.avgStopsPerRoundTrip.toFixed(2) : '—',
      rightVal: right.avgStopsPerRoundTrip > 0 ? right.avgStopsPerRoundTrip.toFixed(2) : '—',
      target: `${cibseBenchmark.expectedStopsS.toFixed(2)} Barney`,
      delta:
        left.avgStopsPerRoundTrip > 0 && right.avgStopsPerRoundTrip > 0
          ? formatDelta(left.avgStopsPerRoundTrip, right.avgStopsPerRoundTrip, true)
          : { text: '—', className: 'text-slate-500' },
    },
    {
      category: 'kinematics',
      glossaryKey: 'stopsAndLoad',
      label: 'Stops / Trip & Car Load (%CF)',
      formulaNote: 'Stops per trip & mean cabin fill vs capacity',
      leftVal: `${left.stopsPerTrip.toFixed(2)} · ${Math.round(left.utilizationPct)}%`,
      rightVal: `${right.stopsPerTrip.toFixed(2)} · ${Math.round(right.utilizationPct)}%`,
      target: '≤ 80% CF',
      delta: formatDelta(left.stopsPerTrip, right.stopsPerTrip, true),
    },
    {
      category: 'efficiency',
      glossaryKey: 'shaftMileage',
      label: 'Shaft Mileage',
      formulaNote: 'Total car floors travelled per served rider',
      leftVal: `${left.floorsPerPax.toFixed(1)} fl/p`,
      rightVal: `${right.floorsPerPax.toFixed(1)} fl/p`,
      target: 'Minimize',
      delta: formatDelta(left.floorsPerPax, right.floorsPerPax, true),
    },
    {
      category: 'efficiency',
      glossaryKey: 'energy',
      label: 'Estimated Energy',
      formulaNote: '1.8 Wh/floor + 4.5 Wh/motor start per rider',
      leftVal: `${left.whPerPax.toFixed(1)} Wh/p`,
      rightVal: `${right.whPerPax.toFixed(1)} Wh/p`,
      target: 'Minimize',
      delta: formatDelta(left.whPerPax, right.whPerPax, true),
    },
    {
      category: 'efficiency',
      glossaryKey: 'queue',
      label: 'Queue (Now / Peak)',
      formulaNote: 'Current waiting vs session high-water mark',
      leftVal: `${left.waitingCount} / ${left.maxQueue}`,
      rightVal: `${right.waitingCount} / ${right.maxQueue}`,
      target: '< 22',
      delta: formatDelta(left.waitingCount, right.waitingCount, true, ''),
    },
  ];

  const filteredMatrixRows =
    matrixCategory === 'all'
      ? matrixRows
      : matrixRows.filter((row) => row.category === matrixCategory);

  const activeChannel = TREND_CHANNELS.find((c) => c.id === selectedMetric) ?? TREND_CHANNELS[0];
  const leftFocusStats = summarizeChannel(leftSeries, activeChannel.accessor);
  const rightFocusStats = summarizeChannel(rightSeries, activeChannel.accessor);

  const gridChannels = [
    TREND_CHANNELS[0], // AWT
    TREND_CHANNELS[2], // 5-Min %HC
    TREND_CHANNELS[3], // RTT
    TREND_CHANNELS[5], // Queue
  ];

  const handleExportCsv = () => {
    const csv = serializeTelemetryCsv(telemetry);
    const safeClock = clockText.replace(':', '-');
    triggerFileDownload(
      `liftbench-cibse-${distributionMode}-${safeClock}.csv`,
      csv,
      'text/csv;charset=utf-8'
    );
    setExportStatus(`Exported CSV (${Math.max(leftSeries.length, rightSeries.length)}s window)`);
  };

  const handleExportJson = () => {
    const json = serializeTelemetryJson(telemetry, config);
    const safeClock = clockText.replace(':', '-');
    triggerFileDownload(
      `liftbench-cibse-${distributionMode}-${safeClock}.json`,
      json,
      'application/json;charset=utf-8'
    );
    setExportStatus(`Exported JSON report (Sim ${clockText})`);
  };

  const distLeftValues = distMetric === 'wait' ? leftSamples.wait : leftSamples.ttd;
  const distRightValues = distMetric === 'wait' ? rightSamples.wait : rightSamples.ttd;

  return (
    <dialog
      open
      aria-modal="true"
      aria-labelledby="metricsModalTitle"
      className="fixed inset-0 z-50 m-0 flex h-full max-h-none w-full max-w-none items-center justify-center border-0 bg-transparent p-2 sm:p-4 text-inherit"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close telemetry modal"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm cursor-default"
      />
      <div
        ref={panelRef}
        className="modal-panel-anim relative w-full max-w-5xl max-h-[90dvh] bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="shrink-0 px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/80 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <BarChart3 className="w-4 h-4 text-sky-400 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2
                id="metricsModalTitle"
                className="text-sm sm:text-base font-bold text-slate-100 leading-tight truncate"
              >
                Live Dispatch Telemetry
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                {fireAlarmActive
                  ? 'Fire Alarm Active · Phase I Lobby Recall Across All Shafts'
                  : meta.desc}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono tabular-nums text-[11px] text-slate-300 whitespace-nowrap">
              Sim {clockText}
            </span>
            {onTogglePause && (
              <button
                type="button"
                onClick={onTogglePause}
                aria-pressed={paused}
                className={`h-9 px-3 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  paused
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                    : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                }`}
              >
                {paused ? (
                  <>
                    <Play className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Resume</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Pause</span>
                  </>
                )}
              </button>
            )}
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              aria-label="Close telemetry modal"
              className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center border border-slate-700 transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="shrink-0 px-3 sm:px-4 py-2 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
          <div
            role="tablist"
            aria-label="Telemetry studio views"
            className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg"
          >
            {STUDIO_TABS.map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={handleTabKeyDown}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                    selected
                      ? 'bg-slate-800 text-slate-100 border border-slate-700'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="hidden md:flex items-center gap-3 text-[11px] font-mono tabular-nums shrink-0">
            <span className="text-amber-300 whitespace-nowrap">{leftMeta.shortName} (Left)</span>
            <span className="text-slate-600" aria-hidden="true">
              vs
            </span>
            <span className="text-cyan-300 whitespace-nowrap">{rightMeta.shortName} (Right)</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 flex flex-col gap-3">
          {activeTab === 'overview' && (
            <>
              <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 flex items-center justify-between gap-2 flex-wrap">
                <span className="font-medium">{verdictContent}</span>
                <span className="inline-flex items-center gap-1.5 font-mono tabular-nums text-[11px] text-slate-400">
                  <span>
                    Pop {cibseBenchmark.buildingPopulation} · Barney RTT{' '}
                    {cibseBenchmark.theoreticalRTT.toFixed(1)}s
                  </span>
                  <InfoPopover topic="barney" size="xs" />
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
                <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-amber-300">{leftMeta.name} (Left)</span>
                    <span className="inline-flex items-center gap-1">
                      <span
                        className={`font-mono font-bold ${getCibseGradeColorClass(left.cibseGrade)}`}
                      >
                        Grade {left.cibseGrade} · {left.cibseLabel}
                      </span>
                      <InfoPopover topic="cibseCompliance" size="xs" />
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-snug">{leftMeta.description}</p>
                  <div className="pt-1 border-t border-slate-800/80 flex items-center gap-2.5 font-mono tabular-nums text-[10.5px] flex-wrap">
                    {renderComplianceText('AWT', left.cibseCompliance.awt)}
                    <span className="text-slate-700" aria-hidden="true">
                      ·
                    </span>
                    {renderComplianceText('ATT', left.cibseCompliance.att)}
                    <span className="text-slate-700" aria-hidden="true">
                      ·
                    </span>
                    {renderComplianceText('INT', left.cibseCompliance.interval)}
                    <span className="text-slate-700" aria-hidden="true">
                      ·
                    </span>
                    {renderComplianceText('%HC5', left.cibseCompliance.hc5)}
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-cyan-300">{rightMeta.name} (Right)</span>
                    <span className="inline-flex items-center gap-1">
                      <span
                        className={`font-mono font-bold ${getCibseGradeColorClass(right.cibseGrade)}`}
                      >
                        Grade {right.cibseGrade} · {right.cibseLabel}
                      </span>
                      <InfoPopover topic="cibseCompliance" size="xs" />
                    </span>
                  </div>
                  <p className="text-slate-400 text-[11px] leading-snug">{rightMeta.description}</p>
                  <div className="pt-1 border-t border-slate-800/80 flex items-center gap-2.5 font-mono tabular-nums text-[10.5px] flex-wrap">
                    {renderComplianceText('AWT', right.cibseCompliance.awt)}
                    <span className="text-slate-700" aria-hidden="true">
                      ·
                    </span>
                    {renderComplianceText('ATT', right.cibseCompliance.att)}
                    <span className="text-slate-700" aria-hidden="true">
                      ·
                    </span>
                    {renderComplianceText('INT', right.cibseCompliance.interval)}
                    <span className="text-slate-700" aria-hidden="true">
                      ·
                    </span>
                    {renderComplianceText('%HC5', right.cibseCompliance.hc5)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                {(
                  [
                    {
                      glossaryKey: 'rtt' as GlossaryKey,
                      title: 'Mean Round-Trip (RTT)',
                      leftVal: left.avgRTT > 0 ? `${left.avgRTT.toFixed(1)}s` : '—',
                      rightVal: right.avgRTT > 0 ? `${right.avgRTT.toFixed(1)}s` : '—',
                      delta:
                        left.avgRTT > 0 && right.avgRTT > 0
                          ? formatDelta(left.avgRTT, right.avgRTT, true)
                          : { text: '—', className: 'text-slate-500' },
                      ref: `Barney ${cibseBenchmark.theoreticalRTT.toFixed(1)}s`,
                    },
                    {
                      glossaryKey: 'hc5Pct' as GlossaryKey,
                      title: '5-Min Handling (%HC5)',
                      leftVal: `${left.hc5Pct.toFixed(1)}%`,
                      rightVal: `${right.hc5Pct.toFixed(1)}%`,
                      delta: formatDelta(left.hc5Pct, right.hc5Pct, false, 'pp'),
                      ref: `Barney ${cibseBenchmark.theoreticalHC5Pct.toFixed(1)}% · Dem ${cibseBenchmark.demandHC5Pct.toFixed(1)}%`,
                    },
                    {
                      glossaryKey: 'interval' as GlossaryKey,
                      title: 'Dispatch Interval (INT)',
                      leftVal: left.lobbyInterval > 0 ? `${left.lobbyInterval.toFixed(1)}s` : '—',
                      rightVal:
                        right.lobbyInterval > 0 ? `${right.lobbyInterval.toFixed(1)}s` : '—',
                      delta:
                        left.lobbyInterval > 0 && right.lobbyInterval > 0
                          ? formatDelta(left.lobbyInterval, right.lobbyInterval, true)
                          : { text: '—', className: 'text-slate-500' },
                      ref: `Barney ${cibseBenchmark.theoreticalInterval.toFixed(1)}s`,
                    },
                    {
                      glossaryKey: 'awtAttTriad' as GlossaryKey,
                      title: 'AWT / ATT Triad',
                      leftVal: `${left.avgWait.toFixed(0)}s / ${left.avgTransit.toFixed(0)}s`,
                      rightVal: `${right.avgWait.toFixed(0)}s / ${right.avgTransit.toFixed(0)}s`,
                      delta: formatDelta(left.avgWait, right.avgWait, true),
                      ref: 'CIBSE ≤25s / ≤60s',
                    },
                  ] as const
                ).map((kpi) => (
                  <div
                    key={kpi.title}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="inline-flex items-center gap-1 min-w-0">
                        <span className="text-[11px] font-medium text-slate-400 truncate">
                          {kpi.title}
                        </span>
                        <InfoPopover topic={kpi.glossaryKey} size="xs" />
                      </span>
                      <span
                        className={`font-mono tabular-nums text-[11px] font-semibold shrink-0 ${kpi.delta.className}`}
                      >
                        {kpi.delta.text}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-2 font-mono tabular-nums">
                      <span className="text-sm font-bold text-amber-300">{kpi.leftVal}</span>
                      <span className="text-sm font-bold text-cyan-300">{kpi.rightVal}</span>
                    </div>
                    <span className="text-[10px] font-mono tabular-nums text-slate-500 truncate">
                      {kpi.ref}
                    </span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="inline-flex items-center gap-1 min-w-0">
                      <span className="font-semibold text-amber-300 truncate">
                        {leftMeta.shortName} TTD Split
                      </span>
                      <InfoPopover topic="ttdSplit" size="xs" />
                    </span>
                    <span className="font-mono tabular-nums text-[10.5px] text-slate-400 shrink-0">
                      W {left.avgWait.toFixed(1)}s · R {left.avgTravel.toFixed(1)}s · S{' '}
                      {left.avgStop.toFixed(1)}s
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden flex border border-slate-800">
                    <div
                      className="h-full bg-amber-500 transition-all duration-150"
                      style={{ width: `${(left.avgWait / leftTot) * 100}%` }}
                    />
                    <div
                      className="h-full bg-sky-500 transition-all duration-150"
                      style={{ width: `${(left.avgTravel / leftTot) * 100}%` }}
                    />
                    <div
                      className="h-full bg-rose-500 transition-all duration-150"
                      style={{ width: `${(left.avgStop / leftTot) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="inline-flex items-center gap-1 min-w-0">
                      <span className="font-semibold text-cyan-300 truncate">
                        {rightMeta.shortName} TTD Split
                      </span>
                      <InfoPopover topic="ttdSplit" size="xs" />
                    </span>
                    <span className="font-mono tabular-nums text-[10.5px] text-slate-400 shrink-0">
                      W {right.avgWait.toFixed(1)}s · R {right.avgTravel.toFixed(1)}s · S{' '}
                      {right.avgStop.toFixed(1)}s
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden flex border border-slate-800">
                    <div
                      className="h-full bg-amber-500 transition-all duration-150"
                      style={{ width: `${(right.avgWait / rightTot) * 100}%` }}
                    />
                    <div
                      className="h-full bg-sky-500 transition-all duration-150"
                      style={{ width: `${(right.avgTravel / rightTot) * 100}%` }}
                    />
                    <div
                      className="h-full bg-rose-500 transition-all duration-150"
                      style={{ width: `${(right.avgStop / rightTot) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between gap-3 flex-wrap text-[11px] font-mono tabular-nums">
                <span className="inline-flex items-center gap-1 font-sans font-semibold text-slate-300">
                  <span>Barney Analytical vs. Observed</span>
                  <InfoPopover topic="barney" size="xs" />
                </span>
                <div className="flex items-center gap-3 flex-wrap text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <span>
                      Theory H{' '}
                      <strong className="text-slate-200">
                        Fl {cibseBenchmark.expectedReversalFloor.toFixed(1)}
                      </strong>{' '}
                      ({left.avgReversalFloor > 0 ? left.avgReversalFloor.toFixed(1) : '—'} /{' '}
                      {right.avgReversalFloor > 0 ? right.avgReversalFloor.toFixed(1) : '—'})
                    </span>
                    <InfoPopover topic="reversalFloor" size="xs" />
                  </span>
                  <span className="text-slate-700" aria-hidden="true">
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span>
                      Theory S{' '}
                      <strong className="text-slate-200">
                        {cibseBenchmark.expectedStopsS.toFixed(1)}
                      </strong>{' '}
                      ({left.avgStopsPerRoundTrip > 0 ? left.avgStopsPerRoundTrip.toFixed(1) : '—'}{' '}
                      /{' '}
                      {right.avgStopsPerRoundTrip > 0 ? right.avgStopsPerRoundTrip.toFixed(1) : '—'}
                      )
                    </span>
                    <InfoPopover topic="probableStops" size="xs" />
                  </span>
                  <span className="text-slate-700" aria-hidden="true">
                    ·
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span>
                      Wait &gt;30s:{' '}
                      <strong className="text-amber-300">{left.longWait30Pct.toFixed(0)}%</strong> /{' '}
                      <strong className="text-cyan-300">{right.longWait30Pct.toFixed(0)}%</strong>
                    </span>
                    <InfoPopover topic="longWaitSla" size="xs" />
                  </span>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] sm:text-[11px] font-mono tracking-wider text-slate-400 bg-slate-900/70">
                      <th className="py-2 px-3">Metric</th>
                      <th className="py-2 px-2 text-right text-amber-300">{leftMeta.shortName}</th>
                      <th className="py-2 px-2 text-right text-cyan-300">{rightMeta.shortName}</th>
                      <th className="py-2 px-3 text-right">Delta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-[11px] sm:text-xs font-mono tabular-nums">
                    {overviewRows.map(([glossaryKey, label, sVal, dVal, delta]) => (
                      <tr key={label} className="hover:bg-slate-900/50 transition-colors">
                        <td className="py-1.5 px-3 text-slate-300 font-sans font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            <span>{label}</span>
                            <InfoPopover topic={glossaryKey} size="xs" />
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-right text-amber-200">{sVal}</td>
                        <td className="py-1.5 px-2 text-right text-cyan-200">{dVal}</td>
                        <td className={`py-1.5 px-3 text-right font-semibold ${delta.className}`}>
                          {delta.text}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === 'trends' && (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <fieldset
                  aria-label="Time-series metric selector"
                  className="m-0 flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg overflow-x-auto no-scrollbar"
                >
                  {TREND_CHANNELS.map((ch) => {
                    const active = selectedMetric === ch.id && trendsLayout === 'single';
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setSelectedMetric(ch.id);
                          setTrendsLayout('single');
                        }}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                          active
                            ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                            : 'text-slate-400 hover:text-slate-200 border border-transparent'
                        }`}
                      >
                        {ch.shortLabel}
                      </button>
                    );
                  })}
                </fieldset>

                <fieldset
                  aria-label="Trends layout mode"
                  className="m-0 flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg shrink-0"
                >
                  <button
                    type="button"
                    aria-pressed={trendsLayout === 'single'}
                    onClick={() => setTrendsLayout('single')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                      trendsLayout === 'single'
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Focus View
                  </button>
                  <button
                    type="button"
                    aria-pressed={trendsLayout === 'grid'}
                    onClick={() => setTrendsLayout('grid')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                      trendsLayout === 'grid'
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    2×2 Grid
                  </button>
                </fieldset>
              </div>

              {trendsLayout === 'single' ? (
                <>
                  <TimeSeriesChart
                    title={activeChannel.title}
                    unit={activeChannel.unit}
                    leftLabel={leftMeta.shortName}
                    rightLabel={rightMeta.shortName}
                    leftSeries={leftSeries}
                    rightSeries={rightSeries}
                    accessor={activeChannel.accessor}
                    decimals={activeChannel.decimals}
                    minMaxFloor={activeChannel.minMaxFloor}
                    referenceLines={referenceLinesByMetric[activeChannel.id]}
                    hoverIndex={hoverIndex}
                    onHoverIndexChange={setHoverIndex}
                    fireAlarmActive={fireAlarmActive}
                    lowerIsBetter={activeChannel.lowerIsBetter}
                    infoSlot={<InfoPopover topic={activeChannel.glossaryKey} size="xs" />}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs font-mono tabular-nums">
                    <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between">
                      <span className="font-sans font-semibold text-amber-300">
                        {leftMeta.shortName} ({leftSeries.length}s window)
                      </span>
                      <span className="text-slate-300">
                        Min {leftFocusStats.min.toFixed(activeChannel.decimals)} · Avg{' '}
                        {leftFocusStats.avg.toFixed(activeChannel.decimals)} · Max{' '}
                        {leftFocusStats.max.toFixed(activeChannel.decimals)}
                      </span>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between">
                      <span className="font-sans font-semibold text-cyan-300">
                        {rightMeta.shortName} ({rightSeries.length}s window)
                      </span>
                      <span className="text-slate-300">
                        Min {rightFocusStats.min.toFixed(activeChannel.decimals)} · Avg{' '}
                        {rightFocusStats.avg.toFixed(activeChannel.decimals)} · Max{' '}
                        {rightFocusStats.max.toFixed(activeChannel.decimals)}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {gridChannels.map((ch) => (
                    <TimeSeriesChart
                      key={ch.id}
                      title={ch.title}
                      unit={ch.unit}
                      leftLabel={leftMeta.shortName}
                      rightLabel={rightMeta.shortName}
                      leftSeries={leftSeries}
                      rightSeries={rightSeries}
                      accessor={ch.accessor}
                      decimals={ch.decimals}
                      minMaxFloor={ch.minMaxFloor}
                      referenceLines={referenceLinesByMetric[ch.id]}
                      compact={true}
                      hoverIndex={hoverIndex}
                      onHoverIndexChange={setHoverIndex}
                      fireAlarmActive={fireAlarmActive}
                      lowerIsBetter={ch.lowerIsBetter}
                      infoSlot={<InfoPopover topic={ch.glossaryKey} size="xs" />}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'distributions' && (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <fieldset
                  aria-label="Distribution metric"
                  className="m-0 flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg"
                >
                  <button
                    type="button"
                    aria-pressed={distMetric === 'wait'}
                    onClick={() => {
                      setDistMetric('wait');
                      setHoveredBin(null);
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                      distMetric === 'wait'
                        ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    Wait Time (AWT)
                  </button>
                  <button
                    type="button"
                    aria-pressed={distMetric === 'ttd'}
                    onClick={() => {
                      setDistMetric('ttd');
                      setHoveredBin(null);
                    }}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                      distMetric === 'ttd'
                        ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-500/40'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    Time to Destination (ATTD)
                  </button>
                </fieldset>

                <fieldset
                  aria-label="Distribution plot type"
                  className="m-0 flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg"
                >
                  <button
                    type="button"
                    aria-pressed={distMode === 'histogram'}
                    onClick={() => setDistMode('histogram')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                      distMode === 'histogram'
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Histogram
                  </button>
                  <button
                    type="button"
                    aria-pressed={distMode === 'cdf'}
                    onClick={() => setDistMode('cdf')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                      distMode === 'cdf'
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Cumulative CDF
                  </button>
                </fieldset>
              </div>

              <DistributionChart
                metric={distMetric}
                mode={distMode}
                leftLabel={leftMeta.shortName}
                rightLabel={rightMeta.shortName}
                leftSamples={distLeftValues}
                rightSamples={distRightValues}
                hoveredBin={hoveredBin}
                onHoverBinChange={setHoveredBin}
                infoSlot={
                  <InfoPopover topic={distMode === 'histogram' ? 'histogram' : 'cdf'} size="xs" />
                }
              />

              <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] sm:text-[11px] font-mono tracking-wider text-slate-400 bg-slate-900/70">
                      <th className="py-2 px-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span>Percentile / SLA</span>
                          <InfoPopover topic="percentiles" size="xs" />
                        </span>
                      </th>
                      <th className="py-2 px-2 text-right text-amber-300">{leftMeta.shortName}</th>
                      <th className="py-2 px-2 text-right text-cyan-300">{rightMeta.shortName}</th>
                      <th className="py-2 px-3 text-right">Delta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-[11px] sm:text-xs font-mono tabular-nums">
                    {(
                      [
                        [
                          null,
                          'P25',
                          distMetric === 'wait' ? left.p25Wait : left.p25TTD,
                          distMetric === 'wait' ? right.p25Wait : right.p25TTD,
                          's',
                        ],
                        [
                          'p95TTD' as GlossaryKey,
                          'P50 (Median)',
                          distMetric === 'wait' ? left.p50Wait : left.p50TTD,
                          distMetric === 'wait' ? right.p50Wait : right.p50TTD,
                          's',
                        ],
                        [
                          null,
                          'P75',
                          distMetric === 'wait' ? left.p75Wait : left.p75TTD,
                          distMetric === 'wait' ? right.p75Wait : right.p75TTD,
                          's',
                        ],
                        [
                          null,
                          'P90',
                          distMetric === 'wait' ? left.p90Wait : left.p90TTD,
                          distMetric === 'wait' ? right.p90Wait : right.p90TTD,
                          's',
                        ],
                        [
                          (distMetric === 'wait' ? 'p95Wait' : 'p95TTD') as GlossaryKey,
                          'P95 (Tail)',
                          distMetric === 'wait' ? left.p95Wait : left.p95TTD,
                          distMetric === 'wait' ? right.p95Wait : right.p95TTD,
                          's',
                        ],
                        [
                          'longWaitSla' as GlossaryKey,
                          'Wait > 30s SLA Breach',
                          left.longWait30Pct,
                          right.longWait30Pct,
                          '%',
                        ],
                        [
                          'longWaitSla' as GlossaryKey,
                          'Wait > 60s SLA Breach',
                          left.longWait60Pct,
                          right.longWait60Pct,
                          '%',
                        ],
                      ] as const
                    ).map(([glossaryKey, label, lv, rv, u]) => {
                      const d = formatDelta(lv, rv, true, u === '%' ? 'pp' : '%');
                      return (
                        <tr key={label} className="hover:bg-slate-900/50 transition-colors">
                          <td className="py-1.5 px-3 text-slate-300 font-sans font-medium">
                            <span className="inline-flex items-center gap-1.5">
                              <span>{label}</span>
                              {glossaryKey && <InfoPopover topic={glossaryKey} size="xs" />}
                            </span>
                          </td>
                          <td className="py-1.5 px-2 text-right text-amber-200">
                            {lv.toFixed(1)}
                            {u}
                          </td>
                          <td className="py-1.5 px-2 text-right text-cyan-200">
                            {rv.toFixed(1)}
                            {u}
                          </td>
                          <td className={`py-1.5 px-3 text-right font-semibold ${d.className}`}>
                            {d.text}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === 'matrix' && (
            <>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <fieldset
                  aria-label="Engineering matrix category filter"
                  className="m-0 flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg overflow-x-auto no-scrollbar"
                >
                  {MATRIX_CATEGORIES.map((cat) => {
                    const active = matrixCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setMatrixCategory(cat.id)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                          active
                            ? 'bg-slate-800 text-slate-100'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </fieldset>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {exportStatus && (
                    <span className="text-[11px] font-mono text-emerald-300">{exportStatus}</span>
                  )}
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="h-8 px-3 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-300" aria-hidden="true" />
                    <span>Export CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportJson}
                    className="h-8 px-3 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-300" aria-hidden="true" />
                    <span>Export JSON</span>
                  </button>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[10px] sm:text-[11px] font-mono tracking-wider text-slate-400 bg-slate-900/70">
                      <th className="py-2 px-3">Metric</th>
                      <th className="py-2 px-2 hidden md:table-cell">Criterion / Basis</th>
                      <th className="py-2 px-2 text-right text-amber-300">{leftMeta.shortName}</th>
                      <th className="py-2 px-2 text-right text-cyan-300">{rightMeta.shortName}</th>
                      <th className="py-2 px-2 text-right">CIBSE Target</th>
                      <th className="py-2 px-3 text-right">Delta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-[11px] sm:text-xs font-mono tabular-nums">
                    {filteredMatrixRows.map((row) => (
                      <tr key={row.label} className="hover:bg-slate-900/50 transition-colors">
                        <td className="py-1.5 px-3 text-slate-200 font-sans font-medium">
                          <span className="inline-flex items-center gap-1.5">
                            <span>{row.label}</span>
                            <InfoPopover topic={row.glossaryKey} size="xs" />
                          </span>
                        </td>
                        <td className="py-1.5 px-2 text-slate-400 font-sans text-[11px] hidden md:table-cell">
                          {row.formulaNote}
                        </td>
                        <td className="py-1.5 px-2 text-right text-amber-200">{row.leftVal}</td>
                        <td className="py-1.5 px-2 text-right text-cyan-200">{row.rightVal}</td>
                        <td className="py-1.5 px-2 text-right text-slate-400">{row.target}</td>
                        <td
                          className={`py-1.5 px-3 text-right font-semibold ${row.delta.className}`}
                        >
                          {row.delta.text}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
});
