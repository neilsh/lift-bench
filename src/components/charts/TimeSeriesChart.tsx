import { useId } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { TelemetryHistoryPoint } from '../../types/simulation';
import { computeNiceAxisMax, formatClockSeconds } from '../../utils/cibse';

export interface ChartReferenceLine {
  label: string;
  value: number;
  tone?: 'slate' | 'emerald' | 'amber' | 'rose';
}

interface TimeSeriesChartProps {
  title: string;
  unit: string;
  leftLabel: string;
  rightLabel: string;
  leftSeries: TelemetryHistoryPoint[];
  rightSeries: TelemetryHistoryPoint[];
  accessor: (point: TelemetryHistoryPoint) => number;
  decimals?: number;
  minMaxFloor?: number;
  referenceLines?: ChartReferenceLine[];
  compact?: boolean;
  hoverIndex: number | null;
  onHoverIndexChange: (index: number | null) => void;
  fireAlarmActive?: boolean;
  lowerIsBetter?: boolean;
}

const REF_STROKE: Record<NonNullable<ChartReferenceLine['tone']>, string> = {
  slate: '#94a3b8',
  emerald: '#34d399',
  amber: '#fbbf24',
  rose: '#fb7185',
};

export function TimeSeriesChart({
  title,
  unit,
  leftLabel,
  rightLabel,
  leftSeries,
  rightSeries,
  accessor,
  decimals = 1,
  minMaxFloor = 10,
  referenceLines = [],
  compact = false,
  hoverIndex,
  onHoverIndexChange,
  fireAlarmActive = false,
  lowerIsBetter = true,
}: TimeSeriesChartProps) {
  const gradId = useId();
  const count = Math.min(leftSeries.length, rightSeries.length);

  const W = compact ? 360 : 720;
  const H = compact ? 155 : 236;
  const pad = compact
    ? { top: 14, right: 12, bottom: 22, left: 40 }
    : { top: 18, right: 18, bottom: 26, left: 50 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  let rawMax = 0;
  for (let i = 0; i < count; i++) {
    const lv = accessor(leftSeries[i]);
    const rv = accessor(rightSeries[i]);
    if (Number.isFinite(lv) && lv > rawMax) rawMax = lv;
    if (Number.isFinite(rv) && rv > rawMax) rawMax = rv;
  }
  for (const ref of referenceLines) {
    if (Number.isFinite(ref.value) && ref.value > rawMax) {
      rawMax = ref.value;
    }
  }

  const yMax = computeNiceAxisMax(rawMax * 1.12, minMaxFloor);
  const toX = (idx: number) => (count <= 1 ? pad.left : pad.left + (idx / (count - 1)) * plotW);
  const toY = (val: number) => {
    const clamped = Math.max(0, Math.min(yMax, Number.isFinite(val) ? val : 0));
    return pad.top + plotH - (clamped / yMax) * plotH;
  };

  const activeIdx =
    count > 0
      ? hoverIndex !== null
        ? Math.max(0, Math.min(count - 1, hoverIndex))
        : count - 1
      : null;

  const activePointL = activeIdx !== null ? leftSeries[activeIdx] : null;
  const activePointR = activeIdx !== null ? rightSeries[activeIdx] : null;
  const activeValL = activePointL ? accessor(activePointL) : 0;
  const activeValR = activePointR ? accessor(activePointR) : 0;
  const activeDiff = activeValR - activeValL;
  const activeGood = lowerIsBetter ? activeDiff < -0.05 : activeDiff > 0.05;
  const activeBad = lowerIsBetter ? activeDiff > 0.05 : activeDiff < -0.05;
  const deltaClass = activeGood
    ? 'text-emerald-300'
    : activeBad
      ? 'text-rose-300'
      : 'text-slate-400';

  const handlePointerMove = (e: PointerEvent<HTMLInputElement>) => {
    if (count < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    const norm = Math.max(0, Math.min(1, (relX - pad.left) / plotW));
    onHoverIndexChange(Math.round(norm * (count - 1)));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      onHoverIndexChange(null);
    }
  };

  let leftPath = '';
  let rightPath = '';
  let rightAreaPath = '';
  if (count >= 2) {
    const lPts: string[] = [];
    const rPts: string[] = [];
    for (let i = 0; i < count; i++) {
      const x = toX(i).toFixed(1);
      lPts.push(`${x},${toY(accessor(leftSeries[i])).toFixed(1)}`);
      rPts.push(`${x},${toY(accessor(rightSeries[i])).toFixed(1)}`);
    }
    leftPath = `M${lPts.join(' L')}`;
    rightPath = `M${rPts.join(' L')}`;
    rightAreaPath = `${rightPath} L${toX(count - 1).toFixed(1)},${(pad.top + plotH).toFixed(1)} L${toX(0).toFixed(1)},${(pad.top + plotH).toFixed(1)} Z`;
  }

  const gridTicks = [0, 0.25, 0.5, 0.75, 1];
  const xTickIndices =
    count >= 2
      ? compact
        ? [0, Math.floor((count - 1) / 2), count - 1]
        : [
            0,
            Math.floor((count - 1) * 0.25),
            Math.floor((count - 1) * 0.5),
            Math.floor((count - 1) * 0.75),
            count - 1,
          ]
      : [];

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 sm:p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs sm:text-sm font-semibold text-slate-100 truncate">{title}</span>
          <span className="text-[11px] font-mono text-slate-400 shrink-0">{unit}</span>
        </div>

        <div className="flex items-center gap-2.5 text-[11px] font-mono tabular-nums flex-wrap">
          {activePointL && activePointR ? (
            <>
              <span className="text-slate-400">
                {hoverIndex !== null ? 'Probe' : 'Now'}{' '}
                <strong className="text-slate-200">
                  {formatClockSeconds(activePointL.simTime)}
                </strong>
              </span>
              <span className="text-amber-300">
                {leftLabel}:{' '}
                <strong>
                  {activeValL.toFixed(decimals)}
                  {unit ? ` ${unit}` : ''}
                </strong>
              </span>
              <span className="text-cyan-300">
                {rightLabel}:{' '}
                <strong>
                  {activeValR.toFixed(decimals)}
                  {unit ? ` ${unit}` : ''}
                </strong>
              </span>
              <span className={`font-semibold ${deltaClass}`}>
                {activeDiff > 0 ? '+' : ''}
                {activeDiff.toFixed(decimals)}
              </span>
            </>
          ) : (
            <span className="text-slate-500">Waiting for samples</span>
          )}
        </div>
      </div>

      {count < 2 ? (
        <div className="h-36 flex items-center justify-center text-xs text-slate-400 border border-dashed border-slate-800 rounded-lg bg-slate-950/60">
          {fireAlarmActive
            ? 'Fire Alarm Active · Phase I Lobby Recall'
            : 'Collecting time-series samples...'}
        </div>
      ) : (
        <div className="relative w-full rounded-md focus-within:ring-2 focus-within:ring-cyan-400">
          <input
            type="range"
            min={0}
            max={Math.max(0, count - 1)}
            value={activeIdx ?? 0}
            aria-label={`${title} timeline probe`}
            onChange={(e) => onHoverIndexChange(Number(e.target.value))}
            onPointerMove={handlePointerMove}
            onPointerLeave={() => onHoverIndexChange(null)}
            onKeyDown={handleKeyDown}
            className="absolute inset-0 z-10 w-full h-full opacity-0 cursor-crosshair m-0"
          />
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`${title} time-series chart comparing ${leftLabel} and ${rightLabel}`}
            className="w-full h-auto block pointer-events-none"
          >
            <defs>
              <linearGradient id={`cyanArea-${gradId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.16" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {gridTicks.map((ratio) => {
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
                    fontSize={compact ? 9 : 10}
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {val >= 100 || Number.isInteger(val) ? Math.round(val) : val.toFixed(1)}
                  </text>
                </g>
              );
            })}

            {referenceLines.map((ref, idx) => {
              if (!Number.isFinite(ref.value) || ref.value <= 0 || ref.value > yMax) return null;
              const ry = toY(ref.value);
              const stroke = REF_STROKE[ref.tone ?? 'slate'];
              return (
                <g key={`${ref.label}-${idx}`}>
                  <line
                    x1={pad.left}
                    y1={ry}
                    x2={W - pad.right}
                    y2={ry}
                    stroke={stroke}
                    strokeWidth={1.1}
                    strokeDasharray="4 4"
                    opacity={0.75}
                  />
                  {!compact && (
                    <text
                      x={W - pad.right - 4}
                      y={ry - 4}
                      textAnchor="end"
                      fill={stroke}
                      fontSize={9.5}
                      fontFamily="JetBrains Mono, monospace"
                      opacity={0.9}
                    >
                      {ref.label}
                    </text>
                  )}
                </g>
              );
            })}

            {xTickIndices.map((idx, pos) => {
              const pt = leftSeries[idx];
              if (!pt) return null;
              const tx = toX(idx);
              const anchor =
                pos === 0 ? 'start' : pos === xTickIndices.length - 1 ? 'end' : 'middle';
              return (
                <text
                  key={`${idx}-${pos}`}
                  x={tx}
                  y={H - 6}
                  textAnchor={anchor}
                  fill="#94a3b8"
                  fontSize={compact ? 9 : 10}
                  fontFamily="JetBrains Mono, monospace"
                >
                  {formatClockSeconds(pt.simTime)}
                </text>
              );
            })}

            <path d={rightAreaPath} fill={`url(#cyanArea-${gradId})`} />
            <path
              d={leftPath}
              fill="none"
              stroke="#fbbf24"
              strokeWidth={compact ? 1.8 : 2.1}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d={rightPath}
              fill="none"
              stroke="#22d3ee"
              strokeWidth={compact ? 1.8 : 2.1}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {hoverIndex !== null && activeIdx !== null && (
              <g>
                <line
                  x1={toX(activeIdx)}
                  y1={pad.top}
                  x2={toX(activeIdx)}
                  y2={pad.top + plotH}
                  stroke="#cbd5e1"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.8}
                />
                <circle
                  cx={toX(activeIdx)}
                  cy={toY(activeValL)}
                  r={compact ? 3.5 : 4.2}
                  fill="#090d16"
                  stroke="#fbbf24"
                  strokeWidth={2}
                />
                <circle
                  cx={toX(activeIdx)}
                  cy={toY(activeValR)}
                  r={compact ? 3.5 : 4.2}
                  fill="#090d16"
                  stroke="#22d3ee"
                  strokeWidth={2}
                />
              </g>
            )}
          </svg>
        </div>
      )}
    </div>
  );
}
