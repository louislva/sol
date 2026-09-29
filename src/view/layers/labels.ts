/**
 * Labels, placed greedily by priority so that important names win and no
 * two labels overlap. Collision checks use a coarse spatial grid.
 */

const FONT = '11px "Space Mono", monospace';
const LINE_HEIGHT = 13;
const PADDING = 3;
const CELL = 64;
const COLOR = "#cccccc";
const BASE_ALPHA = 0.7;

interface LabelRequest {
  text: string;
  x: number;
  y: number;
  priority: number;
  alpha: number;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export class LabelLayer {
  private readonly requests: LabelRequest[] = [];
  private readonly widths = new Map<string, number>();
  private readonly grid = new Map<number, Box[]>();

  /** Queue a label centered horizontally at x, with its top at y. */
  add(text: string, x: number, y: number, priority: number, alpha = 1): void {
    if (alpha <= 0.01) return;
    this.requests.push({ text, x, y, priority, alpha });
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const requests = this.requests;
    requests.sort((a, b) => a.priority - b.priority);
    this.grid.clear();
    ctx.font = FONT;
    ctx.fillStyle = COLOR;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    for (const request of requests) {
      const textWidth = this.measure(ctx, request.text);
      const box = {
        left: request.x - textWidth / 2 - PADDING,
        right: request.x + textWidth / 2 + PADDING,
        top: request.y - PADDING,
        bottom: request.y + LINE_HEIGHT + PADDING,
      };
      if (box.right < 0 || box.left > width || box.bottom < 0 || box.top > height) continue;
      if (this.collides(box)) continue;
      this.insert(box);
      ctx.globalAlpha = BASE_ALPHA * request.alpha;
      ctx.fillText(request.text, request.x, request.y);
    }
    ctx.globalAlpha = 1;
    requests.length = 0;
  }

  private measure(ctx: CanvasRenderingContext2D, text: string): number {
    let width = this.widths.get(text);
    if (width === undefined) {
      width = ctx.measureText(text).width;
      this.widths.set(text, width);
    }
    return width;
  }

  private cellsOf(box: Box, visit: (key: number) => boolean | void): boolean {
    const x0 = Math.floor(box.left / CELL);
    const x1 = Math.floor(box.right / CELL);
    const y0 = Math.floor(box.top / CELL);
    const y1 = Math.floor(box.bottom / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        if (visit(cx * 100_003 + cy)) return true;
      }
    }
    return false;
  }

  private collides(box: Box): boolean {
    return this.cellsOf(box, (key) => this.grid.get(key)?.some((other) => (
      box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top
    )));
  }

  private insert(box: Box): void {
    this.cellsOf(box, (key) => {
      const cell = this.grid.get(key);
      if (cell) cell.push(box);
      else this.grid.set(key, [box]);
    });
  }
}
