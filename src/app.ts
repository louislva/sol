/**
 * The application: owns the world, the clock and the view, and runs the
 * frame loop.
 *
 * Each frame: advance time → move the camera's frame origin with its body →
 * possibly switch reference frame → draw → update hover and the UI.
 */

import { AU_KM, J2000, julianToDate } from "./astro/constants";
import { LIGHT_YEAR_KM } from "./astro/galactic";
import { type Body, type MoonCategory, orbitAt, segmentAt } from "./model/body";
import { AUTO_SPEED_MAX, Clock, DEEP_TIME_YEARS, type SpeedMode } from "./model/clock";
import { AsteroidPopulation } from "./model/asteroidPopulation";
import type { EphemerisFile, EphemerisSeries, MissionFile } from "./model/catalog";
import { SatellitePopulation } from "./model/satellitePopulation";
import { StarPopulation } from "./model/starPopulation";
import { sameTarget, type Target, World } from "./model/world";
import { Controls } from "./ui/controls";
import { Sidebar } from "./ui/sidebar";
import { Camera } from "./view/camera";
import { InputController } from "./view/input";
import type { PickResult } from "./view/picking";
import { ReferenceFrameSelector } from "./view/referenceFrame";
import { profiler } from "./view/profiler";
import { Renderer, type ViewState } from "./view/renderer";

const MOON_CATEGORY_ORDER: MoonCategory[] = ["major", "medium", "named", "minor"];
/** Moving bodies drift under a resting pointer; re-test hover this often. */
const HOVER_REFRESH_MS = 100;
const UI_REFRESH_MS = 100;
/** Device pixel ratio cap: beyond 2× the extra fill cost buys little. */
const MAX_PIXEL_RATIO = 2;
/** While following, auto speed moves the object about this fast on screen. */
const FOLLOW_PACE_PX_PER_SECOND = 40;
/** Fastest auto speed (simulated seconds per second): five years per second. */
const MAX_AUTO_RATE = AUTO_SPEED_MAX;
const MAX_TRAJECTORY_LOADS = 3;

export class App {
  readonly world = new World();
  readonly clock = new Clock();
  readonly camera = new Camera();
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: Renderer;
  private readonly frames: ReferenceFrameSelector;
  private readonly sidebar: Sidebar;
  private readonly controls: Controls;

  moonCategory: MoonCategory = "medium";
  /** Frame chosen automatically when nothing is followed. */
  private autoFrame: Body;
  /** Explicitly followed object; overrides the automatic frame. */
  private followed: Target | null = null;
  /** The target whose position is the camera origin this frame. */
  private frameTarget: Target;

  private hovered: PickResult | null = null;
  private selected: Target | null = null;
  private pointer: { x: number; y: number } | null = null;
  private hoverDirty = false;
  private lastHoverMs = 0;
  private lastUiMs = 0;
  private lastFrameMs = performance.now();
  private readonly scratch = new Float64Array(3);
  private readonly missionBodies: Body[];
  private readonly viewState: ViewState = {
    hovered: null,
    selected: null,
    followed: null,
    trailFrame: { type: "body", body: this.world.sun },
    isShown: (body) => this.isShown(body),
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas, this.world);
    this.frames = new ReferenceFrameSelector(this.world, (body) => this.isShown(body));
    this.autoFrame = this.world.earth;
    this.missionBodies = this.world.bodies.filter((body) => body.mission?.trajectoryFile);
    this.frameTarget = { type: "body", body: this.autoFrame };

