import type { CibseComplianceStatus, CibseGrade } from '../types/simulation';

export function getCibseGradeColorClass(grade: CibseGrade): string {
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

export function getComplianceLabel(status: CibseComplianceStatus): string {
  switch (status) {
    case 'pass':
      return 'Pass';
    case 'warn':
      return 'Warn';
    case 'fail':
      return 'Fail';
    default:
      return 'Pending';
  }
}

export function getComplianceTextClass(status: CibseComplianceStatus): string {
  switch (status) {
    case 'pass':
      return 'text-emerald-300';
    case 'warn':
      return 'text-amber-300';
    case 'fail':
      return 'text-rose-300';
    default:
      return 'text-slate-400';
  }
}

export function computeHistoryMax(leftHistory: number[], rightHistory: number[]): number {
  if (leftHistory.length < 2) return 0;
  let maxQ = 10;
  for (let i = 0; i < leftHistory.length; i++) {
    if (leftHistory[i] > maxQ) maxQ = leftHistory[i];
    if (i < rightHistory.length && rightHistory[i] > maxQ) maxQ = rightHistory[i];
  }
  return maxQ;
}

export function formatClockSeconds(simTimeSec: number): string {
  const safe = Math.max(0, Math.floor(simTimeSec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function computeNiceAxisMax(rawMax: number, minFloor = 10): number {
  const target = Math.max(minFloor, rawMax);
  if (!Number.isFinite(target) || target <= 0) return minFloor;
  const magnitude = Math.pow(10, Math.floor(Math.log10(target)));
  const norm = target / magnitude;
  let niceNorm = 10;
  if (norm <= 1) niceNorm = 1;
  else if (norm <= 1.5) niceNorm = 1.5;
  else if (norm <= 2) niceNorm = 2;
  else if (norm <= 2.5) niceNorm = 2.5;
  else if (norm <= 4) niceNorm = 4;
  else if (norm <= 5) niceNorm = 5;
  else if (norm <= 7.5) niceNorm = 7.5;
  else niceNorm = 10;
  return Math.max(minFloor, niceNorm * magnitude);
}

export interface NiceAxisScale {
  yMin: number;
  yMax: number;
  ticks: number[];
}

function roundAxisValue(val: number): number {
  return Math.abs(val) < 1e-9 ? 0 : Number(val.toFixed(6));
}

function pickNiceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / magnitude;
  let niceNorm = 10;
  if (norm <= 1) niceNorm = 1;
  else if (norm <= 2) niceNorm = 2;
  else if (norm <= 2.5) niceNorm = 2.5;
  else if (norm <= 5) niceNorm = 5;
  return niceNorm * magnitude;
}

export function computeAutoAxisScale(
  rawMin: number,
  rawMax: number,
  targetIntervals = 4
): NiceAxisScale {
  const safeIntervals = Math.max(2, Math.floor(targetIntervals));
  if (!Number.isFinite(rawMin) || !Number.isFinite(rawMax)) {
    return {
      yMin: 0,
      yMax: safeIntervals,
      ticks: Array.from({ length: safeIntervals + 1 }, (_, i) => i),
    };
  }

  const minVal = Math.max(0, Math.min(rawMin, rawMax));
  const maxVal = Math.max(0, Math.max(rawMin, rawMax));

  if (maxVal <= 1e-9) {
    return {
      yMin: 0,
      yMax: safeIntervals,
      ticks: Array.from({ length: safeIntervals + 1 }, (_, i) => i),
    };
  }

  const span = maxVal - minVal;
  let paddedMin: number;
  let paddedMax: number;

  if (span < 1e-6) {
    const pad = Math.max(maxVal * 0.15, 0.5);
    paddedMin = Math.max(0, minVal - pad);
    paddedMax = maxVal + pad;
  } else {
    const pad = span * 0.12;
    paddedMin = minVal <= maxVal * 0.12 ? 0 : Math.max(0, minVal - pad);
    paddedMax = maxVal + pad;
  }

  let step = pickNiceStep((paddedMax - paddedMin) / safeIntervals);
  let yMin = Math.max(0, Math.floor(paddedMin / step) * step);
  let yMax = Math.ceil(paddedMax / step) * step;

  while (Math.round((yMax - yMin) / step) > safeIntervals + 1) {
    step = pickNiceStep(step * 1.25);
    yMin = Math.max(0, Math.floor(paddedMin / step) * step);
    yMax = Math.ceil(paddedMax / step) * step;
  }

  if (yMax <= yMin) {
    yMax = yMin + step;
  }

  const stepsCount = Math.max(1, Math.round((yMax - yMin) / step));
  const ticks: number[] = [];
  for (let i = 0; i <= stepsCount; i++) {
    ticks.push(roundAxisValue(yMin + i * step));
  }

  return {
    yMin: roundAxisValue(yMin),
    yMax: roundAxisValue(yMax),
    ticks,
  };
}

export interface DistributionBin {
  index: number;
  minSec: number;
  maxSec: number | null;
  label: string;
  leftCount: number;
  rightCount: number;
  leftPct: number;
  rightPct: number;
  leftCdfPct: number;
  rightCdfPct: number;
}

export function buildDistributionBins(
  leftSamples: number[],
  rightSamples: number[],
  binWidthSec: number,
  binCount: number
): DistributionBin[] {
  const safeCount = Math.max(2, Math.floor(binCount));
  const safeWidth = Math.max(1, binWidthSec);

  const leftCounts = Array.from({ length: safeCount }, () => 0);
  const rightCounts = Array.from({ length: safeCount }, () => 0);

  for (let i = 0; i < leftSamples.length; i++) {
    const val = Math.max(0, leftSamples[i]);
    const idx = Math.min(safeCount - 1, Math.floor(val / safeWidth));
    leftCounts[idx]++;
  }
  for (let i = 0; i < rightSamples.length; i++) {
    const val = Math.max(0, rightSamples[i]);
    const idx = Math.min(safeCount - 1, Math.floor(val / safeWidth));
    rightCounts[idx]++;
  }

  const leftTotal = leftSamples.length;
  const rightTotal = rightSamples.length;

  let leftCum = 0;
  let rightCum = 0;
  const bins: DistributionBin[] = [];

  for (let i = 0; i < safeCount; i++) {
    const minSec = i * safeWidth;
    const isOverflow = i === safeCount - 1;
    const maxSec = isOverflow ? null : (i + 1) * safeWidth;
    const label = isOverflow ? `${minSec}s+` : `${minSec}–${maxSec}s`;

    const lc = leftCounts[i];
    const rc = rightCounts[i];
    leftCum += lc;
    rightCum += rc;

    bins.push({
      index: i,
      minSec,
      maxSec,
      label,
      leftCount: lc,
      rightCount: rc,
      leftPct: leftTotal > 0 ? (lc / leftTotal) * 100 : 0,
      rightPct: rightTotal > 0 ? (rc / rightTotal) * 100 : 0,
      leftCdfPct: leftTotal > 0 ? (leftCum / leftTotal) * 100 : 0,
      rightCdfPct: rightTotal > 0 ? (rightCum / rightTotal) * 100 : 0,
    });
  }

  return bins;
}
