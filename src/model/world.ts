/**
 * Everything that exists in the simulation at one moment: the body catalog,
 * position resolution, and the bulk populations.
 */

import { type Body, existsAt, parentAt } from "./body";
import { Catalog } from "./catalog";
import { Ephemeris } from "./ephemeris";
import type { AsteroidPopulation } from "./asteroidPopulation";
import type { SatellitePopulation } from "./satellitePopulation";

/** Anything that can be hovered, selected, or followed. */
export type Target =
  | { type: "body"; body: Body }
  | { type: "asteroid"; index: number }
  | { type: "satellite"; index: number };

export function sameTarget(a: Target | null, b: Target | null): boolean {
  if (!a || !b) return a === b;
  if (a.type === "body" && b.type === "body") return a.body === b.body;
  if (a.type === "asteroid" && b.type === "asteroid") return a.index === b.index;
  if (a.type === "satellite" && b.type === "satellite") return a.index === b.index;
  return false;
}

export class World {
  readonly catalog: Catalog;
  readonly ephemeris: Ephemeris;
  readonly sun: Body;
  readonly earth: Body;
  asteroids: AsteroidPopulation | null = null;
  satellites: SatellitePopulation | null = null;
  private readonly scratch = new Float64Array(3);

  constructor() {
    this.catalog = new Catalog();
    this.ephemeris = new Ephemeris(this.catalog.bodies);
    this.sun = this.catalog.sun;
    this.earth = this.catalog.get("Earth")!;
  }

  get time(): number {
    return this.ephemeris.time;
  }

  setTime(t: number): void {
    this.ephemeris.setTime(t);
  }

  get bodies(): readonly Body[] {
    return this.catalog.bodies;
  }

  /** Heliocentric x/y (km) of a target at the current time. */
  position(target: Target, out: Float64Array | number[]): void {
    const t = this.time;
    switch (target.type) {
      case "body": {
        const offset = this.ephemeris.resolve(target.body);
        out[0] = this.ephemeris.positions[offset];
        out[1] = this.ephemeris.positions[offset + 1];
        return;
      }
      case "asteroid":
        this.asteroids!.positionAt(target.index, t, out);
        return;
      case "satellite": {
        this.satellites!.positionAt(target.index, t, this.scratch);
        out[0] = this.scratch[0] + this.ephemeris.x(this.earth);
        out[1] = this.scratch[1] + this.ephemeris.y(this.earth);
        return;
      }
    }
  }

  name(target: Target): string {
    switch (target.type) {
      case "body": return target.body.name;
      case "asteroid": return this.asteroids?.names[target.index] ?? "Asteroid";
      case "satellite": return this.satellites?.names[target.index] ?? "Satellite";
    }
  }

  exists(target: Target): boolean {
    return target.type !== "body" || existsAt(target.body, this.time);
  }

  /** The body a target orbits right now. */
  parentOf(target: Target): Body | null {
    switch (target.type) {
      case "body": return parentAt(target.body, this.time);
      case "asteroid": return this.sun;
      case "satellite": return this.earth;
    }
  }

  /** Look up a target by name: bodies first, then satellites, then asteroids. */
  find(query: string): Target | null {
    const body = this.catalog.find(query);
    if (body) return { type: "body", body };
    const needle = query.trim().toLowerCase();
    const satelliteIndex = this.satellites?.names.findIndex((name) => name.toLowerCase() === needle) ?? -1;
    if (satelliteIndex >= 0) return { type: "satellite", index: satelliteIndex };
    const asteroidIndex = this.asteroids?.names.findIndex((name) => {
      const lower = name.toLowerCase();
      return lower === needle || lower.replace(/^\d+\s+/, "") === needle;
    }) ?? -1;
    if (asteroidIndex >= 0) return { type: "asteroid", index: asteroidIndex };
    return null;
  }

  /** Substring search across every named object, capped at `limit` results. */
  search(query: string, limit = 50): Target[] {
    const needle = query.trim().toLowerCase();
    const results: Target[] = [];
    for (const body of this.catalog.bodies) {
      if (body.kind !== "barycenter" && body.name.toLowerCase().includes(needle)) results.push({ type: "body", body });
    }
    this.satellites?.names.forEach((name, index) => {
      if (name.toLowerCase().includes(needle)) results.push({ type: "satellite", index });
    });
    this.asteroids?.names.forEach((name, index) => {
      if (name.toLowerCase().includes(needle)) results.push({ type: "asteroid", index });
    });
    return results.slice(0, limit);
  }
}
