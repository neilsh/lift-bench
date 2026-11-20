import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Flame,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Thermometer,
  Zap,
} from 'lucide-react';
import { memo } from 'react';
import { CONFIG_LIMITS } from '../engine/elevatorSim';
import type { PlaybackState, SimConfig } from '../types/simulation';

interface ControlDockProps {
  config: SimConfig;
  paused: boolean;
  speed: PlaybackState['speed'];
  fireAlarmActive: boolean;
  showWaitHeatmap: boolean;
  drawerOpen: boolean;
  onTogglePause: () => void;
  onSelectSpeed: (speed: PlaybackState['speed']) => void;
  onToggleWaitHeatmap: () => void;
  onToggleFireAlarm: () => void;
  onBurst: () => void;
  onReset: () => void;
  onToggleDrawer: () => void;
  onConfigChange: (partial: Partial<SimConfig>, needsReinit: boolean) => void;
}

const SPEEDS: PlaybackState['speed'][] = [1, 3, 8];

export const ControlDock = memo(function ControlDock({
  config,
  paused,
  speed,
  fireAlarmActive,
  showWaitHeatmap,
  drawerOpen,
  onTogglePause,
  onSelectSpeed,
  onToggleWaitHeatmap,
  onToggleFireAlarm,
  onBurst,
  onReset,
  onToggleDrawer,
  onConfigChange,
}: ControlDockProps) {
  return (
    <footer className="shrink-0 bg-slate-900/95 border-t border-slate-800 z-30 shadow-[0_-8px_24px_rgba(0,0,0,0.45)]">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-2 sm:py-2.5 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onTogglePause}
              aria-label={paused ? 'Play simulation' : 'Pause simulation'}
              className="h-10 px-2.5 sm:px-3.5 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 text-xs font-semibold text-slate-100 flex items-center gap-1.5 transition-colors shrink-0 whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              {paused ? (
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Pause className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span className="hidden sm:inline">{paused ? 'Play' : 'Pause'}</span>
            </button>

            <fieldset
              aria-label="Simulation playback speed"
              className="m-0 flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800 h-10 shrink-0"
            >
              {SPEEDS.map((s) => {
                const active = speed === s;
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onSelectSpeed(s)}
                    className={`h-full px-2 sm:px-2.5 rounded-md font-mono text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                      active
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-400 hover:text-white border border-transparent'
                    }`}
                  >
                    {s}x
                  </button>
                );
              })}
            </fieldset>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              aria-pressed={showWaitHeatmap}
              onClick={onToggleWaitHeatmap}
              title="Toggle floor wait-time heatmap (emerald to crimson by longest current passenger wait)"
              className={
                showWaitHeatmap
                  ? 'h-10 px-2.5 sm:px-3 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 active:bg-emerald-500/30 border border-emerald-400/60 text-emerald-200 font-semibold text-[11px] sm:text-xs transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400'
                  : 'h-10 px-2.5 sm:px-3 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 text-slate-200 font-medium text-[11px] sm:text-xs transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400'
              }
            >
              <Thermometer className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Wait Heat</span>
            </button>

            <button
              type="button"
              onClick={onToggleFireAlarm}
              title="Pull the building Fire Alarm to recall all elevators nonstop to Floor 1 and lock them out of service"
              className={
                fireAlarmActive
                  ? 'h-10 px-2.5 sm:px-3 rounded-lg bg-rose-600 hover:bg-rose-500 active:bg-rose-400 border border-rose-300 text-white font-bold text-[11px] sm:text-xs shadow-[0_0_14px_rgba(244,63,94,0.55)] transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300'
                  : 'h-10 px-2.5 sm:px-3 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 active:bg-rose-500/35 border border-rose-500/50 text-rose-300 font-semibold text-[11px] sm:text-xs transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400'
              }
            >
              {fireAlarmActive ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              ) : (
                <Flame className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              )}
              <span>{fireAlarmActive ? 'Clear Alarm' : 'Fire Alarm'}</span>
            </button>

            <button
              type="button"
              onClick={onBurst}
              className="h-10 px-2.5 sm:px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-400 text-slate-950 font-bold text-[11px] sm:text-xs shadow-sm transition-colors flex items-center gap-1 shrink-0 whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              <Zap className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>
                +12<span className="hidden sm:inline"> Burst</span>
              </span>
            </button>

            <button
              type="button"
              onClick={onReset}
              title="Reset simulation with new seed"
              className="h-10 px-2.5 sm:px-3 rounded-lg bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 text-[11px] sm:text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-colors shrink-0 whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <RotateCcw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="hidden sm:inline">Reset</span>
            </button>

            <button
              type="button"
              onClick={onToggleDrawer}
              aria-expanded={drawerOpen}
              className="md:hidden h-10 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-cyan-500/40 text-[11px] font-semibold text-cyan-300 flex items-center gap-1 transition-colors shrink-0 whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Sliders</span>
              {drawerOpen ? (
                <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <div
          className={`${
            drawerOpen ? 'grid' : 'hidden'
          } md:grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-1.5 pt-1 border-t border-slate-800/80`}
        >
          <div className="flex flex-col justify-center min-h-[44px]">
            <div className="flex items-center justify-between text-[11px]">
              <label htmlFor="sliderArrival" className="text-slate-300 font-medium">
                Arrival Rate
              </label>
              <span className="font-mono tabular-nums font-semibold text-cyan-300">
                {config.arrivalRate} pax/m
              </span>
            </div>
            <input
              id="sliderArrival"
              className="sim-slider"
              type="range"
              min={CONFIG_LIMITS.arrivalRate.min}
              max={CONFIG_LIMITS.arrivalRate.max}
              step={CONFIG_LIMITS.arrivalRate.step}
              value={config.arrivalRate}
              onChange={(e) => onConfigChange({ arrivalRate: Number(e.target.value) }, false)}
            />
          </div>

          <div className="flex flex-col justify-center min-h-[44px]">
            <div className="flex items-center justify-between text-[11px]">
              <label htmlFor="sliderFloors" className="text-slate-300 font-medium">
                Building Floors
              </label>
              <span className="font-mono tabular-nums font-semibold text-cyan-300">
                {config.floors} fl
              </span>
            </div>
            <input
              id="sliderFloors"
              className="sim-slider"
              type="range"
              min={CONFIG_LIMITS.floors.min}
              max={CONFIG_LIMITS.floors.max}
              step={CONFIG_LIMITS.floors.step}
              value={config.floors}
              onChange={(e) => onConfigChange({ floors: Number(e.target.value) }, true)}
            />
          </div>

          <div className="flex flex-col justify-center min-h-[44px]">
            <div className="flex items-center justify-between text-[11px]">
              <label htmlFor="sliderCars" className="text-slate-300 font-medium">
                Elevator Cars
              </label>
              <span className="font-mono tabular-nums font-semibold text-cyan-300">
                {config.cars} cars
              </span>
            </div>
            <input
              id="sliderCars"
              className="sim-slider"
              type="range"
              min={CONFIG_LIMITS.cars.min}
              max={CONFIG_LIMITS.cars.max}
              step={CONFIG_LIMITS.cars.step}
              value={config.cars}
              onChange={(e) => onConfigChange({ cars: Number(e.target.value) }, true)}
            />
          </div>

          <div className="flex flex-col justify-center min-h-[44px]">
            <div className="flex items-center justify-between text-[11px]">
              <label htmlFor="sliderStopPenalty" className="text-slate-300 font-medium">
                Stop Penalty
              </label>
              <span className="font-mono tabular-nums font-semibold text-cyan-300">
                {config.stopPenalty.toFixed(1)}s
              </span>
            </div>
            <input
              id="sliderStopPenalty"
              className="sim-slider"
              type="range"
              min={CONFIG_LIMITS.stopPenalty.min}
              max={CONFIG_LIMITS.stopPenalty.max}
              step={CONFIG_LIMITS.stopPenalty.step}
              value={config.stopPenalty}
              onChange={(e) => onConfigChange({ stopPenalty: Number(e.target.value) }, false)}
            />
          </div>

          <div className="flex flex-col justify-center min-h-[44px]">
            <div className="flex items-center justify-between text-[11px]">
              <label htmlFor="sliderCapacity" className="text-slate-300 font-medium">
                Car Capacity
              </label>
              <span className="font-mono tabular-nums font-semibold text-cyan-300">
                {config.carCapacity} pax
              </span>
            </div>
            <input
              id="sliderCapacity"
              className="sim-slider"
              type="range"
              min={CONFIG_LIMITS.carCapacity.min}
              max={CONFIG_LIMITS.carCapacity.max}
              step={CONFIG_LIMITS.carCapacity.step}
              value={config.carCapacity}
              onChange={(e) => onConfigChange({ carCapacity: Number(e.target.value) }, false)}
            />
          </div>
        </div>
      </div>
    </footer>
  );
});
