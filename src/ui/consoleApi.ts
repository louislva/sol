/**
 * `window.sol`: programmatic control for the browser console and automation.
 * Type `sol.help()` for a reference.
 */

import { AU_KM } from "../astro/constants";
import type { App } from "../app";
import type { SpeedMode } from "../model/clock";
import type { Target } from "../model/world";
import { profiler } from "../view/profiler";

const HELP = `
Navigation:
  sol.goto("Earth")          Center on an object at a suitable zoom
  sol.follow("Voyager 1")    Lock the camera to an object (Esc releases)
  sol.unfollow()             Return to the automatic reference frame
  sol.watch("Voyager 2")     Rewind to a mission's launch and follow it
  sol.pan(1, 0)              Pan by an offset in AU
  sol.panToAU(1, 0)          Center on a heliocentric position in AU
  sol.panTo(x, y)            Center on a heliocentric position in km
  sol.zoom(0.0001)           Set zoom (pixels per km)
  sol.zoomIn(3) / zoomOut(3) Zoom by a factor

Time:
  sol.setDate("2024-07-04")  Jump to a date (ISO)
  sol.setSpeed("year")       auto | realtime | day | month | year
  sol.setTimeScale(86400)    Exact rate in simulated seconds per second
  sol.pause() / resume()
  sol.getDate()

Info:
  sol.listBodies()           Names of all bodies (not satellites/asteroids)
  sol.findBody("mars")       Search bodies, satellites and asteroids
  sol.getBody("Earth")       Position and type
  sol.status()               Camera, frame, time
  sol.perf()                 Mean ms per frame for each rendering phase

Selection:
  sol.select("Jupiter") / sol.deselect()
`;

export function installConsoleApi(app: App): void {
  const { world, camera, clock } = app;

  const resolve = (name: string): Target | null => world.find(name);
  const notFound = (name: string) => `"${name}" not found. Try sol.findBody("${name}").`;
  const describe = (target: Target) => {
    const kind = target.type === "body" ? target.body.kind : target.type;
    return `${world.name(target)} (${kind})`;
  };

  const sol = {
    goto(name: string) {
      const target = resolve(name);
      if (!target) return notFound(name);
      app.goto(target);
      return `Centered on ${world.name(target)}`;
    },
    follow(name: string) {
      const target = resolve(name);
      if (!target) return notFound(name);
      app.follow(target);
      return `Following ${world.name(target)}`;
    },
    async watch(name: string) {
      const target = resolve(name);
      if (target?.type !== "body" || !target.body.mission) return `"${name}" is not a spacecraft mission.`;
      await app.watchFromLaunch(target.body);
      return `Watching ${target.body.name} from launch (${clock.format()})`;
    },
    unfollow() {
      app.unfollow();
      return "Automatic reference frame";
    },
    pan(dx: number, dy: number) {
      camera.setView(camera.offsetX + dx * AU_KM, camera.offsetY + dy * AU_KM, camera.zoom);
      return `Center at (${(camera.centerX / AU_KM).toFixed(3)}, ${(camera.centerY / AU_KM).toFixed(3)}) AU`;
    },
    panTo(x: number, y: number) {
      camera.setView(x - camera.originX, y - camera.originY, camera.zoom);
      return `Center at (${x}, ${y}) km`;
    },
    panToAU(x: number, y: number) {
      return sol.panTo(x * AU_KM, y * AU_KM);
    },
    zoom(level: number) {
      camera.setZoomImmediately(level);
      return `Zoom ${camera.zoom.toExponential(2)}`;
    },
    zoomIn(factor = 3) {
      return sol.zoom(camera.zoom * factor);
    },
    zoomOut(factor = 3) {
      return sol.zoom(camera.zoom / factor);
    },

    setDate(text: string) {
      const date = new Date(text);
      if (Number.isNaN(date.getTime())) return `Invalid date "${text}"; use ISO format like "2024-01-15".`;
      app.setDate(date);
      return `Date ${clock.format()}`;
    },
    setSpeed(mode: SpeedMode) {
      app.setSpeed(mode);
      return `Speed "${mode}"`;
    },
    setTimeScale(rate: number) {
      clock.setRate(rate);
      return `Rate ${rate} s/s (${rate / 86_400} days/s)`;
    },
    pause() {
      clock.setRate(0);
      return "Paused";
    },
    resume() {
      app.setSpeed("auto");
      return "Resumed (auto speed)";
    },
    getDate() {
      return clock.format();
    },

    listBodies() {
      return world.bodies.filter((body) => body.kind !== "barycenter").map((body) => body.name);
    },
    findBody(query: string) {
      return world.search(query).map(describe);
    },
    getBody(name: string) {
      const target = resolve(name);
      if (!target) return null;
      const position = [0, 0, 0];
      world.position(target, position);
      return {
        name: world.name(target),
        type: target.type === "body" ? target.body.kind : target.type,
        x: position[0],
        y: position[1],
        xAU: position[0] / AU_KM,
        yAU: position[1] / AU_KM,
      };
    },
    status() {
      return {
        date: clock.format(),
        julianDate: clock.julianDate,
        speed: `${clock.rate} s/s (${clock.mode})`,
        zoom: camera.zoom,
        frame: app.frameName,
        following: app.followedTarget ? world.name(app.followedTarget) : null,
        center: { x: camera.centerX, y: camera.centerY },
        centerAU: { x: camera.centerX / AU_KM, y: camera.centerY / AU_KM },
      };
    },

    select(name: string) {
      const target = resolve(name);
      if (!target) return notFound(name);
      app.select(target);
      return `Selected ${world.name(target)}`;
    },
    deselect() {
      app.select(null);
      return "Deselected";
    },

    perf() {
      return profiler.report();
    },

    help() {
      console.log("%csol — console API", "font-size: 14px; font-weight: bold; color: #4fc3f7");
      console.log(HELP);
    },
  };

  (window as unknown as { sol: typeof sol }).sol = sol;
  console.log("%cType sol.help() for the console API", "color: #4fc3f7; font-weight: bold");
}
