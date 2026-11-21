import { useEffect, useRef } from 'react';
import { SHORTCUT_BY_KEY } from '../data/keyboardShortcuts';
import type { ShortcutAction } from '../data/keyboardShortcuts';

export type ShortcutActions = Partial<Record<ShortcutAction, () => void>>;

const TEXT_CONTROL_SELECTOR =
  'input, select, textarea, [role="slider"], [role="textbox"], [role="combobox"], [role="spinbutton"], [contenteditable="true"]';
const ACTIVATABLE_CONTROL_SELECTOR = 'button, a, canvas, [role="button"]';

export function useKeyboardShortcuts(actions: ShortcutActions, enabled = true): void {
  const actionsRef = useRef<ShortcutActions>(actions);

  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.repeat || e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest(TEXT_CONTROL_SELECTOR) !== null)
      ) {
        return;
      }
      if (
        e.key === ' ' &&
        target instanceof HTMLElement &&
        target.closest(ACTIVATABLE_CONTROL_SELECTOR) !== null
      ) {
        return;
      }

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
