import type { MouseEvent, RefObject } from 'react';
import type { CanvasLayout, TelemetrySnapshot } from '../types/simulation';

interface SimCanvasStageProps {
  containerRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  layoutRef: RefObject<CanvasLayout | null>;
  telemetry: TelemetrySnapshot;
  onSpawnFloorBurst: (floor: number) => void;
}

export function SimCanvasStage({
  containerRef,
  canvasRef,
  layoutRef,
  telemetry,
  onSpawnFloorBurst,
}: SimCanvasStageProps) {
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

  const recallStatusText =
    telemetry.lockedCount < telemetry.totalCars
      ? `FIRE ALARM · RECALLING ${telemetry.lockedCount}/${telemetry.totalCars} AT LOBBY · ${telemetry.totalEvac} EVAC`
      : `FIRE ALARM · ALL ${telemetry.totalCars} CARS LOCKED AT LOBBY · USE STAIRS`;

  return (
    <main
      ref={containerRef}
      className="relative flex-1 min-h-[200px] w-full bg-[#090d16] overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="block w-full h-full cursor-pointer"
        aria-label="Twin-tower elevator dispatch simulation canvas. Click any floor number on the center spine to spawn 4 passengers."
      />

      {!telemetry.fireAlarmActive ? (
        <div className="pointer-events-none absolute top-1.5 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-950/85 backdrop-blur-sm border border-slate-800/80 px-2.5 py-0.5 rounded-full text-[9.5px] sm:text-[10px] text-slate-300 shadow whitespace-nowrap">
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
          <span className="text-slate-700">|</span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-indigo-400 ring-1 ring-white" />
            Lobby
          </span>
          <span className="hidden md:inline text-slate-700">|</span>
          <span className="hidden md:inline text-slate-400">Tap floor # to spawn +4</span>
        </div>
      ) : (
        <div className="pointer-events-none absolute top-1.5 left-1/2 -translate-x-1/2 badge-saturated flex items-center gap-2 bg-rose-950/95 backdrop-blur-sm border border-rose-500/80 px-3 py-0.5 rounded-full text-[10px] sm:text-xs font-mono font-bold tabular-nums text-rose-200 shadow-[0_0_18px_rgba(244,63,94,0.45)] whitespace-nowrap">
          <span aria-hidden="true">🚨</span>
          <span>{recallStatusText}</span>
        </div>
      )}
    </main>
  );
}
