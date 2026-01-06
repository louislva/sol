import { dateToJulian, julianToDate } from '../astronomy/constants';

export type SpeedMode = 'auto' | 'realtime' | 'day' | 'month' | 'year';

// Time scale values in seconds per real second
export const SPEED_VALUES: Record<Exclude<SpeedMode, 'auto'>, number> = {
  realtime: 1,
  day: 86400,
  month: 2592000,
  year: 31536000,
};

export class TimeSystem {
  // Current simulation time as Julian Date
  private julianDate: number;

  // Time scale: simulated seconds per real second
  // 1 = real-time, 86400 = 1 day per second, etc.
  private _timeScale: number = 86400; // Default: 1 day per second

  // Current speed mode
  private _speedMode: SpeedMode = 'auto';

  // Last update timestamp
  private lastUpdate: number = 0;

  constructor(startDate?: Date) {
    const date = startDate || new Date();
    this.julianDate = dateToJulian(date);
    this.lastUpdate = performance.now();
  }

  get timeScale(): number {
    return this._timeScale;
  }

  get speedMode(): SpeedMode {
    return this._speedMode;
  }

  get currentDate(): Date {
    return julianToDate(this.julianDate);
  }

  get currentJulian(): number {
    return this.julianDate;
  }

  // Set speed mode
  setSpeedMode(mode: SpeedMode): void {
    this._speedMode = mode;
    if (mode !== 'auto') {
      this._timeScale = SPEED_VALUES[mode];
    }
  }

  // Set time scale directly (used by auto mode)
  setTimeScale(scale: number): void {
    this._timeScale = scale;
  }

  // Update time based on elapsed real time
  update(): void {
    const now = performance.now();
    const deltaMs = now - this.lastUpdate;
    this.lastUpdate = now;

    // Convert milliseconds to days and scale
    const deltaDays = (deltaMs / 1000) * this._timeScale / 86400;
    this.julianDate += deltaDays;
  }

  // Format current date for display
  formatDate(): string {
    const date = this.currentDate;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  // Jump to specific date
  setDate(date: Date): void {
    this.julianDate = dateToJulian(date);
  }
}
