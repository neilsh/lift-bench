import type { CanvasHoverTarget, CanvasLayout } from '../types/simulation';

export function isSameHoverTarget(
  a: CanvasHoverTarget | null,
  b: CanvasHoverTarget | null
): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'spine' && b.kind === 'spine') return a.floor === b.floor;
  if (a.kind === 'car' && b.kind === 'car') return a.side === b.side && a.carId === b.carId;
  if (a.kind === 'floor' && b.kind === 'floor') return a.side === b.side && a.floor === b.floor;
  return false;
}

export function hitTestCanvas(
  x: number,
  y: number,
  layout: CanvasLayout
): CanvasHoverTarget | null {
  const {
    H,
    topPad,
    botPad,
    leftQueueX,
    leftBankX,
    spineX,
    spineW,
    rightBankX,
    rightQueueX,
    bankW,
    shaftW,
    queueZoneW,
    floorH,
    floors,
    cars,
  } = layout;

  if (y < topPad || y > H - botPad || floorH <= 0 || shaftW <= 0 || cars <= 0) {
    return null;
  }

  const floor = Math.max(1, Math.min(floors, Math.floor((H - botPad - y) / floorH) + 1));

  if (x >= spineX - 12 && x <= spineX + spineW + 12) {
    return { kind: 'spine', floor };
  }

  if (x >= leftBankX && x <= leftBankX + bankW) {
    const carId = Math.min(cars - 1, Math.max(0, Math.floor((x - leftBankX) / shaftW)));
    return { kind: 'car', side: 'left', carId };
  }

  if (x >= rightBankX && x <= rightBankX + bankW) {
    const carId = Math.min(cars - 1, Math.max(0, Math.floor((x - rightBankX) / shaftW)));
    return { kind: 'car', side: 'right', carId };
  }

  if (x >= leftQueueX && x <= leftQueueX + queueZoneW) {
    return { kind: 'floor', side: 'left', floor };
  }

  if (x >= rightQueueX && x <= rightQueueX + queueZoneW) {
    return { kind: 'floor', side: 'right', floor };
  }

  return null;
}
