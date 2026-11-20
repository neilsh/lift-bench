import { ChevronDown, Info } from 'lucide-react';
import { memo } from 'react';
import { ALGORITHM_META, ALGORITHM_ORDER, isDispatchAlgorithm } from '../engine/elevatorSim';
import type { DispatchAlgorithm, TowerSide, WorldTelemetry } from '../types/simulation';
import { getCibseGradeColorClass } from '../utils/cibse';
import { InfoPopover } from './InfoPopover';

interface TowerTelemetryCardProps {
  side: TowerSide;
  algorithm: DispatchAlgorithm;
  stats: WorldTelemetry;
  onSelectAlgorithm: (side: TowerSide, algorithm: DispatchAlgorithm) => void;
  onOpenGuide: (focusedAlgorithm?: DispatchAlgorithm) => void;
}

const SIDE_THEME: Record<
  TowerSide,
  {
    sectionLabel: string;
    selectAriaLabel: string;
    containerBorder: string;
    selectTone: string;
    chevronTone: string;
    infoHoverTone: string;
    ttdTone: string;
    thruTone: string;
    queueTone: string;
  }
> = {
  left: {
    sectionLabel: 'Left tower telemetry',
    selectAriaLabel: 'Left tower dispatch algorithm',
    containerBorder: 'border-slate-800/90',
    selectTone:
      'text-amber-200 border-amber-500/25 hover:border-amber-400/50 focus-visible:ring-amber-400',
    chevronTone: 'text-amber-300/80',
    infoHoverTone: 'hover:text-amber-300 focus-visible:ring-amber-400',
    ttdTone: 'text-amber-300',
    thruTone: 'text-emerald-300',
    queueTone: 'text-amber-300',
  },
  right: {
    sectionLabel: 'Right tower telemetry',
    selectAriaLabel: 'Right tower dispatch algorithm',
    containerBorder: 'border-cyan-900/50',
    selectTone:
      'text-cyan-200 border-cyan-500/25 hover:border-cyan-400/50 focus-visible:ring-cyan-400',
    chevronTone: 'text-cyan-300/80',
    infoHoverTone: 'hover:text-cyan-300 focus-visible:ring-cyan-400',
    ttdTone: 'text-cyan-300',
    thruTone: 'text-cyan-300',
    queueTone: 'text-cyan-300',
  },
};

