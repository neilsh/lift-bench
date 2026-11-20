import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlDock } from './components/ControlDock';
import { MetricsModal } from './components/MetricsModal';
import { SimCanvasStage } from './components/SimCanvasStage';
import { TelemetryHud } from './components/TelemetryHud';
import { renderSimulationCanvas } from './engine/canvasRenderer';
import {
  buildTelemetrySnapshot,
  createSimulation,
  DEFAULT_CONFIG,
  FIXED_DT,
  spawnBurstPassengers,
  stepTwinSimulation,
  toggleFireAlarmState,
} from './engine/elevatorSim';
import type {
  CanvasLayout,
  DispatchAlgorithm,
  DistributionMode,
  PlaybackState,
  SimConfig,
  SimState,
  TelemetrySnapshot,
  TowerSide,
} from './types/simulation';

const INITIAL_SEED = 20261118;

export default function App() {
  const [config, setConfig] = useState<SimConfig>(() => ({ ...DEFAULT_CONFIG }));
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<PlaybackState['speed']>(3);
  const [metricsModalOpen, setMetricsModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const configRef = useRef<SimConfig>({ ...DEFAULT_CONFIG });
  const playbackRef = useRef<PlaybackState>({
    paused: false,
    speed: 3,
    seed: INITIAL_SEED,
  });

  const simRef = useRef<SimState | null>(null);
  if (!simRef.current) {
    simRef.current = createSimulation(configRef.current, INITIAL_SEED, 75);
  }

  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>(() =>
    buildTelemetrySnapshot(simRef.current!, configRef.current)
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layoutRef = useRef<CanvasLayout | null>(null);
  const canvasSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  const resizeCanvas = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const rect = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(300, rect.width);
    const height = Math.max(200, rect.height);

    canvasSizeRef.current = { width, height };
    const targetW = Math.floor(width * dpr);
    const targetH = Math.floor(height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }, []);

  const syncSnapshot = useCallback(() => {
    if (!simRef.current) return;
    setTelemetry(buildTelemetrySnapshot(simRef.current, configRef.current));
  }, []);

  useEffect(() => {
    resizeCanvas();

    const container = containerRef.current;
    let observer: ResizeObserver | null = null;
    if (container && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => resizeCanvas());
      observer.observe(container);
    }

    window.addEventListener('resize', resizeCanvas);

    let lastFrameTime = performance.now();
    let accumulator = 0;
    let lastHudUpdate = 0;
    let rafId = 0;

    const handleVisibility = () => {
      if (!document.hidden) {
        lastFrameTime = performance.now();
        resizeCanvas();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const loop = (now: number) => {
      const rawDelta = Math.min(0.1, Math.max(0, (now - lastFrameTime) / 1000));
      lastFrameTime = now;

      const sim = simRef.current;
      const pb = playbackRef.current;
      const cfg = configRef.current;

      if (!pb.paused && sim) {
        accumulator += rawDelta * pb.speed;
        let safetySteps = 0;
        while (accumulator >= FIXED_DT && safetySteps < 24) {
          stepTwinSimulation(sim, cfg, FIXED_DT);
          accumulator -= FIXED_DT;
          safetySteps++;
        }
        if (safetySteps >= 24) accumulator = 0;
      }

      if (canvasRef.current && sim) {
        const containerEl = containerRef.current;
        if (containerEl) {
          const rect = containerEl.getBoundingClientRect();
          if (
            rect.width > 0 &&
            rect.height > 0 &&
            (Math.abs(rect.width - canvasSizeRef.current.width) > 2 ||
              Math.abs(rect.height - canvasSizeRef.current.height) > 2)
          ) {
            resizeCanvas();
          }
        }
        const nextLayout = renderSimulationCanvas(
          canvasRef.current,
          sim,
          cfg,
          canvasSizeRef.current.width,
          canvasSizeRef.current.height
        );
        if (nextLayout) layoutRef.current = nextLayout;
      }

      if (now - lastHudUpdate >= 100 && sim) {
        lastHudUpdate = now;
        setTelemetry(buildTelemetrySnapshot(sim, cfg));
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resizeCanvas);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (observer) observer.disconnect();
    };
  }, [resizeCanvas]);

  const handleSelectPreset = useCallback(
    (mode: DistributionMode) => {
      if (configRef.current.distributionMode === mode) return;
      const nextCfg: SimConfig = { ...configRef.current, distributionMode: mode };
      configRef.current = nextCfg;
      setConfig(nextCfg);
      simRef.current = createSimulation(nextCfg, playbackRef.current.seed, 65);
      syncSnapshot();
    },
    [syncSnapshot]
  );

  const handleSelectAlgorithm = useCallback(
    (side: TowerSide, algorithm: DispatchAlgorithm) => {
      const key = side === 'left' ? 'leftAlgorithm' : 'rightAlgorithm';
      if (configRef.current[key] === algorithm) return;
      const nextCfg: SimConfig = { ...configRef.current, [key]: algorithm };
      configRef.current = nextCfg;
      setConfig(nextCfg);
      simRef.current = createSimulation(nextCfg, playbackRef.current.seed, 65);
      syncSnapshot();
    },
    [syncSnapshot]
  );

  const handleTogglePause = useCallback(() => {
    const nextPaused = !playbackRef.current.paused;
    playbackRef.current.paused = nextPaused;
    setPaused(nextPaused);
  }, []);

  const handleSelectSpeed = useCallback((nextSpeed: PlaybackState['speed']) => {
    playbackRef.current.speed = nextSpeed;
    setSpeed(nextSpeed);
  }, []);

  const handleToggleFireAlarm = useCallback(() => {
    if (!simRef.current) return;
    toggleFireAlarmState(simRef.current, configRef.current);
    syncSnapshot();
  }, [syncSnapshot]);

  const handleBurst = useCallback(() => {
    if (!simRef.current) return;
    spawnBurstPassengers(simRef.current, configRef.current, 12, null);
    syncSnapshot();
  }, [syncSnapshot]);

  const handleSpawnFloorBurst = useCallback(
    (floor: number) => {
      if (!simRef.current) return;
      spawnBurstPassengers(simRef.current, configRef.current, 4, floor);
      syncSnapshot();
    },
    [syncSnapshot]
  );

  const handleReset = useCallback(() => {
    const freshSeed = (playbackRef.current.seed + 7919) >>> 0;
    playbackRef.current.seed = freshSeed;
    simRef.current = createSimulation(configRef.current, freshSeed, 45);
    syncSnapshot();
  }, [syncSnapshot]);

  const handleToggleDrawer = useCallback(() => {
    setDrawerOpen((prev) => !prev);
    setTimeout(resizeCanvas, 10);
  }, [resizeCanvas]);

  const handleConfigChange = useCallback(
    (partial: Partial<SimConfig>, needsReinit: boolean) => {
      const nextCfg: SimConfig = { ...configRef.current, ...partial };
      configRef.current = nextCfg;
      setConfig(nextCfg);
      if (needsReinit) {
        simRef.current = createSimulation(nextCfg, playbackRef.current.seed, 75);
        syncSnapshot();
      }
    },
    [syncSnapshot]
  );

  return (
    <div className="flex flex-col h-full w-full bg-[#090d16] text-slate-100 font-sans">
      <TelemetryHud
        telemetry={telemetry}
        paused={paused}
        distributionMode={config.distributionMode}
        leftAlgorithm={config.leftAlgorithm}
        rightAlgorithm={config.rightAlgorithm}
        onSelectPreset={handleSelectPreset}
        onSelectAlgorithm={handleSelectAlgorithm}
        onOpenMetrics={() => setMetricsModalOpen(true)}
      />

      <SimCanvasStage
        containerRef={containerRef}
        canvasRef={canvasRef}
        layoutRef={layoutRef}
        telemetry={telemetry}
        onSpawnFloorBurst={handleSpawnFloorBurst}
      />

      <ControlDock
        config={config}
        paused={paused}
        speed={speed}
        fireAlarmActive={telemetry.fireAlarmActive}
        drawerOpen={drawerOpen}
        onTogglePause={handleTogglePause}
        onSelectSpeed={handleSelectSpeed}
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
        onClose={() => setMetricsModalOpen(false)}
      />
    </div>
  );
}
