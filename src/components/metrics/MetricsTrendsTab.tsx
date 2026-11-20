import { memo, useMemo, useState } from 'react';
import { ALGORITHM_META } from '../../engine/elevatorSim';
import type { TelemetrySnapshot } from '../../types/simulation';
import { TimeSeriesChart } from '../charts/TimeSeriesChart';
import { InfoPopover } from '../InfoPopover';
import type { TrendMetricId } from './metricsConfig';
import {
  GRID_CHANNEL_IDS,
  TREND_CHANNELS,
  buildReferenceLinesByMetric,
  summarizeChannel,
} from './metricsConfig';

interface MetricsTrendsTabProps {
  telemetry: TelemetrySnapshot;
}

export const MetricsTrendsTab = memo(function MetricsTrendsTab({
  telemetry,
}: MetricsTrendsTabProps) {
  const [selectedMetric, setSelectedMetric] = useState<TrendMetricId>('avgWait');
  const [trendsLayout, setTrendsLayout] = useState<'single' | 'grid'>('single');
  const [autoScaleY, setAutoScaleY] = useState(true);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const {
    leftAlgorithm,
    rightAlgorithm,
    fireAlarmActive,
    cibseBenchmark,
    leftSeries,
    rightSeries,
  } = telemetry;

  const leftMeta = ALGORITHM_META[leftAlgorithm];
  const rightMeta = ALGORITHM_META[rightAlgorithm];

  const referenceLinesByMetric = useMemo(
    () => buildReferenceLinesByMetric(cibseBenchmark),
    [cibseBenchmark]
  );

  const activeChannel = TREND_CHANNELS.find((c) => c.id === selectedMetric) ?? TREND_CHANNELS[0];
  const leftFocusStats = summarizeChannel(leftSeries, activeChannel.accessor);
  const rightFocusStats = summarizeChannel(rightSeries, activeChannel.accessor);

  const gridChannels = GRID_CHANNEL_IDS.map(
    (id) => TREND_CHANNELS.find((c) => c.id === id) ?? TREND_CHANNELS[0]
  );

  return (
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

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            aria-pressed={autoScaleY}
            onClick={() => setAutoScaleY((prev) => !prev)}
            title="Auto-scale Y-axis to visible data range (click to toggle 0-based scale)"
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
              autoScaleY
                ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40'
                : 'bg-slate-950 text-slate-400 hover:text-slate-200 border-slate-800'
            }`}
          >
            Auto Y
          </button>

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
            autoScaleY={autoScaleY}
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
              autoScaleY={autoScaleY}
              infoSlot={<InfoPopover topic={ch.glossaryKey} size="xs" />}
            />
          ))}
        </div>
      )}
    </>
  );
});
