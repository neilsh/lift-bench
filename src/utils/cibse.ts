import type { CibseGrade } from '../types/simulation';

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

export function computeHistoryMax(leftHistory: number[], rightHistory: number[]): number {
  if (leftHistory.length < 2) return 0;
  let maxQ = 10;
  for (let i = 0; i < leftHistory.length; i++) {
    if (leftHistory[i] > maxQ) maxQ = leftHistory[i];
    if (i < rightHistory.length && rightHistory[i] > maxQ) maxQ = rightHistory[i];
  }
  return maxQ;
}
