/**
 * Two-body (Keplerian) orbits with optional secular drift of the elements.
 *
 * Positions are full 3D vectors in the J2000 ecliptic relative to the body
 * being orbited. The top-down view simply uses their x/y, so inclined
 * orbits appear as the ellipses you would actually see from above.
 */

import { DAYS_PER_CENTURY, J2000, TWO_PI, wrapAngle } from "./constants";
import { IDENTITY, type Mat3 } from "./rotation";

export interface SecularRates {
  /** Rates per day; angles in radians, a in km. */
  a?: number;
  e?: number;
  i?: number;
  node?: number;
  argPeri?: number;
}

/**
 * JPL "approximate positions" correction for the outer planets:
 * M += b·T² + c·cos(f·T) + s·sin(f·T), T in Julian centuries from J2000,
 * coefficients converted to radians.
 */
export interface MeanAnomalyTerms {
  b: number;
  c: number;
  s: number;
  f: number;
}

export interface KeplerElements {
  /** Epoch of the elements, Julian date (TDB). */
  epoch: number;
  /** Semi-major axis in km; negative for hyperbolic orbits. */
  a: number;
  e: number;
  /** Angles in radians relative to the reference frame. */
  i: number;
  node: number;
  argPeri: number;
  meanAnomaly: number;
  /** Mean motion, radians per day. */
  meanMotion: number;
  rates?: SecularRates;
  meanAnomalyTerms?: MeanAnomalyTerms;
  /** Reference frame of i/node/argPeri, expressed in the J2000 ecliptic. */
  frame?: Mat3;
}

/** Elements for a conic given by periapsis distance and time (comets, spacecraft). */
export function elementsFromPeriapsis(params: {
  q: number;
  e: number;
  tp: number;
  meanMotion: number;
  i: number;
  node: number;
  argPeri: number;
  frame?: Mat3;
}): KeplerElements {
  // A true parabola has no finite a; nudge it into the elliptic regime.
  const e = Math.abs(params.e - 1) < 1e-9 ? 1 - 1e-9 : params.e;
  return {
    epoch: params.tp,
    a: params.q / (1 - e),
    e,
    i: params.i,
    node: params.node,
    argPeri: params.argPeri,
    meanAnomaly: 0,
    meanMotion: params.meanMotion,
    frame: params.frame,
  };
}

/** Solve Kepler's equation M = E − e·sin E for the eccentric anomaly. */
export function solveElliptic(meanAnomaly: number, e: number): number {
  // Work in [−π, π] where the Danby starting guess converges in a few steps.
  let M = wrapAngle(meanAnomaly);
  if (M > Math.PI) M -= TWO_PI;
  let E = e < 0.8 ? M + e * Math.sin(M) : M + (M < 0 ? -0.85 : 0.85) * e;
  for (let iteration = 0; iteration < 32; iteration++) {
    const sinE = Math.sin(E);
    const cosE = Math.cos(E);
    const delta = (E - e * sinE - M) / (1 - e * cosE);
    E -= delta;
    if (Math.abs(delta) < 1e-13) break;
  }
  return E;
}

/** Solve the hyperbolic Kepler equation M = e·sinh H − H. */
export function solveHyperbolic(meanAnomaly: number, e: number): number {
  const M = meanAnomaly;
  let H = Math.abs(M) < 1 ? M : Math.sign(M) * Math.log((2 * Math.abs(M)) / e + 1.8);
  for (let iteration = 0; iteration < 64; iteration++) {
    const delta = (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1);
    H -= delta;
    if (Math.abs(delta) < 1e-13 * Math.max(1, Math.abs(H))) break;
  }
  return H;
}

/** Instantaneous orbit geometry: shape plus the in-plane basis (P toward periapsis, Q 90° ahead). */
export interface OrbitShape {
  a: number;
  e: number;
  /** Semi-minor axis (positive) for ellipses, or b = |a|√(e²−1) for hyperbolas. */
  b: number;
  meanAnomaly: number;
  P: [number, number, number];
  Q: [number, number, number];
}

function orientationBasis(frame: Mat3, i: number, node: number, argPeri: number, shape: OrbitShape): void {
  const cosO = Math.cos(node);
  const sinO = Math.sin(node);
  const cosW = Math.cos(argPeri);
  const sinW = Math.sin(argPeri);
  const cosI = Math.cos(i);
  const sinI = Math.sin(i);
  // Columns of Rz(Ω)·Rx(i)·Rz(ω) in the reference frame.
  const px = cosO * cosW - sinO * sinW * cosI;
  const py = sinO * cosW + cosO * sinW * cosI;
  const pz = sinW * sinI;
  const qx = -cosO * sinW - sinO * cosW * cosI;
  const qy = -sinO * sinW + cosO * cosW * cosI;
  const qz = cosW * sinI;
  const f = frame;
  shape.P[0] = f[0] * px + f[1] * py + f[2] * pz;
  shape.P[1] = f[3] * px + f[4] * py + f[5] * pz;
  shape.P[2] = f[6] * px + f[7] * py + f[8] * pz;
  shape.Q[0] = f[0] * qx + f[1] * qy + f[2] * qz;
  shape.Q[1] = f[3] * qx + f[4] * qy + f[5] * qz;
  shape.Q[2] = f[6] * qx + f[7] * qy + f[8] * qz;
}

/**
 * A Keplerian orbit, evaluated at arbitrary times. Orbits without secular
 * orientation drift compute their basis once.
 */
export class KeplerOrbit {
  readonly elements: KeplerElements;
  readonly frame: Mat3;
  readonly isStatic: boolean;
  /**
   * Upper bound on how fast the orbit's geometry changes, as a fraction of
   * its size per day. Lets renderers decide how long a sampled path stays valid.
   */
  readonly geometryDriftPerDay: number;

