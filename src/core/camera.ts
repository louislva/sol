import { AU_KM } from '../astronomy/constants';

export class Camera {
  // Center position in kilometers (0, 0 = Sun)
  x: number = 0;
  y: number = 0;

  // Zoom level: pixels per kilometer
  // Start zoomed out to see inner solar system (~5 AU visible)
  private _zoom: number = 0.0000001; // Very zoomed out initially
  private _targetZoom: number = 0.0000001;

  // Canvas dimensions
  width: number = 0;
  height: number = 0;

  // Zoom limits
  private minZoom = 1e-12;  // See past Neptune
  private maxZoom = 0.01;   // Zoom into individual planets

  // Pan state
  private isPanning = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.resize(canvas);
    this.setupControls(canvas);
  }

  get zoom(): number {
    return this._zoom;
  }

  resize(canvas: HTMLCanvasElement): void {
    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    this.width = rect.width;
    this.height = rect.height;
  }

  // Convert world coordinates (km) to screen coordinates (pixels)
  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const screenX = (worldX - this.x) * this._zoom + this.width / 2;
    const screenY = (worldY - this.y) * this._zoom + this.height / 2;
    return { x: screenX, y: screenY };
  }

  // Convert screen coordinates to world coordinates
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const worldX = (screenX - this.width / 2) / this._zoom + this.x;
    const worldY = (screenY - this.height / 2) / this._zoom + this.y;
    return { x: worldX, y: worldY };
  }

  // Convert a size in km to pixels (for rendering bodies)
  kmToPixels(km: number): number {
    return km * this._zoom;
  }

  private setupControls(canvas: HTMLCanvasElement): void {
    // Track the world point we're zooming towards
    let zoomAnchorWorld: { x: number; y: number } | null = null;
    let zoomAnchorScreen: { x: number; y: number } | null = null;

    // Smooth zoom animation that keeps anchor point stable
    const animateZoom = () => {
      const targetZoom = this._targetZoom;

      if (Math.abs(this._zoom - targetZoom) > targetZoom * 0.0001) {
        // Smoothly interpolate zoom
        this._zoom += (targetZoom - this._zoom) * 0.15;

        // If we have an anchor, keep it under the cursor
        if (zoomAnchorWorld && zoomAnchorScreen) {
          // Where would the anchor world point appear on screen now?
          const anchorScreenNowX = (zoomAnchorWorld.x - this.x) * this._zoom + this.width / 2;
          const anchorScreenNowY = (zoomAnchorWorld.y - this.y) * this._zoom + this.height / 2;

          // Adjust camera to keep anchor at original screen position
          const dx = (zoomAnchorScreen.x - anchorScreenNowX) / this._zoom;
          const dy = (zoomAnchorScreen.y - anchorScreenNowY) / this._zoom;
          this.x -= dx;
          this.y -= dy;
        }
      } else {
        this._zoom = targetZoom;
        zoomAnchorWorld = null;
        zoomAnchorScreen = null;
      }
      requestAnimationFrame(animateZoom);
    };
    animateZoom();

    // Mouse wheel zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();

      // Remember the world point under cursor as our zoom anchor
      const mouseX = e.offsetX;
      const mouseY = e.offsetY;
      zoomAnchorScreen = { x: mouseX, y: mouseY };
      zoomAnchorWorld = {
        x: (mouseX - this.width / 2) / this._zoom + this.x,
        y: (mouseY - this.height / 2) / this._zoom + this.y
      };

      // Normalize scroll delta across browsers/devices
      const delta = -e.deltaY * 0.0035;

      // Use exponential zoom for consistent feel at all scales
      const zoomFactor = Math.exp(delta);
      this._targetZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this._targetZoom * zoomFactor));
    }, { passive: false });

    // Pan with mouse drag
    canvas.addEventListener('mousedown', (e) => {
      this.isPanning = true;
      this.lastMouseX = e.offsetX;
      this.lastMouseY = e.offsetY;
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!this.isPanning) return;

      const dx = e.offsetX - this.lastMouseX;
      const dy = e.offsetY - this.lastMouseY;

      // Move camera in opposite direction of drag
      this.x -= dx / this._zoom;
      this.y -= dy / this._zoom;

      this.lastMouseX = e.offsetX;
      this.lastMouseY = e.offsetY;
    });

    canvas.addEventListener('mouseup', () => {
      this.isPanning = false;
    });

    canvas.addEventListener('mouseleave', () => {
      this.isPanning = false;
    });
  }

  // Get current visible range in AU (for debugging/display)
  getVisibleRangeAU(): number {
    return (this.width / this._zoom) / AU_KM;
  }
}
