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
    case "lander": return drawLander(ctx, x, y, size);
  }
}

/** Squat body on splayed legs (landers and rovers seen from above). */
function drawLander(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillRect(x - s * 0.45, y - s * 0.35, s * 0.9, s * 0.6);
  ctx.fillRect(x - s * 0.08, y - s * 0.8, s * 0.16, s * 0.45);
  ctx.beginPath();
  ctx.arc(x, y - s * 0.85, s * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(1, s * 0.12);
  ctx.strokeStyle = ctx.fillStyle;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.4, y + s * 0.2);
  ctx.lineTo(x - s * 0.75, y + s * 0.7);
  ctx.moveTo(x + s * 0.4, y + s * 0.2);
  ctx.lineTo(x + s * 0.75, y + s * 0.7);
  ctx.stroke();
}

/**
 * A little figure standing on a surface: feet at (x, y), body along `angle`
 * (the local "up", pointing away from the body it stands on).
 */
export function drawStickFigure(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, height: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI / 2);
  const h = height;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, h * 0.09);
  ctx.lineCap = "round";
  ctx.beginPath();
  // Legs, torso, arms (one raised in a wave).
  ctx.moveTo(-h * 0.18, 0);
  ctx.lineTo(0, -h * 0.4);
  ctx.lineTo(h * 0.18, 0);
  ctx.moveTo(0, -h * 0.4);
  ctx.lineTo(0, -h * 0.75);
  ctx.moveTo(-h * 0.22, -h * 0.55);
  ctx.lineTo(0, -h * 0.68);
  ctx.lineTo(h * 0.2, -h * 0.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -h * 0.87, h * 0.12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
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
