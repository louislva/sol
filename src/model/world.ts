/**
 * Everything that exists in the simulation at one moment: the body catalog,
 * position resolution, and the bulk populations.
 */

import { type Body, existsAt, parentAt } from "./body";
import { Catalog } from "./catalog";
import { Ephemeris } from "./ephemeris";
import { type GalaxyModel, galacticCenterAt } from "../astro/galactic";
import galaxyData from "../data/galaxy.json";
import type { AsteroidPopulation } from "./asteroidPopulation";
import type { SatellitePopulation } from "./satellitePopulation";
import type { StarPopulation } from "./starPopulation";

/** Anything that can be hovered, selected, or followed. */
export type Target =
  | { type: "body"; body: Body }
  | { type: "asteroid"; index: number }
  | { type: "satellite"; index: number }
  | { type: "star"; index: number };

export function sameTarget(a: Target | null, b: Target | null): boolean {
  if (!a || !b) return a === b;
  if (a.type === "body" && b.type === "body") return a.body === b.body;
  if (a.type === "asteroid" && b.type === "asteroid") return a.index === b.index;
  if (a.type === "satellite" && b.type === "satellite") return a.index === b.index;
  if (a.type === "star" && b.type === "star") return a.index === b.index;
  return false;
}

export class World {
  readonly catalog: Catalog;
  readonly ephemeris: Ephemeris;
  readonly sun: Body;
  readonly earth: Body;
  asteroids: AsteroidPopulation | null = null;
  satellites: SatellitePopulation | null = null;
  stars: StarPopulation | null = null;
  /** The Milky Way's structure and the Sun's motion in it (Reid et al. 2019). */
  readonly galaxy: GalaxyModel = galaxyData;
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
      case "star":
        this.stars!.positionAt(target.index, t, out);
        return;
    }
  }

  /** Heliocentric x/y/z (km) of a target at an arbitrary time (not cached). */
  positionAt(target: Target, t: number, out: Float64Array | number[]): void {
    switch (target.type) {
      case "body":
        this.ephemeris.positionAt(target.body, t, out);
        return;
      case "asteroid":
        this.asteroids!.positionAt(target.index, t, out);
        out[2] = 0;
        return;
      case "satellite": {
        this.satellites!.positionAt(target.index, t, this.scratch);
        const earth = [0, 0, 0];
        this.ephemeris.positionAt(this.earth, t, earth);
        out[0] = this.scratch[0] + earth[0];
        out[1] = this.scratch[1] + earth[1];
        out[2] = this.scratch[2] + earth[2];
        return;
      }
      case "star":
        this.stars!.positionAt(target.index, t, out);
        return;
    }
  }

  /** The Galactic center relative to the Sun (km, display frame) at the current time. */
  galacticCenter(out: Float64Array | number[]): void {
    galacticCenterAt(this.galaxy, this.time, out);
  }

  name(target: Target): string {
    switch (target.type) {
      case "body": return target.body.name;
      case "asteroid": return this.asteroids?.names[target.index] ?? "Asteroid";
      case "satellite": return this.satellites?.names[target.index] ?? "Satellite";
      case "star": return this.stars?.names[target.index] ?? "Star";
    }
  }

  exists(target: Target): boolean {
    if (target.type === "body") return existsAt(target.body, this.time);
    if (target.type === "satellite") return this.satellites?.validAt(this.time) ?? false;
    return true;
  }

  /** The body a target orbits right now. */
  parentOf(target: Target): Body | null {
    switch (target.type) {
      case "body": return parentAt(target.body, this.time);
      case "asteroid": return this.sun;
      case "satellite": return this.earth;
      case "star": return null;
    }
  }

  /** Look up a target by name: bodies first, then satellites, then asteroids. */
  find(query: string): Target | null {
    const body = this.catalog.find(query);
    if (body) return { type: "body", body };
    const needle = query.trim().toLowerCase();
    const satelliteIndex = this.satellites?.names.findIndex((name) => name.toLowerCase() === needle) ?? -1;
    if (satelliteIndex >= 0) return { type: "satellite", index: satelliteIndex };
    const stars = this.stars;
    const starIndex = stars ? stars.names.findIndex((name, index) => (
      name.toLowerCase() === needle || stars.designations[index].toLowerCase() === needle
    )) : -1;
    if (starIndex >= 0) return { type: "star", index: starIndex };
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
    this.stars?.names.forEach((name, index) => {
      if (name.toLowerCase().includes(needle) || this.stars!.designations[index].toLowerCase().includes(needle)) {
        results.push({ type: "star", index });
      }
    });
    this.satellites?.names.forEach((name, index) => {
      if (name.toLowerCase().includes(needle)) results.push({ type: "satellite", index });
    });
    this.asteroids?.names.forEach((name, index) => {
      if (name.toLowerCase().includes(needle)) results.push({ type: "asteroid", index });
    });
    return results.slice(0, limit);
  }
}
