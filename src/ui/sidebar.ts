/** Info panel for the selected object. */

import { AU_KM, DEG, EARTH_EQUATORIAL_RADIUS_KM, julianToDate } from "../astro/constants";
import { type Body, orbitAt, segmentAt } from "../model/body";
import { sameTarget, type Target, type World } from "../model/world";
import { fetchWikipediaSummary, type WikipediaSummary } from "./wikipedia";

const KIND_LABELS: Record<Body["kind"], string> = {
  star: "Star",
  barycenter: "Barycenter",
  planet: "Planet",
  dwarf: "Dwarf planet",
  moon: "Moon",
  asteroid: "Asteroid",
  comet: "Comet",
  spacecraft: "Spacecraft",
};

const MISSION_TYPES = {
  deep_space: "Deep space",
  earth_orbiter: "Earth orbiter",
  planetary_orbiter: "Planetary orbiter",
  lander: "Lander / rover",
} as const;

type Row = [label: string, value: string, color?: string];
interface Section {
  title?: string;
  rows: Row[];
}

export interface SidebarCallbacks {
  close(): void;
  toggleFollow(target: Target): void;
  /** Jump to a mission's launch and follow the spacecraft. */
  watchFromLaunch(body: Body): void;
}

export class Sidebar {
  private readonly root: HTMLElement;
  private readonly content: HTMLElement;
  private readonly callbacks: SidebarCallbacks;
  private target: Target | null = null;
  private wikipedia: WikipediaSummary | null | "loading" = null;
  private lastSignature = "";

  constructor(callbacks: SidebarCallbacks) {
    this.root = document.getElementById("sidebar")!;
    this.content = document.getElementById("sidebar-content")!;
    this.callbacks = callbacks;
    document.getElementById("sidebar-close")!.addEventListener("click", () => callbacks.close());
  }

  get visible(): boolean {
    return this.target !== null;
  }

  show(target: Target, world: World, following: boolean): void {
    if (sameTarget(target, this.target)) return;
    this.target = target;
    this.root.classList.remove("hidden");
    this.lastSignature = "";
    this.wikipedia = "loading";
    fetchWikipediaSummary(articleCandidates(target, world)).then((summary) => {
      if (!sameTarget(this.target, target)) return;
      this.wikipedia = summary;
      this.lastSignature = "";
      this.update(world, following);
    });
    this.update(world, following);
  }

  hide(): void {
    this.target = null;
    this.root.classList.add("hidden");
  }

  update(world: World, following: boolean): void {
    const target = this.target;
    if (!target) return;
    const sections = describe(target, world);
    const signature = JSON.stringify([sections, following, this.wikipedia === "loading" ? 0 : this.wikipedia?.title]);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.render(world.name(target), color(target, world), subtitle(target, world), sections, following, target);
  }

  private render(name: string, titleColor: string, kind: string, sections: Section[], following: boolean, target: Target): void {
    const content = this.content;
    content.replaceChildren();

    const heading = element("h2", name);
    heading.style.color = titleColor;
    content.append(heading, element("div", kind, "sidebar-type"));

    const follow = element("button", following ? "Following — click to release" : "Follow", "sidebar-follow");
    follow.classList.toggle("active", following);
    follow.addEventListener("click", () => this.callbacks.toggleFollow(target));
    content.append(follow);
    if (target.type === "body" && target.body.mission?.trajectoryFile) {
      const body = target.body;
      const watch = element("button", "Watch from launch", "sidebar-follow");
      watch.addEventListener("click", () => this.callbacks.watchFromLaunch(body));
      content.append(watch);
    }

    for (const section of sections) {
      if (section.rows.length === 0) continue;
      if (section.title) {
        content.append(element("div", "", "sidebar-divider"), element("div", section.title, "sidebar-section-title"));
      }
      for (const [label, value, valueColor] of section.rows) {
        const row = element("div", "", "sidebar-section");
        const valueElement = element("div", value, "sidebar-value");
        if (valueColor) valueElement.style.color = valueColor;
        if (label) row.append(element("div", label, "sidebar-label"));
        row.append(valueElement);
        content.append(row);
      }
    }

    content.append(element("div", "", "sidebar-divider"));
    const wiki = element("div", "", "sidebar-wikipedia");
    if (this.wikipedia === "loading") {
      wiki.append(element("div", "Loading Wikipedia summary…", "sidebar-wikipedia-loading"));
      content.append(wiki);
    } else if (this.wikipedia) {
      wiki.append(element("div", this.wikipedia.extract, "sidebar-wikipedia-content"));
      const url = this.wikipedia.content_urls?.desktop.page;
      if (url) {
        const link = element("a", "Read more on Wikipedia →", "sidebar-wikipedia-link") as HTMLAnchorElement;
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener";
        wiki.append(link);
      }
      content.append(wiki);
    }
  }
}