    this.sidebar = new Sidebar({
      close: () => this.select(null),
      toggleFollow: (target) => (sameTarget(this.followed, target) ? this.unfollow() : this.follow(target)),
      watchFromLaunch: (body) => void this.watchFromLaunch(body),
    });
    this.clock.bounds = [J2000 - DEEP_TIME_YEARS * 365.25, J2000 + DEEP_TIME_YEARS * 365.25];
    this.controls = new Controls({
      shuttle: (direction) => this.clock.shuttle(direction),
      togglePause: () => this.togglePause(),
      speed: (magnitude) => {
        this.clock.setSpeed(magnitude);
        this.clock.paused = false;
      },
      auto: () => {
        this.clock.auto = true;
        this.clock.paused = false;
      },
      now: () => this.setDate(new Date()),
      date: (date) => this.setDate(date),
      moons: (category) => this.setMoonCategory(category),
      mission: (name) => {
        const body = this.world.catalog.get(name);
        if (body) void this.watchFromLaunch(body);
      },
    });
    this.controls.setMissions(this.world.bodies
      .filter((body) => body.mission?.trajectoryFile)
      .sort((a, b) => a.mission!.launch - b.mission!.launch)
      .map((body) => {
        const mission = body.mission!;
        const year = julianToDate(mission.launch).getUTCFullYear();
        const detail = mission.landing ? `landed on ${mission.landing.body}` : mission.status === "active" ? "active" : "ended";
        return { name: body.name, detail: `${year} · ${detail}` };
      }));
    this.controls.setMoonCategory(this.moonCategory);
    this.bindInput();
    this.observeSize();
    this.frameEarthAndMoon();
    this.loadRuntimeData();
  }

  start(): void {
    const tick = (now: number) => {
      this.frame(now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ── Frame loop ──────────────────────────────────────────────────────

  private frame(now: number): void {
    const dt = Math.max(0, now - this.lastFrameMs);
    this.lastFrameMs = now;

    this.clock.advance(dt, this.camera.zoom, this.followed ? this.pacedRate() : undefined);
    this.world.setTime(this.clock.julianDate);
    this.camera.update(dt);
    profiler.measure("frame selection", () => this.updateReferenceFrame());

    this.viewState.hovered = this.hovered?.target ?? null;
    this.viewState.selected = this.selected;
    this.viewState.followed = this.followed;
    this.viewState.trailFrame = { type: "body", body: this.autoFrame };
    profiler.measure("render", () => this.renderer.render(this.world, this.camera, this.viewState));

    if (this.pointer && (this.hoverDirty || now - this.lastHoverMs >= HOVER_REFRESH_MS)) {
      const pointer = this.pointer;
      this.hovered = profiler.measure("hover", () => this.renderer.picks.pick(pointer.x, pointer.y));
      this.canvas.style.cursor = this.hovered ? "pointer" : "";
      this.hoverDirty = false;
      this.lastHoverMs = now;
    }

    if (now - this.lastUiMs >= UI_REFRESH_MS) {
      this.lastUiMs = now;
      profiler.measure("ui", () => this.refreshUi());
      this.requestTrajectories();
    }
    profiler.endFrame();
  }

  /**
   * Auto speed while following: the rate at which the followed object moves
   * a comfortable number of pixels per second relative to the body it is
   * near — fast through a long cruise, slow motion at a flyby.
   */
  private pacedRate(): number | undefined {
    const target = this.followed!;
    // A followed body that is itself the frame has no motion to pace.
    if (target.type === "body" && target.body === this.autoFrame) return undefined;
    const context: Target = { type: "body", body: this.autoFrame };
    const t = this.world.time;
    const probe = 60 / 86_400; // one minute
    const now = [0, 0, 0];
    const later = [0, 0, 0];
    const frameNow = [0, 0, 0];
    const frameLater = [0, 0, 0];
    this.world.positionAt(target, t, now);
    this.world.positionAt(target, t + probe, later);
    this.world.positionAt(context, t, frameNow);
    this.world.positionAt(context, t + probe, frameLater);
    const kmPerSecond = Math.hypot(
      later[0] - now[0] - (frameLater[0] - frameNow[0]),
      later[1] - now[1] - (frameLater[1] - frameNow[1])
    ) / 60;
    const rate = FOLLOW_PACE_PX_PER_SECOND / Math.max(1e-9, kmPerSecond * this.camera.zoom);
    return Math.min(MAX_AUTO_RATE, Math.max(1, rate));
  }

  /**
   * Keep the camera in the frame of the followed object, or of the body
   * whose region the view is in. The origin moves with that body, so it
   * stays still on screen.
   */
  private updateReferenceFrame(): void {
    if (this.followed && !this.world.exists(this.followed)) this.unfollow();

    const next: Target = this.followed ?? { type: "body", body: this.autoFrame };
    if (!sameTarget(next, this.frameTarget)) {
      this.world.position(next, this.scratch);
      this.camera.changeOrigin(this.scratch[0], this.scratch[1]);
      this.frameTarget = next;
    }
    this.world.position(this.frameTarget, this.scratch);
    this.camera.setOrigin(this.scratch[0], this.scratch[1]);

    // The automatic frame is tracked even while following: it is the
    // context trails are drawn in (the Sun in cruise, Jupiter at Jupiter).
    const chosen = this.frames.choose(this.world, this.camera, this.autoFrame);
    if (chosen !== this.autoFrame) {
      this.autoFrame = chosen;
      if (!this.followed) {
        this.frameTarget = { type: "body", body: chosen };
        this.world.position(this.frameTarget, this.scratch);
        this.camera.changeOrigin(this.scratch[0], this.scratch[1]);
      }
    }
  }

  private refreshUi(): void {
    const frameName = this.world.name(this.frameTarget);
    const [validFrom, validTo] = this.world.catalog.validSpan;
    const t = this.world.time;
    const status = [
      ...(t < validFrom || t > validTo ? ["planets extrapolated"] : []),
      `${this.followed ? "following" : "frame"} ${frameName}`,
      `zoom ${this.camera.zoom.toExponential(1)}`,
    ].join(" · ");
    this.controls.setText(this.clock.format(), status, this.clock.date);
    this.controls.setClock(this.clock);
    if (this.sidebar.visible) this.sidebar.update(this.world, this.isFollowing(this.selected));
  }

  // ── Interaction ─────────────────────────────────────────────────────

  private bindInput(): void {
    new InputController(this.canvas, {
      hover: (point) => {
        this.pointer = point;
        this.hoverDirty = true;
        if (!point) {
          this.hovered = null;
          this.canvas.style.cursor = "";
        }
      },
      zoom: (factor, x, y) => {
        const hovered = this.hovered;
        this.hoverDirty = true;
        // Zooming in over an object homes in on the object itself.
        if (factor > 1 && hovered?.direct) {
          this.world.position(hovered.target, this.scratch);
          this.camera.zoomToward(factor, this.scratch[0] - this.camera.originX, this.scratch[1] - this.camera.originY);
        } else {
          this.camera.zoomAt(factor, x, y);
        }
      },
      pan: (dx, dy) => {
        this.camera.panByPixels(dx, dy);
        this.hoverDirty = true;
      },
      pinch: (factor, from, to) => {
        this.camera.pinch(factor, from.x, from.y, to.x, to.y);
        this.hoverDirty = true;
      },
      click: (x, y) => this.select(this.renderer.picks.pick(x, y)?.target ?? null),
      doubleClick: (x, y) => {
        const picked = this.renderer.picks.pick(x, y);
        if (picked) this.follow(picked.target);
      },
    });

    window.addEventListener("keydown", (event) => {
      if (event.target instanceof HTMLInputElement && event.target.type === "text") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      switch (event.key) {
        case "Escape":
          if (this.followed) this.unfollow();
          else this.select(null);
          return;
        case " ":
          this.togglePause();
          break;
        case "ArrowLeft":
          this.clock.shuttle(-1);
          break;
        case "ArrowRight":
          this.clock.shuttle(1);
          break;
        default:
          return;
      }
      event.preventDefault();
      // Keep a focused button from also "clicking" on Space.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      this.controls.setClock(this.clock);
    });
  }

  private observeSize(): void {
    const resize = () => {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const ratio = Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);
      const width = Math.round(rect.width * ratio);
      const height = Math.round(rect.height * ratio);
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
      this.camera.resize(rect.width, rect.height, ratio);
    };
    resize();
    new ResizeObserver(resize).observe(this.canvas);
    // Mobile browser chrome changes the visual viewport without always resizing the canvas.
    window.visualViewport?.addEventListener("resize", resize);
  }

  isShown(body: Body): boolean {
    if (body.kind !== "moon") return true;
    return MOON_CATEGORY_ORDER.indexOf(body.moonCategory ?? "minor") <= MOON_CATEGORY_ORDER.indexOf(this.moonCategory);
  }

  // ── Commands (also used by the console API) ─────────────────────────

  select(target: Target | null): void {
    this.selected = target;
    if (target) this.sidebar.show(target, this.world, this.isFollowing(target));
    else this.sidebar.hide();
  }

  follow(target: Target): void {
    this.followed = target;
    this.select(target);
    // The frame switch happens next frame; glide the view onto the target.
    this.world.position(target, this.scratch);
    this.camera.changeOrigin(this.scratch[0], this.scratch[1]);
    this.frameTarget = target;
    this.camera.glideToOrigin();
    this.sidebar.update(this.world, true);
  }

  /** Rewind to a mission's launch and ride along with the spacecraft. */
  async watchFromLaunch(body: Body): Promise<void> {
    const launch = body.mission?.launch;
    if (launch === undefined) return;
    if (body.mission?.trajectoryFile) await this.loadTrajectory(body);
    this.setJulianDate(Math.max(launch, body.existsFrom) + 1 / 1440);
    this.setSpeed("auto");
    this.follow({ type: "body", body });
    // Frame the spacecraft together with the body it is departing.
    const parent = segmentAt(body, this.world.time).parent;
    let reach = 60_000;
    if (parent && parent.kind !== "star") {
      const craft = [0, 0, 0];
      this.world.position({ type: "body", body }, craft);
      this.world.position({ type: "body", body: parent }, this.scratch);
      reach = Math.max(reach, 1.3 * Math.hypot(craft[0] - this.scratch[0], craft[1] - this.scratch[1]));
    }
    this.camera.setZoomImmediately(Math.min(this.camera.width, this.camera.height) / 2 / reach);
  }

  unfollow(): void {
    this.followed = null;
    if (this.selected) this.sidebar.update(this.world, false);
  }

  isFollowing(target: Target | null): boolean {
    return target !== null && sameTarget(this.followed, target);
  }

  get followedTarget(): Target | null {
    return this.followed;
  }

  get frameName(): string {
    return this.world.name(this.frameTarget);
  }

  /** Jump to a date; positions and the camera's frame origin update immediately. */
  setDate(date: Date): void {
    this.setJulianDate(this.clock.julianDate + (date.getTime() - this.clock.date.getTime()) / 86_400_000);
  }

  private setJulianDate(jd: number): void {
    const [first, last] = this.clock.bounds;
    jd = Math.min(last, Math.max(first, jd));
    this.clock.julianDate = jd;
    this.world.setTime(jd);
    this.world.position(this.frameTarget, this.scratch);
    this.camera.setOrigin(this.scratch[0], this.scratch[1]);
  }

  setSpeed(mode: SpeedMode): void {
    this.clock.setMode(mode);
    this.controls.setClock(this.clock);
  }

  togglePause(): void {
    this.clock.paused = !this.clock.paused;
    this.controls.setClock(this.clock);
  }

  setMoonCategory(category: MoonCategory): void {
    this.moonCategory = category;
    this.controls.setMoonCategory(category);
  }

  /** Center the view on a target at a zoom suited to it. */
  goto(target: Target): void {
    this.world.position(target, this.scratch);
    this.camera.setView(
      this.scratch[0] - this.camera.originX,
      this.scratch[1] - this.camera.originY,
      Math.min(this.camera.width, this.camera.height) / 2 / this.viewRadiusFor(target)
    );
  }

  /** A comfortable view radius (km) for looking at a target. */
  private viewRadiusFor(target: Target): number {
    if (target.type === "satellite") return 3_000;
    if (target.type === "asteroid") return 0.05 * AU_KM;
    if (target.type === "star") return 0.5 * LIGHT_YEAR_KM;
    const body = target.body;
    if (body.kind === "star") return 1.5 * AU_KM;
    if (body.kind === "spacecraft") {
      return segmentAt(body, this.world.time).parent?.kind === "star" ? 0.02 * AU_KM : 50_000;
    }
    // Frame the orbits of the two largest moons, or the body itself.
    const t = this.world.time;
    const largest = body.children
      .filter((child) => child.kind === "moon" && child.radius !== null)
      .sort((a, b) => b.radius! - a.radius!)
      .slice(0, 2);
    const reach = Math.max(0, ...largest.map((moon) => orbitAt(segmentAt(moon, t).motion, t)?.apoapsis ?? 0));
    return reach > 0 && Number.isFinite(reach) ? reach * 1.3 : Math.max((body.radius ?? 1) * 15, 2_000);
  }

  /**
   * Startup view: Earth at the center with the Moon in frame, keeping clear
   * of the controls at the bottom of the screen.
   */
  private frameEarthAndMoon(): void {
    const { world, camera } = this;
    world.setTime(this.clock.julianDate);
    const earth = world.earth;
    const moon = world.catalog.get("Moon")!;
    const moonX = world.ephemeris.x(moon) - world.ephemeris.x(earth);
    const moonY = world.ephemeris.y(moon) - world.ephemeris.y(earth);

    const horizontalPadding = Math.min(80, camera.width * 0.15);
    const topPadding = 40;
    const bottomPadding = camera.width <= 600 ? 180 : 220;
    const margin = 28;
    const room = {
      left: Math.max(1, camera.width / 2 - horizontalPadding),
      right: Math.max(1, camera.width / 2 - horizontalPadding),
      top: Math.max(1, camera.height / 2 - topPadding),
      bottom: Math.max(1, camera.height / 2 - bottomPadding),
    };
    const fit = (offset: number, negative: number, positive: number) => (
      offset === 0 ? Number.POSITIVE_INFINITY : Math.max(1, (offset < 0 ? negative : positive) - margin) / Math.abs(offset)
    );
    const systemRadius = 50_000;
    const zoom = Math.min(
      Math.min(room.left, room.right, room.top, room.bottom) / systemRadius,
      fit(moonX, room.left, room.right),
      fit(moonY, room.top, room.bottom),
      0.0015
    );
    world.position({ type: "body", body: earth }, this.scratch);
    camera.setOrigin(this.scratch[0], this.scratch[1]);
    camera.setView(0, 0, zoom);
  }

  /**
   * Mission trajectories are loaded when they matter: when the mission spans
   * the current date, or its spacecraft is looked at. A few at a time.
   */
  private readonly trajectories = new Map<Body, Promise<void>>();
  private readonly trajectoryQueue: Array<() => void> = [];
  private activeTrajectoryLoads = 0;

  private loadTrajectory(body: Body): Promise<void> {
    let pending = this.trajectories.get(body);
    if (!pending) {
      pending = this.acquireLoadSlot().then(async () => {
        try {
          const response = await fetch(`/${body.mission!.trajectoryFile}`);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          this.world.catalog.applyMission(body, await response.json() as MissionFile);
        } catch (error) {
          console.warn(`Trajectory for ${body.name} failed to load:`, error);
        } finally {
          this.activeTrajectoryLoads--;
          this.trajectoryQueue.shift()?.();
        }
      });
      this.trajectories.set(body, pending);
    }
    return pending;
  }

  private acquireLoadSlot(): Promise<void> {
    return new Promise((resolve) => {
      const start = () => {
        this.activeTrajectoryLoads++;
        resolve();
      };
      if (this.activeTrajectoryLoads < MAX_TRAJECTORY_LOADS) start();
      else this.trajectoryQueue.push(start);
    });
  }

  /** Request the trajectories relevant to the current view and date. */
  private requestTrajectories(): void {
    const t = this.world.time;
    const focus = [this.hovered?.target, this.selected, this.followed];
    for (const body of this.missionBodies) {
      if (this.trajectories.has(body)) continue;
      const mission = body.mission!;
      const spansNow = t >= mission.launch && t <= (mission.end ?? Number.POSITIVE_INFINITY);
      const focused = focus.some((target) => target?.type === "body" && target.body === body);
      if (spansNow || focused) void this.loadTrajectory(body);
    }
  }

  /** Datasets fetched after startup: precise ephemerides and the point populations. */
  private loadRuntimeData(): void {
    // High-resolution planet and small-body ephemerides; the element tables
    // bundled with the app serve until this arrives.
    fetch("/data/ephemerides.json")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((file: EphemerisFile) => this.world.catalog.applyEphemerides(file))
      .catch((error: unknown) => console.error("High-resolution ephemerides failed to load:", error))
      // The Moon's series is large and matters mostly where spacecraft meet
      // it, so it comes last.
      .then(() => fetch("/data/moon.json"))
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((file: { moon: EphemerisSeries }) => this.world.catalog.applySeries("Moon", file.moon))
      .catch((error: unknown) => console.error("Lunar ephemeris failed to load:", error));

    // Named small bodies are already full bodies; keep them out of the cloud.
    const numbered = new Set<string>();
    for (const body of this.world.bodies) {
      const number = body.designation?.match(/^(\d+)\s/)?.[1];
      if (number) numbered.add(number);
    }
    AsteroidPopulation.load((name) => numbered.has(name.match(/^(\d+)\s/)?.[1] ?? ""))
      .then((population) => {
        this.world.asteroids = population;
        console.log(`Loaded ${population.count.toLocaleString()} asteroids`);
      })
      .catch((error: unknown) => console.error("Asteroid catalog failed to load:", error));
    SatellitePopulation.load()
      .then((population) => {
        this.world.satellites = population;
        console.log(`Loaded ${population.count.toLocaleString()} satellites, ${population.constellations.length} constellations`);
      })
      .catch((error: unknown) => console.error("Satellite catalog failed to load:", error));
    StarPopulation.load()
      .then((population) => {
        this.world.stars = population;
        console.log(`Loaded ${population.count.toLocaleString()} stars`);
      })
      .catch((error: unknown) => console.error("Star catalog failed to load:", error));
  }
}