  private readonly shape: OrbitShape = { a: 0, e: 0, b: 0, meanAnomaly: 0, P: [0, 0, 0], Q: [0, 0, 0] };
  private shapeTime = Number.NaN;

  constructor(elements: KeplerElements) {
    this.elements = elements;
    this.frame = elements.frame ?? IDENTITY;
    const rates = elements.rates;
    this.isStatic = !rates || (!rates.a && !rates.e && !rates.i && !rates.node && !rates.argPeri);
    this.geometryDriftPerDay = rates
      ? Math.abs(rates.a ?? 0) / Math.abs(elements.a)
        + Math.abs(rates.e ?? 0)
        + Math.abs(rates.i ?? 0)
        + Math.abs(rates.node ?? 0)
        + Math.abs(rates.argPeri ?? 0)
      : 0;
    if (this.isStatic) {
      this.setShape(elements.a, elements.e);
      orientationBasis(this.frame, elements.i, elements.node, elements.argPeri, this.shape);
    }
  }

  get isClosed(): boolean {
    return this.elements.e < 1;
  }

  /** Orbital period in days (Infinity for open orbits). */
  get period(): number {
    return this.isClosed ? TWO_PI / this.elements.meanMotion : Number.POSITIVE_INFINITY;
  }

  /** Farthest distance from the focus (Infinity for open orbits). */
  get apoapsis(): number {
    const { a, e } = this.elements;
    return e < 1 ? a * (1 + e) : Number.POSITIVE_INFINITY;
  }

  get periapsis(): number {
    const { a, e } = this.elements;
    return Math.abs(a) * Math.abs(1 - e);
  }

  private setShape(a: number, e: number): void {
    this.shape.a = a;
    this.shape.e = e;
    this.shape.b = Math.abs(a) * Math.sqrt(Math.abs((1 - e) * (1 + e)));
  }

  /** Orbit shape and orientation at time t (cached for the most recent t). */
  shapeAt(t: number): OrbitShape {
    if (t === this.shapeTime) return this.shape;
    const el = this.elements;
    const dt = t - el.epoch;
    let M = el.meanAnomaly + el.meanMotion * dt;
    if (el.meanAnomalyTerms) {
      const T = (t - J2000) / DAYS_PER_CENTURY;
      const { b, c, s, f } = el.meanAnomalyTerms;
      M += b * T * T + c * Math.cos(f * T) + s * Math.sin(f * T);
    }
    this.shape.meanAnomaly = M;
    if (!this.isStatic) {
      const rates = el.rates!;
      this.setShape(el.a + (rates.a ?? 0) * dt, el.e + (rates.e ?? 0) * dt);
      orientationBasis(
        this.frame,
        el.i + (rates.i ?? 0) * dt,
        el.node + (rates.node ?? 0) * dt,
        el.argPeri + (rates.argPeri ?? 0) * dt,
        this.shape
      );
    }
    this.shapeTime = t;
    return this.shape;
  }

  /** Position (km, ecliptic, relative to the focus) at time t, written to out[offset..offset+2]. */
  positionAt(t: number, out: Float64Array | number[], offset = 0): void {
    const { a, e, b, meanAnomaly, P, Q } = this.shapeAt(t);
    let x: number;
    let y: number;
    if (e < 1) {
      const E = solveElliptic(meanAnomaly, e);
      x = a * (Math.cos(E) - e);
      y = b * Math.sin(E);
    } else {
      const H = solveHyperbolic(meanAnomaly, e);
      x = -a * (e - Math.cosh(H));
      y = b * Math.sinh(H);
    }
    out[offset] = P[0] * x + Q[0] * y;
    out[offset + 1] = P[1] * x + Q[1] * y;
    out[offset + 2] = P[2] * x + Q[2] * y;
  }

  /** Eccentric (or hyperbolic) anomaly at time t. */
  anomalyAt(t: number): number {
    const { e, meanAnomaly } = this.shapeAt(t);
    return e < 1 ? solveElliptic(meanAnomaly, e) : solveHyperbolic(meanAnomaly, e);
  }

  /** Hyperbolic anomaly at which the distance from the focus equals r. */
  hyperbolicAnomalyAtRadius(r: number, t: number): number {
    const { a, e } = this.shapeAt(t);
    // r = |a|(e cosh H − 1)
    return Math.acosh(Math.max(1, (r / Math.abs(a) + 1) / e));
  }

  /**
   * Sample the projected (x, y) path at time t, uniformly in eccentric or
   * hyperbolic anomaly — dense where curvature is high at both apsides.
   * Closed orbits: `count` points around the full ellipse (the path closes
   * implicitly). Open orbits: `count` points over [fromAnomaly, toAnomaly].
   */
  samplePath(
    t: number,
    count: number,
    out: Float64Array,
    fromAnomaly = -Math.PI,
    toAnomaly = Math.PI
  ): void {
    const { a, e, b, P, Q } = this.shapeAt(t);
    const closed = e < 1;
    const step = closed ? TWO_PI / count : (toAnomaly - fromAnomaly) / (count - 1);
    for (let index = 0; index < count; index++) {
      const anomaly = fromAnomaly + index * step;
      let x: number;
      let y: number;
      if (closed) {
        x = a * (Math.cos(anomaly) - e);
        y = b * Math.sin(anomaly);
      } else {
        x = -a * (e - Math.cosh(anomaly));
        y = b * Math.sinh(anomaly);
      }
      out[index * 2] = P[0] * x + Q[0] * y;
      out[index * 2 + 1] = P[1] * x + Q[1] * y;
    }
  }
}

