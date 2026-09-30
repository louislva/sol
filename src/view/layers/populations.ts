/**
 * Point populations: the asteroid cloud and Earth's satellites.
 *
 * Dots are small squares of the same area as the intended circle, batched
 * into one path per color — several times cheaper than arcs at this count.
 */

import { AU_KM } from "../../astro/constants";
import { ASTEROID_POPULATION_COLOR } from "../../data/palette";
import type { AsteroidPopulation } from "../../model/asteroidPopulation";
import type { SatellitePopulation } from "../../model/satellitePopulation";
import type { Camera } from "../camera";
import type { PickBuffer } from "../picking";

const ASTEROID_DOT_RADIUS = 1.5;
const SATELLITE_DOT_RADIUS = 2;
/** Constellation members are thousands strong; smaller dots keep Earth visible through them. */
const CONSTELLATION_DOT_RADIUS = 1;
/** Square side with the same area as a circle of radius r. */
const squareSide = (radius: number) => radius * Math.sqrt(Math.PI);

/**
 * Level of detail: in each region, roughly one asteroid per this many square
 * pixels of the region's on-screen area, and at least a few hundred. The
 * catalog is sorted by size, so fewer dots means only the largest objects.
 */
const PX2_PER_ASTEROID = 6;
const MIN_PER_REGION = 300;

/** Earth's satellites appear once this orbital radius spans at least this many pixels. */
const SATELLITE_SYSTEM_RADIUS_KM = 45_000;
const SATELLITE_DETAIL_MIN_PX = 8;

/** Dot budget per asteroid region (see ASTEROID_REGIONS) at the current zoom. */
function asteroidBudgets(camera: Camera): number[] {
  const auPx = AU_KM * camera.zoom;
  return ASTEROID_REGIONS.map(({ area: [inner, outer] }) => {
    const areaPx = Math.PI * (outer * outer - inner * inner) * auPx * auPx;
    return Math.max(MIN_PER_REGION, Math.floor(areaPx / PX2_PER_ASTEROID));
  });
}

export function drawAsteroids(
  ctx: CanvasRenderingContext2D,
  population: AsteroidPopulation,
  camera: Camera,
  t: number,
  picks: PickBuffer
): void {
  // Range of heliocentric distances the viewport spans.
  const left = camera.screenToWorldX(0);
  const right = camera.screenToWorldX(camera.width);
  const top = camera.screenToWorldY(0);
  const bottom = camera.screenToWorldY(camera.height);
  const nearestX = Math.max(left, Math.min(0, right));
  const nearestY = Math.max(top, Math.min(0, bottom));
  const viewMin = Math.hypot(nearestX, nearestY);
  const viewMax = Math.hypot(Math.max(Math.abs(left), Math.abs(right)), Math.max(Math.abs(top), Math.abs(bottom)));
  population.update(t, asteroidBudgets(camera), camera.zoom, viewMin, viewMax);

  const { x: xs, y: ys, visible, visibleCount } = population;
  const zoom = camera.zoom;
  const offsetX = camera.width / 2 - camera.centerX * zoom;
  const offsetY = camera.height / 2 - camera.centerY * zoom;
  const side = squareSide(ASTEROID_DOT_RADIUS);
  const half = side / 2;
  const width = camera.width;
  const height = camera.height;

  ctx.beginPath();
  for (let slot = 0; slot < visibleCount; slot++) {
    const index = visible[slot];
    const x = xs[index] * zoom + offsetX;
    const y = ys[index] * zoom + offsetY;
    if (x < -half || x > width + half || y < -half || y > height + half) continue;
    ctx.rect(x - half, y - half, side, side);
    picks.addDot("asteroid", index, x, y);
  }
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = ASTEROID_POPULATION_COLOR;
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function satelliteDetailVisible(camera: Camera): boolean {
  return SATELLITE_SYSTEM_RADIUS_KM * camera.zoom >= SATELLITE_DETAIL_MIN_PX;
}

/**
 * Satellite dots. Those behind Earth's disc (farther from the viewer) are
 * hidden; those in front are drawn over it.
 * @param highlight index drawn larger (hovered/selected), or −1
 */
export function drawSatellites(
  ctx: CanvasRenderingContext2D,
  population: SatellitePopulation,
  camera: Camera,
  earthX: number,
  earthY: number,
  earthRadiusPx: number,
  picks: PickBuffer,
  highlight: number
): void {
  const { x: xs, y: ys, z: zs } = population;
  const zoom = camera.zoom;
  const firstConstellationColor = population.categories.length;
  const sides = population.colors.map((_, colorIndex) => squareSide(colorIndex < firstConstellationColor ? SATELLITE_DOT_RADIUS : CONSTELLATION_DOT_RADIUS));
  const half = squareSide(SATELLITE_DOT_RADIUS) / 2;
  const width = camera.width;
  const height = camera.height;
  const radiusSquared = earthRadiusPx * earthRadiusPx;

  const paths = population.colors.map(() => new Path2D());
  let highlightX = Number.NaN;
  let highlightY = Number.NaN;
  for (let index = 0; index < population.count; index++) {
    const dx = xs[index] * zoom;
    const dy = ys[index] * zoom;
    const x = earthX + dx;
    const y = earthY + dy;
    if (x < -half || x > width + half || y < -half || y > height + half) continue;
    if (zs[index] < 0 && dx * dx + dy * dy < radiusSquared) continue;
    if (index === highlight) {
      highlightX = x;
      highlightY = y;
    }
    const colorIndex = population.colorIndex[index];
    const side = sides[colorIndex];
    paths[colorIndex].rect(x - side / 2, y - side / 2, side, side);
    picks.addDot("satellite", index, x, y);
  }

  ctx.globalAlpha = 0.9;
  population.colors.forEach((color, colorIndex) => {
    ctx.fillStyle = color;
    ctx.fill(paths[colorIndex]);
  });
  ctx.globalAlpha = 1;

  if (!Number.isNaN(highlightX)) {
    ctx.fillStyle = population.colorOf(highlight);
    ctx.beginPath();
    ctx.arc(highlightX, highlightY, SATELLITE_DOT_RADIUS + 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = population.colorOf(highlight);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(highlightX, highlightY, SATELLITE_DOT_RADIUS + 5, 0, Math.PI * 2);
    ctx.stroke();
  }
}
