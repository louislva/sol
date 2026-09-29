/** Bottom control bar: date, speed and moon-detail selectors, status line. */

import type { SpeedMode } from "../model/clock";
import type { MoonCategory } from "../model/body";

export interface ControlHandlers {
  speed(mode: SpeedMode): void;
  moons(category: MoonCategory): void;
  /** A mission picked from the missions menu. */
  mission(name: string): void;
}

export interface MissionListing {
  name: string;
  /** Short context, e.g. "1977 · Jupiter, Saturn" or "1996 · landed on Eros". */
  detail: string;
}

export class Controls {
  private readonly date = document.getElementById("date-display")!;
  private readonly status = document.getElementById("status-line")!;
  private readonly speedButtons = [...document.querySelectorAll<HTMLButtonElement>(".speed-option")];
  private readonly moonButtons = [...document.querySelectorAll<HTMLButtonElement>(".moon-option[data-moons]")];

  private readonly missionsButton = document.getElementById("missions-button")!;
  private readonly missionsPanel = document.getElementById("missions-panel")!;
  private readonly missionsList = document.getElementById("missions-list")!;
  private readonly handlers: ControlHandlers;

  constructor(handlers: ControlHandlers) {
    this.handlers = handlers;
    this.missionsButton.addEventListener("click", () => this.toggleMissions());
    for (const button of this.speedButtons) {
      button.addEventListener("click", () => handlers.speed(button.dataset.speed as SpeedMode));
    }
    for (const button of this.moonButtons) {
      button.addEventListener("click", () => handlers.moons(button.dataset.moons as MoonCategory));
    }
  }

  /** Highlight the active speed; "custom" rates highlight nothing. */
  setSpeedMode(mode: string): void {
    for (const button of this.speedButtons) button.classList.toggle("active", button.dataset.speed === mode);
  }

  setMoonCategory(category: MoonCategory): void {
    for (const button of this.moonButtons) button.classList.toggle("active", button.dataset.moons === category);
  }

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

  setText(date: string, status: string): void {
    if (this.date.textContent !== date) this.date.textContent = date;
    if (this.status.textContent !== status) this.status.textContent = status;
  }
}

/** Human-readable simulation rate: "realtime", "1.0 day/s", "3.2 yr/s", "paused". */
export function formatRate(secondsPerSecond: number): string {
  const rate = Math.abs(secondsPerSecond);
  if (rate === 0) return "paused";
  if (rate < 1.5) return "realtime";
  if (rate < 3600) return `${rate.toFixed(0)}× realtime`;
  if (rate < 86_400) return `${(rate / 3600).toFixed(1)} hr/s`;
  if (rate < 86_400 * 60) return `${(rate / 86_400).toFixed(1)} day/s`;
  return `${(rate / (86_400 * 365.25)).toFixed(2)} yr/s`;
}
