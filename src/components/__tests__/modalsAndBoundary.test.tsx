import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { buildTelemetrySnapshot, createSimulation, DEFAULT_CONFIG } from '../../engine/elevatorSim';
import { AlgorithmGuideModal } from '../AlgorithmGuideModal';
import { ErrorBoundary } from '../ErrorBoundary';
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

  it('renders MetricsModal telemetry comparison table and traps Tab focus', async () => {
    const user = userEvent.setup();
    const sim = createSimulation(DEFAULT_CONFIG, 9001, 60);
    const snapshot = buildTelemetrySnapshot(sim, DEFAULT_CONFIG);
    const onClose = vi.fn();

    render(
      <MetricsModal
        open={true}
        telemetry={snapshot}
        distributionMode="realistic"
        onClose={onClose}
      />
    );

    expect(screen.getByText('Live Dispatch Telemetry')).toBeInTheDocument();
    expect(screen.getByText('CIBSE Guide D Grade')).toBeInTheDocument();
    expect(screen.getByText('Mean TTD (Total)')).toBeInTheDocument();

    const closeButtons = screen.getAllByLabelText('Close telemetry modal');
    const closeBtn = closeButtons[closeButtons.length - 1];
    await waitFor(() => expect(closeBtn).toHaveFocus());

    await user.tab();
    expect(closeBtn).toHaveFocus();

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
