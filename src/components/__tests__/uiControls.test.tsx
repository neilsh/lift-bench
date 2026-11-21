import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { buildTelemetrySnapshot, createSimulation, DEFAULT_CONFIG } from '../../engine/elevatorSim';
import type { CanvasLayout } from '../../types/simulation';
import { ControlDock } from '../ControlDock';
import { SimCanvasStage } from '../SimCanvasStage';
import { TelemetryHud } from '../TelemetryHud';

describe('ControlDock & TelemetryHud & SimCanvasStage', () => {
  it('invokes playback, heatmap toggle, burst, fire alarm, reset, and slider callbacks in ControlDock', async () => {
    const user = userEvent.setup();
    const handlers = {
      onTogglePause: vi.fn(),
      onSelectSpeed: vi.fn(),
      onToggleWaitHeatmap: vi.fn(),
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
        showWaitHeatmap={false}
        drawerOpen={false}
        {...handlers}
      />
    );

    const waitHeatBtn = screen.getByRole('button', { name: /Wait Heat/i });
    expect(waitHeatBtn).toHaveAttribute('aria-pressed', 'false');
    await user.click(waitHeatBtn);
    expect(handlers.onToggleWaitHeatmap).toHaveBeenCalledTimes(1);

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

  it('shows calibrated wait-time gradient legend in SimCanvasStage only when enabled and not in Fire Alarm', () => {
    const sim = createSimulation(DEFAULT_CONFIG, 20261118, 45);
    const snapshot = buildTelemetrySnapshot(sim, DEFAULT_CONFIG);
    const containerRef = createRef<HTMLDivElement>();
    const canvasRef = createRef<HTMLCanvasElement>();
    const layoutRef = createRef<CanvasLayout | null>();

    const { rerender } = render(
      <SimCanvasStage
        containerRef={containerRef}
        canvasRef={canvasRef}
        layoutRef={layoutRef}
        telemetry={snapshot}
        showWaitHeatmap={false}
        onSpawnFloorBurst={vi.fn()}
        onHoverTargetChange={vi.fn()}
        inspectTarget={vi.fn(() => null)}
      />
    );

    expect(screen.queryByLabelText(/Wait-time heatmap scale/i)).not.toBeInTheDocument();

    rerender(
      <SimCanvasStage
        containerRef={containerRef}
        canvasRef={canvasRef}
        layoutRef={layoutRef}
        telemetry={snapshot}
        showWaitHeatmap={true}
        onSpawnFloorBurst={vi.fn()}
        onHoverTargetChange={vi.fn()}
        inspectTarget={vi.fn(() => null)}
      />
    );

    const scale = screen.getByLabelText(/Wait-time heatmap scale/i);
    expect(scale).toBeInTheDocument();
    expect(scale).toHaveTextContent('0s');
    expect(scale).toHaveTextContent('20s');
    expect(scale).toHaveTextContent('45s+');

    rerender(
      <SimCanvasStage
        containerRef={containerRef}
        canvasRef={canvasRef}
        layoutRef={layoutRef}
        telemetry={{ ...snapshot, fireAlarmActive: true }}
        showWaitHeatmap={true}
        onSpawnFloorBurst={vi.fn()}
        onHoverTargetChange={vi.fn()}
        inspectTarget={vi.fn(() => null)}
      />
    );

    expect(screen.queryByLabelText(/Wait-time heatmap scale/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Fire Alarm/i)).toBeInTheDocument();
  });

  it('spawns passengers on the tapped floor anywhere across queues, shafts, or spine in SimCanvasStage', async () => {
    const user = userEvent.setup();
    const sim = createSimulation(DEFAULT_CONFIG, 20261118, 45);
    const snapshot = buildTelemetrySnapshot(sim, DEFAULT_CONFIG);
    const containerRef = createRef<HTMLDivElement>();
    const canvasRef = createRef<HTMLCanvasElement>();
    const layoutRef = createRef<CanvasLayout | null>();
    const onSpawnFloorBurst = vi.fn();

    render(
      <SimCanvasStage
        containerRef={containerRef}
        canvasRef={canvasRef}
        layoutRef={layoutRef}
        telemetry={snapshot}
        showWaitHeatmap={true}
        onSpawnFloorBurst={onSpawnFloorBurst}
        onHoverTargetChange={vi.fn()}
        inspectTarget={vi.fn(() => null)}
      />
    );

    const canvasEl = screen.getByLabelText(/Twin-tower elevator dispatch simulation canvas/i);

    layoutRef.current = {
      W: 800,
      H: 600,
      topPad: 42,
      botPad: 12,
      usableH: 546,
      leftQueueX: 18,
      leftBankX: 106,
      spineX: 381,
      spineW: 38,
      rightBankX: 419,
      rightQueueX: 694,
      bankW: 275,
      shaftW: 68.75,
      queueZoneW: 88,
      floorH: 546 / 14,
      floors: 14,
      cars: 4,
    };

    if (!canvasEl) throw new Error('Expected canvas element');
    vi.spyOn(canvasEl, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 800,
      bottom: 600,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    });

    const floor3Y = 600 - 12 - (546 / 14) * 2.5;
    await user.pointer({
      keys: '[MouseLeft]',
      target: canvasEl,
      coords: { clientX: 40, clientY: floor3Y },
    });
    expect(onSpawnFloorBurst).toHaveBeenCalledWith(3);

    const floor10Y = 600 - 12 - (546 / 14) * 9.5;
    await user.pointer({
      keys: '[MouseLeft]',
      target: canvasEl,
      coords: { clientX: 500, clientY: floor10Y },
    });
    expect(onSpawnFloorBurst).toHaveBeenCalledWith(10);
  });

  it('enables the thermal overlay by default in App and toggles it off on click', async () => {
    const user = userEvent.setup();
    render(<App />);

    const waitHeatBtn = screen.getByRole('button', { name: /Wait Heat/i });
    expect(waitHeatBtn).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/Wait-time heatmap scale/i)).toBeInTheDocument();

    await user.click(waitHeatBtn);
    expect(waitHeatBtn).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByLabelText(/Wait-time heatmap scale/i)).not.toBeInTheDocument();
  });

  it('renders telemetry cards, switches presets and algorithms, and opens modals from TelemetryHud', async () => {
    const user = userEvent.setup();
    const sim = createSimulation(DEFAULT_CONFIG, 20261118, 45);
    const snapshot = buildTelemetrySnapshot(sim, DEFAULT_CONFIG);

    const onSelectPreset = vi.fn();
    const onSelectAlgorithm = vi.fn();
    const onOpenMetrics = vi.fn();
    const onOpenGuide = vi.fn();
    const onOpenShortcuts = vi.fn();

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
        onOpenShortcuts={onOpenShortcuts}
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

    await user.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);

    const githubLink = screen.getByRole('link', { name: /View LiftBench source on GitHub/i });
    expect(githubLink).toHaveAttribute('target', '_blank');
    expect(githubLink).toHaveAttribute('rel', 'noopener noreferrer');
    expect(githubLink.getAttribute('href')).toMatch(/^https:\/\/github\.com\//);
  });

  it('supports global keyboard shortcuts in App while respecting focused controls, open modals, and modifiers', async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByText('Paused')).not.toBeInTheDocument();
    await user.keyboard(' ');
    expect(screen.getByText('Paused')).toBeInTheDocument();
    await user.keyboard(' ');
    expect(screen.queryByText('Paused')).not.toBeInTheDocument();

    await user.keyboard('1');
    expect(screen.getByRole('button', { name: '1x' })).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('3');
    expect(screen.getByRole('button', { name: '8x' })).toHaveAttribute('aria-pressed', 'true');

    const waitHeatBtn = screen.getByRole('button', { name: /Wait Heat/i });
    expect(waitHeatBtn).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('h');
    expect(waitHeatBtn).toHaveAttribute('aria-pressed', 'false');

    // Focusing <canvas> or a <button> allows letter shortcuts like 'h', while Space on canvas does not toggle pause
    const canvasEl = screen.getByLabelText(/Twin-tower elevator dispatch simulation canvas/i);
    canvasEl.focus();
    await user.keyboard(' ');
    expect(screen.queryByText('Paused')).not.toBeInTheDocument();
    await user.keyboard('h');
    expect(waitHeatBtn).toHaveAttribute('aria-pressed', 'true');

    waitHeatBtn.focus();
    await user.keyboard('h');
    expect(waitHeatBtn).toHaveAttribute('aria-pressed', 'false');

    // Pressing 'h' while a modal is open does NOT toggle Wait Heat
    await user.keyboard('?');
    expect(screen.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeInTheDocument();
    await user.keyboard('h');
    expect(waitHeatBtn).toHaveAttribute('aria-pressed', 'false');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Keyboard Shortcuts' })).not.toBeInTheDocument();

    // Pressing 'h' with a modifier does NOT toggle Wait Heat
    await user.keyboard('{Control>}h{/Control}');
    expect(waitHeatBtn).toHaveAttribute('aria-pressed', 'false');

    const arrivalInput = screen.getByLabelText('Arrival Rate');
    arrivalInput.focus();
    await user.keyboard('h');
    expect(waitHeatBtn).toHaveAttribute('aria-pressed', 'false');

    const leftAlgoSelect = screen.getByLabelText('Left tower dispatch algorithm');
    leftAlgoSelect.focus();
    await user.keyboard('h');
    expect(waitHeatBtn).toHaveAttribute('aria-pressed', 'false');
  });
});
