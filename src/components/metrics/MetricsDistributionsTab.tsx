import { memo, useState } from 'react';
import type { GlossaryKey } from '../../data/metricGlossary';
import { ALGORITHM_META } from '../../engine/elevatorSim';
import type { TelemetrySnapshot } from '../../types/simulation';
import { DistributionChart } from '../charts/DistributionChart';
import { InfoPopover } from '../InfoPopover';
import { formatDelta } from './metricsConfig';

interface MetricsDistributionsTabProps {
  telemetry: TelemetrySnapshot;
}

export const MetricsDistributionsTab = memo(function MetricsDistributionsTab({
  telemetry,
}: MetricsDistributionsTabProps) {
  const [distMetric, setDistMetric] = useState<'wait' | 'ttd'>('wait');
  const [distMode, setDistMode] = useState<'histogram' | 'cdf'>('histogram');
  const [hoveredBin, setHoveredBin] = useState<number | null>(null);

  const { left, right, leftAlgorithm, rightAlgorithm, leftSamples, rightSamples } = telemetry;
  const leftMeta = ALGORITHM_META[leftAlgorithm];
  const rightMeta = ALGORITHM_META[rightAlgorithm];

  const distLeftValues = distMetric === 'wait' ? leftSamples.wait : leftSamples.ttd;
  const distRightValues = distMetric === 'wait' ? rightSamples.wait : rightSamples.ttd;

  return (
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
        infoSlot={<InfoPopover topic={distMode === 'histogram' ? 'histogram' : 'cdf'} size="xs" />}
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
  );
});