/** Likely Wikipedia article titles for a target, most specific first. */
function articleCandidates(target: Target, world: World): string[] {
  const name = world.name(target);
  const plain = name.replace(/\s*\([^)]*\)/g, "").trim();
  if (target.type === "satellite" || target.type === "asteroid") return [plain];
  const body = target.body;
  switch (body.kind) {
    case "moon": return [`${name} (moon)`, name];
    case "spacecraft": return [name, `${plain} (spacecraft)`, plain];
    case "dwarf": return [`${name} (dwarf planet)`, name];
    case "asteroid":
    case "comet": {
      // SBDB designations are Wikipedia's titles: "433 Eros (A898 PA)" → "433 Eros", "1P/Halley".
      const designation = body.designation?.replace(/\s*\([^)]*\)/g, "").trim();
      return designation && designation !== name ? [designation, name] : [name];
    }
    default: return [name];
  }
}

function element(tag: string, text: string, className?: string): HTMLElement {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function color(target: Target, world: World): string {
  switch (target.type) {
    case "body": return target.body.color;
    case "satellite": return world.satellites!.colorOf(target.index);
    case "asteroid": return "#aaaaaa";
  }
}

function subtitle(target: Target, world: World): string {
  switch (target.type) {
    case "body": {
      const body = target.body;
      const parent = segmentAt(body, world.time).parent;
      if (body.kind === "moon" && parent) return `Moon of ${parent.name}`;
      return KIND_LABELS[body.kind];
    }
    case "satellite": return `Earth satellite · ${world.satellites!.categoryOf(target.index)}`;
    case "asteroid": return "Asteroid";
  }
}

function describe(target: Target, world: World): Section[] {
  const position = [0, 0, 0];
  world.position(target, position);
  const sunDistance = Math.hypot(position[0], position[1]);
  switch (target.type) {
    case "body": return describeBody(target.body, world, sunDistance, position);
    case "satellite": {
      const satellites = world.satellites!;
      const index = target.index;
      const a = satellites.semiMajorAxis[index];
      const e = satellites.eccentricity[index];
      return [
        { rows: [["NORAD ID", String(satellites.noradIds[index])]] },
        {
          title: "Orbit",
          rows: [
            ["Perigee altitude", formatKm(a * (1 - e) - EARTH_EQUATORIAL_RADIUS_KM)],
            ["Apogee altitude", formatKm(a * (1 + e) - EARTH_EQUATORIAL_RADIUS_KM)],
            ["Inclination", `${(satellites.inclination[index] / DEG).toFixed(2)}° (equator)`],
            ["Period", formatDuration(2 * Math.PI * Math.sqrt(a ** 3 / 398_600.4418) / 86_400)],
          ],
        },
        { title: "Data", rows: [["Source", "CelesTrak GP elements"], ["Catalog date", satellites.generatedAt.slice(0, 10)]] },
      ];
    }
    case "asteroid": {
      const asteroids = world.asteroids!;
      const index = target.index;
      const a = asteroids.semiMajorAxisAu[index];
      return [
        { rows: [["Distance from Sun", formatDistance(sunDistance)], ["Absolute magnitude H", asteroids.H[index].toFixed(2)]] },
        {
          title: "Orbit",
          rows: [
            ["Semi-major axis", `${a.toFixed(3)} AU`],
            ["Eccentricity", asteroids.eccentricity[index].toFixed(4)],
            ["Inclination", `${asteroids.inclinationDeg[index].toFixed(2)}°`],
            ["Period", formatDuration(365.25 * a ** 1.5)],
          ],
        },
        { title: "Data", rows: [["Source", "JPL Small-Body Database"]] },
      ];
    }
  }
}

function describeBody(body: Body, world: World, sunDistance: number, position: number[]): Section[] {
  const t = world.time;
  const segment = segmentAt(body, t);
  const parent = segment.parent;
  const overview: Row[] = body.kind === "spacecraft"
    ? []
    : [["Radius", body.radius === null ? "unknown" : formatKm(body.radius)]];
  if (body.radii) overview.push(["Dimensions", `${body.radii.map((value) => formatKm(2 * value).replace(" km", "")).join(" × ")} km`]);
  if (body.kind !== "star") overview.push(["Distance from Sun", formatDistance(sunDistance)]);
  if (parent && parent.kind !== "star" && parent.kind !== "barycenter") {
    const parentPosition = [0, 0, 0];
    world.position({ type: "body", body: parent }, parentPosition);
    overview.push([`Distance from ${parent.name}`, formatDistance(Math.hypot(position[0] - parentPosition[0], position[1] - parentPosition[1]))]);
  }
  const sections: Section[] = [{ rows: overview }];

  const discovery = body.discovery;
  if (discovery && body.kind !== "spacecraft") {
    const rows: Row[] = [];
    if (discovery.by) rows.push(["Discovered by", discovery.by]);
    if (discovery.date) rows.push(["Date", discovery.date]);
    else if (discovery.year) rows.push(["Year", String(discovery.year)]);
    if (rows.length === 0 && body.kind === "planet") rows.push(["", "Known since antiquity", "#888"]);
    sections.push({ title: "Discovery", rows });
  }

  const orbitHolder = body.orbitSource ?? body;
  const orbit = orbitAt(segmentAt(orbitHolder, t).motion, t);
  if (orbit) {
    const { a, e } = orbit.shapeAt(t);
    const heliocentric = segmentAt(orbitHolder, t).parent?.kind === "star";
    sections.push({
      title: parent && parent.kind !== "star" && parent.kind !== "barycenter" ? `Orbit around ${parent.name}` : "Orbit",
      rows: [
        e < 1 ? ["Semi-major axis", heliocentric ? `${(a / AU_KM).toFixed(3)} AU` : formatKm(a)]
          : [heliocentric ? "Perihelion" : "Periapsis", heliocentric ? `${(orbit.periapsis / AU_KM).toFixed(3)} AU` : formatKm(orbit.periapsis)],
        ["Eccentricity", e.toFixed(4)],
        ["Inclination", `${(orbit.elements.i / DEG).toFixed(2)}°${body.kind === "moon" ? " (to reference plane)" : ""}`],
        ["Period", e < 1 ? formatDuration(orbit.period) : "unbound (hyperbolic)"],
      ],
    });
  }

  const mission = body.mission;
  if (mission) {
    sections.push({
      title: "Mission",
      rows: [
        ["Status", capitalize(mission.status), mission.status === "active" ? "#66ff66" : "#888888"],
        ["Mission type", MISSION_TYPES[mission.type]],
        ["Launch", formatDate(mission.launch)],
        ...(mission.end ? [["End", formatDate(mission.end)] as Row] : []),
        ...(mission.landing ? [
          ["Landed", `${formatDate(mission.landing.time)} on ${mission.landing.body}`] as Row,
          ["Site", formatSite(mission.landing.latitude, mission.landing.longitude)] as Row,
        ] : []),
        ["NAIF ID", String(mission.spkid)],
      ],
    });
    if (mission.fate) sections.push({ rows: [["", mission.fate, "#aaaaaa"]] });
  }

  const dataRows: Row[] = [["Source", body.dataSource]];
  if (mission?.elementsEpoch) dataRows.push(["Elements epoch", formatDate(mission.elementsEpoch)]);
  if (body.designation && body.designation !== body.name) dataRows.push(["Designation", body.designation]);
  sections.push({ title: "Data", rows: dataRows });
  return sections;
}

function formatKm(km: number): string {
  if (km >= 1e6) return `${(km / 1e6).toFixed(2)}M km`;
  if (km >= 1e4) return `${Math.round(km / 1000)}k km`;
  if (km >= 10) return `${Math.round(km).toLocaleString()} km`;
  if (km >= 1) return `${km.toFixed(1)} km`;
  return `${Math.round(km * 1000)} m`;
}

function formatDistance(km: number): string {
  return km < 0.01 * AU_KM ? formatKm(km) : `${(km / AU_KM).toFixed(3)} AU`;
}

function formatDuration(days: number): string {
  if (days < 1) return `${(days * 24).toFixed(1)} hours`;
  if (days < 60) return `${days.toFixed(2)} days`;
  if (days < 2 * 365.25) return `${(days / 30.44).toFixed(1)} months`;
  return `${(days / 365.25).toFixed(1)} years`;
}

function formatDate(jd: number): string {
  return julianToDate(jd).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function formatSite(latitude: number, longitude: number): string {
  const east = ((longitude % 360) + 360) % 360;
  return `${Math.abs(latitude).toFixed(3)}° ${latitude < 0 ? "S" : "N"}, ${east.toFixed(3)}° E`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
