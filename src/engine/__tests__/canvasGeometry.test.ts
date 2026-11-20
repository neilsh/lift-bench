import { describe, expect, it } from 'vitest';
import { hitTestCanvas, isSameHoverTarget } from '../canvasGeometry';
import type { CanvasLayout } from '../../types/simulation';

const SAMPLE_LAYOUT: CanvasLayout = {
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

describe('Canvas Geometry & Hit-Testing', () => {
  it('returns null outside the vertical floor bounds', () => {
    expect(hitTestCanvas(400, 10, SAMPLE_LAYOUT)).toBeNull();
    expect(hitTestCanvas(400, 595, SAMPLE_LAYOUT)).toBeNull();
  });

  it('detects spine clicks and maps Y coordinates to exact floor numbers', () => {
    const floor1Y = SAMPLE_LAYOUT.H - SAMPLE_LAYOUT.botPad - SAMPLE_LAYOUT.floorH * 0.5;
    const floor14Y = SAMPLE_LAYOUT.topPad + SAMPLE_LAYOUT.floorH * 0.5;

    expect(hitTestCanvas(400, floor1Y, SAMPLE_LAYOUT)).toEqual({ kind: 'spine', floor: 1 });
    expect(hitTestCanvas(400, floor14Y, SAMPLE_LAYOUT)).toEqual({ kind: 'spine', floor: 14 });
  });

  it('detects left and right elevator car shafts and waiting queue zones', () => {
    const midY = SAMPLE_LAYOUT.H - SAMPLE_LAYOUT.botPad - SAMPLE_LAYOUT.floorH * 2.5; // Floor 3

    expect(hitTestCanvas(SAMPLE_LAYOUT.leftBankX + 10, midY, SAMPLE_LAYOUT)).toEqual({
      kind: 'car',
      side: 'left',
      carId: 0,
    });
    expect(
      hitTestCanvas(SAMPLE_LAYOUT.rightBankX + SAMPLE_LAYOUT.shaftW * 3 + 5, midY, SAMPLE_LAYOUT)
    ).toEqual({
      kind: 'car',
      side: 'right',
      carId: 3,
    });
    expect(hitTestCanvas(SAMPLE_LAYOUT.leftQueueX + 20, midY, SAMPLE_LAYOUT)).toEqual({
      kind: 'floor',
      side: 'left',
      floor: 3,
    });
    expect(hitTestCanvas(SAMPLE_LAYOUT.rightQueueX + 20, midY, SAMPLE_LAYOUT)).toEqual({
      kind: 'floor',
      side: 'right',
      floor: 3,
    });
  });

  it('compares CanvasHoverTarget union values accurately', () => {
    expect(isSameHoverTarget(null, null)).toBe(true);
    expect(isSameHoverTarget({ kind: 'spine', floor: 2 }, null)).toBe(false);
    expect(isSameHoverTarget({ kind: 'spine', floor: 2 }, { kind: 'spine', floor: 2 })).toBe(true);
    expect(isSameHoverTarget({ kind: 'spine', floor: 2 }, { kind: 'spine', floor: 3 })).toBe(false);
    expect(
      isSameHoverTarget(
        { kind: 'car', side: 'left', carId: 1 },
        { kind: 'car', side: 'left', carId: 1 }
      )
    ).toBe(true);
    expect(
      isSameHoverTarget(
        { kind: 'car', side: 'left', carId: 1 },
        { kind: 'car', side: 'right', carId: 1 }
      )
    ).toBe(false);
    expect(
      isSameHoverTarget(
        { kind: 'floor', side: 'right', floor: 5 },
        { kind: 'floor', side: 'right', floor: 5 }
      )
    ).toBe(true);
  });
});
