import { Info, X } from 'lucide-react';
import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { METRIC_GLOSSARY } from '../data/metricGlossary';
import type { GlossaryKey } from '../data/metricGlossary';

interface InfoPopoverProps {
  topic: GlossaryKey;
  /** Optional custom accessible label for the trigger button */
  ariaLabel?: string;
  /** Icon sizing preset to fit dense HUD lines or modal headers */
  size?: 'xs' | 'sm';
  /** Optional extra classes for the trigger button */
  className?: string;
}

const POPOVER_OPEN_EVENT = 'liftbench:infopopover-open';
const POPOVER_WIDTH_PX = 312;
const VIEWPORT_MARGIN_PX = 12;
const GAP_PX = 8;

interface PopoverCoords {
  top: number;
  left: number;
  placement: 'top' | 'bottom';
  arrowLeft: number;
}

function computePopoverCoords(triggerRect: DOMRect, panelHeight: number): PopoverCoords {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const panelW = Math.min(POPOVER_WIDTH_PX, vw - VIEWPORT_MARGIN_PX * 2);

  const spaceBelow = vh - triggerRect.bottom - VIEWPORT_MARGIN_PX;
  const spaceAbove = triggerRect.top - VIEWPORT_MARGIN_PX;
  const placement: 'top' | 'bottom' =
    spaceBelow >= panelHeight + GAP_PX || spaceBelow >= spaceAbove ? 'bottom' : 'top';

  const triggerCenterX = triggerRect.left + triggerRect.width / 2;
  const rawLeft = triggerCenterX - panelW / 2;
  const left = Math.max(VIEWPORT_MARGIN_PX, Math.min(vw - panelW - VIEWPORT_MARGIN_PX, rawLeft));

  const rawTop =
    placement === 'bottom' ? triggerRect.bottom + GAP_PX : triggerRect.top - panelHeight - GAP_PX;
  const top = Math.max(VIEWPORT_MARGIN_PX, Math.min(vh - panelHeight - VIEWPORT_MARGIN_PX, rawTop));

  const arrowLeft = Math.max(14, Math.min(panelW - 14, triggerCenterX - left));

  return { top, left, placement, arrowLeft };
}

