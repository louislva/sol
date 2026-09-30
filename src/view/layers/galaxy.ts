/**
 * The Milky Way as a transit map (Reid et al. 2019).
 *
 * - The disc: flat, stepped contours of its exponential surface density,
 *   one step per scale length, so it brightens toward the center.
 * - Each spiral arm is a line in its own color over a soft band as wide as
 *   its measured Gaussian width: solid where masers were measured, dashed
 *   ("under construction") along the model's continuation beyond them.
 * - The masers the arms were fitted to are the stations, ringed in the
 *   color of their arm; the best-known regions are labeled.
 * - Arm names follow their arms, like street names on a map.
 *
 * Everything is placed about the Galactic center, which moves relative to
 * the Sun as the Sun orbits it.
 */

import { DEG, J2000 } from "../../astro/constants";
import { armPoint, galacticCenterAt, GALACTIC_TO_FAR, type GalaxyModel, ICRS_TO_FAR, PARSEC_KM } from "../../astro/galactic";
import { transform } from "../../astro/rotation";
import { ARM_COLORS, GALACTIC_CENTER_COLOR, GALACTIC_DISC_COLOR, UNASSIGNED_ARM_COLOR } from "../../data/palette";
import type { World } from "../../model/world";
import type { Camera } from "../camera";
import type { LabelLayer } from "./labels";

/** How far (deg of azimuth) each arm's model is drawn beyond its measured span. */
const EXTRAPOLATION_DEG = 60;
/** The model is drawn only within these Galactocentric radii (kpc). */
const MIN_RADIUS_KPC = 2.5;
const MAX_RADIUS_KPC = 18;
const STEP_DEG = 1;
const KPC_KM = 1000 * PARSEC_KM;
/** Disc contour steps, in scale lengths, and the opacity each adds. */
const DISC_STEPS = 5;
const DISC_STEP_ALPHA = 0.028;
/** Band opacity at ±2σ and ±1σ. */
const BAND_ALPHA = [0.05, 0.07];
const LINE_WIDTH = 2;
const STATION_RADIUS = 3;
const ARM_FONT = '600 11px "Space Mono", monospace';
const LETTER_SPACING = 2.5;

/** Table 1 arm codes → the arm (and color) they belong to; others are spurs, the bar region, or unknown. */
const ARM_OF_CODE: Record<string, string> = {
  "3kN": "3-kpc", "3kF": "3-kpc",
  Nor: "Norma", Out: "Outer",
  ScN: "Scutum-Centaurus", ScF: "Scutum-Centaurus", OSC: "Scutum-Centaurus",
  SgN: "Sagittarius-Carina", SgF: "Sagittarius-Carina",
  Loc: "Local", LoS: "Local",
  Per: "Perseus",
};

type ToScreen = (points: Float64Array, index: number) => [number, number];

interface ArmPath {
  name: string;
  color: string;
  /** Far-frame km offsets from the Galactic center, x/y pairs. */
  before: Float64Array;
  measured: Float64Array;
  after: Float64Array;
  /** Gaussian 1σ width, km. */
  width: number;
}

interface Station {
  /** Far-frame km offset from the Galactic center at J2000. */
  x: number;
  y: number;
  color: string;
  label: string | null;
}

export class GalaxyLayer {
  private arms: ArmPath[] | null = null;
  private stations: Station[] | null = null;
  private readonly center = new Float64Array(3);

  private buildArms(model: GalaxyModel): ArmPath[] {
    const sample = (arm: GalaxyModel["arms"][number], from: number, to: number): Float64Array => {
      const points: number[] = [];
      const steps = Math.max(1, Math.round(Math.abs(to - from) / STEP_DEG));
      for (let step = 0; step <= steps; step++) {
        const beta = from + ((to - from) * step) / steps;
        const [x, y] = armPoint(arm, beta);
        const radius = Math.hypot(x, y);
        if (radius < MIN_RADIUS_KPC || radius > MAX_RADIUS_KPC) continue;
        const [fx, fy] = transform(GALACTIC_TO_FAR, x * KPC_KM, y * KPC_KM, 0);
        points.push(fx, fy);
      }
      return Float64Array.from(points);
    };
    return model.arms.map((arm) => ({
      name: `${arm.name} Arm`,
      color: ARM_COLORS[arm.name] ?? UNASSIGNED_ARM_COLOR,
      before: sample(arm, arm.betaMin - EXTRAPOLATION_DEG, arm.betaMin),
      measured: sample(arm, arm.betaMin, arm.betaMax),
      after: sample(arm, arm.betaMax, arm.betaMax + EXTRAPOLATION_DEG),
      width: arm.width * KPC_KM,
    }));
  }

