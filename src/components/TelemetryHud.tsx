import {
  BarChart3,
  BookOpen,
  ChevronDown,
  Crown,
  Flame,
  Info,
  Pause,
  SlidersHorizontal,
  Sunrise,
  Sunset,
  Utensils,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { renderSparklineCanvas } from '../engine/canvasRenderer';
import { ALGORITHM_META, ALGORITHM_ORDER, PRESET_META } from '../engine/elevatorSim';
import type {
  CibseGrade,
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
  onOpenGuide: (focusedAlgorithm?: DispatchAlgorithm) => void;
}

const PRESET_ORDER: DistributionMode[] = ['realistic', 'lunch', 'downpeak', 'vip', 'uniform'];

const PRESET_ICONS: Record<DistributionMode, ComponentType<{ className?: string }>> = {
  realistic: Sunrise,
  lunch: Utensils,
  downpeak: Sunset,
  vip: Crown,
  uniform: SlidersHorizontal,
};

function getGradeClass(grade: CibseGrade): string {
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

export function TelemetryHud({
  telemetry,
  paused,
  distributionMode,
  leftAlgorithm,
  rightAlgorithm,
  onSelectPreset,
  onSelectAlgorithm,
  onOpenMetrics,
  onOpenGuide,
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
  let advantageColor = 'text-slate-400';

  if (left.avgTTD > 1 && right.avgTTD > 1) {
    const pctDelta = ((right.avgTTD - left.avgTTD) / left.avgTTD) * 100;
    const sign = pctDelta > 0 ? '+' : '';
    advantageText = `${rightMeta.shortName}: ${sign}${Math.round(pctDelta)}% ATTD`;
    if (pctDelta <= -5) {
      advantageColor = 'text-emerald-300';
    } else if (pctDelta >= 5) {
      advantageColor = 'text-amber-300';
    } else {
      advantageColor = 'text-slate-300';
    }
  }

  return (
    <header className="shrink-0 bg-slate-900/95 border-b border-slate-800 px-2 sm:px-4 py-1.5 sm:py-2 z-20 shadow-lg">
      <div className="max-w-7xl mx-auto flex flex-col gap-1.5">
        {/* Row 1: Title, Unboxed Telemetry Metadata, Guide & Metrics Triggers, and Traffic Presets */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-xs sm:text-sm font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
              LiftBench
            </h1>
            <span className="text-slate-700" aria-hidden="true">
              ·
            </span>
            <span className="font-mono tabular-nums text-[11px] sm:text-xs text-slate-300 whitespace-nowrap">
              {clockText}
            </span>
            {paused && (
              <>
                <span className="text-slate-700" aria-hidden="true">
                  ·
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-amber-300 whitespace-nowrap">
                  <Pause className="w-3 h-3" aria-hidden="true" />
                  <span>Paused</span>
                </span>
              </>
            )}
            {fireAlarmActive && (
              <>
                <span className="text-slate-700" aria-hidden="true">
                  ·
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-rose-300 whitespace-nowrap">
                  <Flame className="w-3 h-3" aria-hidden="true" />
                  <span>Fire Alarm</span>
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <span
              className={`font-mono text-[11px] sm:text-xs font-semibold tabular-nums whitespace-nowrap ${advantageColor}`}
              title={`${rightMeta.name} vs ${leftMeta.name} average time to destination`}
            >
              {advantageText}
            </span>
            <span className="text-slate-700 hidden sm:inline" aria-hidden="true">
              ·
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onOpenGuide(rightAlgorithm)}
                className="h-8 sm:h-9 px-2.5 rounded-lg text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                title="Read concise explanations of all 6 dispatch algorithms"
              >
                <BookOpen className="w-3.5 h-3.5 text-cyan-300" aria-hidden="true" />
                <span>Guide</span>
              </button>
              <button
                type="button"
                onClick={onOpenMetrics}
                className="h-8 sm:h-9 px-2.5 rounded-lg text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-sky-300 border border-sky-500/35 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                title="Open live deep metrics, percentiles & energy comparison"
              >
                <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Metrics</span>
              </button>
            </div>
          </div>

          {/* Time-of-Day & Scenario Preset Switcher */}
          <fieldset
            aria-label="Traffic preset scenarios"
            className="m-0 w-full sm:w-auto flex items-center gap-0.5 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[10px] sm:text-[11px] overflow-x-auto no-scrollbar"
          >
            {PRESET_ORDER.map((mode) => {
              const meta = PRESET_META[mode];
              const Icon = PRESET_ICONS[mode];
              const active = distributionMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onSelectPreset(mode)}
                  aria-pressed={active}
                  className={`shrink-0 px-2.5 py-1 rounded-md font-medium flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                    active
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span>{meta.shortLabel}</span>
                </button>
              );
            })}
          </fieldset>
        </div>

        {/* Row 2: Decoupled Twin Telemetry Sections & Sparkline */}
        <div className="grid grid-cols-12 gap-1.5 sm:gap-2 items-stretch">
          {/* LEFT TOWER TELEMETRY */}
          <section
            aria-label="Left tower telemetry"
            className="col-span-6 lg:col-span-5 bg-slate-950/80 border border-slate-800/90 rounded-lg p-1.5 sm:p-2 flex flex-col justify-between gap-1 overflow-hidden"
          >
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1 min-w-0">
                <div className="relative flex items-center min-w-0">
                  <select
                    aria-label="Left tower dispatch algorithm"
                    value={leftAlgorithm}
                    onChange={(e) => onSelectAlgorithm('left', e.target.value as DispatchAlgorithm)}
                    title={leftMeta.description}
                    className="appearance-none bg-slate-900/90 hover:bg-slate-800/90 text-amber-200 border border-amber-500/25 hover:border-amber-400/50 rounded-md pl-2 pr-5 py-1 text-[10.5px] sm:text-xs font-semibold truncate max-w-[115px] sm:max-w-[175px] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
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
                <button
                  type="button"
                  onClick={() => onOpenGuide(leftAlgorithm)}
                  aria-label={`Explain ${leftMeta.name} algorithm`}
                  title={`How ${leftMeta.name} works`}
                  className="w-7 h-7 rounded-md bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-amber-300 flex items-center justify-center transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                >
                  <Info className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                {left.saturated && (
                  <span className="font-mono text-[9px] font-bold text-rose-300 shrink-0">
                    SAT
                  </span>
                )}
              </div>

              <div className="text-right shrink-0 flex items-baseline gap-1.5">
                <span
                  className={`font-mono text-[10px] sm:text-xs font-bold hidden sm:inline ${getGradeClass(left.cibseGrade)}`}
                  title={`CIBSE Guide D Grade ${left.cibseGrade}: ${left.cibseLabel}`}
                >
                  {left.cibseGrade}
                </span>
                <span className="font-mono tabular-nums text-xs sm:text-base font-bold text-amber-300">
                  {left.avgTTD.toFixed(1)}s
                </span>
                <span className="text-[10px] text-slate-400 hidden md:inline">TTD</span>
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
              <div className="flex items-center justify-between gap-1 text-[8.5px] sm:text-[10px] text-slate-400">
                <span className="whitespace-nowrap">
                  Wait <strong className="text-amber-300">{Math.round(left.avgWait)}s</strong> · P95{' '}
                  <strong className="text-slate-200">{Math.round(left.p95TTD)}s</strong>
                  <span className="hidden sm:inline">
                    {' '}
                    · Int{' '}
                    <strong className="text-slate-200">
                      {left.lobbyInterval > 0 ? `${Math.round(left.lobbyInterval)}s` : '—'}
                    </strong>
                  </span>
                </span>
                <span className="whitespace-nowrap">
                  Out <strong className="text-slate-200">{left.served}</strong>
                </span>
              </div>
            </div>
          </section>

          {/* QUEUE SPARKLINE & LEGEND */}
          <button
            type="button"
            onClick={onOpenMetrics}
            aria-label="Open expanded waiting queue chart and telemetry modal"
            title="Click to expand live charts"
            className="hud-card-btn hidden lg:flex lg:col-span-2 bg-slate-950/80 border border-slate-800/90 hover:border-sky-500/45 rounded-lg p-1.5 flex-col justify-between text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <div className="w-full flex items-center justify-between text-[9px] font-mono tabular-nums text-slate-400 px-0.5">
              <span>Queue</span>
              <span>Max {sparkMax}</span>
            </div>
            <canvas ref={sparkRef} className="w-full h-7 block" />
            <div className="w-full flex items-center justify-center gap-2 text-[9px] text-slate-400">
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
          </button>

          {/* RIGHT TOWER TELEMETRY */}
          <section
            aria-label="Right tower telemetry"
            className="col-span-6 lg:col-span-5 bg-slate-950/80 border border-cyan-900/50 rounded-lg p-1.5 sm:p-2 flex flex-col justify-between gap-1 overflow-hidden"
          >
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1 min-w-0">
                <div className="relative flex items-center min-w-0">
                  <select
                    aria-label="Right tower dispatch algorithm"
                    value={rightAlgorithm}
                    onChange={(e) => onSelectAlgorithm('right', e.target.value as DispatchAlgorithm)}
                    title={rightMeta.description}
                    className="appearance-none bg-slate-900/90 hover:bg-slate-800/90 text-cyan-200 border border-cyan-500/25 hover:border-cyan-400/50 rounded-md pl-2 pr-5 py-1 text-[10.5px] sm:text-xs font-semibold truncate max-w-[115px] sm:max-w-[175px] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
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
                <button
                  type="button"
                  onClick={() => onOpenGuide(rightAlgorithm)}
                  aria-label={`Explain ${rightMeta.name} algorithm`}
                  title={`How ${rightMeta.name} works`}
                  className="w-7 h-7 rounded-md bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-cyan-300 flex items-center justify-center transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  <Info className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                {right.saturated && (
                  <span className="font-mono text-[9px] font-bold text-rose-300 shrink-0">
                    SAT
                  </span>
                )}
              </div>

              <div className="text-right shrink-0 flex items-baseline gap-1.5">
                <span
                  className={`font-mono text-[10px] sm:text-xs font-bold hidden sm:inline ${getGradeClass(right.cibseGrade)}`}
                  title={`CIBSE Guide D Grade ${right.cibseGrade}: ${right.cibseLabel}`}
                >
                  {right.cibseGrade}
                </span>
                <span className="font-mono tabular-nums text-xs sm:text-base font-bold text-cyan-300">
                  {right.avgTTD.toFixed(1)}s
                </span>
                <span className="text-[10px] text-slate-400 hidden md:inline">TTD</span>
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
              <div className="flex items-center justify-between gap-1 text-[8.5px] sm:text-[10px] text-slate-400">
                <span className="whitespace-nowrap">
                  Wait <strong className="text-amber-300">{Math.round(right.avgWait)}s</strong> · P95{' '}
                  <strong className="text-slate-200">{Math.round(right.p95TTD)}s</strong>
                  <span className="hidden sm:inline">
                    {' '}
                    · Int{' '}
                    <strong className="text-slate-200">
                      {right.lobbyInterval > 0 ? `${Math.round(right.lobbyInterval)}s` : '—'}
                    </strong>
                  </span>
                </span>
                <span className="whitespace-nowrap">
                  Out <strong className="text-slate-200">{right.served}</strong>
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </header>
  );
}
