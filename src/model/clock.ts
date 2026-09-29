/** Simulation time: a Julian date (TDB) advanced at a chosen rate. */

import { dateToJulian, julianToDate, SECONDS_PER_DAY } from "../astro/constants";

export type SpeedMode = "auto" | "realtime" | "day" | "month" | "year";

/** Simulated seconds per real second for each fixed speed. */
export const SPEEDS: Record<Exclude<SpeedMode, "auto">, number> = {
  realtime: 1,
  day: 86_400,
  month: 2_592_000,
  year: 31_536_000,
};

/**
 * A frame longer than this (a background tab, a debugger pause) advances
 * time as if it were this long, rather than leaping years ahead.
 */
const MAX_STEP_MS = 100;

/** How quickly a paced auto speed follows changes in the action. */
const PACE_TIME_CONSTANT_MS = 400;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Auto speed: faster the farther out you are, interpolated in log–log space
 * between hand-tuned control points (zoom px/km → simulated s per s).
 */
const AUTO_SPEED_POINTS: Array<[number, number]> = [
  [6.4e-5, 1],
  [2.7e-6, 86_400],
  [1.2e-7, 31_536_000],
  [3.8e-12, 315_360_000_000],
];
const AUTO_SPEED_MAX = 5 * 31_536_000;

export function autoSpeedForZoom(zoom: number): number {
  const points = AUTO_SPEED_POINTS;
  const logZoom = Math.log(zoom);
  // Segment whose zoom range contains logZoom; extrapolate at either end.
  let segment = 0;
  while (segment < points.length - 2 && logZoom < Math.log(points[segment + 1][0])) segment++;
  const [z0, s0] = points[segment];
  const [z1, s1] = points[segment + 1];
  const t = (logZoom - Math.log(z0)) / (Math.log(z1) - Math.log(z0));
  const speed = Math.exp(Math.log(s0) + t * (Math.log(s1) - Math.log(s0)));
  return Math.min(AUTO_SPEED_MAX, Math.max(1, speed));
}

export class Clock {
  julianDate: number;
  /** "custom" means an explicit rate set programmatically (including 0, paused). */
  mode: SpeedMode | "custom" = "auto";
  /** Simulated seconds per real second. */
  rate = 1;

  constructor(start: Date = new Date()) {
    this.julianDate = dateToJulian(start);
  }

  setMode(mode: SpeedMode): void {
    this.mode = mode;
    if (mode !== "auto") this.rate = SPEEDS[mode];
  }

  /** Set an explicit rate (0 pauses). */
  setRate(rate: number): void {
    this.mode = "custom";
    this.rate = rate;
  }

  /**
   * @param pacedRate in auto mode, a rate to use instead of the zoom-based
   *   one (e.g. pacing a followed spacecraft's motion); smoothed over time.
   */
  advance(realMs: number, zoom: number, pacedRate?: number): void {
    if (this.mode === "auto") {
      const target = pacedRate ?? autoSpeedForZoom(zoom);
      // Ease toward the target in log space so pace changes feel natural.
      const blend = 1 - Math.exp(-Math.min(realMs, MAX_STEP_MS) / PACE_TIME_CONSTANT_MS);
      this.rate = pacedRate === undefined
        ? target
        : Math.exp(Math.log(Math.max(1, this.rate)) + (Math.log(target) - Math.log(Math.max(1, this.rate))) * blend);
    }
    const stepMs = Math.min(realMs, MAX_STEP_MS);
    this.julianDate += (stepMs / 1000) * this.rate / SECONDS_PER_DAY;
  }

  setDate(date: Date): void {
    this.julianDate = dateToJulian(date);
  }

  get date(): Date {
    return julianToDate(this.julianDate);
  }

  format(): string {
    const date = this.date;
    return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  }
}
