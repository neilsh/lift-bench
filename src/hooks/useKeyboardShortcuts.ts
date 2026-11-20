import { useEffect, useRef } from 'react';
import { SHORTCUT_BY_KEY } from '../data/keyboardShortcuts';
import type { ShortcutAction } from '../data/keyboardShortcuts';

export type ShortcutActions = Partial<Record<ShortcutAction, () => void>>;

const INTERACTIVE_SELECTOR =
  'input, select, textarea, button, a, canvas, [role="slider"], [role="button"], [contenteditable="true"]';

export function useKeyboardShortcuts(actions: ShortcutActions, enabled = true): void {
  const actionsRef = useRef<ShortcutActions>(actions);

  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;

      const target = e.target;
      if (target instanceof HTMLElement && target.isContentEditable) return;
      if (target instanceof Element && target.closest(INTERACTIVE_SELECTOR)) return;

      const lookupKey = e.key === '?' ? '?' : e.shiftKey ? null : e.key.toLowerCase();
      if (!lookupKey) return;

      const def = SHORTCUT_BY_KEY.get(lookupKey);
      if (!def) return;

      const handler = actionsRef.current[def.action];
      if (handler) {
        e.preventDefault();
        handler();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
