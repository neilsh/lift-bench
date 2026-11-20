import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { METRIC_GLOSSARY } from '../../data/metricGlossary';
import { buildTelemetrySnapshot, createSimulation, DEFAULT_CONFIG } from '../../engine/elevatorSim';
import { ControlDock } from '../ControlDock';
import { InfoPopover } from '../InfoPopover';
import { MetricsModal } from '../MetricsModal';

describe('InfoPopover & Metric Glossary', () => {
  it('provides non-empty titles, summaries, and significance across the entire glossary', () => {
    const entries = Object.entries(METRIC_GLOSSARY);
    expect(entries.length).toBeGreaterThanOrEqual(30);
    for (const [, entry] of entries) {
      expect(entry.title.trim().length).toBeGreaterThan(2);
      expect(entry.summary.trim().length).toBeGreaterThan(15);
      expect(entry.significance.trim().length).toBeGreaterThan(15);
    }
  });

  it('opens on click, enforces single-active popover, and closes on close button or outside click', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <InfoPopover topic="rtt" />
        <InfoPopover topic="hc5Pct" />
        <button type="button">Outside Target</button>
      </div>
    );

    const rttTrigger = screen.getByRole('button', { name: 'About Round-Trip Time' });
    const hc5Trigger = screen.getByRole('button', { name: 'About 5-Minute Handling Capacity' });

    await user.click(rttTrigger);
    expect(rttTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/Why it matters/i)).toBeInTheDocument();
    expect(screen.getByText(/Barney Eq: RTT/i)).toBeInTheDocument();

    // Opening a second popover closes the first
    await user.click(hc5Trigger);
    expect(rttTrigger).toHaveAttribute('aria-expanded', 'false');
    expect(hc5Trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByText(/Barney Eq: RTT/i)).not.toBeInTheDocument();
    expect(screen.getByText(/CIBSE Commercial Office Target/i)).toBeInTheDocument();

    // Clicking outside closes the active popover
    await user.click(screen.getByRole('button', { name: 'Outside Target' }));
    expect(hc5Trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/Why it matters/i)).not.toBeInTheDocument();

    // Reopen and close via popover close button
    await user.click(rttTrigger);
    await user.click(screen.getByRole('button', { name: 'Close explanation' }));
    expect(rttTrigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('captures Escape inside MetricsModal so only the popover closes before the modal', async () => {
    const user = userEvent.setup();
    const sim = createSimulation(DEFAULT_CONFIG, 4242, 90);
    const snapshot = buildTelemetrySnapshot(sim, DEFAULT_CONFIG);
    const onClose = vi.fn();

    render(
      <MetricsModal
        open={true}
        telemetry={snapshot}
        distributionMode="realistic"
        config={DEFAULT_CONFIG}
        paused={false}
        onTogglePause={vi.fn()}
        onClose={onClose}
      />
    );

    const rttButtons = screen.getAllByRole('button', { name: 'About Round-Trip Time' });
    await user.click(rttButtons[0]);
    expect(screen.getByText(/Barney Eq: RTT/i)).toBeInTheDocument();

    // First Escape closes only the InfoPopover, leaving MetricsModal open
    await user.keyboard('{Escape}');
    expect(screen.queryByText(/Barney Eq: RTT/i)).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    // Second Escape closes MetricsModal
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('exposes contextual slider explanations in ControlDock without breaking slider labels', async () => {
    const user = userEvent.setup();
    render(
      <ControlDock
        config={DEFAULT_CONFIG}
        paused={false}
        speed={3}
        fireAlarmActive={false}
        showWaitHeatmap={true}
        drawerOpen={true}
        onTogglePause={vi.fn()}
        onSelectSpeed={vi.fn()}
        onToggleWaitHeatmap={vi.fn()}
        onToggleFireAlarm={vi.fn()}
        onBurst={vi.fn()}
        onReset={vi.fn()}
        onToggleDrawer={vi.fn()}
        onConfigChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Stop Penalty')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'About Stop Penalty Time' }));
    expect(screen.getByText(/Modern high-speed doors/i)).toBeInTheDocument();
  });
});