export const TowerTelemetryCard = memo(function TowerTelemetryCard({
  side,
  algorithm,
  stats,
  onSelectAlgorithm,
  onOpenGuide,
}: TowerTelemetryCardProps) {
  const theme = SIDE_THEME[side];
  const meta = ALGORITHM_META[algorithm];
  const totalTtd = Math.max(0.1, stats.avgTTD);

  return (
    <section
      aria-label={theme.sectionLabel}
      className={`col-span-6 lg:col-span-5 bg-slate-950/80 border ${theme.containerBorder} rounded-lg p-1.5 sm:p-2 flex flex-col justify-between gap-1 overflow-hidden`}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1 min-w-0">
          <div className="relative flex items-center min-w-0">
            <select
              aria-label={theme.selectAriaLabel}
              value={algorithm}
              onChange={(e) => {
                if (isDispatchAlgorithm(e.target.value)) {
                  onSelectAlgorithm(side, e.target.value);
                }
              }}
              title={meta.description}
              className={`appearance-none bg-slate-900/90 hover:bg-slate-800/90 border rounded-md pl-2 pr-5 py-1 text-[10.5px] sm:text-xs font-semibold truncate max-w-[115px] sm:max-w-[175px] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 ${theme.selectTone}`}
            >
              {ALGORITHM_ORDER.map((id) => (
                <option key={id} value={id} className="bg-slate-900 text-slate-100">
                  {ALGORITHM_META[id].name}
                </option>
              ))}
            </select>
            <ChevronDown
              className={`pointer-events-none absolute right-1.5 w-3 h-3 ${theme.chevronTone}`}
              aria-hidden="true"
            />
          </div>
          <button
            type="button"
            onClick={() => onOpenGuide(algorithm)}
            aria-label={`Explain ${meta.name} algorithm`}
            title={`How ${meta.name} works`}
            className={`w-7 h-7 rounded-md bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-slate-400 flex items-center justify-center transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 ${theme.infoHoverTone}`}
          >
            <Info className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          {stats.saturated && (
            <span className="inline-flex items-center gap-0.5 shrink-0">
              <span className="font-mono text-[9px] font-bold text-rose-300">SAT</span>
              <InfoPopover topic="saturation" size="xs" />
            </span>
          )}
        </div>

        <div className="text-right shrink-0 flex items-center gap-1">
          <div className="flex items-baseline gap-1.5">
            <span
              className={`font-mono text-[10px] sm:text-xs font-bold hidden sm:inline ${getCibseGradeColorClass(stats.cibseGrade)}`}
              title={`CIBSE Guide D Grade ${stats.cibseGrade}: ${stats.cibseLabel}`}
            >
              {stats.cibseGrade}
            </span>
            <span
              className={`font-mono tabular-nums text-xs sm:text-base font-bold ${theme.ttdTone}`}
            >
              {stats.avgTTD.toFixed(1)}s
            </span>
            <span className="text-[10px] text-slate-400 hidden md:inline">TTD</span>
          </div>
          <InfoPopover topic="cibseGrade" size="xs" className="hidden sm:inline-flex" />
        </div>
      </div>

      <div
        className="w-full h-2 sm:h-2.5 bg-slate-900 rounded-full overflow-hidden flex border border-slate-800"
        title="Queue Wait / Active Travel / Stop Overhead"
      >
        <div
          className="h-full bg-amber-500 transition-all duration-150"
          style={{ width: `${(stats.avgWait / totalTtd) * 100}%` }}
        />
        <div
          className="h-full bg-sky-500 transition-all duration-150"
          style={{ width: `${(stats.avgTravel / totalTtd) * 100}%` }}
        />
        <div
          className="h-full bg-rose-500 transition-all duration-150"
          style={{ width: `${(stats.avgStop / totalTtd) * 100}%` }}
        />
      </div>

      <div className="flex flex-col gap-0.5 text-[9px] sm:text-[11px] tracking-tight font-mono tabular-nums text-slate-400">
        <div className="flex items-center justify-between gap-1">
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <span>
              Thru{' '}
              <strong className={stats.saturated ? 'text-rose-400' : theme.thruTone}>
                {stats.throughput.toFixed(1)}
              </strong>
              /m
            </span>
            <InfoPopover topic="throughput" size="xs" className="hidden md:inline-flex" />
          </span>
          <span className="whitespace-nowrap">
            Stp <strong className="text-slate-200">{stats.stopsPerTrip.toFixed(1)}</strong> · Q{' '}
            <strong className={theme.queueTone}>{stats.waitingCount}</strong>
          </span>
        </div>
        <div className="flex items-center justify-between gap-1 text-[8.5px] sm:text-[10px] text-slate-400">
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <span>
              Wait <strong className="text-amber-300">{Math.round(stats.avgWait)}s</strong> · P95{' '}
              <strong className="text-slate-200">{Math.round(stats.p95TTD)}s</strong>
              <span className="hidden sm:inline">
                {' '}
                · Int{' '}
                <strong className="text-slate-200">
                  {stats.lobbyInterval > 0 ? `${Math.round(stats.lobbyInterval)}s` : '—'}
                </strong>
              </span>
            </span>
            <InfoPopover topic="interval" size="xs" className="hidden md:inline-flex" />
          </span>
          <span className="whitespace-nowrap">
            Out <strong className="text-slate-200">{stats.served}</strong>
          </span>
        </div>
      </div>
    </section>
  );
});
