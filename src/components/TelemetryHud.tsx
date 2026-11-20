import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ALGORITHM_META, ALGORITHM_ORDER, PRESET_META } from '../engine/elevatorSim';
import { renderSparklineCanvas } from '../engine/canvasRenderer';
import type {
  DispatchAlgorithm,
  DistributionMode,
  TelemetrySnapshot,
  TowerSide,
} from '../types/simulation';

interface TelemetryHudProps {
  telemetry: TelemetrySnapshot;
  paused: boolean;
  distributionMode: DistributionMode;
  leftAlgorithm: DispatchAlgorithm;
  rightAlgorithm: DispatchAlgorithm;
  onSelectPreset: (mode: DistributionMode) => void;
  onSelectAlgorithm: (side: TowerSide, algorithm: DispatchAlgorithm) => void;
  onOpenMetrics: () => void;
}

const PRESET_ORDER: DistributionMode[] = ['realistic', 'lunch', 'downpeak', 'vip', 'uniform'];

export function TelemetryHud({
  telemetry,
  paused,
  distributionMode,
  leftAlgorithm,
  rightAlgorithm,
  onSelectPreset,
  onSelectAlgorithm,
  onOpenMetrics,
}: TelemetryHudProps) {
  const sparkRef = useRef<HTMLCanvasElement | null>(null);
  const [sparkMax, setSparkMax] = useState(0);

  useEffect(() => {
    const canvas = sparkRef.current;
    if (!canvas || canvas.offsetParent === null) return;
    const maxQ = renderSparklineCanvas(canvas, telemetry.leftHistory, telemetry.rightHistory);
    if (maxQ > 0) setSparkMax(maxQ);
  }, [telemetry.leftHistory, telemetry.rightHistory]);

  const { left, right, clockText, fireAlarmActive } = telemetry;
  const leftMeta = ALGORITHM_META[leftAlgorithm];
  const rightMeta = ALGORITHM_META[rightAlgorithm];

  const leftTot = Math.max(0.1, left.avgTTD);
  const rightTot = Math.max(0.1, right.avgTTD);

  let advantageText = `${rightMeta.shortName}: --% ATTD`;
  let advantageCls =
    'px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-mono font-semibold tabular-nums bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 transition-colors whitespace-nowrap';

  if (left.avgTTD > 1 && right.avgTTD > 1) {
    const pctDelta = ((right.avgTTD - left.avgTTD) / left.avgTTD) * 100;
    const sign = pctDelta > 0 ? '+' : '';
    advantageText = `${rightMeta.shortName}: ${sign}${Math.round(pctDelta)}% ATTD`;
    if (pctDelta <= -5) {
      advantageCls =
        'px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-mono font-semibold tabular-nums bg-emerald-500/15 text-emerald-300 border border-emerald-500/35 transition-colors whitespace-nowrap';
    } else if (pctDelta >= 5) {
      advantageCls =
        'px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-mono font-semibold tabular-nums bg-amber-500/15 text-amber-300 border border-amber-500/35 transition-colors whitespace-nowrap';
    } else {
      advantageCls =
        'px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-mono font-semibold tabular-nums bg-slate-800 text-slate-300 border border-slate-700 transition-colors whitespace-nowrap';
    }
  }

  const dotCls = paused
    ? 'w-2 h-2 rounded-full bg-amber-400'
    : fireAlarmActive
      ? 'w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e] badge-saturated'
      : 'w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]';

  return (
    <header className="shrink-0 bg-slate-900/95 border-b border-slate-800 px-2 sm:px-4 py-1.5 sm:py-2 z-20 shadow-lg">
      <div className="max-w-7xl mx-auto flex flex-col gap-1.5">
        {/* Row 1: Title, Fire Alarm Badge, Advantage Pill, Metrics Trigger & Traffic Presets */}
        <div className="flex items-center justify-between gap-1.5 flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className={dotCls} aria-hidden="true" />
            <h1 className="text-xs sm:text-sm font-bold tracking-tight text-slate-100 whitespace-nowrap">
              LiftBench
            </h1>
            <span className="font-mono tabular-nums text-[10px] sm:text-[11px] text-slate-400 bg-slate-800/90 px-1.5 py-0.5 rounded">
              {clockText}
            </span>
            {fireAlarmActive && (
              <span className="badge-saturated font-mono text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/50 whitespace-nowrap">
                🚨 FIRE ALARM
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <div className={advantageCls} title={`${rightMeta.name} vs ${leftMeta.name} average time to destination`}>
              {advantageText}
            </div>
            <button
              type="button"
              onClick={onOpenMetrics}
              className="px-2 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-sky-300 border border-sky-500/35 flex items-center gap-1 transition-colors shadow-sm cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              title="Open live deep metrics, percentiles & energy comparison"
            >
              <span aria-hidden="true">📊</span>
              <span>Metrics</span>
            </button>
          </div>

          {/* Time-of-Day & Scenario Preset Switcher */}
          <div className="w-full sm:w-auto flex items-center gap-0.5 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[10px] sm:text-[11px] overflow-x-auto no-scrollbar">
            {PRESET_ORDER.map((mode) => {
              const meta = PRESET_META[mode];
              const active = distributionMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onSelectPreset(mode)}
                  className={`shrink-0 px-2 py-0.5 sm:py-1 rounded-md font-medium transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                    active
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {meta.emoji} {meta.shortLabel}
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 2: Side-by-Side Twin Metrics & Algorithm Selectors */}
        <div className="grid grid-cols-12 gap-1.5 sm:gap-2 items-stretch">
          {/* LEFT TOWER TELEMETRY */}
          <div
            role="button"
            tabIndex={0}
            onClick={onOpenMetrics}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenMetrics();
              }
            }}
            title="Click for detailed analytics & percentiles"
            className="hud-card-btn col-span-6 lg:col-span-5 bg-slate-950/80 border border-slate-800/90 hover:border-amber-500/45 rounded-lg p-1.5 sm:p-2 flex flex-col justify-between gap-1 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1 min-w-0">
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 shadow-[0_0_6px_rgba(251,191,36,0.5)]" />
                <div
                  className="relative flex items-center min-w-0"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <select
                    aria-label="Left tower dispatch algorithm"
                    value={leftAlgorithm}
                    onChange={(e) => onSelectAlgorithm('left', e.target.value as DispatchAlgorithm)}
                    title={leftMeta.description}
                    className="appearance-none bg-slate-900/90 hover:bg-slate-800/90 text-amber-200 border border-amber-500/25 hover:border-amber-400/50 rounded-md pl-1.5 pr-5 py-0.5 text-[10.5px] sm:text-xs font-semibold truncate max-w-[125px] sm:max-w-[190px] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    {ALGORITHM_ORDER.map((id) => (
                      <option key={id} value={id} className="bg-slate-900 text-slate-100">
                        {ALGORITHM_META[id].name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-1.5 w-3 h-3 text-amber-300/80"
                    aria-hidden="true"
                  />
                </div>
                {left.saturated && (
                  <span className="badge-saturated text-[8px] sm:text-[9px] font-mono font-bold px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 shrink-0">
                    SAT
                  </span>
                )}
              </div>
              <div className="text-right shrink-0">
                <span className="font-mono tabular-nums text-xs sm:text-base font-bold text-amber-300">
                  {left.avgTTD.toFixed(1)}s
                </span>
                <span className="text-[10px] text-slate-400 hidden sm:inline"> avg TTD</span>
              </div>
            </div>

            <div
              className="w-full h-2 sm:h-2.5 bg-slate-900 rounded-full overflow-hidden flex border border-slate-800"
              title="Queue Wait / Active Travel / Stop Overhead"
            >
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

            <div className="flex flex-col gap-0.5 text-[9px] sm:text-[11px] tracking-tight font-mono tabular-nums text-slate-400">
              <div className="flex items-center justify-between gap-1">
                <span className="whitespace-nowrap">
                  Thru{' '}
                  <strong className={left.saturated ? 'text-rose-400' : 'text-emerald-300'}>
                    {left.throughput.toFixed(1)}
                  </strong>
                  /m
                </span>
                <span className="whitespace-nowrap">
                  Stp <strong className="text-slate-200">{left.stopsPerTrip.toFixed(1)}</strong> · Q{' '}
                  <strong className="text-amber-300">{left.waitingCount}</strong>
                </span>
              </div>
              <div className="flex items-center justify-between gap-1 text-[8.5px] sm:text-[10px] text-slate-500">
                <span className="whitespace-nowrap">
                  Wait <strong className="text-amber-300">{Math.round(left.avgWait)}s</strong> · P95{' '}
                  <strong className="text-slate-300">{Math.round(left.p95TTD)}s</strong>
                </span>
                <span className="whitespace-nowrap">
                  Out <strong className="text-slate-300">{left.served}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* QUEUE SPARKLINE & LEGEND */}
          <div
            role="button"
            tabIndex={0}
            onClick={onOpenMetrics}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenMetrics();
              }
            }}
            title="Click to expand live charts"
            className="hud-card-btn hidden lg:flex lg:col-span-2 bg-slate-950/80 border border-slate-800/90 hover:border-sky-500/45 rounded-lg p-1.5 flex-col justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <div className="flex items-center justify-between text-[9px] font-mono tabular-nums text-slate-400 px-0.5">
              <span>WAITING QUEUE</span>
              <span>{sparkMax}</span>
            </div>
            <canvas ref={sparkRef} className="w-full h-7 block" />
            <div className="flex items-center justify-center gap-2 text-[9px] text-slate-400">
              <span className="flex items-center gap-1">
                <i className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                Wait
              </span>
              <span className="flex items-center gap-1">
                <i className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block" />
                Ride
              </span>
              <span className="flex items-center gap-1">
                <i className="w-1.5 h-1.5 rounded-full bg-rose-500 inline-block" />
                Stops
              </span>
            </div>
          </div>

          {/* RIGHT TOWER TELEMETRY */}
          <div
            role="button"
            tabIndex={0}
            onClick={onOpenMetrics}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenMetrics();
              }
            }}
            title="Click for detailed analytics & percentiles"
            className="hud-card-btn col-span-6 lg:col-span-5 bg-slate-950/80 border border-cyan-900/50 hover:border-cyan-400/60 rounded-lg p-1.5 sm:p-2 flex flex-col justify-between gap-1 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1 min-w-0">
                <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0 shadow-[0_0_6px_rgba(34,211,238,0.5)]" />
                <div
                  className="relative flex items-center min-w-0"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <select
                    aria-label="Right tower dispatch algorithm"
                    value={rightAlgorithm}
                    onChange={(e) => onSelectAlgorithm('right', e.target.value as DispatchAlgorithm)}
                    title={rightMeta.description}
                    className="appearance-none bg-slate-900/90 hover:bg-slate-800/90 text-cyan-200 border border-cyan-500/25 hover:border-cyan-400/50 rounded-md pl-1.5 pr-5 py-0.5 text-[10.5px] sm:text-xs font-semibold truncate max-w-[125px] sm:max-w-[190px] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                  >
                    {ALGORITHM_ORDER.map((id) => (
                      <option key={id} value={id} className="bg-slate-900 text-slate-100">
                        {ALGORITHM_META[id].name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="pointer-events-none absolute right-1.5 w-3 h-3 text-cyan-300/80"
                    aria-hidden="true"
                  />
                </div>
                {right.saturated && (
                  <span className="badge-saturated text-[8px] sm:text-[9px] font-mono font-bold px-1 py-0.2 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 shrink-0">
                    SAT
                  </span>
                )}
              </div>
              <div className="text-right shrink-0">
                <span className="font-mono tabular-nums text-xs sm:text-base font-bold text-cyan-300">
                  {right.avgTTD.toFixed(1)}s
                </span>
                <span className="text-[10px] text-slate-400 hidden sm:inline"> avg TTD</span>
              </div>
            </div>

            <div
              className="w-full h-2 sm:h-2.5 bg-slate-900 rounded-full overflow-hidden flex border border-slate-800"
              title="Queue Wait / Active Travel / Stop Overhead"
            >
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

            <div className="flex flex-col gap-0.5 text-[9px] sm:text-[11px] tracking-tight font-mono tabular-nums text-slate-400">
              <div className="flex items-center justify-between gap-1">
                <span className="whitespace-nowrap">
                  Thru{' '}
                  <strong className={right.saturated ? 'text-rose-400' : 'text-cyan-300'}>
                    {right.throughput.toFixed(1)}
                  </strong>
                  /m
                </span>
                <span className="whitespace-nowrap">
                  Stp <strong className="text-slate-200">{right.stopsPerTrip.toFixed(1)}</strong> · Q{' '}
                  <strong className="text-cyan-300">{right.waitingCount}</strong>
                </span>
              </div>
              <div className="flex items-center justify-between gap-1 text-[8.5px] sm:text-[10px] text-slate-500">
                <span className="whitespace-nowrap">
                  Wait <strong className="text-amber-300">{Math.round(right.avgWait)}s</strong> · P95{' '}
                  <strong className="text-slate-300">{Math.round(right.p95TTD)}s</strong>
                </span>
                <span className="whitespace-nowrap">
                  Out <strong className="text-slate-300">{right.served}</strong>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
