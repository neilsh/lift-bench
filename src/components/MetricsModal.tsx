import { BarChart3, Pause, Play, X } from 'lucide-react';
import { memo, useCallback, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { ALGORITHM_META, PRESET_META } from '../engine/elevatorSim';
import { useModalFocus } from '../hooks/useModalFocus';
import type { DistributionMode, SimConfig, TelemetrySnapshot } from '../types/simulation';
import { MetricsDistributionsTab } from './metrics/MetricsDistributionsTab';
import { MetricsMatrixTab } from './metrics/MetricsMatrixTab';
import { MetricsOverviewTab } from './metrics/MetricsOverviewTab';
import { MetricsTrendsTab } from './metrics/MetricsTrendsTab';
import type { StudioTab } from './metrics/metricsConfig';
import { STUDIO_TABS } from './metrics/metricsConfig';

interface MetricsModalProps {
  open: boolean;
  telemetry: TelemetrySnapshot;
  distributionMode: DistributionMode;
  config?: SimConfig;
  paused?: boolean;
  onTogglePause?: () => void;
  onClose: () => void;
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

  if (!open) return null;

  const { leftAlgorithm, rightAlgorithm, clockText, fireAlarmActive } = telemetry;
  const meta = PRESET_META[distributionMode] || PRESET_META.realistic;
  const leftMeta = ALGORITHM_META[leftAlgorithm];
  const rightMeta = ALGORITHM_META[rightAlgorithm];

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
          {activeTab === 'overview' && <MetricsOverviewTab telemetry={telemetry} />}
          {activeTab === 'trends' && <MetricsTrendsTab telemetry={telemetry} />}
          {activeTab === 'distributions' && <MetricsDistributionsTab telemetry={telemetry} />}
          {activeTab === 'matrix' && (
            <MetricsMatrixTab
              telemetry={telemetry}
              distributionMode={distributionMode}
              config={config}
            />
          )}
        </div>
      </div>
    </dialog>
  );
});
