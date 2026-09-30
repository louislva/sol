/** Bottom control bar: date, time transport, missions menu, status line. */

import { dateToJulian, julianToDate, julianYear, withinCalendar, yearToJulian } from "../astro/constants";
import { type Clock, MAX_SPEED, MIN_SPEED } from "../model/clock";

export interface ControlHandlers {
  /** Rewind (−1) or fast-forward (1). */
  shuttle(direction: 1 | -1): void;
  togglePause(): void;
  /** A manual speed magnitude (simulated s per s) from the slider. */
  speed(magnitude: number): void;
  auto(): void;
  now(): void;
  /** A Julian date (TDB) typed into the date editor. */
  date(jd: number): void;
  /** A mission picked from the missions menu. */
  mission(name: string): void;
}

export interface MissionListing {
  name: string;
  /** Short context, e.g. "1977 · Jupiter, Saturn" or "1996 · landed on Eros". */
  detail: string;
}

const SLIDER_STEPS = 1000;

/** Slider position (0–SLIDER_STEPS) ↔ speed, logarithmic from realtime to the current speed limit. */
const sliderToSpeed = (value: number, limit: number) => MIN_SPEED * Math.exp((value / SLIDER_STEPS) * Math.log(limit / MIN_SPEED));
const speedToSlider = (speed: number, limit: number) =>
  Math.round((Math.log(speed / MIN_SPEED) / Math.log(limit / MIN_SPEED)) * SLIDER_STEPS);

/**
 * Parse a typed date (UTC) to a Julian date: "2024-07-04", "1969-07-20 20:17",
 * "1969-07-20T20:17:40", negative years for BC ("-0500-03-01"), a bare year
 * ("44250", "-3000000"), or "now". Years beyond the calendar's reach are
 * counted in mean Gregorian years.
 */
export function parseDateInput(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, "");
  if (/^now$/i.test(trimmed)) return dateToJulian(new Date());
  const match = /^([+-]?)(\d{1,8})(?:-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d*)?))?)?)?\s*(?:UTC|Z)?$/i.exec(trimmed);
  if (!match) return null;
  const [, sign, yearText, month = "1", day = "1", hours = "0", minutes = "0", seconds = "0"] = match;
  const year = Number(sign + yearText);
  const approximate = yearToJulian(year);
  if (!withinCalendar(approximate)) return approximate + (Number(month) - 1) * 30.436875 + (Number(day) - 1);
  const date = new Date(0);
  date.setUTCFullYear(year, Number(month) - 1, Number(day));
  date.setUTCHours(Number(hours), Number(minutes), 0, Number(seconds) * 1000);
  return Number.isNaN(date.getTime()) ? null : dateToJulian(date);
}

