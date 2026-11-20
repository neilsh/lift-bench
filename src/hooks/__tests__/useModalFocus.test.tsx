import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useModalFocus } from '../useModalFocus';

function ModalFocusHarness() {
  const [open, setOpen] = useState(false);
  const initialRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDialogElement | null>(null);

  useModalFocus(open, () => setOpen(false), initialRef, panelRef);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open Dialog
      </button>
      {open && (
        <dialog ref={panelRef} open aria-modal="true">
          <button ref={initialRef} type="button">
            First Control
          </button>
          <button type="button" onClick={() => setOpen(false)}>
            Last Control
          </button>
        </dialog>
      )}
    </div>
  );
}

describe('useModalFocus', () => {
  it('focuses initial control on open, cycles Tab within dialog, and restores focus on close', async () => {
    const user = userEvent.setup();
    render(<ModalFocusHarness />);

    const trigger = screen.getByRole('button', { name: 'Open Dialog' });
    trigger.focus();
    await user.click(trigger);

    const first = screen.getByRole('button', { name: 'First Control' });
    const last = screen.getByRole('button', { name: 'Last Control' });

    await waitFor(() => expect(first).toHaveFocus());

    await user.tab();
    expect(last).toHaveFocus();

    await user.tab();
    expect(first).toHaveFocus();

    await user.tab({ shift: true });
    expect(last).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
