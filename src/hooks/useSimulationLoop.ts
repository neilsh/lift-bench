import { useCallback, useEffect, useRef, useState } from 'react';
import { renderSimulationCanvas } from '../engine/canvasRenderer';
import {
  ALGORITHM_META,
  assertNever,
  buildTelemetrySnapshot,
  createSimulation,
  DEFAULT_CONFIG,
  FIXED_DT,
  PRESET_META,
  sanitizeSimConfig,
  SHAFT_LETTERS,
  spawnBurstPassengers,
  stepTwinSimulation,
  toggleFireAlarmState,
} from '../engine/elevatorSim';
import { classifyWaitSeverity, getFloorLongestWaitSec } from '../engine/waitHeatmap';
import type {
  CanvasHoverTarget,
  CanvasLayout,
  CarState,
  DispatchAlgorithm,
  DistributionMode,
  HoverInspection,
  PlaybackState,
  SimConfig,
  SimState,
  TelemetrySnapshot,
  TowerSide,
} from '../types/simulation';

const INITIAL_SEED = 20261118;

function formatCarStateLabel(state: CarState): string {
  switch (state) {
    case 'MOVING':
      return 'Moving';
    case 'DWELLING':
      return 'Dwelling';
    case 'FIRE_RECALL':
      return 'Fire Recall';
    case 'FIRE_LOCKED':
      return 'Locked Out';
    case 'IDLE':
      return 'Idle';
    default:
      return assertNever(state, 'Unhandled CarState');
  }
}

