/**
 * Sagittarius A*, the black hole at the Galactic center: a black disc the
 * size of its event horizon (Schwarzschild radius, from its measured mass),
 * never smaller than a few pixels, so it cuts a hole in the glowing bulge.
 */

import { GM_SUN } from "../../astro/constants";
import type { World } from "../../model/world";
import type { Camera } from "../camera";
import type { LabelLayer } from "./labels";

const SPEED_OF_LIGHT_KM_S = 299_792.458;
const MIN_RADIUS_PX = 5;
const RIM_COLOR = "#6b5a44";

export class GalacticCenterLayer {
  private readonly center = new Float64Array(3);

  draw(ctx: CanvasRenderingContext2D, world: World, camera: Camera, labels: LabelLayer, labelAlpha: number): void {
    world.galacticCenter(this.center);
    const x = camera.worldToScreenX(this.center[0]);
    const y = camera.worldToScreenY(this.center[1]);
    const horizonKm = (2 * GM_SUN * world.galaxy.sagittariusAStarMass) / SPEED_OF_LIGHT_KM_S ** 2;
    const radius = Math.max(MIN_RADIUS_PX, horizonKm * camera.zoom);
    if (x < -radius || y < -radius || x > camera.width + radius || y > camera.height + radius) return;
    ctx.fillStyle = "#000000";
    ctx.strokeStyle = RIM_COLOR;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    labels.add("Sgr A*", x, y + radius + 4, 1.5e9, labelAlpha);
  }
}
