import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { buildTelemetrySnapshot, createSimulation, DEFAULT_CONFIG } from '../../engine/elevatorSim';
import { ControlDock } from '../ControlDock';
import { TelemetryHud } from '../TelemetryHud';

describe('ControlDock & TelemetryHud', () => {
  it('invokes playback, burst, fire alarm, reset, and slider callbacks in ControlDock', async () => {
    const user = userEvent.setup();
    const handlers = {
      onTogglePause: vi.fn(),
      onSelectSpeed: vi.fn(),
      onToggleFireAlarm: vi.fn(),
      onBurst: vi.fn(),
      onReset: vi.fn(),
      onToggleDrawer: vi.fn(),
      onConfigChange: vi.fn(),
    };

    render(
      <ControlDock
        config={DEFAULT_CONFIG}
        paused={false}
        speed={3}
        fireAlarmActive={false}
        drawerOpen={false}
        {...handlers}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Pause simulation' }));
    expect(handlers.onTogglePause).toHaveBeenCalledTimes(1);

    const speed8Btn = screen.getByRole('button', { name: '8x' });
    expect(speed8Btn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: '3x' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(speed8Btn);
    expect(handlers.onSelectSpeed).toHaveBeenCalledWith(8);

    await user.click(screen.getByRole('button', { name: /Fire Alarm/i }));
    expect(handlers.onToggleFireAlarm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /\+12/i }));
    expect(handlers.onBurst).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /Reset/i }));
    expect(handlers.onReset).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Arrival Rate'), { target: { value: '60' } });
    expect(handlers.onConfigChange).toHaveBeenCalledWith({ arrivalRate: 60 }, false);

    fireEvent.change(screen.getByLabelText('Building Floors'), { target: { value: '18' } });
    expect(handlers.onConfigChange).toHaveBeenCalledWith({ floors: 18 }, true);
  });

  it('renders telemetry cards, switches presets and algorithms, and opens modals from TelemetryHud', async () => {
    const user = userEvent.setup();
    const sim = createSimulation(DEFAULT_CONFIG, 20261118, 45);
    const snapshot = buildTelemetrySnapshot(sim, DEFAULT_CONFIG);

    const onSelectPreset = vi.fn();
    const onSelectAlgorithm = vi.fn();
    const onOpenMetrics = vi.fn();
    const onOpenGuide = vi.fn();

    render(
      <TelemetryHud
        telemetry={snapshot}
        paused={true}
        distributionMode={DEFAULT_CONFIG.distributionMode}
        leftAlgorithm={DEFAULT_CONFIG.leftAlgorithm}
        rightAlgorithm={DEFAULT_CONFIG.rightAlgorithm}
        onSelectPreset={onSelectPreset}
        onSelectAlgorithm={onSelectAlgorithm}
        onOpenMetrics={onOpenMetrics}
        onOpenGuide={onOpenGuide}
      />
    );

    expect(screen.getByText('Paused')).toBeInTheDocument();
    expect(screen.getByText('LiftBench')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Lunch' }));
    expect(onSelectPreset).toHaveBeenCalledWith('lunch');

    await user.selectOptions(screen.getByLabelText('Left tower dispatch algorithm'), 'eco');
    expect(onSelectAlgorithm).toHaveBeenCalledWith('left', 'eco');

    await user.click(screen.getByRole('button', { name: 'Guide' }));
    expect(onOpenGuide).toHaveBeenCalledWith('destination');

    await user.click(screen.getByRole('button', { name: 'Metrics' }));
    expect(onOpenMetrics).toHaveBeenCalledTimes(1);
  });
});
