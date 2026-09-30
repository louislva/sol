/**
 * Frame-phase timings, exposed as `sol.perf()`. Cheap enough to leave on:
 * a couple of performance.now() calls per phase per frame.
 */

const WINDOW_FRAMES = 120;

export class Profiler {
  private readonly totals = new Map<string, number>();
  private frames = 0;
  private snapshot: Record<string, number> = {};

  /** Time a phase of the current frame. */
  measure<T>(phase: string, work: () => T): T {
    const start = performance.now();
    try {
      return work();
    } finally {
      this.totals.set(phase, (this.totals.get(phase) ?? 0) + performance.now() - start);
    }
  }

  endFrame(): void {
    if (++this.frames < WINDOW_FRAMES) return;
    this.snapshot = {};
    for (const [phase, total] of this.totals) this.snapshot[phase] = Number((total / this.frames).toFixed(3));
    this.totals.clear();
    this.frames = 0;
  }

  /** Mean milliseconds per frame for each phase over the last window. */
  report(): Record<string, number> {
    return { ...this.snapshot };
  }
}

export const profiler = new Profiler();
