/** A map-style scale bar in light-time (or AU / km when light-time does not fit). */

import { AU_KM, LIGHT_SECOND_KM } from "../../astro/constants";

const MIN_BAR_PX = 80;
const MAX_BAR_PX = 250;
const IDEAL_BAR_PX = 150;

function pluralize(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

/**
 * Candidate lengths (km, label, tier). Light-time is preferred; AU is used
 * only when no light-time length fits, then km.
 */
const STEPS: Array<[number, string, number]> = (() => {
  const steps: Array<[number, string, number]> = [];
  const lightUnits: Array<[number, string, number[]]> = [
    [1, "light-sec", [1, 2, 3, 5, 10, 15, 20, 30, 45, 60, 90]],
    [60, "light-min", [2, 3, 5, 10, 15, 20, 30, 45, 60, 90]],
    [3600, "light-hr", [2, 3, 5, 10, 15, 20]],
    [86_400, "light-day", [2, 3, 5, 10, 20, 50, 100, 200]],
    [86_400 * 365.25, "light-yr", [1, 2, 3, 5, 10, 20, 30, 50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 10_000, 20_000, 30_000, 50_000]],
  ];
  for (const [seconds, unit, counts] of lightUnits) {
    for (const count of counts) steps.push([count * seconds * LIGHT_SECOND_KM, pluralize(count, unit).replace(/^(\d{4,})/, (n) => Number(n).toLocaleString("en-US")), 0]);
  }
  for (const au of [1, 1.5, 2, 3, 5, 7.5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500, 750, 1000]) {
    steps.push([au * AU_KM, `${au} AU`, 1]);
  }
  for (const km of [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000, 150_000, 200_000, 300_000]) {
    const label = km < 1 ? `${km * 1000} m` : km >= 1000 ? `${km / 1000}k km` : `${km} km`;
    steps.push([km, label, 2]);
  }
  return steps;
})();

export function drawScaleBar(ctx: CanvasRenderingContext2D, zoom: number, width: number, height: number): void {
  let best: { px: number; label: string; tier: number } | null = null;
  for (const [km, label, tier] of STEPS) {
    const px = km * zoom;
    if (px < MIN_BAR_PX || px > MAX_BAR_PX) continue;
    const better = !best
      || tier < best.tier
      || (tier === best.tier && Math.abs(px - IDEAL_BAR_PX) < Math.abs(best.px - IDEAL_BAR_PX));
    if (better) best = { px, label, tier };
  }
  if (!best) return;

  const { px: barPx, label } = best;
  const narrow = width <= 600;
  const x = width - (narrow ? 16 : 24) - barPx;
  const y = height - (narrow ? 160 : 24);
  const tick = 6;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - tick);
  ctx.lineTo(x, y);
  ctx.lineTo(x + barPx, y);
  ctx.lineTo(x + barPx, y - tick);
  ctx.stroke();

  ctx.font = '11px "Space Mono", monospace';
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(label, x + barPx / 2, y - tick - 4);
}
