import { Flame } from 'lucide-react';
import { memo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, RefObject } from 'react';
import { hitTestCanvas, isSameHoverTarget } from '../engine/canvasGeometry';
import type {
  CanvasHoverTarget,
  CanvasLayout,
  HoverInspection,
  TelemetrySnapshot,
} from '../types/simulation';

interface SimCanvasStageProps {
  containerRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  layoutRef: RefObject<CanvasLayout | null>;
  telemetry: TelemetrySnapshot;
  onSpawnFloorBurst: (floor: number) => void;
  onHoverTargetChange: (target: CanvasHoverTarget | null) => void;
  inspectTarget: (target: CanvasHoverTarget | null) => HoverInspection | null;
}

export const SimCanvasStage = memo(function SimCanvasStage({
  containerRef,
  canvasRef,
  layoutRef,
  telemetry,
  onSpawnFloorBurst,
  onHoverTargetChange,
  inspectTarget,
}: SimCanvasStageProps) {
  const [hoverTarget, setHoverTarget] = useState<CanvasHoverTarget | null>(null);
  const lastHoverRef = useRef<CanvasHoverTarget | null>(null);

  const updateHover = (next: CanvasHoverTarget | null) => {
    if (isSameHoverTarget(lastHoverRef.current, next)) return;
    lastHoverRef.current = next;
    setHoverTarget(next);
    onHoverTargetChange(next);
  };

  const handlePointerMove = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const layout = layoutRef.current;
    if (!canvas || !layout) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    updateHover(hitTestCanvas(x, y, layout));
  };

  const handlePointerLeave = () => {
    updateHover(null);
  };

  const handleCanvasClick = (e: MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const layout = layoutRef.current;
    if (!canvas || !layout) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const { H, topPad, botPad, spineX, spineW, floorH, floors } = layout;
    if (x >= spineX - 16 && x <= spineX + spineW + 16 && y >= topPad && y <= H - botPad) {
      const floorNum = Math.max(1, Math.min(floors, Math.floor((H - botPad - y) / floorH) + 1));
      onSpawnFloorBurst(floorNum);
    }
  };

  const handleCanvasKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSpawnFloorBurst(1);
    }
  };

  const inspection = hoverTarget ? inspectTarget(hoverTarget) : null;

  const cursorClass =
    hoverTarget?.kind === 'spine'
      ? 'cursor-pointer'
      : hoverTarget
        ? 'cursor-crosshair'
        : 'cursor-default';

  const recallStatusText =
    telemetry.lockedCount < telemetry.totalCars
      ? `Fire Alarm · Recalling ${telemetry.lockedCount}/${telemetry.totalCars} at Lobby · ${telemetry.totalEvac} Evac`
      : `Fire Alarm · All ${telemetry.totalCars} Cars Locked at Lobby · Use Stairs`;

  return (
    <main
      ref={containerRef}
      className="relative flex-1 min-h-[200px] w-full bg-[#090d16] overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        tabIndex={0}
        onMouseMove={handlePointerMove}
        onMouseLeave={handlePointerLeave}
        onClick={handleCanvasClick}
        onKeyDown={handleCanvasKeyDown}
        className={`block w-full h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-400 ${cursorClass}`}
        aria-label="Twin-tower elevator dispatch simulation canvas. Click any floor number on the center spine to spawn 4 passengers, or press Enter while focused to spawn 4 lobby passengers."
      />

      {!telemetry.fireAlarmActive ? (
        <div className="pointer-events-none absolute top-1.5 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-950/90 border border-slate-800/80 px-2.5 py-0.5 rounded-md text-[10px] text-slate-300 whitespace-nowrap">
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: 'hsl(205, 85%, 56%)' }}
            />
            Low
          </span>
          <span className="text-slate-600">→</span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: 'hsl(42, 90%, 55%)' }}
            />
            Mid
          </span>
          <span className="text-slate-600">→</span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: 'hsl(4, 85%, 58%)' }}
            />
            High
          </span>
          <span className="text-slate-700" aria-hidden="true">
            ·
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-indigo-400 ring-1 ring-white" />
            Lobby
          </span>
          <span className="hidden md:inline text-slate-700" aria-hidden="true">
            ·
          </span>
          <span className="hidden md:inline text-slate-400">Tap floor # to spawn +4</span>
        </div>
      ) : (
        <div className="pointer-events-none absolute top-1.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-rose-950/95 border border-rose-500/80 px-3 py-0.5 rounded-md text-[10px] sm:text-xs font-mono font-bold tabular-nums text-rose-200 whitespace-nowrap">
          <Flame className="w-3.5 h-3.5 text-rose-300 shrink-0" aria-hidden="true" />
          <span>{recallStatusText}</span>
        </div>
      )}

      {inspection && (
        <div className="pointer-events-none absolute bottom-2.5 left-2.5 bg-slate-950/95 border border-slate-700/90 rounded-lg px-3 py-2 text-[11px] font-mono tabular-nums text-slate-200 shadow-lg max-w-[260px]">
          {inspection.kind === 'car' && (
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between gap-3">
                <span
                  className={`font-bold ${
                    inspection.side === 'left' ? 'text-amber-300' : 'text-cyan-300'
                  }`}
                >
                  {inspection.side === 'left' ? 'Left' : 'Right'} · Car {inspection.shaftLetter}
                </span>
                <span className="text-slate-300">{inspection.stateLabel}</span>
              </div>
              <div className="text-slate-400">
                Fl <strong className="text-slate-100">{inspection.floor.toFixed(1)}</strong> · Load{' '}
                <strong className="text-slate-100">
                  {inspection.load}/{inspection.capacity}
                </strong>
              </div>
              {inspection.targetFloors.length > 0 && (
                <div className="text-slate-400 truncate">
                  Targets:{' '}
                  <span className="text-slate-200">{inspection.targetFloors.join(', ')}</span>
                </div>
              )}
            </div>
          )}

          {inspection.kind === 'floor' && (
            <div className="flex flex-col gap-0.5">
              <div
                className={`font-bold ${
                  inspection.side === 'left' ? 'text-amber-300' : 'text-cyan-300'
                }`}
              >
                {inspection.side === 'left' ? 'Left' : 'Right'} · Floor {inspection.floor}
              </div>
              <div className="text-slate-300">
                Waiting: <strong className="text-slate-100">{inspection.waitingCount}</strong> · Max
                Wait:{' '}
                <strong className="text-slate-100">{inspection.longestWaitSec.toFixed(0)}s</strong>
              </div>
            </div>
          )}

          {inspection.kind === 'spine' && (
            <div className="flex flex-col gap-0.5">
              <div className="font-bold text-sky-300">
                Floor {inspection.floor} · Click to spawn +4
              </div>
              <div className="text-slate-400">
                Queues: L <strong className="text-amber-300">{inspection.leftWaiting}</strong> · R{' '}
                <strong className="text-cyan-300">{inspection.rightWaiting}</strong>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
});
