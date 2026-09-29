/**
 * The Milky Way's spiral arms (Reid et al. 2019): each arm a translucent
 * band as wide as its measured Gaussian width, brighter over the azimuths
 * where masers were measured and fading along the model's continuation
 * beyond them. Drawn in the Galactic plane about the Galactic center, which
 * moves relative to the Sun as the Sun orbits it.
 */

import { armPoint, GALACTIC_TO_FAR, type GalaxyModel, PARSEC_KM } from "../../astro/galactic";
import { transform } from "../../astro/rotation";
import { GALACTIC_CENTER_COLOR, GALAXY_ARM_COLOR } from "../../data/palette";
import type { World } from "../../model/world";
import type { Camera } from "../camera";
import type { LabelLayer } from "./labels";

/** How far (deg of azimuth) each arm's model is drawn beyond its measured span. */
const EXTRAPOLATION_DEG = 60;
/** The model is drawn only within these Galactocentric radii (kpc). */
const MIN_RADIUS_KPC = 2.5;
const MAX_RADIUS_KPC = 18;
const STEP_DEG = 1;
const MEASURED_ALPHA = 0.16;
const EXTRAPOLATED_ALPHA = 0.06;
const KPC_KM = 1000 * PARSEC_KM;

interface ArmPath {
  name: string;
  /** Far-frame km offsets from the Galactic center, x/y pairs. */
  measured: Float64Array;
  before: Float64Array;
  after: Float64Array;
  /** Gaussian 1σ width, km. */
  width: number;
  /** Where the arm's label goes (middle of the measured span), offset from the center. */
  labelX: number;
  labelY: number;
}

export class GalaxyLayer {
  private arms: ArmPath[] | null = null;
  private readonly center = new Float64Array(3);

  private build(model: GalaxyModel): ArmPath[] {
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
    return model.arms.map((arm) => {
      const [labelX, labelY] = armPoint(arm, (arm.betaMin + arm.betaMax) / 2);
      const [lx, ly] = transform(GALACTIC_TO_FAR, labelX * KPC_KM, labelY * KPC_KM, 0);
      return {
        name: `${arm.name} Arm`,
        measured: sample(arm, arm.betaMin, arm.betaMax),
        before: sample(arm, arm.betaMin - EXTRAPOLATION_DEG, arm.betaMin),
        after: sample(arm, arm.betaMax, arm.betaMax + EXTRAPOLATION_DEG),
        width: arm.width * KPC_KM,
        labelX: lx,
        labelY: ly,
      };
    });
  }

  draw(ctx: CanvasRenderingContext2D, world: World, camera: Camera, labels: LabelLayer, alpha: number): void {
    this.arms ??= this.build(world.galaxy);
    world.galacticCenter(this.center);
    const zoom = camera.zoom;
    const centerX = camera.worldToScreenX(this.center[0]);
    const centerY = camera.worldToScreenY(this.center[1]);

    // Butt caps: the measured and extrapolated pieces meet without overlapping.
    ctx.lineCap = "butt";
    ctx.lineJoin = "round";
    ctx.strokeStyle = GALAXY_ARM_COLOR;
    for (const arm of this.arms) {
      ctx.lineWidth = Math.max(1, 2 * arm.width * zoom);
      for (const [points, opacity] of [[arm.before, EXTRAPOLATED_ALPHA], [arm.after, EXTRAPOLATED_ALPHA], [arm.measured, MEASURED_ALPHA]] as const) {
        if (points.length < 4) continue;
        ctx.beginPath();
        ctx.moveTo(centerX + points[0] * zoom, centerY + points[1] * zoom);
        for (let index = 2; index < points.length; index += 2) {
          ctx.lineTo(centerX + points[index] * zoom, centerY + points[index + 1] * zoom);
        }
        ctx.globalAlpha = opacity * alpha;
        ctx.stroke();
      }
      labels.add(arm.name, centerX + arm.labelX * zoom, centerY + arm.labelY * zoom - 6, 2e9, alpha);
    }

    // The center, Sagittarius A*, marked with a soft glow.
    const glow = Math.max(6, 1.5 * KPC_KM * zoom);
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glow);
    gradient.addColorStop(0, GALACTIC_CENTER_COLOR);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.globalAlpha = 0.35 * alpha;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, glow, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = GALACTIC_CENTER_COLOR;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    labels.add("Galactic Center · Sgr A*", centerX, centerY + 8, 1.5e9, alpha);
  }
}
