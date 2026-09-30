/** Simulation time: a Julian date (TDB) advanced at a chosen rate. */

import { dateToJulian, formatYear, julianToDate, SECONDS_PER_DAY, withinCalendar } from "../astro/constants";

/** Named speeds (the console's `sol.setSpeed`). */
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
/** Fastest auto speed: a thousand years per second, for watching the stars drift. */
export const AUTO_SPEED_MAX = 1_000 * 31_557_600;

export function autoSpeedForZoom(zoom: number): number {
  return Math.min(AUTO_SPEED_MAX, Math.max(1, interpolateLogLog(AUTO_SPEED_POINTS, zoom)));
}

/**
 * Speed limit: the fastest any speed may run at this zoom, so that close in
 * time can't race by at geological rates. About a month per second around
 * Earth and the Moon, ten years among the inner planets, a thousand at
 * Neptune, 100,000 years out among the stars, and a million only with the
 * whole Galaxy in view.
 */
const SPEED_LIMIT_POINTS: Array<[number, number]> = [
  [6.4e-5, 2_629_800],
  [2.7e-6, 10 * 31_557_600],
  [1.2e-7, 1_000 * 31_557_600],
  [3.8e-12, 100_000 * 31_557_600],
  [1e-15, 1_000_000 * 31_557_600],
];
/** Slowest limit, however far in: an hour per second (an orbit of the ISS in 1.5 s). */
const SPEED_LIMIT_MIN = 3_600;

export function speedLimitForZoom(zoom: number): number {
  return Math.min(MAX_SPEED, Math.max(SPEED_LIMIT_MIN, interpolateLogLog(SPEED_LIMIT_POINTS, zoom)));
}

/** Piecewise-linear in log–log space over points sorted by decreasing zoom; extrapolates at either end. */
function interpolateLogLog(points: Array<[number, number]>, zoom: number): number {
  const logZoom = Math.log(zoom);
  // Segment whose zoom range contains logZoom; extrapolate at either end.
  let segment = 0;
  while (segment < points.length - 2 && logZoom < Math.log(points[segment + 1][0])) segment++;
  const [z0, s0] = points[segment];
  const [z1, s1] = points[segment + 1];
  const t = (logZoom - Math.log(z0)) / (Math.log(z1) - Math.log(z0));
  return Math.exp(Math.log(s0) + t * (Math.log(s1) - Math.log(s0)));
}

const YEAR_SECONDS = 31_557_600;

/** Manual speeds range over these magnitudes (simulated s per s): realtime to a million years per second. */
export const MIN_SPEED = 1;
export const MAX_SPEED = 1_000_000 * YEAR_SECONDS;

/** Speeds that fast-forward and rewind step through. */
const SPEED_LADDER = [1, 60, 3_600, 86_400, 604_800, 2_629_800, YEAR_SECONDS, 10, 100, 1_000, 10_000, 100_000, 1_000_000]
  .map((speed, index) => (index > 6 ? speed * YEAR_SECONDS : speed));

/**
 * Deep time: ten million years either way. Beyond a few hundred thousand
 * years the stars' straight-line paths are approximations (the Galaxy's
 * tides bend them), and the solar system itself is long extrapolated;
 * past the calendar's reach dates are shown as years.
 */
export const DEEP_TIME_YEARS = 10_000_000;

export class Clock {
  julianDate: number;
  /** Speed chosen by the view (zoom, or the followed object's pace) rather than by hand. */
  auto = true;
  /** Manual speed magnitude, simulated seconds per real second. */
  speed = 86_400;
  direction: 1 | -1 = 1;
  paused = false;
  /** Time stays within [start, end] (JD); reaching either end pauses. */
  bounds: [number, number] = [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];
  /** Fastest speed allowed at the current zoom; a faster chosen speed is kept but held to this. */
  limit = MAX_SPEED;
  private autoSpeed = 1;