/** A date as the editor shows it: "1977-08-20 14:29" (UTC), or just the year in deep time. */
function formatDateInput(jd: number): string {
  if (!withinCalendar(jd)) return String(Math.floor(julianYear(jd)));
  const date = julianToDate(jd);
  const pad = (value: number, width = 2) => String(Math.abs(value)).padStart(width, "0");
  const year = date.getUTCFullYear();
  return `${year < 0 ? "-" : ""}${pad(year, 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} `
    + `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

export class Controls {
  private readonly date = document.getElementById("date-display") as HTMLButtonElement;
  private readonly dateInput = document.getElementById("date-input") as HTMLInputElement;
  private readonly status = document.getElementById("status-line")!;
  private readonly rewind = document.getElementById("rewind")!;
  private readonly playPause = document.getElementById("play-pause")!;
  private readonly fastForward = document.getElementById("fast-forward")!;
  private readonly slider = document.getElementById("speed-slider") as HTMLInputElement;
  private readonly readout = document.getElementById("speed-readout")!;
  private readonly autoButton = document.getElementById("auto-speed")!;

  private readonly missionsButton = document.getElementById("missions-button")!;
  private readonly missionsPanel = document.getElementById("missions-panel")!;
  private readonly missionsList = document.getElementById("missions-list")!;
  private readonly handlers: ControlHandlers;
  /** Speed at the slider's right end, as of the last clock update. */
  private speedLimit = MAX_SPEED;
  private sliderHeld = false;

  constructor(handlers: ControlHandlers) {
    this.handlers = handlers;
    this.missionsButton.addEventListener("click", () => this.toggleMissions());
    this.rewind.addEventListener("click", () => handlers.shuttle(-1));
    this.fastForward.addEventListener("click", () => handlers.shuttle(1));
    this.playPause.addEventListener("click", () => handlers.togglePause());
    this.autoButton.addEventListener("click", () => handlers.auto());
    document.getElementById("now-button")!.addEventListener("click", () => handlers.now());
    this.slider.addEventListener("input", () => handlers.speed(sliderToSpeed(Number(this.slider.value), this.speedLimit)));
    this.slider.addEventListener("pointerdown", () => (this.sliderHeld = true));
    window.addEventListener("pointerup", () => (this.sliderHeld = false));
    window.addEventListener("pointercancel", () => (this.sliderHeld = false));
    // Arrow keys belong to the transport, not the focused slider.
    this.slider.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") event.preventDefault();
    });

    this.date.addEventListener("click", () => this.editDate());
    this.dateInput.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape") this.closeDateEditor();
      if (event.key !== "Enter") return;
      const date = parseDateInput(this.dateInput.value);
      if (!date) {
        this.dateInput.classList.add("invalid");
        return;
      }
      this.closeDateEditor();
      handlers.date(date);
    });
    this.dateInput.addEventListener("input", () => this.dateInput.classList.remove("invalid"));
    this.dateInput.addEventListener("blur", () => this.closeDateEditor());
  }

  /** Reflect the clock in the transport. */
  setClock(clock: Clock): void {
    const playing = !clock.paused;
    this.playPause.classList.toggle("paused", !playing);
    this.playPause.setAttribute("aria-label", playing ? "Pause" : "Play");
    this.rewind.classList.toggle("active", playing && clock.direction < 0);
    this.fastForward.classList.toggle("active", playing && clock.direction > 0 && clock.magnitude > 1);
    this.autoButton.classList.toggle("active", clock.auto);
    // The slider's right end is the zoom's speed limit. Leave it alone while it is being dragged.
    this.speedLimit = clock.limit;
    if (!this.sliderHeld || clock.auto) this.slider.value = String(speedToSlider(clock.magnitude, clock.limit));
    this.slider.classList.toggle("auto", clock.auto);
    const readout = formatRate(clock.direction * clock.magnitude);
    if (this.readout.textContent !== readout) this.readout.textContent = readout;
  }

  private editDate(): void {
    this.dateInput.value = formatDateInput(this.dateDisplayed);
    this.dateInput.classList.remove("hidden", "invalid");
    this.date.classList.add("hidden");
    this.dateInput.focus();
    this.dateInput.select();
  }

  private closeDateEditor(): void {
    this.dateInput.classList.add("hidden");
    this.date.classList.remove("hidden");
  }

  /** The date last shown, for seeding the editor. */
  private dateDisplayed = 0;

  setMissions(missions: readonly MissionListing[]): void {
    this.missionsList.replaceChildren(...missions.map((mission) => {
      const option = document.createElement("button");
      option.className = "mission-option";
      const name = document.createElement("span");
      name.textContent = mission.name;
      const detail = document.createElement("span");
      detail.className = "mission-detail";
      detail.textContent = mission.detail;
      option.append(name, detail);
      option.addEventListener("click", () => {
        this.toggleMissions(false);
        this.handlers.mission(mission.name);
      });
      return option;
    }));
  }

  private toggleMissions(open = this.missionsPanel.classList.contains("hidden")): void {
    this.missionsPanel.classList.toggle("hidden", !open);
    this.missionsButton.classList.toggle("active", open);
    this.missionsButton.setAttribute("aria-expanded", String(open));
  }

  setText(date: string, status: string, current: number): void {
    this.dateDisplayed = current;
    if (this.date.textContent !== date) this.date.textContent = date;
    if (this.status.textContent !== status) this.status.textContent = status;
  }
}

/** Human-readable simulation rate: "realtime", "−1.0 day/s", "3.2 yr/s", "paused". */
export function formatRate(secondsPerSecond: number): string {
  const rate = Math.abs(secondsPerSecond);
  const sign = secondsPerSecond < 0 ? "−" : "";
  if (rate === 0) return "paused";
  if (rate < 1.5) return `${sign}realtime`;
  if (rate < 60) return `${sign}${rate.toFixed(0)}× realtime`;
  if (rate < 3600) return `${sign}${(rate / 60).toFixed(1)} min/s`;
  if (rate < 86_400) return `${sign}${(rate / 3600).toFixed(1)} hr/s`;
  if (rate < 86_400 * 30) return `${sign}${(rate / 86_400).toFixed(1)} day/s`;
  if (rate < 86_400 * 365.25) return `${sign}${(rate / (86_400 * 30.44)).toFixed(1)} mo/s`;
  const years = rate / (86_400 * 365.25);
  if (years < 1000) return `${sign}${years.toFixed(years < 100 ? 1 : 0)} yr/s`;
  if (years < 1e6) return `${sign}${(years / 1000).toFixed(years < 10_000 ? 1 : 0)}k yr/s`;
  return `${sign}${(years / 1e6).toFixed(1)}M yr/s`;
}
