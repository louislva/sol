/**
 * Pointer, wheel, touch, and gesture input, translated into view intents.
 * Knows nothing about bodies; the app decides what a click or zoom means.
 */

export interface InputHandlers {
  /** Pointer moved to (x, y), or left the canvas (null). */
  hover(point: { x: number; y: number } | null): void;
  /** Zoom by `factor` (>1 zooms in) around the screen point. */
  zoom(factor: number, x: number, y: number): void;
  pan(dx: number, dy: number): void;
  /** Two-finger pinch: scale about `from`, which moves to `to`. */
  pinch(factor: number, from: { x: number; y: number }, to: { x: number; y: number }): void;
  click(x: number, y: number): void;
  doubleClick(x: number, y: number): void;
}

/** A press that travels less than this (px) is a click, not a drag. */
const CLICK_SLOP_PX = 5;
const WHEEL_GAIN = 0.0035;
/** Trackpad pinch arrives as ctrl+wheel with much smaller deltas. */
const PINCH_WHEEL_GAIN = 0.01;

export class InputController {
  constructor(canvas: HTMLCanvasElement, handlers: InputHandlers) {
    const local = (event: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      const point = local(event);
      // Normalize line/page deltas to pixels.
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
      const gain = event.ctrlKey ? PINCH_WHEEL_GAIN : WHEEL_GAIN;
      handlers.zoom(Math.exp(-event.deltaY * scale * gain), point.x, point.y);
    }, { passive: false });

    // Pointer events cover mouse, pen and touch; touches are tracked for pinch.
    const pointers = new Map<number, { x: number; y: number }>();
    let travel = 0;
    let pinchDistance = 0;
    let pinchCenter: { x: number; y: number } | null = null;

    const pinchState = () => {
      const [first, second] = [...pointers.values()];
      return {
        center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
        distance: Math.hypot(second.x - first.x, second.y - first.y),
      };
    };

    canvas.addEventListener("pointerdown", (event) => {
      canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, local(event));
      if (pointers.size === 1) travel = 0;
      if (pointers.size === 2) {
        travel = Number.POSITIVE_INFINITY;
        ({ center: pinchCenter, distance: pinchDistance } = pinchState());
      }
    });

    canvas.addEventListener("pointermove", (event) => {
      const point = local(event);
      const previous = pointers.get(event.pointerId);
      if (!previous) {
        if (event.pointerType === "mouse") handlers.hover(point);
        return;
      }
      event.preventDefault();
      pointers.set(event.pointerId, point);

      if (pointers.size >= 2 && pinchCenter && pinchDistance > 0) {
        const { center, distance } = pinchState();
        handlers.pinch(distance / pinchDistance, pinchCenter, center);
        pinchCenter = center;
        pinchDistance = distance;
      } else if (pointers.size === 1) {
        travel += Math.hypot(point.x - previous.x, point.y - previous.y);
        handlers.pan(point.x - previous.x, point.y - previous.y);
        if (event.pointerType === "mouse") handlers.hover(point);
      }
    }, { passive: false });

    const release = (event: PointerEvent, cancelled: boolean) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinchCenter = null;
      if (!cancelled && pointers.size === 0 && travel <= CLICK_SLOP_PX) {
        const point = local(event);
        handlers.click(point.x, point.y);
      }
    };
    canvas.addEventListener("pointerup", (event) => release(event, false));
    canvas.addEventListener("pointercancel", (event) => release(event, true));
    canvas.addEventListener("pointerleave", (event) => {
      if (event.pointerType === "mouse" && !pointers.has(event.pointerId)) handlers.hover(null);
    });
    canvas.addEventListener("dblclick", (event) => {
      const point = local(event);
      handlers.doubleClick(point.x, point.y);
    });

    // Safari exposes trackpad pinch as GestureEvents rather than ctrl+wheel.
    type GestureEvent = Event & { scale: number; clientX: number; clientY: number };
    let gestureScale = 1;
    canvas.addEventListener("gesturestart", (event) => {
      event.preventDefault();
      gestureScale = 1;
    });
    canvas.addEventListener("gesturechange", (event) => {
      event.preventDefault();
      if (pointers.size > 0) return;
      const gesture = event as GestureEvent;
      const point = local(gesture);
      handlers.pinch(gesture.scale / gestureScale, point, point);
      gestureScale = gesture.scale;
    });
    canvas.addEventListener("gestureend", (event) => event.preventDefault());
  }
}
