import type {
  BuildingWorld,
  CanvasHoverTarget,
  CanvasLayout,
  SimConfig,
  SimState,
} from '../types/simulation';
import { isCarUnderFireAlarm, PRESET_META, SHAFT_LETTERS } from './elevatorSim';
import { computeWaitHeatmapSample } from './waitHeatmap';

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const cr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.moveTo(x + cr, y);
  ctx.arcTo(x + w, y, x + w, y + h, cr);
  ctx.arcTo(x + w, y + h, x, y + h, cr);
  ctx.arcTo(x, y + h, x, y, cr);
  ctx.arcTo(x, y, x + w, y, cr);
  ctx.closePath();
}

interface TowerRenderOpts {
  ctx: CanvasRenderingContext2D;
  sim: SimState;
  cfg: SimConfig;
  world: BuildingWorld;
  bankX: number;
  queueX: number;
  queueAlignRight: boolean;
  shaftW: number;
  queueZoneW: number;
  topPad: number;
  usableH: number;
  floorH: number;
  getFloorBottomY: (floorNum: number) => number;
  getFloorCenterY: (floorNum: number) => number;
  accentColor: string;
  nowMs: number;
  alarmStrobe: number;
  reducedMotion: boolean;
  hoverTarget: CanvasHoverTarget | null;
  showWaitHeatmap: boolean;
}