export function useSimulationLoop() {
  const [boot] = useState(() => {
    const initialCfg: SimConfig = sanitizeSimConfig(DEFAULT_CONFIG);
    const initialSim = createSimulation(initialCfg, INITIAL_SEED, 75);
    return {
      cfg: initialCfg,
      sim: initialSim,
      telemetry: buildTelemetrySnapshot(initialSim, initialCfg),
    };
  });

  const [config, setConfig] = useState<SimConfig>(boot.cfg);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState<PlaybackState['speed']>(3);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot>(boot.telemetry);
  const [showWaitHeatmap, setShowWaitHeatmap] = useState(true);
  const [announcement, setAnnouncement] = useState('');

  const configRef = useRef<SimConfig>(boot.cfg);
  const playbackRef = useRef<PlaybackState>({
    paused: false,
    speed: 3,
    seed: INITIAL_SEED,
  });
  const simRef = useRef<SimState>(boot.sim);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layoutRef = useRef<CanvasLayout | null>(null);
  const canvasSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const hoverTargetRef = useRef<CanvasHoverTarget | null>(null);
  const reducedMotionRef = useRef(false);
  const showWaitHeatmapRef = useRef(true);

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
    setTelemetry(buildTelemetrySnapshot(simRef.current, configRef.current));
  }, []);

  useEffect(() => {
    const mq =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    if (mq) {
      reducedMotionRef.current = mq.matches;
      const handleMq = (e: MediaQueryListEvent) => {
        reducedMotionRef.current = e.matches;
      };
      mq.addEventListener('change', handleMq);
      return () => mq.removeEventListener('change', handleMq);
    }
    return undefined;
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

      if (!pb.paused) {
        accumulator += rawDelta * pb.speed;
        let safetySteps = 0;
        while (accumulator >= FIXED_DT && safetySteps < 24) {
          stepTwinSimulation(sim, cfg, FIXED_DT);
          accumulator -= FIXED_DT;
          safetySteps++;
        }
        if (safetySteps >= 24) accumulator = 0;
      }

      if (canvasRef.current) {
        const nextLayout = renderSimulationCanvas(
          canvasRef.current,
          sim,
          cfg,
          canvasSizeRef.current.width,
          canvasSizeRef.current.height,
          reducedMotionRef.current,
          hoverTargetRef.current,
          now,
          showWaitHeatmapRef.current
        );
        if (nextLayout) layoutRef.current = nextLayout;
      }

      if (!pb.paused && now - lastHudUpdate >= 100) {
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
      const nextCfg = sanitizeSimConfig({ distributionMode: mode }, configRef.current);
      configRef.current = nextCfg;
      setConfig(nextCfg);
      simRef.current = createSimulation(nextCfg, playbackRef.current.seed, 65);
      syncSnapshot();
      setAnnouncement(`Traffic preset changed to ${PRESET_META[mode].name}.`);
    },
    [syncSnapshot]
  );

  const handleSelectAlgorithm = useCallback(
    (side: TowerSide, algorithm: DispatchAlgorithm) => {
      const key = side === 'left' ? 'leftAlgorithm' : 'rightAlgorithm';
      if (configRef.current[key] === algorithm) return;
      const nextCfg = sanitizeSimConfig({ [key]: algorithm }, configRef.current);
      configRef.current = nextCfg;
      setConfig(nextCfg);
      simRef.current = createSimulation(nextCfg, playbackRef.current.seed, 65);
      syncSnapshot();
      setAnnouncement(
        `${side === 'left' ? 'Left' : 'Right'} tower set to ${ALGORITHM_META[algorithm].name}.`
      );
    },
    [syncSnapshot]
  );

  const handleTogglePause = useCallback(() => {
    const nextPaused = !playbackRef.current.paused;
    playbackRef.current.paused = nextPaused;
    setPaused(nextPaused);
    if (nextPaused) {
      syncSnapshot();
    }
    setAnnouncement(nextPaused ? 'Simulation paused.' : 'Simulation resumed.');
  }, [syncSnapshot]);

  const handleSelectSpeed = useCallback((nextSpeed: PlaybackState['speed']) => {
    playbackRef.current.speed = nextSpeed;
    setSpeed(nextSpeed);
    setAnnouncement(`Playback speed set to ${nextSpeed}x.`);
  }, []);

  const handleToggleWaitHeatmap = useCallback(() => {
    const next = !showWaitHeatmapRef.current;
    showWaitHeatmapRef.current = next;
    setShowWaitHeatmap(next);
    setAnnouncement(
      next ? 'Floor wait-time heatmap enabled.' : 'Floor wait-time heatmap disabled.'
    );
  }, []);

  const handleToggleFireAlarm = useCallback(() => {
    toggleFireAlarmState(simRef.current, configRef.current);
    const active = simRef.current.fireAlarmActive;
    syncSnapshot();
    setAnnouncement(
      active
        ? 'Fire alarm activated. All elevators recalling to lobby Floor 1.'
        : 'Fire alarm cleared. Normal elevator service resumed.'
    );
  }, [syncSnapshot]);

  const handleBurst = useCallback(() => {
    spawnBurstPassengers(simRef.current, configRef.current, 12, null);
    syncSnapshot();
    setAnnouncement('Spawned 12 burst passengers across both towers.');
  }, [syncSnapshot]);

  const handleSpawnFloorBurst = useCallback(
    (floor: number) => {
      spawnBurstPassengers(simRef.current, configRef.current, 4, floor);
      syncSnapshot();
      setAnnouncement(`Spawned 4 passengers on Floor ${floor}.`);
    },
    [syncSnapshot]
  );

  const handleReset = useCallback(() => {
    const freshSeed = (playbackRef.current.seed + 7919) >>> 0;
    playbackRef.current.seed = freshSeed;
    simRef.current = createSimulation(configRef.current, freshSeed, 45);
    syncSnapshot();
    setAnnouncement('Simulation reset with a fresh arrival seed.');
  }, [syncSnapshot]);

  const handleConfigChange = useCallback(
    (partial: Partial<SimConfig>, needsReinit: boolean) => {
      const nextCfg = sanitizeSimConfig(partial, configRef.current);
      configRef.current = nextCfg;
      setConfig(nextCfg);
      if (needsReinit) {
        simRef.current = createSimulation(nextCfg, playbackRef.current.seed, 75);
      } else {
        simRef.current.left.carCapacity = nextCfg.carCapacity;
        simRef.current.right.carCapacity = nextCfg.carCapacity;
      }
      syncSnapshot();
    },
    [syncSnapshot]
  );

  const setCanvasHoverTarget = useCallback((target: CanvasHoverTarget | null) => {
    hoverTargetRef.current = target;
  }, []);

  const inspectHoverTarget = useCallback(
    (target: CanvasHoverTarget | null): HoverInspection | null => {
      if (!target) return null;
      const sim = simRef.current;
      const cfg = configRef.current;

      if (target.kind === 'spine') {
        const leftQ = sim.left.waitingQueues[target.floor]?.length ?? 0;
        const rightQ = sim.right.waitingQueues[target.floor]?.length ?? 0;
        return {
          kind: 'spine',
          floor: target.floor,
          leftWaiting: leftQ,
          rightWaiting: rightQ,
        };
      }

      const world = target.side === 'left' ? sim.left : sim.right;
      if (target.kind === 'car') {
        const car = world.cars[target.carId];
        if (!car) return null;
        return {
          kind: 'car',
          side: target.side,
          shaftLetter: SHAFT_LETTERS[car.id] || String(car.id + 1),
          stateLabel: formatCarStateLabel(car.state),
          floor: car.floor,
          load: car.passengers.length,
          capacity: cfg.carCapacity,
          targetFloors: car.targetFloors.slice(0, 6),
        };
      }

      const q = world.waitingQueues[target.floor] ?? [];
      const longest = getFloorLongestWaitSec(q, sim.simTime);
      return {
        kind: 'floor',
        side: target.side,
        floor: target.floor,
        waitingCount: q.length,
        longestWaitSec: longest,
        severity: classifyWaitSeverity(longest, q.length > 0),
      };
    },
    []
  );

  return {
    config,
    paused,
    speed,
    telemetry,
    showWaitHeatmap,
    announcement,
    containerRef,
    canvasRef,
    layoutRef,
    resizeCanvas,
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
  };
}
