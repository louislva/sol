/**
 * Point populations: the asteroid cloud and Earth's satellites.
 *
 * Dots are small squares of the same area as the intended circle, batched
 * into one path per color — several times cheaper than arcs at this count.
 */

import { AU_KM } from "../../astro/constants";
import { ASTEROID_POPULATION_COLOR, SATELLITE_CATEGORY_COLORS } from "../../data/palette";
import type { AsteroidPopulation } from "../../model/asteroidPopulation";
import type { SatellitePopulation } from "../../model/satellitePopulation";
import type { Camera } from "../camera";
import type { PickBuffer } from "../picking";

const ASTEROID_DOT_RADIUS = 1.5;
const SATELLITE_DOT_RADIUS = 2;
/** Square side with the same area as a circle of radius r. */
const squareSide = (radius: number) => radius * Math.sqrt(Math.PI);

/**
 * Level of detail: roughly one asteroid per this many square pixels of the
 * main belt's on-screen area. The catalog is sorted by size, so fewer dots
 * means only the largest objects.
 */
const PX2_PER_ASTEROID = 6;
const MIN_ASTEROIDS = 1500;
/** Main belt annulus 2.1–3.3 au, in au². */
const MAIN_BELT_AREA_AU2 = Math.PI * (3.3 ** 2 - 2.1 ** 2);

/** Earth's satellites appear once this orbital radius spans at least this many pixels. */
const SATELLITE_SYSTEM_RADIUS_KM = 45_000;
const SATELLITE_DETAIL_MIN_PX = 8;

export function asteroidDetailCount(population: AsteroidPopulation, camera: Camera): number {
  const auPx = AU_KM * camera.zoom;
  const beltAreaPx = MAIN_BELT_AREA_AU2 * auPx * auPx;
  return Math.min(population.count, Math.max(MIN_ASTEROIDS, Math.floor(beltAreaPx / PX2_PER_ASTEROID)));
}

export function drawAsteroids(
  ctx: CanvasRenderingContext2D,
  population: AsteroidPopulation,
  camera: Camera,
  t: number,
  picks: PickBuffer
): void {
  const count = asteroidDetailCount(population, camera);
  if (count === 0) return;
  // Range of heliocentric distances the viewport spans.
  const left = camera.screenToWorldX(0);
  const right = camera.screenToWorldX(camera.width);
  const top = camera.screenToWorldY(0);
  const bottom = camera.screenToWorldY(camera.height);
  const nearestX = Math.max(left, Math.min(0, right));
  const nearestY = Math.max(top, Math.min(0, bottom));
  const viewMin = Math.hypot(nearestX, nearestY);
  const viewMax = Math.hypot(Math.max(Math.abs(left), Math.abs(right)), Math.max(Math.abs(top), Math.abs(bottom)));
  population.update(t, count, camera.zoom, viewMin, viewMax);

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

/** Constellation shells as translucent annuli around Earth. */
export function drawConstellationBands(
  ctx: CanvasRenderingContext2D,
  population: SatellitePopulation,
  camera: Camera,
  earthX: number,
  earthY: number
): void {
  const viewRadius = Math.hypot(camera.width, camera.height);
  const distanceToCenter = Math.hypot(earthX - camera.width / 2, earthY - camera.height / 2);
  for (const constellation of population.constellations) {
    ctx.globalAlpha = Math.min(0.19, 0.055 + Math.log10(constellation.count + 1) * 0.035);
    ctx.fillStyle = constellation.color;
    ctx.beginPath();
    for (const band of constellation.bands) {
      const widthPx = Math.max(1.25, (band.outerRadiusKm - band.innerRadiusKm) * camera.zoom);
      const meanPx = band.meanRadiusKm * camera.zoom;
      const outer = meanPx + widthPx / 2;
      const inner = Math.max(0, meanPx - widthPx / 2);
      if (distanceToCenter - outer > viewRadius || distanceToCenter + viewRadius < inner) continue;
      ctx.moveTo(earthX + outer, earthY);
      ctx.arc(earthX, earthY, outer, 0, Math.PI * 2);
      ctx.moveTo(earthX + inner, earthY);
      ctx.arc(earthX, earthY, inner, 0, Math.PI * 2, true);
    }
    ctx.fill("evenodd");
  }
  ctx.globalAlpha = 1;
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
  t: number,
  earthX: number,
  earthY: number,
  earthRadiusPx: number,
  picks: PickBuffer,
  highlight: number
): void {
  population.update(t, camera.zoom);
  const { x: xs, y: ys, z: zs } = population;
  const zoom = camera.zoom;
  const side = squareSide(SATELLITE_DOT_RADIUS);
  const half = side / 2;
  const width = camera.width;
  const height = camera.height;
  const radiusSquared = earthRadiusPx * earthRadiusPx;

  const paths = population.categories.map(() => new Path2D());
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
    paths[population.categoryIndex[index]].rect(x - half, y - half, side, side);
    picks.addDot("satellite", index, x, y);
  }

  ctx.globalAlpha = 0.9;
  population.categories.forEach((category, categoryIndex) => {
    ctx.fillStyle = SATELLITE_CATEGORY_COLORS[category];
    ctx.fill(paths[categoryIndex]);
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
