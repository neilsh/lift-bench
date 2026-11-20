import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { buildDistributionBins, computeNiceAxisMax } from '../../utils/cibse';

interface DistributionChartProps {
  metric: 'wait' | 'ttd';
  mode: 'histogram' | 'cdf';
  leftLabel: string;
  rightLabel: string;
  leftSamples: number[];
  rightSamples: number[];
  hoveredBin: number | null;
  onHoverBinChange: (index: number | null) => void;
  infoSlot?: ReactNode;
}

const WAIT_CUTOFFS = [
  { sec: 20, label: '20s Exc', tone: '#34d399' },
  { sec: 30, label: '30s Fair', tone: '#fbbf24' },
  { sec: 60, label: '60s SLA', tone: '#fb7185' },
];

const TTD_CUTOFFS = [
  { sec: 45, label: '45s Exc', tone: '#34d399' },
  { sec: 60, label: '60s Good', tone: '#38bdf8' },
  { sec: 90, label: '90s Limit', tone: '#fb7185' },
];

export function DistributionChart({
  metric,
  mode,
  leftLabel,
  rightLabel,
  leftSamples,
  rightSamples,
  hoveredBin,
  onHoverBinChange,
  infoSlot,
}: DistributionChartProps) {
  const binWidth = metric === 'wait' ? 5 : 10;
  const binCount = 13;
  const bins = buildDistributionBins(leftSamples, rightSamples, binWidth, binCount);
  const cutoffs = metric === 'wait' ? WAIT_CUTOFFS : TTD_CUTOFFS;

  const W = 720;
  const H = 240;
  const pad = { top: 24, right: 18, bottom: 28, left: 48 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const colW = plotW / bins.length;

  let rawHistMax = 5;
  for (const b of bins) {
    if (b.leftCount > rawHistMax) rawHistMax = b.leftCount;
    if (b.rightCount > rawHistMax) rawHistMax = b.rightCount;
  }
  const yMax = mode === 'cdf' ? 100 : computeNiceAxisMax(rawHistMax * 1.12, 5);
  const toY = (val: number) => pad.top + plotH - (Math.max(0, Math.min(yMax, val)) / yMax) * plotH;

  const activeBinIdx =
    hoveredBin !== null ? Math.max(0, Math.min(bins.length - 1, hoveredBin)) : null;
  const activeBin = activeBinIdx !== null ? bins[activeBinIdx] : null;

  const handlePointerMove = (e: PointerEvent<HTMLInputElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.floor((relX - pad.left) / colW);
    if (idx >= 0 && idx < bins.length) {
      onHoverBinChange(idx);
    } else {
      onHoverBinChange(null);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      onHoverBinChange(null);
    }
  };

  const hasSamples = leftSamples.length > 0 || rightSamples.length > 0;
  const gridRatios = [0, 0.25, 0.5, 0.75, 1];

  const leftCdfPath = bins
    .map(
      (b, i) =>
        `${i === 0 ? 'M' : 'L'}${(pad.left + (i + 0.5) * colW).toFixed(1)},${toY(b.leftCdfPct).toFixed(1)}`
    )
    .join(' ');
  const rightCdfPath = bins
    .map(
      (b, i) =>
        `${i === 0 ? 'M' : 'L'}${(pad.left + (i + 0.5) * colW).toFixed(1)},${toY(b.rightCdfPct).toFixed(1)}`
    )
    .join(' ');

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 sm:p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs sm:text-sm font-semibold text-slate-100">
            {metric === 'wait' ? 'Passenger Wait Time' : 'Total Time to Destination'} ·{' '}
            {mode === 'histogram' ? 'Frequency Histogram' : 'Cumulative CDF'}
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            n={leftSamples.length}/{rightSamples.length}
          </span>
          {infoSlot}
        </div>

        <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums flex-wrap">
          {activeBin ? (
            <>
              <span className="text-slate-300 font-semibold">{activeBin.label}</span>
              <span className="text-amber-300">
                {leftLabel}:{' '}
                <strong>
                  {mode === 'histogram'
                    ? `${activeBin.leftCount} (${activeBin.leftPct.toFixed(1)}%)`
                    : `${activeBin.leftCdfPct.toFixed(1)}%`}
                </strong>
              </span>
              <span className="text-cyan-300">
                {rightLabel}:{' '}
                <strong>
                  {mode === 'histogram'
                    ? `${activeBin.rightCount} (${activeBin.rightPct.toFixed(1)}%)`
                    : `${activeBin.rightCdfPct.toFixed(1)}%`}
                </strong>
              </span>
            </>
          ) : (
            <span className="text-slate-400">Hover or arrow-scrub buckets for exact share</span>
          )}
        </div>
      </div>

      {!hasSamples ? (
        <div className="h-44 flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-lg">
          Delivering initial passengers to populate distribution buckets...
        </div>
      ) : (
        <div className="relative w-full rounded-md focus-within:ring-2 focus-within:ring-cyan-400">
          <input
            type="range"
            min={0}
            max={bins.length - 1}
            value={activeBinIdx ?? 0}
            aria-label={`${metric === 'wait' ? 'Wait time' : 'Time to destination'} bucket probe`}
            onChange={(e) => onHoverBinChange(Number(e.target.value))}
            onPointerMove={handlePointerMove}
            onPointerLeave={() => onHoverBinChange(null)}
            onKeyDown={handleKeyDown}
            className="absolute inset-0 z-10 w-full h-full opacity-0 cursor-crosshair m-0"
          />
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`${metric === 'wait' ? 'Wait time' : 'Time to destination'} ${mode} chart`}
            className="w-full h-auto block pointer-events-none"
          >
            {gridRatios.map((ratio) => {
              const val = yMax * ratio;
              const y = toY(val);
              return (
                <g key={ratio}>
                  <line
                    x1={pad.left}
                    y1={y}
                    x2={W - pad.right}
                    y2={y}
                    stroke={ratio === 0 ? '#334155' : 'rgba(51, 65, 85, 0.45)'}
                    strokeWidth={1}
                  />
                  <text
                    x={pad.left - 6}
                    y={y + 3}
                    textAnchor="end"
                    fill="#94a3b8"
                    fontSize={10}
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {mode === 'cdf' ? `${Math.round(val)}%` : Math.round(val)}
                  </text>
                </g>
              );
            })}

            {mode === 'cdf' &&
              [50, 95].map((pct) => {
                const py = toY(pct);
                return (
                  <g key={pct}>
                    <line
                      x1={pad.left}
                      y1={py}
                      x2={W - pad.right}
                      y2={py}
                      stroke="#64748b"
                      strokeWidth={1}
                      strokeDasharray="2 4"
                      opacity={0.7}
                    />
                    <text
                      x={W - pad.right - 4}
                      y={py - 3}
                      textAnchor="end"
                      fill="#94a3b8"
                      fontSize={9}
                      fontFamily="JetBrains Mono, monospace"
                    >
                      P{pct}
                    </text>
                  </g>
                );
              })}

            {activeBinIdx !== null && (
              <rect
                x={pad.left + activeBinIdx * colW}
                y={pad.top}
                width={colW}
                height={plotH}
                fill="rgba(148, 163, 184, 0.08)"
              />
            )}

            {mode === 'histogram' ? (
              bins.map((b, i) => {
                const xBase = pad.left + i * colW;
                const barGap = 2;
                const barW = Math.max(4, (colW - 8 - barGap) / 2);
                const lH = Math.max(0, pad.top + plotH - toY(b.leftCount));
                const rH = Math.max(0, pad.top + plotH - toY(b.rightCount));
                const isActive = activeBinIdx === i;
                return (
                  <g key={b.index}>
                    <rect
                      x={xBase + 4}
                      y={toY(b.leftCount)}
                      width={barW}
                      height={lH}
                      rx={1.5}
                      fill={isActive ? 'rgba(251, 191, 36, 0.8)' : 'rgba(251, 191, 36, 0.55)'}
                      stroke="#fbbf24"
                      strokeWidth={isActive ? 1.4 : 0.8}
                    />
                    <rect
                      x={xBase + 4 + barW + barGap}
                      y={toY(b.rightCount)}
                      width={barW}
                      height={rH}
                      rx={1.5}
                      fill={isActive ? 'rgba(34, 211, 238, 0.82)' : 'rgba(34, 211, 238, 0.55)'}
                      stroke="#22d3ee"
                      strokeWidth={isActive ? 1.4 : 0.8}
                    />
                  </g>
                );
              })
            ) : (
              <g>
                <path
                  d={leftCdfPath}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth={2.2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <path
                  d={rightCdfPath}
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth={2.2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {bins.map((b, i) => {
                  const cx = pad.left + (i + 0.5) * colW;
                  const isActive = activeBinIdx === i;
                  return (
                    <g key={b.index}>
                      <circle
                        cx={cx}
                        cy={toY(b.leftCdfPct)}
                        r={isActive ? 4.2 : 2.3}
                        fill="#090d16"
                        stroke="#fbbf24"
                        strokeWidth={isActive ? 2 : 1.4}
                      />
                      <circle
                        cx={cx}
                        cy={toY(b.rightCdfPct)}
                        r={isActive ? 4.2 : 2.3}
                        fill="#090d16"
                        stroke="#22d3ee"
                        strokeWidth={isActive ? 2 : 1.4}
                      />
                    </g>
                  );
                })}
              </g>
            )}

            {cutoffs.map((c) => {
              const binUnits = c.sec / binWidth;
              const cx = pad.left + binUnits * colW;
              return (
                <g key={c.sec}>
                  <line
                    x1={cx}
                    y1={pad.top - 4}
                    x2={cx}
                    y2={pad.top + plotH}
                    stroke={c.tone}
                    strokeWidth={1.2}
                    strokeDasharray="4 3"
                    opacity={0.85}
                  />
                  <text
                    x={cx}
                    y={13}
                    textAnchor="middle"
                    fill={c.tone}
                    fontSize={9.5}
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {c.label}
                  </text>
                </g>
              );
            })}

            {bins.map((b, i) => {
              if (i % 2 !== 0 && i !== bins.length - 1) return null;
              const tx = pad.left + (i + 0.5) * colW;
              const tickText = b.maxSec === null ? `${b.minSec}+` : `${b.minSec}`;
              return (
                <text
                  key={b.index}
                  x={tx}
                  y={H - 7}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize={9.5}
                  fontFamily="JetBrains Mono, monospace"
                >
                  {tickText}s
                </text>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}