  /** Masers at their parallax distances, relative to the Galactic center at J2000. */
  private buildStations(model: GalaxyModel): Station[] {
    const center = [0, 0, 0];
    galacticCenterAt(model, J2000, center);
    return model.masers.map(([, alias, ra, dec, parallax, code]) => {
      const distance = KPC_KM / (parallax as number);
      const r = (ra as number) * DEG;
      const d = (dec as number) * DEG;
      const [x, y] = transform(ICRS_TO_FAR, Math.cos(d) * Math.cos(r) * distance, Math.cos(d) * Math.sin(r) * distance, Math.sin(d) * distance);
      const arm = ARM_OF_CODE[code as string];
      return {
        x: x - center[0],
        y: y - center[1],
        color: arm ? ARM_COLORS[arm] : UNASSIGNED_ARM_COLOR,
        label: readableAlias(alias as string | null),
      };
    });
  }

  draw(ctx: CanvasRenderingContext2D, world: World, camera: Camera, labels: LabelLayer, alpha: number): void {
    this.arms ??= this.buildArms(world.galaxy);
    this.stations ??= this.buildStations(world.galaxy);
    world.galacticCenter(this.center);
    const zoom = camera.zoom;
    const centerX = camera.worldToScreenX(this.center[0]);
    const centerY = camera.worldToScreenY(this.center[1]);
    const toScreen: ToScreen = (points, index) => [centerX + points[index] * zoom, centerY + points[index + 1] * zoom];

    // The disc: each step one scale length farther out, filled on top of
    // the last, so the density rises in flat terraces toward the center.
    ctx.fillStyle = GALACTIC_DISC_COLOR;
    ctx.globalAlpha = DISC_STEP_ALPHA * alpha;
    for (let step = DISC_STEPS; step >= 1; step--) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, step * world.galaxy.discScaleLength * KPC_KM * zoom, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bands, then lines, so no arm's band covers another's line.
    ctx.lineCap = "butt";
    ctx.lineJoin = "round";
    for (const arm of this.arms) {
      ctx.strokeStyle = arm.color;
      for (const [sigmas, bandAlpha] of [[2, BAND_ALPHA[0]], [1, BAND_ALPHA[1]]] as const) {
        ctx.lineWidth = Math.max(1, 2 * sigmas * arm.width * zoom);
        ctx.globalAlpha = bandAlpha * alpha;
        strokeJoined(ctx, [arm.before, arm.measured, arm.after], toScreen);
      }
    }
    ctx.lineCap = "round";
    for (const arm of this.arms) {
      ctx.strokeStyle = arm.color;
      ctx.lineWidth = LINE_WIDTH;
      ctx.globalAlpha = 0.9 * alpha;
      strokeJoined(ctx, [arm.measured], toScreen);
      ctx.setLineDash([6, 7]);
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.45 * alpha;
      strokeJoined(ctx, [arm.before], toScreen);
      strokeJoined(ctx, [arm.after], toScreen);
      ctx.setLineDash([]);
    }

    // Stations (their positions also keep arm names clear of them).
    const placed: number[] = [];
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#000000";
    for (const station of this.stations) {
      const x = centerX + station.x * zoom;
      const y = centerY + station.y * zoom;
      if (x < -10 || y < -10 || x > camera.width + 10 || y > camera.height + 10) continue;
      placed.push(x, y);
      ctx.strokeStyle = station.color;
      ctx.beginPath();
      ctx.arc(x, y, STATION_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (station.label) labels.add(station.label, x, y + STATION_RADIUS + 3, 2.5e9, 0.75 * alpha);
    }

    const sunX = camera.worldToScreenX(0);
    const sunY = camera.worldToScreenY(0);
    for (const arm of this.arms) labelAlong(ctx, arm, toScreen, camera, sunX, sunY, placed, alpha);

    // The center, Sagittarius A*.
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#000000";
    ctx.strokeStyle = GALACTIC_CENTER_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = GALACTIC_CENTER_COLOR;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    labels.add("Galactic Center · Sgr A*", centerX, centerY + 10, 1.5e9, alpha);
  }
}

/** One continuous stroke through consecutive pieces (a translucent band then has no seams). */
function strokeJoined(ctx: CanvasRenderingContext2D, pieces: Float64Array[], toScreen: ToScreen): void {
  ctx.beginPath();
  let started = false;
  for (const points of pieces) {
    for (let index = 0; index < points.length; index += 2) {
      const [x, y] = toScreen(points, index);
      if (started) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      started = true;
    }
  }
  if (started) ctx.stroke();
}

/** Where along an arm (fractions of its length) its name may go, in order of preference. */
const LABEL_POSITIONS = [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7, 0.25, 0.75, 0.2, 0.8, 0.15, 0.85];
/** Screen margin (px) a name's middle keeps from the edges. */
const LABEL_MARGIN = 60;
/** Letters of different arm names keep at least this far apart (px). */
const LABEL_CLEARANCE = 16;

/**
 * The arm's name set letter by letter along the curve, reversed where the
 * arm runs right to left so it never reads upside down. It goes where the
 * arm is on screen and farthest from the Sun, since the measured parts of
 * every arm crowd together near us, and clear of stations and names already
 * placed (`placed`: x, y pairs, which this appends its letters to).
 */
function labelAlong(
  ctx: CanvasRenderingContext2D,
  arm: ArmPath,
  toScreen: ToScreen,
  camera: Camera,
  sunX: number,
  sunY: number,
  placed: number[],
  alpha: number
): void {
  const path: Array<[number, number]> = [];
  for (const points of [arm.before, arm.measured, arm.after]) {
    for (let index = 0; index < points.length; index += 2) path.push(toScreen(points, index));
  }
  if (path.length < 2) return;
  const text = arm.name.toUpperCase();
  ctx.font = ARM_FONT;
  const widths = [...text].map((char) => ctx.measureText(char).width + LETTER_SPACING);
  const textLength = widths.reduce((sum, width) => sum + width, 0);

  const lengths = [0];
  for (let index = 1; index < path.length; index++) {
    lengths.push(lengths[index - 1] + Math.hypot(path[index][0] - path[index - 1][0], path[index][1] - path[index - 1][1]));
  }
  const total = lengths[lengths.length - 1];
  if (total < textLength * 1.5) return;

  const at = (distance: number): [number, number, number] => {
    let index = 1;
    while (index < lengths.length - 1 && lengths[index] < distance) index++;
    const [x0, y0] = path[index - 1];
    const [x1, y1] = path[index];
    const t = (distance - lengths[index - 1]) / (lengths[index] - lengths[index - 1] || 1);
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, Math.atan2(y1 - y0, x1 - x0)];
  };

