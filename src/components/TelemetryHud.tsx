import {
  BarChart3,
  BookOpen,
  Crown,
  Flame,
  Keyboard,
  Pause,
  SlidersHorizontal,
  Sunrise,
  Sunset,
  Utensils,
} from 'lucide-react';
import { memo, useEffect, useMemo, useRef } from 'react';
import type { ComponentType } from 'react';
import { renderSparklineCanvas } from '../engine/canvasRenderer';
import { GITHUB_REPO_URL } from '../engine/constants';
import { ALGORITHM_META, PRESET_META, PRESET_ORDER } from '../engine/elevatorSim';
import type {
  DispatchAlgorithm,
  DistributionMode,
  TelemetrySnapshot,
  TowerSide,
} from '../types/simulation';
import { computeHistoryMax } from '../utils/cibse';
import { InfoPopover } from './InfoPopover';
import { TowerTelemetryCard } from './TowerTelemetryCard';

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
  onOpenShortcuts?: () => void;
}

const PRESET_ICONS: Record<DistributionMode, ComponentType<{ className?: string }>> = {
  realistic: Sunrise,
  lunch: Utensils,
  downpeak: Sunset,
  vip: Crown,
  uniform: SlidersHorizontal,
};

export const TelemetryHud = memo(function TelemetryHud({
  telemetry,
  paused,
  distributionMode,
  leftAlgorithm,
  rightAlgorithm,
  onSelectPreset,
  onSelectAlgorithm,
  onOpenMetrics,
  onOpenGuide,
  onOpenShortcuts,
}: TelemetryHudProps) {
  const sparkRef = useRef<HTMLCanvasElement | null>(null);

  const sparkMax = useMemo(
    () => computeHistoryMax(telemetry.leftHistory, telemetry.rightHistory),
    [telemetry.leftHistory, telemetry.rightHistory]
  );

  useEffect(() => {
    const canvas = sparkRef.current;
    if (!canvas || canvas.offsetParent === null) return;
    renderSparklineCanvas(canvas, telemetry.leftHistory, telemetry.rightHistory);
  }, [telemetry.leftHistory, telemetry.rightHistory]);

  const { left, right, clockText, fireAlarmActive } = telemetry;
  const leftMeta = ALGORITHM_META[leftAlgorithm];
  const rightMeta = ALGORITHM_META[rightAlgorithm];

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
            <span className="inline-flex items-center gap-1">
              <span
                className={`font-mono text-[11px] sm:text-xs font-semibold tabular-nums whitespace-nowrap ${advantageColor}`}
                title={`${rightMeta.name} vs ${leftMeta.name} average time to destination`}
              >
                {advantageText}
              </span>
              <InfoPopover topic="advantageDelta" size="xs" />
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
              {onOpenShortcuts && (
                <button
                  type="button"
                  onClick={onOpenShortcuts}
                  aria-label="Keyboard shortcuts"
                  title="Keyboard shortcuts (?)"
                  className="h-8 sm:h-9 w-8 sm:w-9 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 hover:text-white border border-slate-700 inline-flex items-center justify-center transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                >
                  <Keyboard className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
              <a
                href={GITHUB_REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View LiftBench source on GitHub"
                title="View source on GitHub"
                className="h-8 sm:h-9 w-8 sm:w-9 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-300 hover:text-white border border-slate-700 inline-flex items-center justify-center transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z"
                  />
                </svg>
              </a>
            </div>
          </div>

          <div className="w-full sm:w-auto flex items-center gap-1">
            <fieldset
              aria-label="Traffic preset scenarios"
              className="m-0 flex-1 sm:flex-initial flex items-center gap-0.5 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-[10px] sm:text-[11px] overflow-x-auto no-scrollbar"
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
            <InfoPopover topic="trafficPresets" size="xs" className="hidden sm:inline-flex" />
          </div>
        </div>

        <div className="grid grid-cols-12 gap-1.5 sm:gap-2 items-stretch">
          <TowerTelemetryCard
            side="left"
            algorithm={leftAlgorithm}
            stats={left}
            onSelectAlgorithm={onSelectAlgorithm}
            onOpenGuide={onOpenGuide}
          />

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

          <TowerTelemetryCard
            side="right"
            algorithm={rightAlgorithm}
            stats={right}
            onSelectAlgorithm={onSelectAlgorithm}
            onOpenGuide={onOpenGuide}
          />
        </div>
      </div>
    </header>
  );
});
