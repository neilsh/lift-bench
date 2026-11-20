import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

export function useModalFocus(
  open: boolean,
  onClose: () => void,
  initialFocusRef: RefObject<HTMLElement | null>
) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

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
        onClose();
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
  }, [open, onClose, initialFocusRef]);
}
