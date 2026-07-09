import { AU_KM } from '../astronomy/constants';

export class Camera {
  // Center position in kilometers (0, 0 = Sun)
  x: number = 0;
  y: number = 0;

  // Zoom level: pixels per kilometer
  // Start zoomed out to see inner solar system (100x wider view)
  private _zoom: number = 0.000000001; // Very zoomed out initially
  private _targetZoom: number = 0.000000001;

  // Canvas dimensions
  width: number = 0;
  height: number = 0;

  // Zoom limits
  private minZoom = 1e-12;  // See past Neptune
  private maxZoom = 1;      // Zoom in very close

  // Pan state
  private isPanning = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  // Hover target for zoom centering (set externally when hovering over a body)
  private hoverTargetWorld: { x: number; y: number } | null = null;

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

    const getCanvasPoint = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    };

    const setImmediateZoomAroundPoint = (
      zoom: number,
      screenPoint: { x: number; y: number },
      worldPoint: { x: number; y: number }
    ) => {
      const clampedZoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
      this._zoom = clampedZoom;
      this._targetZoom = clampedZoom;
      this.x = worldPoint.x - (screenPoint.x - this.width / 2) / clampedZoom;
      this.y = worldPoint.y - (screenPoint.y - this.height / 2) / clampedZoom;
    };

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

      const mouseX = e.offsetX;
      const mouseY = e.offsetY;

      // Determine zoom direction: deltaY > 0 means zooming out, deltaY < 0 means zooming in
      const isZoomingIn = e.deltaY < 0;

      // Use hover target (body position) only when zooming IN and hovering over a body
      // When zooming out, always use cursor position for more intuitive behavior
      if (isZoomingIn && this.hoverTargetWorld) {
        zoomAnchorWorld = this.hoverTargetWorld;
        // Calculate where this world point currently appears on screen
        zoomAnchorScreen = this.worldToScreen(this.hoverTargetWorld.x, this.hoverTargetWorld.y);
      } else {
        zoomAnchorScreen = { x: mouseX, y: mouseY };
        zoomAnchorWorld = {
          x: (mouseX - this.width / 2) / this._zoom + this.x,
          y: (mouseY - this.height / 2) / this._zoom + this.y
        };
      }

      // Normalize scroll delta across browsers/devices
      // Browsers expose trackpad pinch as Ctrl+wheel. It uses much smaller
      // deltas than ordinary scrolling, so give it pinch-appropriate gain.
      const sensitivity = e.ctrlKey ? 0.01 : 0.0035;
      const delta = -e.deltaY * sensitivity;

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

    // Touch input: one-finger pan and midpoint-anchored two-finger pinch.
    const touchPoints = new Map<number, { x: number; y: number }>();
    let lastTouchCenter: { x: number; y: number } | null = null;
    let lastTouchDistance = 0;
    let touchTravel = 0;
    let suppressNextClick = false;

    const getFirstTwoTouchPoints = () => {
      const points = touchPoints.values();
      const first = points.next().value as { x: number; y: number } | undefined;
      const second = points.next().value as { x: number; y: number } | undefined;
      return first && second ? [first, second] as const : null;
    };

    const updateTouchReference = () => {
      const pair = getFirstTwoTouchPoints();
      if (pair) {
        const [first, second] = pair;
        lastTouchCenter = {
          x: (first.x + second.x) / 2,
          y: (first.y + second.y) / 2,
        };
        lastTouchDistance = Math.hypot(second.x - first.x, second.y - first.y);
        return;
      }

      const remaining = touchPoints.values().next().value as { x: number; y: number } | undefined;
      lastTouchCenter = remaining || null;
      lastTouchDistance = 0;
    };

    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      canvas.setPointerCapture(e.pointerId);
      touchPoints.set(e.pointerId, getCanvasPoint(e.clientX, e.clientY));
      if (touchPoints.size === 1) touchTravel = 0;
      if (touchPoints.size > 1) touchTravel = Infinity;
      updateTouchReference();
    });

    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch' || !touchPoints.has(e.pointerId)) return;
      e.preventDefault();

      const nextPoint = getCanvasPoint(e.clientX, e.clientY);
      const previousPoint = touchPoints.get(e.pointerId)!;
      touchTravel += Math.hypot(nextPoint.x - previousPoint.x, nextPoint.y - previousPoint.y);
      touchPoints.set(e.pointerId, nextPoint);

      const pair = getFirstTwoTouchPoints();
      if (pair && lastTouchCenter && lastTouchDistance > 0) {
        const [first, second] = pair;
        const center = {
          x: (first.x + second.x) / 2,
          y: (first.y + second.y) / 2,
        };
        const distance = Math.hypot(second.x - first.x, second.y - first.y);
        const anchorWorld = this.screenToWorld(lastTouchCenter.x, lastTouchCenter.y);
        setImmediateZoomAroundPoint(
          this._zoom * distance / lastTouchDistance,
          center,
          anchorWorld
        );
        lastTouchCenter = center;
        lastTouchDistance = distance;
      } else if (touchPoints.size === 1 && lastTouchCenter) {
        const dx = nextPoint.x - lastTouchCenter.x;
        const dy = nextPoint.y - lastTouchCenter.y;
        this.x -= dx / this._zoom;
        this.y -= dy / this._zoom;
        lastTouchCenter = nextPoint;
      }
    }, { passive: false });

    const finishTouch = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      touchPoints.delete(e.pointerId);
      if (touchPoints.size === 0 && touchTravel > 5) {
        suppressNextClick = true;
        window.setTimeout(() => { suppressNextClick = false; }, 500);
      }
      updateTouchReference();
    };

    canvas.addEventListener('pointerup', finishTouch);
    canvas.addEventListener('pointercancel', finishTouch);

    // Prevent a completed pinch or drag from becoming an accidental body click.
    canvas.addEventListener('click', (e) => {
      if (!suppressNextClick) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      suppressNextClick = false;
    }, true);

    // Safari on macOS exposes trackpad pinch through GestureEvents rather than
    // Ctrl+wheel. These are intentionally typed structurally for portability.
    type GestureLikeEvent = Event & {
      scale: number;
      clientX: number;
      clientY: number;
    };

    let gestureStartZoom = this._zoom;
    let gestureAnchorWorld: { x: number; y: number } | null = null;

    canvas.addEventListener('gesturestart', ((event: Event) => {
      const e = event as GestureLikeEvent;
      e.preventDefault();
      if (touchPoints.size > 0) return;
      const screenPoint = getCanvasPoint(e.clientX, e.clientY);
      gestureStartZoom = this._zoom;
      gestureAnchorWorld = this.screenToWorld(screenPoint.x, screenPoint.y);
      suppressNextClick = true;
    }) as EventListener, { passive: false });

    canvas.addEventListener('gesturechange', ((event: Event) => {
      const e = event as GestureLikeEvent;
      e.preventDefault();
      if (touchPoints.size > 0) return;
      if (!gestureAnchorWorld) return;
      setImmediateZoomAroundPoint(
        gestureStartZoom * e.scale,
        getCanvasPoint(e.clientX, e.clientY),
        gestureAnchorWorld
      );
    }) as EventListener, { passive: false });

    canvas.addEventListener('gestureend', ((event: Event) => {
      event.preventDefault();
      gestureAnchorWorld = null;
      window.setTimeout(() => { suppressNextClick = false; }, 500);
    }) as EventListener, { passive: false });
  }

  // Get current visible range in AU (for debugging/display)
  getVisibleRangeAU(): number {
    return (this.width / this._zoom) / AU_KM;
  }

  // Set hover target for zoom centering (call with body position when hovering)
  setHoverTarget(worldPos: { x: number; y: number } | null): void {
    this.hoverTargetWorld = worldPos;
  }
}
