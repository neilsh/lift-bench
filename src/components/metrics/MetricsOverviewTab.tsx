import { Flame } from 'lucide-react';
import { memo } from 'react';
import type { ReactNode } from 'react';
import type { GlossaryKey } from '../../data/metricGlossary';
import { ALGORITHM_META } from '../../engine/elevatorSim';
import type { CibseComplianceStatus, TelemetrySnapshot } from '../../types/simulation';
import {
  getCibseGradeColorClass,
  getComplianceLabel,
  getComplianceTextClass,
} from '../../utils/cibse';
import { InfoPopover } from '../InfoPopover';
import type { DeltaDisplay } from './metricsConfig';
import { formatDelta } from './metricsConfig';

interface MetricsOverviewTabProps {
  telemetry: TelemetrySnapshot;
}

function renderComplianceText(label: string, status: CibseComplianceStatus) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className="text-slate-400">{label}</span>
      <strong className={`font-semibold ${getComplianceTextClass(status)}`}>
        {getComplianceLabel(status)}
      </strong>
    </span>
  );
}

export const MetricsOverviewTab = memo(function MetricsOverviewTab({
  telemetry,
}: MetricsOverviewTabProps) {
  const { left, right, leftAlgorithm, rightAlgorithm, fireAlarmActive, cibseBenchmark } = telemetry;
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

  const overviewRows: Array<[GlossaryKey, string, string, string, DeltaDisplay]> = [
    [
      'cibseGrade',
      'CIBSE Guide D Grade',
      `Grade ${left.cibseGrade} (${left.cibseLabel})`,
      `Grade ${right.cibseGrade} (${right.cibseLabel})`,
      { text: '—', className: 'text-slate-500' },
    ],
    [
      'attd',
      'Mean TTD (Total)',
      `${left.avgTTD.toFixed(1)}s`,
      `${right.avgTTD.toFixed(1)}s`,
      formatDelta(left.avgTTD, right.avgTTD, true),
    ],
    [
      'awt',
      'Mean Wait (AWT)',
      `${left.avgWait.toFixed(1)}s`,
      `${right.avgWait.toFixed(1)}s`,
      formatDelta(left.avgWait, right.avgWait, true),
    ],
    [
      'att',
      'Mean Transit (ATT)',
      `${left.avgTransit.toFixed(1)}s`,
      `${right.avgTransit.toFixed(1)}s`,
      formatDelta(left.avgTransit, right.avgTransit, true),
    ],
    [
      'rtt',
      'Mean Round-Trip (RTT)',
      left.avgRTT > 0 ? `${left.avgRTT.toFixed(1)}s` : '—',
      right.avgRTT > 0 ? `${right.avgRTT.toFixed(1)}s` : '—',
      left.avgRTT > 0 && right.avgRTT > 0
        ? formatDelta(left.avgRTT, right.avgRTT, true)
        : { text: '—', className: 'text-slate-500' },
    ],
    [
      'hc5Pct',
      '5-Min Handling (%HC5)',
      `${left.hc5Pct.toFixed(1)}% (${Math.round(left.hc5Pax)})`,
      `${right.hc5Pct.toFixed(1)}% (${Math.round(right.hc5Pax)})`,
      formatDelta(left.hc5Pct, right.hc5Pct, false, 'pp'),
    ],
    [
      'p95Wait',
      'Tail Queue Wait (P95)',
      `${left.p95Wait.toFixed(1)}s`,
      `${right.p95Wait.toFixed(1)}s`,
      formatDelta(left.p95Wait, right.p95Wait, true),
    ],
    [
      'interval',
      'Lobby Dispatch Interval',
      left.lobbyInterval > 0 ? `${left.lobbyInterval.toFixed(1)}s` : '—',
      right.lobbyInterval > 0 ? `${right.lobbyInterval.toFixed(1)}s` : '—',
      left.lobbyInterval > 0 && right.lobbyInterval > 0
        ? formatDelta(left.lobbyInterval, right.lobbyInterval, true)
        : { text: '—', className: 'text-slate-500' },
    ],
    [
      'throughput',
      'Throughput (120s)',
      `${left.throughput.toFixed(1)}/m`,
      `${right.throughput.toFixed(1)}/m`,
      formatDelta(left.throughput, right.throughput, false),
    ],
    [
      'energy',
      'Est. Energy',
      `${left.whPerPax.toFixed(1)} Wh/p`,
      `${right.whPerPax.toFixed(1)} Wh/p`,
      formatDelta(left.whPerPax, right.whPerPax, true),
    ],
  ];

  return (
    <>
      <div className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 flex items-center justify-between gap-2 flex-wrap">
        <span className="font-medium">{verdictContent}</span>
        <span className="inline-flex items-center gap-1.5 font-mono tabular-nums text-[11px] text-slate-400">
          <span>
            Pop {cibseBenchmark.buildingPopulation} · Barney RTT{' '}
            {cibseBenchmark.theoreticalRTT.toFixed(1)}s
          </span>
          <InfoPopover topic="barney" size="xs" />
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
        <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-amber-300">{leftMeta.name} (Left)</span>
            <span className="inline-flex items-center gap-1">
              <span className={`font-mono font-bold ${getCibseGradeColorClass(left.cibseGrade)}`}>
                Grade {left.cibseGrade} · {left.cibseLabel}
              </span>
              <InfoPopover topic="cibseCompliance" size="xs" />
            </span>
          </div>
          <p className="text-slate-400 text-[11px] leading-snug">{leftMeta.description}</p>
          <div className="pt-1 border-t border-slate-800/80 flex items-center gap-2.5 font-mono tabular-nums text-[10.5px] flex-wrap">
            {renderComplianceText('AWT', left.cibseCompliance.awt)}
            <span className="text-slate-700" aria-hidden="true">
              ·
            </span>
            {renderComplianceText('ATT', left.cibseCompliance.att)}
            <span className="text-slate-700" aria-hidden="true">
              ·
            </span>
            {renderComplianceText('INT', left.cibseCompliance.interval)}
            <span className="text-slate-700" aria-hidden="true">
              ·
            </span>
            {renderComplianceText('%HC5', left.cibseCompliance.hc5)}
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-cyan-300">{rightMeta.name} (Right)</span>
            <span className="inline-flex items-center gap-1">
              <span className={`font-mono font-bold ${getCibseGradeColorClass(right.cibseGrade)}`}>
                Grade {right.cibseGrade} · {right.cibseLabel}
              </span>
              <InfoPopover topic="cibseCompliance" size="xs" />
            </span>
          </div>
          <p className="text-slate-400 text-[11px] leading-snug">{rightMeta.description}</p>
          <div className="pt-1 border-t border-slate-800/80 flex items-center gap-2.5 font-mono tabular-nums text-[10.5px] flex-wrap">
            {renderComplianceText('AWT', right.cibseCompliance.awt)}
            <span className="text-slate-700" aria-hidden="true">
              ·
            </span>
            {renderComplianceText('ATT', right.cibseCompliance.att)}
            <span className="text-slate-700" aria-hidden="true">
              ·
            </span>
            {renderComplianceText('INT', right.cibseCompliance.interval)}
            <span className="text-slate-700" aria-hidden="true">
              ·
            </span>
            {renderComplianceText('%HC5', right.cibseCompliance.hc5)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {(
          [
            {
              glossaryKey: 'rtt' as GlossaryKey,
              title: 'Mean Round-Trip (RTT)',
              leftVal: left.avgRTT > 0 ? `${left.avgRTT.toFixed(1)}s` : '—',
              rightVal: right.avgRTT > 0 ? `${right.avgRTT.toFixed(1)}s` : '—',
              delta:
                left.avgRTT > 0 && right.avgRTT > 0
                  ? formatDelta(left.avgRTT, right.avgRTT, true)
                  : { text: '—', className: 'text-slate-500' },
              ref: `Barney ${cibseBenchmark.theoreticalRTT.toFixed(1)}s`,
            },
            {
              glossaryKey: 'hc5Pct' as GlossaryKey,
              title: '5-Min Handling (%HC5)',
              leftVal: `${left.hc5Pct.toFixed(1)}%`,
              rightVal: `${right.hc5Pct.toFixed(1)}%`,
              delta: formatDelta(left.hc5Pct, right.hc5Pct, false, 'pp'),
              ref: `Barney ${cibseBenchmark.theoreticalHC5Pct.toFixed(1)}% · Dem ${cibseBenchmark.demandHC5Pct.toFixed(1)}%`,
            },
            {
              glossaryKey: 'interval' as GlossaryKey,
              title: 'Dispatch Interval (INT)',
              leftVal: left.lobbyInterval > 0 ? `${left.lobbyInterval.toFixed(1)}s` : '—',
              rightVal: right.lobbyInterval > 0 ? `${right.lobbyInterval.toFixed(1)}s` : '—',
              delta:
                left.lobbyInterval > 0 && right.lobbyInterval > 0
                  ? formatDelta(left.lobbyInterval, right.lobbyInterval, true)
                  : { text: '—', className: 'text-slate-500' },
              ref: `Barney ${cibseBenchmark.theoreticalInterval.toFixed(1)}s`,
            },
            {
              glossaryKey: 'awtAttTriad' as GlossaryKey,
              title: 'AWT / ATT Triad',
              leftVal: `${left.avgWait.toFixed(0)}s / ${left.avgTransit.toFixed(0)}s`,
              rightVal: `${right.avgWait.toFixed(0)}s / ${right.avgTransit.toFixed(0)}s`,
              delta: formatDelta(left.avgWait, right.avgWait, true),
              ref: 'CIBSE ≤25s / ≤60s',
            },
          ] as const
        ).map((kpi) => (
          <div
            key={kpi.title}
            className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 flex flex-col gap-1"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1 min-w-0">
                <span className="text-[11px] font-medium text-slate-400 truncate">{kpi.title}</span>
                <InfoPopover topic={kpi.glossaryKey} size="xs" />
              </span>
              <span
                className={`font-mono tabular-nums text-[11px] font-semibold shrink-0 ${kpi.delta.className}`}
              >
                {kpi.delta.text}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-2 font-mono tabular-nums">
              <span className="text-sm font-bold text-amber-300">{kpi.leftVal}</span>
              <span className="text-sm font-bold text-cyan-300">{kpi.rightVal}</span>
            </div>
            <span className="text-[10px] font-mono tabular-nums text-slate-500 truncate">
              {kpi.ref}
            </span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs gap-2">
            <span className="inline-flex items-center gap-1 min-w-0">
              <span className="font-semibold text-amber-300 truncate">
                {leftMeta.shortName} TTD Split
              </span>
              <InfoPopover topic="ttdSplit" size="xs" />
            </span>
            <span className="font-mono tabular-nums text-[10.5px] text-slate-400 shrink-0">
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

        <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs gap-2">
            <span className="inline-flex items-center gap-1 min-w-0">
              <span className="font-semibold text-cyan-300 truncate">
                {rightMeta.shortName} TTD Split
              </span>
              <InfoPopover topic="ttdSplit" size="xs" />
            </span>
            <span className="font-mono tabular-nums text-[10.5px] text-slate-400 shrink-0">
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

      <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 flex items-center justify-between gap-3 flex-wrap text-[11px] font-mono tabular-nums">
        <span className="inline-flex items-center gap-1 font-sans font-semibold text-slate-300">
          <span>Barney Analytical vs. Observed</span>
          <InfoPopover topic="barney" size="xs" />
        </span>
        <div className="flex items-center gap-3 flex-wrap text-slate-400">
          <span className="inline-flex items-center gap-1">
            <span>
              Theory H{' '}
              <strong className="text-slate-200">
                Fl {cibseBenchmark.expectedReversalFloor.toFixed(1)}
              </strong>{' '}
              ({left.avgReversalFloor > 0 ? left.avgReversalFloor.toFixed(1) : '—'} /{' '}
              {right.avgReversalFloor > 0 ? right.avgReversalFloor.toFixed(1) : '—'})
            </span>
            <InfoPopover topic="reversalFloor" size="xs" />
          </span>
          <span className="text-slate-700" aria-hidden="true">
            ·
          </span>
          <span className="inline-flex items-center gap-1">
            <span>
              Theory S{' '}
              <strong className="text-slate-200">{cibseBenchmark.expectedStopsS.toFixed(1)}</strong>{' '}
              ({left.avgStopsPerRoundTrip > 0 ? left.avgStopsPerRoundTrip.toFixed(1) : '—'} /{' '}
              {right.avgStopsPerRoundTrip > 0 ? right.avgStopsPerRoundTrip.toFixed(1) : '—'})
            </span>
            <InfoPopover topic="probableStops" size="xs" />
          </span>
          <span className="text-slate-700" aria-hidden="true">
            ·
          </span>
          <span className="inline-flex items-center gap-1">
            <span>
              Wait &gt;30s:{' '}
              <strong className="text-amber-300">{left.longWait30Pct.toFixed(0)}%</strong> /{' '}
              <strong className="text-cyan-300">{right.longWait30Pct.toFixed(0)}%</strong>
            </span>
            <InfoPopover topic="longWaitSla" size="xs" />
          </span>
        </div>
      </div>

      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
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
            {overviewRows.map(([glossaryKey, label, sVal, dVal, delta]) => (
              <tr key={label} className="hover:bg-slate-900/50 transition-colors">
                <td className="py-1.5 px-3 text-slate-300 font-sans font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    <span>{label}</span>
                    <InfoPopover topic={glossaryKey} size="xs" />
                  </span>
                </td>
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
    </>
  );
});