  constructor(start: Date = new Date()) {
    this.julianDate = dateToJulian(start);
  }

  /** Speed magnitude in effect, auto or manual. */
  get magnitude(): number {
    return Math.min(this.limit, this.auto ? this.autoSpeed : this.speed);
  }

  /** Signed simulated seconds per real second (0 while paused). */
  get rate(): number {
    return this.paused ? 0 : this.direction * this.magnitude;
  }

  /** Name of the speed mode, for display and the console. */
  get mode(): string {
    if (this.paused) return "paused";
    if (this.auto) return "auto";
    const preset = (Object.keys(SPEEDS) as (keyof typeof SPEEDS)[]).find((mode) => SPEEDS[mode] === this.speed);
    return preset ?? "custom";
  }

  setMode(mode: SpeedMode): void {
    this.paused = false;
    this.direction = 1;
    if (mode === "auto") this.auto = true;
    else this.setSpeed(SPEEDS[mode]);
  }

  /** A manual speed magnitude; the direction is kept. */
  setSpeed(magnitude: number): void {
    this.auto = false;
    this.speed = Math.min(MAX_SPEED, Math.max(MIN_SPEED, magnitude));
  }

  /** A signed rate; 0 pauses. */
  setRate(rate: number): void {
    if (rate === 0) {
      this.paused = true;
      return;
    }
    this.paused = false;
    this.direction = rate < 0 ? -1 : 1;
    this.setSpeed(Math.abs(rate));
  }

  /**
   * Fast-forward (1) or rewind (−1): play in that direction, or, if already
   * playing that way, step up to the next faster speed.
   */
  shuttle(direction: 1 | -1): void {
    if (this.paused || this.direction !== direction) {
      this.paused = false;
      this.direction = direction;
      return;
    }
    const current = this.magnitude;
    this.setSpeed(Math.min(this.limit, SPEED_LADDER.find((speed) => speed > current * 1.01) ?? MAX_SPEED));
  }

  /**
   * @param pacedRate in auto mode, a speed to use instead of the zoom-based
   *   one (e.g. pacing a followed spacecraft's motion); smoothed over time.
   */
  advance(realMs: number, zoom: number, pacedRate?: number): void {
    const stepMs = Math.min(realMs, MAX_STEP_MS);
    this.limit = speedLimitForZoom(zoom);
    if (this.auto) {
      if (pacedRate === undefined) {
        this.autoSpeed = autoSpeedForZoom(zoom);
      } else {
        // Ease toward the target in log space so pace changes feel natural.
        const blend = 1 - Math.exp(-stepMs / PACE_TIME_CONSTANT_MS);
        const from = Math.log(Math.max(1, this.autoSpeed));
        this.autoSpeed = Math.exp(from + (Math.log(pacedRate) - from) * blend);
      }
    }
    const next = this.julianDate + (stepMs / 1000) * this.rate / SECONDS_PER_DAY;
    const [first, last] = this.bounds;
    if (next < first || next > last) this.paused = true;
    this.julianDate = Math.min(last, Math.max(first, next));
  }

  setDate(date: Date): void {
    this.julianDate = dateToJulian(date);
  }

  get date(): Date {
    return julianToDate(this.julianDate);
  }

  /**
   * The date, with the time of day as far as it changes slowly enough to
   * read: seconds near realtime, minutes up to a day per second.
   */
  format(): string {
    if (!withinCalendar(this.julianDate)) return formatYear(this.julianDate);
    const date = this.date;
    const year = date.getUTCFullYear();
    const day = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${year > 0 ? year : `${1 - year} BC`}`;
    const speed = this.paused ? 0 : this.magnitude;
    if (speed > 86_400) return day;
    const pad = (value: number) => String(value).padStart(2, "0");
    const time = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
    return speed > 60 ? `${day} ${time} UTC` : `${day} ${time}:${pad(date.getUTCSeconds())} UTC`;
  }
}
