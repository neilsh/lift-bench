import { Keyboard, X } from 'lucide-react';
import { memo, useRef } from 'react';
import {
  SHORTCUT_DEFINITIONS,
  SHORTCUT_GROUP_LABELS,
  SHORTCUT_GROUP_ORDER,
} from '../data/keyboardShortcuts';
import { useModalFocus } from '../hooks/useModalFocus';

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal = memo(function KeyboardShortcutsModal({
  open,
  onClose,
}: KeyboardShortcutsModalProps) {
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useModalFocus(open, onClose, closeBtnRef, panelRef);

  if (!open) return null;

  return (
    <dialog
      open
      aria-modal="true"
      aria-labelledby="shortcutsModalTitle"
      className="fixed inset-0 z-50 m-0 flex h-full max-h-none w-full max-w-none items-center justify-center border-0 bg-transparent p-2.5 sm:p-4 text-inherit"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close keyboard shortcuts"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm cursor-default"
      />
      <div
        ref={panelRef}
        className="modal-panel-anim relative w-full max-w-lg max-h-[86dvh] bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="shrink-0 px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2 bg-slate-950/75">
          <div className="flex items-center gap-2.5 min-w-0">
            <Keyboard className="w-4 h-4 text-cyan-400 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <h2
                id="shortcutsModalTitle"
                className="text-sm sm:text-base font-bold text-slate-100 leading-tight truncate"
              >
                Keyboard Shortcuts
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                Quick controls when canvas or page has focus
              </p>
            </div>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
            className="w-10 h-10 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center border border-slate-700 transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 flex flex-col gap-4">
          {SHORTCUT_GROUP_ORDER.map((group) => {
            const items = SHORTCUT_DEFINITIONS.filter((def) => def.group === group);
            return (
              <section key={group} className="flex flex-col gap-1.5">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-1">
                  {SHORTCUT_GROUP_LABELS[group]}
                </h3>
                <ul className="rounded-xl border border-slate-800 bg-slate-950/70 divide-y divide-slate-800/80">
                  {items.map((item) => (
                    <li
                      key={item.action}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                    >
                      <span className="text-slate-200">{item.label}</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px] font-semibold text-cyan-300">
                        {item.displayKey}
                      </kbd>
                    </li>
                  ))}
                  {group === 'views' && (
                    <li className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                      <span className="text-slate-200">Close active dialog</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[11px] font-semibold text-cyan-300">
                        Esc
                      </kbd>
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </dialog>
  );
});
