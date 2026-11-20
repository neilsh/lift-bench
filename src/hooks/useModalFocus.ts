import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  const nodes = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
  return Array.from(nodes).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true'
  );
}

export function useModalFocus(
  open: boolean,
  onClose: () => void,
  initialFocusRef: RefObject<HTMLElement | null>,
  containerRef?: RefObject<HTMLElement | null>
) {
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const active = document.activeElement;
    previousFocusRef.current = active instanceof HTMLElement ? active : null;

    const raf = requestAnimationFrame(() => {
      initialFocusRef.current?.focus();
    });

    const handleKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        onCloseRef.current();
        return;
      }

      if (ev.key === 'Tab' && containerRef?.current) {
        const focusable = getFocusableElements(containerRef.current);
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const current = document.activeElement;

        if (ev.shiftKey) {
          if (current === first || !containerRef.current.contains(current)) {
            ev.preventDefault();
            last.focus();
          }
        } else if (current === last || !containerRef.current.contains(current)) {
          ev.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', handleKey);
      const prev = previousFocusRef.current;
      if (prev && prev.isConnected) {
        prev.focus();
      }
    };
  }, [open, initialFocusRef, containerRef]);
}