  let best = -1;
  let bestDistance = -1;
  for (const fraction of LABEL_POSITIONS) {
    const middle = fraction * total;
    if (middle < textLength / 2 || middle > total - textLength / 2) continue;
    const [x, y] = at(middle);
    if (x < LABEL_MARGIN || y < LABEL_MARGIN || x > camera.width - LABEL_MARGIN || y > camera.height - LABEL_MARGIN) continue;
    let clear = true;
    for (let offset = -textLength / 2; offset <= textLength / 2 && clear; offset += LABEL_CLEARANCE / 2) {
      const [lx, ly] = at(middle + offset);
      for (let index = 0; index < placed.length && clear; index += 2) {
        if (Math.hypot(placed[index] - lx, placed[index + 1] - ly) < LABEL_CLEARANCE) clear = false;
      }
    }
    if (!clear) continue;
    const fromSun = Math.hypot(x - sunX, y - sunY);
    if (fromSun > bestDistance * 1.25) {
      best = middle;
      bestDistance = fromSun;
    }
  }
  if (best < 0) return;

  // Read left to right: run the letters backward along a leftward stretch.
  const [startX] = at(best - textLength / 2);
  const [endX] = at(best + textLength / 2);
  const direction = endX >= startX ? 1 : -1;
  ctx.fillStyle = arm.color;
  ctx.globalAlpha = 0.85 * alpha;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  let distance = best - (direction * textLength) / 2;
  for (let index = 0; index < widths.length; index++) {
    const [x, y, pathAngle] = at(distance + (direction * widths[index]) / 2);
    const angle = direction > 0 ? pathAngle : pathAngle + Math.PI;
    placed.push(x, y);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillText(text[index], 0, -4);
    ctx.restore();
    distance += direction * widths[index];
  }
  ctx.globalAlpha = 1;
}

/**
 * A readable name for a well-known region: "SgrB2" → "Sgr B2",
 * "NGC6334" → "NGC 6334", "VYCMa" → "VY CMa". Catalog-number aliases
 * (IRAS, AFGL, OH, IRC) are left unlabeled.
 */
function readableAlias(alias: string | null): string | null {
  if (!alias || /^(IRAS|AFGL|OH|IRC)/.test(alias)) return null;
  return alias
    .replace(/^NGC(\d)/, "NGC $1")
    .replace(/^Sgr(B2)/, "Sgr $1")
    .replace(/^([A-Z]+?)([A-Z][a-zA-Z][a-z])$/, "$1 $2");
}
