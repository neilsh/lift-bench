import { BarChart3, Flame, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { renderModalHistoryChart } from '../engine/canvasRenderer';
import { ALGORITHM_META, PRESET_META } from '../engine/elevatorSim';
import { useModalFocus } from '../hooks/useModalFocus';
import type { CibseGrade, DistributionMode, TelemetrySnapshot } from '../types/simulation';

interface MetricsModalProps {
  open: boolean;
  telemetry: TelemetrySnapshot;
  distributionMode: DistributionMode;
  onClose: () => void;
}

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

function getGradeTextColor(grade: CibseGrade): string {
  switch (grade) {
    case 'A':
    case 'B':
      return 'text-emerald-300';
    case 'C':
      return 'text-amber-300';
    case 'D':
    case 'F':
      return 'text-rose-300';
    default:
      return 'text-slate-400';
  }
}

export function MetricsModal({
  open,
  telemetry,
  distributionMode,
  onClose,
}: MetricsModalProps) {
  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const [chartMax, setChartMax] = useState(0);

  useModalFocus(open, onClose, closeBtnRef);

  useEffect(() => {
    if (!open || !chartCanvasRef.current) return;
    const maxQ = renderModalHistoryChart(
      chartCanvasRef.current,
      telemetry.leftHistory,
      telemetry.rightHistory
    );
    if (maxQ > 0) setChartMax(maxQ);
  }, [open, telemetry.leftHistory, telemetry.rightHistory]);

  if (!open) return null;

  const { left, right, leftAlgorithm, rightAlgorithm, clockText, fireAlarmActive } = telemetry;
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

  const rows: Array<[string, string, string, { text: string; className: string }]> = [
    [
      'CIBSE Guide D Grade',
      `Grade ${left.cibseGrade} (${left.cibseLabel})`,
      `Grade ${right.cibseGrade} (${right.cibseLabel})`,
      { text: '—', className: 'text-slate-500' },
    ],
    [
      'Mean TTD (Total)',
      `${left.avgTTD.toFixed(1)}s`,
      `${right.avgTTD.toFixed(1)}s`,
      formatDelta(left.avgTTD, right.avgTTD, true),
    ],
    [
      'Median TTD (P50)',
      `${left.p50TTD.toFixed(1)}s`,
      `${right.p50TTD.toFixed(1)}s`,
      formatDelta(left.p50TTD, right.p50TTD, true),
    ],
    [
      'Tail TTD (P95)',
      `${left.p95TTD.toFixed(1)}s`,
      `${right.p95TTD.toFixed(1)}s`,
      formatDelta(left.p95TTD, right.p95TTD, true),
    ],
    [
      'Tail Queue Wait (P95)',
      `${left.p95Wait.toFixed(1)}s`,
      `${right.p95Wait.toFixed(1)}s`,
      formatDelta(left.p95Wait, right.p95Wait, true),
    ],
    [
      'Live Max Wait (Rage)',
      `${left.maxCurrentWait.toFixed(0)}s`,
      `${right.maxCurrentWait.toFixed(0)}s`,
      formatDelta(left.maxCurrentWait, right.maxCurrentWait, true, 's'),
    ],
    [
      'Lobby Dispatch Interval',
      left.lobbyInterval > 0 ? `${left.lobbyInterval.toFixed(1)}s` : '—',
      right.lobbyInterval > 0 ? `${right.lobbyInterval.toFixed(1)}s` : '—',
      left.lobbyInterval > 0 && right.lobbyInterval > 0
        ? formatDelta(left.lobbyInterval, right.lobbyInterval, true)
        : { text: '—', className: 'text-slate-500' },
    ],
    [
      'Throughput (120s)',
      `${left.throughput.toFixed(1)}/m`,
      `${right.throughput.toFixed(1)}/m`,
      formatDelta(left.throughput, right.throughput, false),
    ],
    [
      'Stops / Trip',
      `${left.stopsPerTrip.toFixed(2)}`,
      `${right.stopsPerTrip.toFixed(2)}`,
      formatDelta(left.stopsPerTrip, right.stopsPerTrip, true),
    ],
    [
      'Car Utilization',
      `${Math.round(left.utilizationPct)}% (${left.avgPaxPerTrip.toFixed(1)})`,
      `${Math.round(right.utilizationPct)}% (${right.avgPaxPerTrip.toFixed(1)})`,
      formatDelta(left.utilizationPct, right.utilizationPct, false, 'pp'),
    ],
    [
      'Shaft Mileage',
      `${left.floorsPerPax.toFixed(1)} fl/p`,
      `${right.floorsPerPax.toFixed(1)} fl/p`,
      formatDelta(left.floorsPerPax, right.floorsPerPax, true),
    ],
    [
      'Est. Energy',
      `${left.whPerPax.toFixed(1)} Wh/p`,
      `${right.whPerPax.toFixed(1)} Wh/p`,
      formatDelta(left.whPerPax, right.whPerPax, true),
    ],
    [
      'Queue (Now / Peak)',
      `${left.waitingCount} / ${left.maxQueue}`,
      `${right.waitingCount} / ${right.maxQueue}`,
      formatDelta(left.waitingCount, right.waitingCount, true, ''),
    ],
    [
      'Total Delivered',
      `${left.served}`,
      `${right.served}`,
      formatDelta(left.served, right.served, false),
    ],
  ];

  return (
    <dialog
      open
      aria-modal="true"
      aria-labelledby="metricsModalTitle"
      className="fixed inset-0 z-50 m-0 flex h-full max-h-none w-full max-w-none items-center justify-center border-0 bg-transparent p-2.5 sm:p-4 text-inherit"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close telemetry modal"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm cursor-default"
      />
      <div className="modal-panel-anim relative w-full max-w-2xl max-h-[86dvh] bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="shrink-0 px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2 bg-slate-950/70">
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

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 flex flex-col gap-3">
          <div className="px-3 py-2 rounded-xl bg-slate-950/90 border border-slate-800 text-xs text-slate-200 flex items-center justify-between gap-2 flex-wrap">
            <span className="font-medium">{verdictContent}</span>
            <span className="font-mono tabular-nums text-[11px] text-slate-400">
              Sim {clockText}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-amber-300">{leftMeta.name} (Left)</span>
                <span className={`font-mono font-bold ${getGradeTextColor(left.cibseGrade)}`}>
                  Grade {left.cibseGrade} · {left.cibseLabel}
                </span>
              </div>
              <p className="text-slate-400 text-[10.5px] leading-snug mt-0.5">
                {leftMeta.description}
              </p>
            </div>
            <div className="bg-slate-950/70 border border-cyan-900/50 rounded-xl px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-cyan-300">{rightMeta.name} (Right)</span>
                <span className={`font-mono font-bold ${getGradeTextColor(right.cibseGrade)}`}>
                  Grade {right.cibseGrade} · {right.cibseLabel}
                </span>
              </div>
              <p className="text-slate-400 text-[10.5px] leading-snug mt-0.5">
                {rightMeta.description}
              </p>
            </div>
          </div>

          <div className="bg-slate-950/85 border border-slate-800 rounded-xl p-2.5 sm:p-3 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[10px] sm:text-xs font-mono tabular-nums">
              <span className="text-slate-300 font-semibold">Waiting Queue Trend (90s)</span>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-amber-300">
                  <i className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                  {leftMeta.shortName}
                </span>
                <span className="flex items-center gap-1 text-cyan-300">
                  <i className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
                  {rightMeta.shortName}
                </span>
                <span className="text-slate-400">
                  Max <strong className="text-slate-200">{chartMax}</strong>
                </span>
              </div>
            </div>
            <canvas ref={chartCanvasRef} className="w-full h-24 sm:h-28 block" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="bg-slate-950/85 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="font-semibold text-amber-300 truncate">
                  {leftMeta.shortName} Split
                </span>
                <span className="font-mono tabular-nums text-[10px] text-slate-400 shrink-0">
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

            <div className="bg-slate-950/85 border border-cyan-900/50 rounded-xl p-2.5 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs gap-2">
                <span className="font-semibold text-cyan-300 truncate">
                  {rightMeta.shortName} Split
                </span>
                <span className="font-mono tabular-nums text-[10px] text-slate-400 shrink-0">
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

          <div className="bg-slate-950/85 border border-slate-800 rounded-xl overflow-hidden">
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
                {rows.map(([label, sVal, dVal, delta]) => (
                  <tr key={label} className="hover:bg-slate-900/50 transition-colors">
                    <td className="py-1.5 px-3 text-slate-300 font-sans font-medium">{label}</td>
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

          <p className="text-[10px] sm:text-[11px] text-slate-400 text-center">
            Tip: Click any floor number on the center spine to spawn a{' '}
            <span className="text-cyan-300 font-mono">+4</span> burst on that floor. Red rings
            indicate riders waiting &gt;40s.
          </p>
        </div>
      </div>
    </dialog>
  );
}
