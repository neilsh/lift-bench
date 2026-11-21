import { Download } from 'lucide-react';
import { memo, useState } from 'react';
import { ALGORITHM_META } from '../../engine/elevatorSim';
import type { DistributionMode, SimConfig, TelemetrySnapshot } from '../../types/simulation';
import {
  serializeTelemetryCsv,
  serializeTelemetryJson,
  triggerFileDownload,
} from '../../utils/telemetryExport';
import { InfoPopover } from '../InfoPopover';
import type { MatrixCategory, MatrixRow } from './metricsConfig';
import { MATRIX_CATEGORIES, formatDelta } from './metricsConfig';

interface MetricsMatrixTabProps {
  telemetry: TelemetrySnapshot;
  distributionMode: DistributionMode;
  config?: SimConfig;
}

export const MetricsMatrixTab = memo(function MetricsMatrixTab({
  telemetry,
  distributionMode,
  config,
}: MetricsMatrixTabProps) {
  const [matrixCategory, setMatrixCategory] = useState<MatrixCategory>('all');
  const [exportStatus, setExportStatus] = useState<string>('');

  const {
    left,
    right,
    leftAlgorithm,
    rightAlgorithm,
    clockText,
    cibseBenchmark,
    leftSeries,
    rightSeries,
  } = telemetry;

  const leftMeta = ALGORITHM_META[leftAlgorithm];
  const rightMeta = ALGORITHM_META[rightAlgorithm];

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

  return (
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
                  active ? 'bg-slate-800 text-slate-100' : 'text-slate-400 hover:text-slate-200'
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
                <td className={`py-1.5 px-3 text-right font-semibold ${row.delta.className}`}>
                  {row.delta.text}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
});
