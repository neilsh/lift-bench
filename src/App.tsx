import { useCallback, useState } from 'react';
import { AlgorithmGuideModal } from './components/AlgorithmGuideModal';
import { ControlDock } from './components/ControlDock';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { MetricsModal } from './components/MetricsModal';
import { SimCanvasStage } from './components/SimCanvasStage';
import { TelemetryHud } from './components/TelemetryHud';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useSimulationLoop } from './hooks/useSimulationLoop';
import type { DispatchAlgorithm } from './types/simulation';

export default function App() {
  const {
    config,
    paused,
    speed,
    telemetry,
    showWaitHeatmap,
    announcement,
    containerRef,
    canvasRef,
    layoutRef,
    handleSelectPreset,
    handleSelectAlgorithm,
    handleTogglePause,
    handleSelectSpeed,
    handleToggleWaitHeatmap,
    handleToggleFireAlarm,
    handleBurst,
    handleSpawnFloorBurst,
    handleReset,
    handleConfigChange,
    setCanvasHoverTarget,
    inspectHoverTarget,
  } = useSimulationLoop();

  const [metricsModalOpen, setMetricsModalOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [focusedAlgorithm, setFocusedAlgorithm] = useState<DispatchAlgorithm | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleToggleDrawer = useCallback(() => {
    setDrawerOpen((prev) => !prev);
  }, []);

  const handleOpenGuide = useCallback((algo?: DispatchAlgorithm) => {
    setFocusedAlgorithm(algo ?? null);
    setGuideOpen(true);
  }, []);

  const handleCloseGuide = useCallback(() => {
    setGuideOpen(false);
  }, []);

  const handleOpenMetrics = useCallback(() => {
    setMetricsModalOpen(true);
  }, []);

  const handleCloseMetrics = useCallback(() => {
    setMetricsModalOpen(false);
  }, []);

  const handleOpenShortcuts = useCallback(() => {
    setShortcutsOpen(true);
  }, []);

  const handleCloseShortcuts = useCallback(() => {
    setShortcutsOpen(false);
  }, []);

  useKeyboardShortcuts(
    {
      togglePause: handleTogglePause,
      speed1x: () => handleSelectSpeed(1),
      speed3x: () => handleSelectSpeed(3),
      speed8x: () => handleSelectSpeed(8),
      burst: handleBurst,
      toggleHeatmap: handleToggleWaitHeatmap,
      toggleFireAlarm: handleToggleFireAlarm,
      reset: handleReset,
      openMetrics: handleOpenMetrics,
      openGuide: () => handleOpenGuide(config.rightAlgorithm),
      openShortcuts: handleOpenShortcuts,
    },
    !metricsModalOpen && !guideOpen && !shortcutsOpen
  );

  return (
    <div className="flex flex-col h-full w-full bg-[#090d16] text-slate-100 font-sans">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <TelemetryHud
        telemetry={telemetry}
        paused={paused}
        distributionMode={config.distributionMode}
        leftAlgorithm={config.leftAlgorithm}
        rightAlgorithm={config.rightAlgorithm}
        onSelectPreset={handleSelectPreset}
        onSelectAlgorithm={handleSelectAlgorithm}
        onOpenMetrics={handleOpenMetrics}
        onOpenGuide={handleOpenGuide}
        onOpenShortcuts={handleOpenShortcuts}
      />

      <SimCanvasStage
        containerRef={containerRef}
        canvasRef={canvasRef}
        layoutRef={layoutRef}
        telemetry={telemetry}
        showWaitHeatmap={showWaitHeatmap}
        onSpawnFloorBurst={handleSpawnFloorBurst}
        onHoverTargetChange={setCanvasHoverTarget}
        inspectTarget={inspectHoverTarget}
      />

      <ControlDock
        config={config}
        paused={paused}
        speed={speed}
        fireAlarmActive={telemetry.fireAlarmActive}
        showWaitHeatmap={showWaitHeatmap}
        drawerOpen={drawerOpen}
        onTogglePause={handleTogglePause}
        onSelectSpeed={handleSelectSpeed}
        onToggleWaitHeatmap={handleToggleWaitHeatmap}
        onToggleFireAlarm={handleToggleFireAlarm}
        onBurst={handleBurst}
        onReset={handleReset}
        onToggleDrawer={handleToggleDrawer}
        onConfigChange={handleConfigChange}
      />

      <MetricsModal
        open={metricsModalOpen}
        telemetry={telemetry}
        distributionMode={config.distributionMode}
        config={config}
        paused={paused}
        onTogglePause={handleTogglePause}
        onClose={handleCloseMetrics}
      />

      <AlgorithmGuideModal
        open={guideOpen}
        leftAlgorithm={config.leftAlgorithm}
        rightAlgorithm={config.rightAlgorithm}
        focusedAlgorithm={focusedAlgorithm}
        onSelectAlgorithm={handleSelectAlgorithm}
        onClose={handleCloseGuide}
      />

      <KeyboardShortcutsModal open={shortcutsOpen} onClose={handleCloseShortcuts} />
    </div>
  );
}
