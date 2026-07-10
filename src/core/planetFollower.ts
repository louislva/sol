import { type CelestialBody, getBodyPosition } from "../astronomy/bodies";
import { Camera } from "./camera";

const MIN_LOCAL_SYSTEM_RADIUS_PX = 72;
const PLANET_RELEASE_MARGIN_PX = 16;
const MOONLESS_SYSTEM_RADIUS_MULTIPLIER = 50;

interface Position {
  x: number;
  y: number;
}

/**
 * Keeps a close local-system view in the planet's moving reference frame.
 * Acquisition and release are automatic so ordinary pan/zoom remains enough.
 */
export class PlanetFollower {
  private readonly camera: Camera;
  private indexedBodies: CelestialBody[] | null = null;
  private planets: CelestialBody[] = [];
  private primaryBodies: CelestialBody[] = [];
  private systemRadiusByPlanet = new Map<string, number>();
  private target: CelestialBody | null = null;
  private previousTargetPosition: Position | null = null;

  constructor(camera: Camera) {
    this.camera = camera;
  }

  get targetName(): string | null {
    return this.target?.name ?? null;
  }

  update(bodies: CelestialBody[], julianDate: number): void {
    this.indexBodies(bodies);

    if (this.target && !this.planets.includes(this.target)) {
      this.clearTarget();
    }

    // Apply the planet's heliocentric displacement before evaluating whether
    // the local view should remain locked. User pan offsets are preserved.
    if (this.target && this.previousTargetPosition) {
      const currentPosition = getBodyPosition(this.target, julianDate);
      this.camera.x += currentPosition.x - this.previousTargetPosition.x;
      this.camera.y += currentPosition.y - this.previousTargetPosition.y;
      this.previousTargetPosition = currentPosition;
    }

    const candidate = this.findSoleVisiblePlanet(julianDate);
    if (!candidate || !this.isLocalSystemResolved(candidate)) {
      this.clearTarget();
      return;
    }

    if (candidate !== this.target) {
      this.target = candidate;
      this.previousTargetPosition = getBodyPosition(candidate, julianDate);
    }
  }

  private indexBodies(bodies: CelestialBody[]): void {
    if (this.indexedBodies === bodies) return;

    this.indexedBodies = bodies;
    this.planets = [];
    this.primaryBodies = [];
    this.systemRadiusByPlanet.clear();

    for (const body of bodies) {
      if (body.type === "planet") {
        this.planets.push(body);
        this.primaryBodies.push(body);
        this.systemRadiusByPlanet.set(
          body.name,
          body.radius * MOONLESS_SYSTEM_RADIUS_MULTIPLIER
        );
      } else if (body.type === "dwarf") {
        this.primaryBodies.push(body);
      }
    }

    for (const body of bodies) {
      if (
        (body.type !== "moon" && body.type !== "satellite")
        || !body.parentName
        || !body.parentCentricElements
        || !this.systemRadiusByPlanet.has(body.parentName)
      ) {
        continue;
      }

      const currentRadius = this.systemRadiusByPlanet.get(body.parentName) ?? 0;
      const orbitRadius = body.parentCentricElements.a * (1 + body.parentCentricElements.e);
      if (orbitRadius > currentRadius) {
        this.systemRadiusByPlanet.set(body.parentName, orbitRadius);
      }
    }
  }

  private findSoleVisiblePlanet(julianDate: number): CelestialBody | null {
    let visibleBody: CelestialBody | null = null;

    for (const body of this.primaryBodies) {
      const position = getBodyPosition(body, julianDate);
      const screen = this.camera.worldToScreen(position.x, position.y);
      const isVisible = screen.x >= -PLANET_RELEASE_MARGIN_PX
        && screen.x <= this.camera.width + PLANET_RELEASE_MARGIN_PX
        && screen.y >= -PLANET_RELEASE_MARGIN_PX
        && screen.y <= this.camera.height + PLANET_RELEASE_MARGIN_PX;
      if (!isVisible) continue;

      if (visibleBody) return null;
      visibleBody = body;
    }

    return visibleBody?.type === "planet" ? visibleBody : null;
  }

  private isLocalSystemResolved(planet: CelestialBody): boolean {
    const systemRadius = this.systemRadiusByPlanet.get(planet.name) ?? 0;
    return this.camera.kmToPixels(systemRadius) >= MIN_LOCAL_SYSTEM_RADIUS_PX;
  }

  private clearTarget(): void {
    this.target = null;
    this.previousTargetPosition = null;
  }
}
