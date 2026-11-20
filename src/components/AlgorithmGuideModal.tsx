import { BookOpen, Check, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { ALGORITHM_META, ALGORITHM_ORDER } from '../engine/elevatorSim';
import { useModalFocus } from '../hooks/useModalFocus';
import type { DispatchAlgorithm, TowerSide } from '../types/simulation';

interface AlgorithmGuideModalProps {
  open: boolean;
  leftAlgorithm: DispatchAlgorithm;
  rightAlgorithm: DispatchAlgorithm;
  focusedAlgorithm: DispatchAlgorithm | null;
  onSelectAlgorithm: (side: TowerSide, algorithm: DispatchAlgorithm) => void;
  onClose: () => void;
}

export function AlgorithmGuideModal({
  open,
  leftAlgorithm,
  rightAlgorithm,
  focusedAlgorithm,
  onSelectAlgorithm,
  onClose,
}: AlgorithmGuideModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const cardRefs = useRef<Partial<Record<DispatchAlgorithm, HTMLElement | null>>>({});

  useModalFocus(open, onClose, closeBtnRef);

  useEffect(() => {
    if (!open || !focusedAlgorithm) return;
    const el = cardRefs.current[focusedAlgorithm];
    if (el) {
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [open, focusedAlgorithm]);

  if (!open) return null;

  return (
    <dialog
      open
      aria-modal="true"
      aria-labelledby="guideModalTitle"
      className="fixed inset-0 z-50 m-0 flex h-full max-h-none w-full max-w-none items-center justify-center border-0 bg-transparent p-2.5 sm:p-4 text-inherit"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close algorithms guide"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm cursor-default"
      />
      <div className="modal-panel-anim relative w-full max-w-3xl max-h-[86dvh] bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="shrink-0 px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2 bg-slate-950/75">
          <div className="flex items-center gap-2.5 min-w-0">
            <BookOpen className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2
                id="guideModalTitle"
                className="text-sm sm:text-base font-bold text-slate-100 leading-tight truncate"
              >
                Dispatch Algorithms Guide
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                Compare how each scheduler routes shafts, batches riders, and trades wait vs. energy.
              </p>
            </div>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close algorithms guide"
            className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center border border-slate-700 transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 flex flex-col gap-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ALGORITHM_ORDER.map((id) => {
              const meta = ALGORITHM_META[id];
              const isLeft = leftAlgorithm === id;
              const isRight = rightAlgorithm === id;
              const isFocused = focusedAlgorithm === id;

              return (
                <article
                  key={id}
                  ref={(node) => {
                    cardRefs.current[id] = node;
                  }}
                  className={`rounded-xl border p-3.5 flex flex-col justify-between gap-3 bg-slate-950/80 transition-colors ${
                    isFocused
                      ? 'border-cyan-400/70'
                      : isLeft || isRight
                        ? 'border-slate-700'
                        : 'border-slate-800/90'
                  }`}
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-100">{meta.name}</h3>
                      {(isLeft || isRight) && (
                        <span className="text-[11px] font-mono tabular-nums whitespace-nowrap">
                          {isLeft && <span className="text-amber-300">Active Left</span>}
                          {isLeft && isRight && <span className="text-slate-600"> · </span>}
                          {isRight && <span className="text-cyan-300">Active Right</span>}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">{meta.howItWorks}</p>

                    <dl className="flex flex-col gap-1 text-[11px] pt-1 border-t border-slate-800/80">
                      <div className="flex gap-1.5">
                        <dt className="text-slate-400 font-medium shrink-0">Best for:</dt>
                        <dd className="text-emerald-300/95">{meta.bestFor}</dd>
                      </div>
                      <div className="flex gap-1.5">
                        <dt className="text-slate-400 font-medium shrink-0">Trade-off:</dt>
                        <dd className="text-slate-300">{meta.tradeOff}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => onSelectAlgorithm('left', id)}
                      disabled={isLeft}
                      className={`flex-1 h-9 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                        isLeft
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-200 cursor-default'
                          : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200 cursor-pointer'
                      }`}
                    >
                      {isLeft && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                      <span>{isLeft ? 'Left Tower' : 'Set Left'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectAlgorithm('right', id)}
                      disabled={isRight}
                      className={`flex-1 h-9 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                        isRight
                          ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200 cursor-default'
                          : 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-200 cursor-pointer'
                      }`}
                    >
                      {isRight && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
                      <span>{isRight ? 'Right Tower' : 'Set Right'}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/70 px-3.5 py-2.5 text-[11px] text-slate-300 leading-relaxed">
            <span className="font-semibold text-slate-100">CIBSE Guide D Grading:</span>{' '}
            Towers are graded live from <span className="font-mono text-emerald-300">A</span>{' '}
            (Excellent: Wait ≤20s, TTD ≤45s) through{' '}
            <span className="font-mono text-amber-300">C</span> (Fair: Wait ≤30s, TTD ≤75s) down to{' '}
            <span className="font-mono text-rose-300">F</span> (Overloaded or saturated queue).
          </div>
        </div>
      </div>
    </dialog>
  );
}
