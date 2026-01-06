import { dateToJulian, julianToDate } from '../astronomy/constants';

export class TimeSystem {
  // Current simulation time as Julian Date
  private julianDate: number;

  // Time scale: simulated seconds per real second
  // 1 = real-time, 86400 = 1 day per second, etc.
  private _timeScale: number = 86400; // Default: 1 day per second

  // Is simulation paused?
  private _paused: boolean = false;

  // Available time scales
  private readonly scales = [
    { value: 1, label: '1x' },
    { value: 60, label: '1 min/s' },
    { value: 3600, label: '1 hr/s' },
    { value: 86400, label: '1 day/s' },
    { value: 604800, label: '1 wk/s' },
    { value: 2592000, label: '1 mo/s' },
    { value: 31536000, label: '1 yr/s' },
  ];
  private scaleIndex: number = 3; // Start at 1 day/s

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

  get paused(): boolean {
    return this._paused;
  }

  get currentDate(): Date {
    return julianToDate(this.julianDate);
  }

  get currentJulian(): number {
    return this.julianDate;
  }

  // Update time based on elapsed real time
  update(): void {
    const now = performance.now();
    const deltaMs = now - this.lastUpdate;
    this.lastUpdate = now;

    if (this._paused) return;

    // Convert milliseconds to days and scale
    const deltaDays = (deltaMs / 1000) * this._timeScale / 86400;
    this.julianDate += deltaDays;
  }

  // Toggle pause
  togglePause(): void {
    this._paused = !this._paused;
  }

  // Increase time scale
  faster(): void {
    if (this.scaleIndex < this.scales.length - 1) {
      this.scaleIndex++;
      this._timeScale = this.scales[this.scaleIndex].value;
    }
  }

  // Decrease time scale
  slower(): void {
    if (this.scaleIndex > 0) {
      this.scaleIndex--;
      this._timeScale = this.scales[this.scaleIndex].value;
    }
  }

  // Get display label for current speed
  getSpeedLabel(): string {
    if (this._paused) return 'Paused';
    return this.scales[this.scaleIndex].label;
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