export const InfoPopover = memo(function InfoPopover({
  topic,
  ariaLabel,
  size = 'xs',
  className = '',
}: InfoPopoverProps) {
  const entry = METRIC_GLOSSARY[topic];
  const popoverId = useId();
  const instanceId = useId();

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [coords, setCoords] = useState<PopoverCoords | null>(null);

  const clearTimers = useCallback(() => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const closePopover = useCallback(() => {
    clearTimers();
    setIsOpen(false);
    setIsPinned(false);
  }, [clearTimers]);

  const openPopover = useCallback(
    (pin: boolean) => {
      clearTimers();
      window.dispatchEvent(new CustomEvent(POPOVER_OPEN_EVENT, { detail: instanceId }));
      setIsOpen(true);
      if (pin) {
        setIsPinned(true);
      }
    },
    [clearTimers, instanceId]
  );

  // Close if another InfoPopover opens anywhere in the app
  useEffect(() => {
    const handleOtherOpen = (ev: Event) => {
      const customEv = ev as CustomEvent<string>;
      if (customEv.detail !== instanceId) {
        closePopover();
      }
    };
    window.addEventListener(POPOVER_OPEN_EVENT, handleOtherOpen);
    return () => {
      window.removeEventListener(POPOVER_OPEN_EVENT, handleOtherOpen);
      clearTimers();
    };
  }, [instanceId, closePopover, clearTimers]);

  // Measure and position popover whenever opened, resized, or scrolled
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const measuredH = panelRef.current?.offsetHeight ?? 172;
    setCoords(computePopoverCoords(rect, measuredH));
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const raf = window.requestAnimationFrame(updatePosition);
    return () => window.cancelAnimationFrame(raf);
  }, [isOpen, updatePosition]);

  // Outside click, Escape key (capture phase so parent modal stays open), and scroll/resize handling
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (ev: PointerEvent) => {
      const target = ev.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }
      closePopover();
    };

    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        closePopover();
        triggerRef.current?.focus();
      }
    };

    const handleViewportChange = () => {
      updatePosition();
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [isOpen, closePopover, updatePosition]);

  // Keep hover-preview open while pointer is inside the portaled panel
  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    if (!panel) return;

    const handlePanelEnter = (ev: PointerEvent) => {
      if (ev.pointerType !== 'mouse') return;
      clearTimers();
    };

    const handlePanelLeave = (ev: PointerEvent) => {
      if (ev.pointerType !== 'mouse' || isPinned) return;
      clearTimers();
      closeTimerRef.current = window.setTimeout(() => {
        setIsOpen(false);
      }, 150);
    };

    panel.addEventListener('pointerenter', handlePanelEnter);
    panel.addEventListener('pointerleave', handlePanelLeave);
    return () => {
      panel.removeEventListener('pointerenter', handlePanelEnter);
      panel.removeEventListener('pointerleave', handlePanelLeave);
    };
  }, [isOpen, isPinned, clearTimers]);

  const handleTriggerClick = (ev: React.MouseEvent<HTMLButtonElement>) => {
    ev.stopPropagation();
    if (isOpen && isPinned) {
      closePopover();
    } else {
      openPopover(true);
    }
  };

  const handleTriggerPointerEnter = (ev: React.PointerEvent<HTMLButtonElement>) => {
    if (ev.pointerType !== 'mouse') return;
    clearTimers();
    if (!isOpen) {
      openTimerRef.current = window.setTimeout(() => {
        openPopover(false);
      }, 220);
    }
  };

  const handleTriggerPointerLeave = (ev: React.PointerEvent<HTMLButtonElement>) => {
    if (ev.pointerType !== 'mouse') return;
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (!isPinned && isOpen) {
      closeTimerRef.current = window.setTimeout(() => {
        setIsOpen(false);
      }, 150);
    }
  };

  const iconSizeClass = size === 'sm' ? 'w-3.5 h-3.5' : 'w-3 h-3';
  const btnPaddingClass = size === 'sm' ? 'p-1 -m-0.5' : 'p-0.5';

  const accessibleLabel = ariaLabel ?? `About ${entry.title}`;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTriggerClick}
        onPointerEnter={handleTriggerPointerEnter}
        onPointerLeave={handleTriggerPointerLeave}
        aria-label={accessibleLabel}
        aria-expanded={isOpen}
        aria-controls={isOpen ? popoverId : undefined}
        className={`inline-flex items-center justify-center rounded-md transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${btnPaddingClass} ${
          isOpen
            ? 'text-cyan-300 bg-cyan-500/15'
            : 'text-slate-500 hover:text-cyan-300 hover:bg-slate-800/70'
        } ${className}`}
      >
        <Info className={iconSizeClass} aria-hidden="true" />
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <section
            ref={panelRef}
            id={popoverId}
            aria-label={`${entry.title} explanation`}
            style={{
              position: 'fixed',
              top: coords ? `${coords.top}px` : '-9999px',
              left: coords ? `${coords.left}px` : '-9999px',
              width: `min(${POPOVER_WIDTH_PX}px, calc(100vw - ${VIEWPORT_MARGIN_PX * 2}px))`,
              zIndex: 70,
            }}
            className="popover-enter bg-slate-950 border border-slate-700/90 rounded-xl shadow-[0_14px_34px_rgba(0,0,0,0.7)] p-3 text-left text-slate-200 select-text"
          >
            {coords && (
              <span
                aria-hidden="true"
                style={{ left: `${coords.arrowLeft - 5}px` }}
                className={`absolute w-2.5 h-2.5 bg-slate-950 border-slate-700/90 rotate-45 pointer-events-none ${
                  coords.placement === 'bottom'
                    ? '-top-[6px] border-t border-l'
                    : '-bottom-[6px] border-b border-r'
                }`}
              />
            )}

            <div className="flex items-start justify-between gap-2 pb-1.5">
              <div className="min-w-0 leading-snug">
                <h3 className="text-xs font-semibold text-slate-100 inline">{entry.title}</h3>
                {entry.symbol && (
                  <>
                    <span className="text-slate-600 mx-1.5" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-cyan-300">
                      {entry.symbol}
                    </span>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={(ev) => {
                  ev.stopPropagation();
                  closePopover();
                  triggerRef.current?.focus();
                }}
                aria-label="Close explanation"
                className="w-5 h-5 -mr-1 -mt-0.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-800 flex items-center justify-center transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
              >
                <X className="w-3 h-3" aria-hidden="true" />
              </button>
            </div>

            <p className="text-[11.5px] text-slate-300 leading-relaxed">{entry.summary}</p>

            <div className="mt-2 pt-2 border-t border-slate-800/90">
              <span className="block text-[10.5px] font-semibold text-cyan-300/95 mb-0.5">
                Why it matters
              </span>
              <p className="text-[11px] text-slate-400 leading-relaxed">{entry.significance}</p>
            </div>

            {entry.benchmark && (
              <div className="mt-2 pt-1.5 border-t border-slate-800/70 font-mono tabular-nums text-[10.5px] text-slate-300/90 leading-snug">
                {entry.benchmark}
              </div>
            )}
          </section>,
          document.body
        )}
    </>
  );
});