function renderBuildingTower({
  ctx,
  sim,
  cfg,
  world,
  bankX,
  queueX,
  queueAlignRight,
  shaftW,
  queueZoneW,
  topPad,
  usableH,
  floorH,
  getFloorBottomY,
  getFloorCenterY,
  accentColor,
  nowMs,
  alarmStrobe,
  reducedMotion,
  hoverTarget,
  showWaitHeatmap,
}: TowerRenderOpts) {
  const cars = world.cars;

  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    const sx = bankX + i * shaftW;
    const underAlarm = isCarUnderFireAlarm(car);
    const isHoveredCar =
      hoverTarget?.kind === 'car' &&
      hoverTarget.side === world.side &&
      hoverTarget.carId === car.id;

    ctx.font = 'bold 9px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = underAlarm ? '#fda4af' : accentColor;
    ctx.globalAlpha = underAlarm ? 0.7 + alarmStrobe * 0.3 : isHoveredCar ? 1 : 0.72;
    ctx.fillText(SHAFT_LETTERS[i] || `${i + 1}`, sx + shaftW * 0.5, topPad - 8);
    ctx.globalAlpha = 1;

    ctx.fillStyle = underAlarm
      ? `rgba(136, 19, 55, ${0.14 + alarmStrobe * 0.12})`
      : isHoveredCar
        ? world.side === 'left'
          ? 'rgba(251, 191, 36, 0.08)'
          : 'rgba(34, 211, 238, 0.09)'
        : i % 2 === 0
          ? 'rgba(15, 23, 42, 0.48)'
          : 'rgba(15, 23, 42, 0.26)';
    ctx.fillRect(sx + 1, topPad, shaftW - 2, usableH);

    ctx.strokeStyle = underAlarm
      ? `rgba(244, 63, 94, ${0.32 + alarmStrobe * 0.35})`
      : isHoveredCar
        ? accentColor
        : 'rgba(51, 65, 85, 0.35)';
    ctx.lineWidth = isHoveredCar ? 1.4 : 1;
    ctx.strokeRect(Math.round(sx + 1) + 0.5, topPad + 0.5, Math.round(shaftW - 2), usableH - 1);

    if (underAlarm) {
      ctx.fillStyle = `rgba(244, 63, 94, ${0.35 + alarmStrobe * 0.65})`;
      ctx.fillRect(sx + 4, topPad + 2, shaftW - 8, 2.5);
    }
  }

  if (showWaitHeatmap && !sim.fireAlarmActive) {
    const bandX = Math.min(queueX, bankX);
    const bandW = queueZoneW + shaftW * cars.length;
    const bandH = Math.max(1, floorH - 2);
    const edgeTickW = 2.5;
    const edgeTickX = queueAlignRight ? queueX : queueX + queueZoneW - edgeTickW;

    for (let f = 1; f <= cfg.floors; f++) {
      const sample = computeWaitHeatmapSample(world.waitingQueues[f] ?? [], sim.simTime);
      if (!sample.fillStyle) continue;

      const yTop = getFloorBottomY(f) - floorH;
      ctx.fillStyle = sample.fillStyle;
      ctx.fillRect(bandX + 1, yTop + 1, Math.max(1, bandW - 2), bandH);

      if (sample.edgeStyle) {
        ctx.fillStyle = sample.edgeStyle;
        ctx.fillRect(edgeTickX, yTop + 1, edgeTickW, bandH);
      }
    }
  }

  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    const sx = bankX + i * shaftW;
    const underAlarm = isCarUnderFireAlarm(car);

    if (!underAlarm) {
      if (
        world.algorithm === 'sector' &&
        car.sectorMin !== undefined &&
        car.sectorMax !== undefined
      ) {
        const zTop = getFloorBottomY(car.sectorMax) - floorH;
        const zBot = getFloorBottomY(car.sectorMin);
        ctx.fillStyle =
          world.side === 'left' ? 'rgba(251, 191, 36, 0.06)' : 'rgba(34, 211, 238, 0.06)';
        ctx.fillRect(sx + 2, zTop + 1, shaftW - 4, zBot - zTop - 2);
        ctx.strokeStyle =
          world.side === 'left' ? 'rgba(251, 191, 36, 0.25)' : 'rgba(34, 211, 238, 0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + 2.5, zTop + 1.5, shaftW - 5, zBot - zTop - 3);
      }

      const activeStops = new Set(car.passengers.map((p) => p.dest));
      for (const tf of car.targetFloors) {
        const ty = getFloorCenterY(tf);
        const isActiveNow =
          activeStops.has(tf) || world.algorithm === 'standard' || world.algorithm === 'fcfs';
        ctx.fillStyle = accentColor;
        ctx.globalAlpha = isActiveNow ? 0.65 : 0.22;
        ctx.fillRect(sx + 4, ty - 1.5, shaftW - 8, isActiveNow ? 3 : 2);
        ctx.globalAlpha = 1;
      }
    }
  }

  const carMarginX = Math.min(shaftW * 0.18, Math.max(1.5, shaftW * 0.12));
  const carW = Math.max(6, shaftW - carMarginX * 2);
  const carH = Math.max(7, floorH * 0.82);

  for (let i = 0; i < cars.length; i++) {
    const car = cars[i];
    const sxCenter = bankX + i * shaftW + shaftW * 0.5;
    const cx = bankX + i * shaftW + carMarginX;
    const cy = getFloorBottomY(car.floor) - floorH * 0.1 - carH;
    const underAlarm = isCarUnderFireAlarm(car);

    if (cy > topPad + 2) {
      ctx.strokeStyle = underAlarm
        ? `rgba(244, 63, 94, ${0.32 + alarmStrobe * 0.25})`
        : 'rgba(100, 116, 139, 0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(sxCenter) + 0.5, topPad + 1);
      ctx.lineTo(Math.round(sxCenter) + 0.5, cy);
      ctx.stroke();
    }

    if (underAlarm) {
      ctx.fillStyle = `rgba(244, 63, 94, ${0.12 + alarmStrobe * 0.12})`;
      ctx.beginPath();
      drawRoundedRect(ctx, cx - 2, cy - 2, carW + 4, carH + 4, 6);
      ctx.fill();

      ctx.fillStyle = car.state === 'FIRE_LOCKED' ? '#2c0f18' : '#3b101b';
      ctx.strokeStyle = `rgba(244, 63, 94, ${0.55 + alarmStrobe * 0.45})`;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      drawRoundedRect(ctx, cx, cy, carW, carH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = alarmStrobe > 0.5 ? '#fb7185' : '#f97316';
      ctx.fillRect(cx + 2, cy + 1.5, carW - 4, 2.2);

      if (car.state === 'FIRE_RECALL') {
        ctx.fillStyle = '#fb7185';
        const triY = cy + carH + 4;
        ctx.beginPath();
        ctx.moveTo(sxCenter, triY + 3.5);
        ctx.lineTo(sxCenter - 3.5, triY - 1.5);
        ctx.lineTo(sxCenter + 3.5, triY - 1.5);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(244, 63, 94, 0.2)';
        ctx.fillRect(cx + 1, cy + 4, carW * 0.16, carH - 5);
        ctx.fillRect(cx + carW - 1 - carW * 0.16, cy + 4, carW * 0.16, carH - 5);

        ctx.font = 'bold 7.5px JetBrains Mono, monospace';
        ctx.fillStyle = '#fecdd3';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('OUT', cx + carW * 0.5, cy + carH * 0.58);
      }
    } else {
      if (car.state === 'DWELLING') {
        ctx.fillStyle =
          world.side === 'left' ? 'rgba(251, 191, 36, 0.10)' : 'rgba(34, 211, 238, 0.12)';
        ctx.beginPath();
        drawRoundedRect(ctx, cx - 2, cy - 2, carW + 4, carH + 4, 6);
        ctx.fill();
      }

      ctx.fillStyle = car.state === 'DWELLING' ? '#1e293b' : '#0f172a';
      ctx.strokeStyle =
        car.state === 'DWELLING' ? accentColor : car.state === 'MOVING' ? '#94a3b8' : '#475569';
      ctx.lineWidth = car.state === 'DWELLING' ? 1.6 : 1.1;

      ctx.beginPath();
      drawRoundedRect(ctx, cx, cy, carW, carH, 4);
      ctx.fill();
      ctx.stroke();

      if (car.state === 'MOVING' && car.direction !== 0) {
        ctx.fillStyle = accentColor;
        ctx.globalAlpha = 0.85;
        const triY = car.direction === 1 ? cy - 4 : cy + carH + 4;
        const dirSign = car.direction === 1 ? -1 : 1;
        ctx.beginPath();
        ctx.moveTo(sxCenter, triY + dirSign * 3);
        ctx.lineTo(sxCenter - 3, triY - dirSign * 1.5);
        ctx.lineTo(sxCenter + 3, triY - dirSign * 1.5);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      if (car.state === 'DWELLING' && car.dwellDuration > 0) {
        const progress = 1 - car.dwellTimer / car.dwellDuration;
        const openRatio = Math.sin(Math.min(1, progress) * Math.PI);
        const panelW = carW * 0.5 * (1 - openRatio * 0.82);

        ctx.fillStyle = 'rgba(148, 163, 184, 0.22)';
        ctx.fillRect(cx + 1, cy + 1, panelW, carH - 2);
        ctx.fillRect(cx + carW - 1 - panelW, cy + 1, panelW, carH - 2);
      }
    }

    const paxList = car.passengers;
    if (paxList.length > 0) {
      const cols = carW >= 24 ? 3 : carW >= 14 ? 2 : 1;
      const rows = Math.ceil(paxList.length / cols);
      const dotR = Math.max(
        1.2,
        Math.min(3.1, (carW - 4) / (cols * 2.5), (carH - 3) / (rows * 2.5))
      );
      const cellW = Math.max(2, (carW - 2) / cols);
      const cellH = Math.max(2, (carH - 2) / Math.max(1, rows));

      for (let pIdx = 0; pIdx < paxList.length; pIdx++) {
        const p = paxList[pIdx];
        const col = pIdx % cols;
        const row = Math.floor(pIdx / cols);
        const px = cx + 1 + cellW * (col + 0.5);
        const py = cy + carH - 1 - cellH * (row + 0.5);

        ctx.beginPath();
        ctx.arc(px, py, dotR, 0, Math.PI * 2);
        ctx.fillStyle = p.color.fill;
        ctx.fill();

        if (p.color.isLobby) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
    }
  }

  for (let eIdx = 0; eIdx < world.deliveryEffects.length; eIdx++) {
    const eff = world.deliveryEffects[eIdx];
    const age = (sim.simTime - eff.bornSimTime) / eff.durationSimSec;
    if (age < 0 || age >= 1) {
      continue;
    }
    const ex = bankX + eff.carId * shaftW + shaftW * 0.5;
    const ey = getFloorCenterY(eff.floor) - (reducedMotion ? 0 : age * 16);
    ctx.font = 'bold 9px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (eff.labelPrefix === 'EVAC ') {
      ctx.fillStyle = `rgba(253, 164, 175, ${1 - age})`;
    } else {
      ctx.fillStyle =
        world.side === 'left'
          ? `rgba(253, 224, 71, ${1 - age})`
          : `rgba(103, 232, 249, ${1 - age})`;
    }
    ctx.fillText(`${eff.labelPrefix}${eff.count}`, ex, ey);
  }

  const maxVisibleDots = queueZoneW >= 68 ? 4 : 3;
  const dotRadius = Math.max(1.8, Math.min(3.6, floorH * 0.18));
  const dotSpacing = dotRadius * 2.35;
  const pulsePhase = reducedMotion ? 0.5 : 0.5 + 0.5 * Math.sin(nowMs * 0.01);

  for (let f = 1; f <= cfg.floors; f++) {
    const isHoveredFloor =
      hoverTarget?.kind === 'floor' && hoverTarget.side === world.side && hoverTarget.floor === f;
    if (isHoveredFloor) {
      const yTop = getFloorBottomY(f) - floorH;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.fillRect(queueX, yTop + 1, queueZoneW, floorH - 2);
    }

    const q = world.waitingQueues[f];
    if (q.length === 0) continue;

    const yMid = getFloorCenterY(f);
    const visibleCount = Math.min(q.length, maxVisibleDots);
    const overflow = q.length - visibleCount;

    for (let idx = 0; idx < visibleCount; idx++) {
      const p = q[idx];
      const dx = queueAlignRight
        ? queueX + queueZoneW - 8 - idx * dotSpacing
        : queueX + 8 + idx * dotSpacing;

      const waitAge = sim.simTime - p.spawnTime;
      if (waitAge > 40) {
        ctx.beginPath();
        ctx.arc(dx, yMid, dotRadius + 1.5 + pulsePhase * 1.4, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(244, 63, 94, ${0.45 + pulsePhase * 0.5})`;
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(dx, yMid, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = p.color.fill;
      ctx.fill();

      if (p.color.isLobby) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
    }

    if (overflow > 0) {
      const badgeText = `+${overflow}`;
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      const textW = ctx.measureText(badgeText).width;
      const badgeW = Math.max(18, textW + 7);
      const badgeH = Math.max(8, Math.min(13, floorH * 0.78));
      const bx = queueAlignRight
        ? queueX + queueZoneW - 8 - visibleCount * dotSpacing - badgeW + 2
        : queueX + 8 + visibleCount * dotSpacing - 2;
      const by = yMid - badgeH / 2;

      ctx.fillStyle = overflow >= 10 ? '#e11d48' : '#334155';
      ctx.beginPath();
      drawRoundedRect(ctx, bx, by, badgeW, badgeH, 4);
      ctx.fill();

      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, bx + badgeW / 2, yMid + 0.5);
    }
  }
}

export function renderSimulationCanvas(
  canvas: HTMLCanvasElement,
  sim: SimState,
  cfg: SimConfig,
  logicalW: number,
  logicalH: number,
  reducedMotion = false,
  hoverTarget: CanvasHoverTarget | null = null,
  frameNowMs = typeof performance !== 'undefined' ? performance.now() : 0,
  showWaitHeatmap = true
): CanvasLayout | null {
  const ctx = canvas.getContext('2d');
  if (!ctx || logicalW <= 0 || logicalH <= 0) return null;

  const W = logicalW;
  const H = logicalH;

  ctx.clearRect(0, 0, W, H);

  const floors = cfg.floors;
  const numCars = cfg.cars;

  const topPad = 42;
  const botPad = 12;
  const sidePad = W < 480 ? 8 : 18;
  const spineW = W < 480 ? 30 : 38;

  const halfTowerW = (W - sidePad * 2 - spineW) / 2;
  const queueZoneW = Math.max(42, Math.min(88, halfTowerW * 0.28));
  const bankW = halfTowerW - queueZoneW;
  const shaftW = bankW / numCars;

  const usableH = H - topPad - botPad;
  const floorH = usableH / floors;

  const getFloorBottomY = (floorNum: number) => H - botPad - (floorNum - 1) * floorH;
  const getFloorCenterY = (floorNum: number) => getFloorBottomY(floorNum) - floorH * 0.5;

  const leftQueueX = sidePad;
  const leftBankX = sidePad + queueZoneW;
  const spineX = leftBankX + bankW;
  const rightBankX = spineX + spineW;
  const rightQueueX = rightBankX + bankW;

  const layout: CanvasLayout = {
    W,
    H,
    topPad,
    botPad,
    usableH,
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
    cars: numCars,
  };

  const nowMs = frameNowMs;
  const alarmStrobe = reducedMotion ? 0.65 : 0.5 + 0.5 * Math.sin(nowMs * 0.012);

  const bgGrad = ctx.createRadialGradient(
    W * 0.5,
    H * 0.45,
    20,
    W * 0.5,
    H * 0.5,
    Math.max(W, H) * 0.72
  );
  if (sim.fireAlarmActive) {
    bgGrad.addColorStop(0, `rgba(225, 29, 72, ${0.08 + alarmStrobe * 0.11})`);
    bgGrad.addColorStop(1, 'rgba(9, 13, 22, 0)');
  } else {
    bgGrad.addColorStop(0, 'rgba(30, 41, 59, 0.22)');
    bgGrad.addColorStop(1, 'rgba(9, 13, 22, 0)');
  }
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  const presetMeta = PRESET_META[cfg.distributionMode] || PRESET_META.realistic;

  for (let f = 1; f <= floors; f++) {
    const yBot = getFloorBottomY(f);
    const yTop = yBot - floorH;

    if (hoverTarget?.kind === 'spine' && hoverTarget.floor === f) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
      ctx.fillRect(sidePad, yTop, W - sidePad * 2, floorH);
    }

    if (cfg.distributionMode !== 'uniform' && f === sim.hotspotFloor) {
      ctx.fillStyle =
        cfg.distributionMode === 'vip' ? 'rgba(192, 132, 252, 0.08)' : 'rgba(245, 158, 11, 0.06)';
      ctx.fillRect(sidePad, yTop, W - sidePad * 2, floorH);
    }

    if (f === 1) {
      ctx.fillStyle = sim.fireAlarmActive
        ? `rgba(244, 63, 94, ${0.08 + alarmStrobe * 0.08})`
        : 'rgba(56, 189, 248, 0.06)';
      ctx.fillRect(sidePad, yTop, W - sidePad * 2, floorH);
    }

    ctx.strokeStyle =
      f === 1
        ? sim.fireAlarmActive
          ? 'rgba(244, 63, 94, 0.55)'
          : 'rgba(148, 163, 184, 0.3)'
        : 'rgba(51, 65, 85, 0.34)';
    ctx.lineWidth = f === 1 ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(sidePad, Math.round(yBot) + 0.5);
    ctx.lineTo(W - sidePad, Math.round(yBot) + 0.5);
    ctx.stroke();
  }

  for (let r = 0; r < sim.floorRipples.length; r++) {
    const rip = sim.floorRipples[r];
    const age = (sim.simTime - rip.bornSimTime) / rip.durationSimSec;
    if (age < 0 || age >= 1) {
      continue;
    }
    const yTop = getFloorBottomY(rip.floor) - floorH;
    ctx.fillStyle = `rgba(56, 189, 248, ${(1 - age) * 0.24})`;
    ctx.fillRect(sidePad, yTop, W - sidePad * 2, floorH);
  }

  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.fillRect(spineX, topPad, spineW, usableH);

  ctx.strokeStyle = sim.fireAlarmActive
    ? `rgba(244, 63, 94, ${0.35 + alarmStrobe * 0.35})`
    : 'rgba(71, 85, 105, 0.48)';
  ctx.lineWidth = 1;
  ctx.strokeRect(spineX + 0.5, topPad + 0.5, spineW - 1, usableH - 1);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  let maxWeight = 1;
  for (let f = 2; f <= floors; f++) {
    if (sim.floorWeights[f] > maxWeight) maxWeight = sim.floorWeights[f];
  }

  for (let f = 1; f <= floors; f++) {
    const yMid = getFloorCenterY(f);
    const isHotspot = cfg.distributionMode !== 'uniform' && f === sim.hotspotFloor;

    if (f >= 2 && cfg.distributionMode !== 'uniform') {
      const wNorm = Math.min(1, sim.floorWeights[f] / maxWeight);
      const barW = (spineW - 4) * wNorm;
      ctx.fillStyle = isHotspot
        ? cfg.distributionMode === 'vip'
          ? 'rgba(192, 132, 252, 0.28)'
          : 'rgba(245, 158, 11, 0.24)'
        : 'rgba(56, 189, 248, 0.14)';
      ctx.fillRect(spineX + (spineW - barW) / 2, yMid - floorH * 0.34, barW, floorH * 0.68);
    }

    const spineFontPx = Math.max(7, Math.min(10, Math.floor(floorH * 0.72)));
    ctx.font =
      f === 1 || isHotspot
        ? `bold ${spineFontPx}px JetBrains Mono, monospace`
        : `${spineFontPx}px JetBrains Mono, monospace`;
    ctx.fillStyle =
      f === 1
        ? sim.fireAlarmActive
          ? '#fda4af'
          : '#38bdf8'
        : isHotspot
          ? cfg.distributionMode === 'vip'
            ? '#e879f9'
            : '#fbbf24'
          : '#94a3b8';
    ctx.fillText(isHotspot ? `${f}${presetMeta.hotspotIcon}` : `${f}`, spineX + spineW / 2, yMid);
  }

  renderBuildingTower({
    ctx,
    sim,
    cfg,
    world: sim.left,
    bankX: leftBankX,
    queueX: leftQueueX,
    queueAlignRight: true,
    shaftW,
    queueZoneW,
    topPad,
    usableH,
    floorH,
    getFloorBottomY,
    getFloorCenterY,
    accentColor: '#fbbf24',
    nowMs,
    alarmStrobe,
    reducedMotion,
    hoverTarget,
    showWaitHeatmap,
  });

  renderBuildingTower({
    ctx,
    sim,
    cfg,
    world: sim.right,
    bankX: rightBankX,
    queueX: rightQueueX,
    queueAlignRight: false,
    shaftW,
    queueZoneW,
    topPad,
    usableH,
    floorH,
    getFloorBottomY,
    getFloorCenterY,
    accentColor: '#22d3ee',
    nowMs,
    alarmStrobe,
    reducedMotion,
    hoverTarget,
    showWaitHeatmap,
  });

  return layout;
}

export function renderSparklineCanvas(
  canvas: HTMLCanvasElement,
  stdHist: number[],
  ddHist: number[]
): number {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return 0;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const targetW = Math.floor(rect.width * dpr);
  const targetH = Math.floor(rect.height * dpr);
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  if (stdHist.length < 2) return 0;

  let maxQ = 10;
  for (let i = 0; i < stdHist.length; i++) {
    if (stdHist[i] > maxQ) maxQ = stdHist[i];
    if (ddHist[i] > maxQ) maxQ = ddHist[i];
  }

  const drawSeries = (arr: number[], color: string) => {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    for (let i = 0; i < arr.length; i++) {
      const x = (i / (arr.length - 1)) * w;
      const y = h - 2 - (arr[i] / maxQ) * (h - 4);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  drawSeries(stdHist, '#fbbf24');
  drawSeries(ddHist, '#22d3ee');

  return maxQ;
}

export function renderModalHistoryChart(
  canvas: HTMLCanvasElement,
  stdHist: number[],
  ddHist: number[]
): number {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return 0;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const targetW = Math.floor(rect.width * dpr);
  const targetH = Math.floor(rect.height * dpr);
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const w = rect.width;
  const h = rect.height;
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(51, 65, 85, 0.35)';
  ctx.lineWidth = 1;
  for (let g = 1; g <= 3; g++) {
    const gy = Math.round((h / 4) * g) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
    ctx.stroke();
  }

  if (stdHist.length < 2) return 0;

  let maxQ = 10;
  for (let i = 0; i < stdHist.length; i++) {
    if (stdHist[i] > maxQ) maxQ = stdHist[i];
    if (ddHist[i] > maxQ) maxQ = ddHist[i];
  }

  const drawAreaSeries = (arr: number[], strokeColor: string, fillColor: string) => {
    ctx.beginPath();
    for (let i = 0; i < arr.length; i++) {
      const x = (i / (arr.length - 1)) * w;
      const y = h - 4 - (arr[i] / maxQ) * (h - 10);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = fillColor;
    ctx.fill();
  };

  drawAreaSeries(stdHist, '#fbbf24', 'rgba(251, 191, 36, 0.08)');
  drawAreaSeries(ddHist, '#22d3ee', 'rgba(34, 211, 238, 0.10)');

  return maxQ;
}
