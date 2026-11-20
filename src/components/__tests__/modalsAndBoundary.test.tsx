import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { buildTelemetrySnapshot, createSimulation, DEFAULT_CONFIG } from '../../engine/elevatorSim';
import { AlgorithmGuideModal } from '../AlgorithmGuideModal';
import { ErrorBoundary } from '../ErrorBoundary';
import { KeyboardShortcutsModal } from '../KeyboardShortcutsModal';
import { MetricsModal } from '../MetricsModal';

function Thrower({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Simulated render crash');
  }
  return <div>Healthy simulator child</div>;
}

function ErrorBoundaryHarness() {
  const [fail, setFail] = useState(true);
  return (
    <div>
      <button type="button" onClick={() => setFail(false)}>
        Fix Child
      </button>
      <ErrorBoundary>
        <Thrower shouldThrow={fail} />
      </ErrorBoundary>
    </div>
  );
}

describe('Modals & ErrorBoundary', () => {
  it('renders AlgorithmGuideModal, assigns tower algorithms, and closes on Escape', async () => {
    const user = userEvent.setup();
    const onSelectAlgorithm = vi.fn();
    const onClose = vi.fn();

    render(
      <AlgorithmGuideModal
        open={true}
        leftAlgorithm="standard"
        rightAlgorithm="destination"
        focusedAlgorithm="eco"
        onSelectAlgorithm={onSelectAlgorithm}
        onClose={onClose}
      />
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Dispatch Algorithms Guide')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Left Tower' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Right Tower' })).toBeDisabled();

    const setLeftButtons = screen.getAllByRole('button', { name: 'Set Left' });
    await user.click(setLeftButtons[0]);
    expect(onSelectAlgorithm).toHaveBeenCalledWith('left', 'destination');

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders KeyboardShortcutsModal, focuses close button, traps Tab focus, and closes on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<KeyboardShortcutsModal open={true} onClose={onClose} />);

    const dialog = screen.getByRole('dialog', { name: 'Keyboard Shortcuts' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    expect(screen.getByText('Close active dialog')).toBeInTheDocument();

    const closeButtons = screen.getAllByLabelText('Close keyboard shortcuts');
    const closeBtn = closeButtons[closeButtons.length - 1];
    await waitFor(() => expect(closeBtn).toHaveFocus());

    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    expect(closeBtn).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders 4-tab Telemetry Studio MetricsModal, switches tabs/charts, pauses, and traps focus', async () => {
    const user = userEvent.setup();
    const sim = createSimulation(DEFAULT_CONFIG, 9001, 120);
    const snapshot = buildTelemetrySnapshot(sim, DEFAULT_CONFIG);
    const onClose = vi.fn();
    const onTogglePause = vi.fn();

    render(
      <MetricsModal
        open={true}
        telemetry={snapshot}
        distributionMode="realistic"
        config={DEFAULT_CONFIG}
        paused={false}
        onTogglePause={onTogglePause}
        onClose={onClose}
      />
    );

    expect(screen.getByText('Live Dispatch Telemetry')).toBeInTheDocument();
    expect(screen.getByText('CIBSE Guide D Grade')).toBeInTheDocument();
    expect(screen.getByText('Mean TTD (Total)')).toBeInTheDocument();

    const dialog = screen.getByRole('dialog');
    const closeButtons = screen.getAllByLabelText('Close telemetry modal');
    const closeBtn = closeButtons[closeButtons.length - 1];
    await waitFor(() => expect(closeBtn).toHaveFocus());

    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    // Inline pause toggle
    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(onTogglePause).toHaveBeenCalledTimes(1);

    // Live Trends tab, Auto Y toggle & 2x2 Grid toggle
    await user.click(screen.getByRole('tab', { name: 'Live Trends' }));
    expect(screen.getByRole('img', { name: /time-series chart/i })).toBeInTheDocument();
    const autoYBtn = screen.getByRole('button', { name: 'Auto Y' });
    expect(autoYBtn).toHaveAttribute('aria-pressed', 'true');
    await user.click(autoYBtn);
    expect(autoYBtn).toHaveAttribute('aria-pressed', 'false');
    await user.click(autoYBtn);
    expect(autoYBtn).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: '2×2 Grid' }));
    expect(screen.getAllByRole('img', { name: /time-series chart/i })).toHaveLength(4);

    // Distributions tab & Histogram/CDF toggle
    await user.click(screen.getByRole('tab', { name: 'Distributions' }));
    expect(screen.getByRole('img', { name: /Wait time histogram chart/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cumulative CDF' }));
    expect(screen.getByRole('img', { name: /Wait time cdf chart/i })).toBeInTheDocument();

    // Matrix & Export tab & category filtering
    await user.click(screen.getByRole('tab', { name: 'Matrix & Export' }));
    expect(screen.getByText('Demand Saturation Ratio (ρ)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cycle Kinematics' }));
    expect(screen.queryByText('Demand Saturation Ratio (ρ)')).not.toBeInTheDocument();
    expect(screen.getByText('Highest Reversal Floor (H)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export JSON' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('catches rendering errors in ErrorBoundary and recovers on reset', async () => {
    const user = userEvent.setup();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<ErrorBoundaryHarness />);
    expect(screen.getByText('Simulator Recovery')).toBeInTheDocument();
    expect(screen.getByText('Simulated render crash')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fix Child' }));
    await user.click(screen.getByRole('button', { name: 'Reset Simulator' }));
    expect(screen.getByText('Healthy simulator child')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });
});
