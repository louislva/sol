/** Spacecraft glyphs: small flat silhouettes drawn at a fixed pixel size. */

import type { SpacecraftIcon } from "../../model/body";

export function drawSpacecraftIcon(
  ctx: CanvasRenderingContext2D,
  icon: SpacecraftIcon,
  x: number,
  y: number,
  size: number,
  color: string
): void {
  ctx.fillStyle = color;
  switch (icon) {
    case "telescope": return drawTelescope(ctx, x, y, size);
    case "orbiter": return drawOrbiter(ctx, x, y, size);
    case "probe": return drawProbe(ctx, x, y, size);
  }
}

/** Bus with two pairs of solar panels. */
function drawProbe(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const bodyW = s * 0.5;
  const bodyH = s * 1.4;
  ctx.fillRect(x - bodyW / 2, y - bodyH / 2, bodyW, bodyH);

  const panelW = s * 0.6;
  const panelH = s * 0.35;
  const panelGap = s * 0.2;
  const panelX = s * 0.9;
  for (const side of [-1, 1]) {
    ctx.fillRect(x + side * panelX - panelW / 2, y - panelGap / 2 - panelH, panelW, panelH);
    ctx.fillRect(x + side * panelX - panelW / 2, y + panelGap / 2, panelW, panelH);
  }
  const armLength = panelX - panelW / 2 - bodyW / 2;
  ctx.fillRect(x - panelX + panelW / 2, y - 0.5, armLength, 1);
  ctx.fillRect(x + bodyW / 2, y - 0.5, armLength, 1);
}

/** Tube with a sunshield (JWST, Kepler, Spitzer). */
function drawTelescope(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const bodyW = s * 0.4;
  const bodyH = s * 1.6;
  ctx.fillRect(x - bodyW / 2, y - bodyH / 2, bodyW, bodyH);

  ctx.beginPath();
  ctx.moveTo(x, y - bodyH / 2 - s * 0.5);
  ctx.lineTo(x - s * 0.6, y - bodyH / 2 + s * 0.2);
  ctx.lineTo(x + s * 0.6, y - bodyH / 2 + s * 0.2);
  ctx.closePath();
  ctx.fill();

  const panelW = s * 0.4;
  const panelH = s * 0.25;
  ctx.fillRect(x - s * 0.7 - panelW / 2, y, panelW, panelH);
  ctx.fillRect(x + s * 0.7 - panelW / 2, y, panelW, panelH);
  ctx.fillRect(x - s * 0.7 + panelW / 2, y + panelH / 2 - 0.5, s * 0.3, 1);
  ctx.fillRect(x + bodyW / 2, y + panelH / 2 - 0.5, s * 0.3, 1);
}

/** Diamond bus with small panels (planetary orbiters). */
function drawOrbiter(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.8);
  ctx.lineTo(x + s * 0.5, y);
  ctx.lineTo(x, y + s * 0.8);
  ctx.lineTo(x - s * 0.5, y);
  ctx.closePath();
  ctx.fill();

  const panelW = s * 0.5;
  const panelH = s * 0.2;
  ctx.fillRect(x - s * 0.9 - panelW / 2, y - panelH / 2, panelW, panelH);
  ctx.fillRect(x + s * 0.9 - panelW / 2, y - panelH / 2, panelW, panelH);
  ctx.fillRect(x - s * 0.9 + panelW / 2, y - 0.5, s * 0.4, 1);
  ctx.fillRect(x + s * 0.5, y - 0.5, s * 0.4, 1);
}
