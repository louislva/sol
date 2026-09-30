/**
 * Least-squares fit of a precessing Keplerian orbit to sampled positions.
 *
 * Model (in a chosen reference frame, times in days from the epoch):
 *   mean longitude λ = λ0 + λ̇·dt
 *   longitude of periapsis ϖ = ϖ0 + ϖ̇·dt, eccentricity e constant
 *   ascending node Ω = Ω0 + Ω̇·dt, inclination i constant
 * parameterised with non-singular elements (h, k) = e(cos ϖ0, sin ϖ0) and
 * (p, q) = tan(i/2)(cos Ω0, sin Ω0) so near-circular and near-equatorial
 * orbits fit cleanly. This is exactly the model the app evaluates.
 */

export interface FitSample {
  dt: number; // days from epoch
  position: [number, number, number]; // km, reference frame
}

export interface MeanElements {
  a: number;
  e: number;
  i: number;        // rad
  node: number;     // rad at epoch
  argPeri: number;  // rad at epoch
  meanAnomaly: number; // rad at epoch
  meanMotion: number;  // rad/day (mean anomaly rate)
  nodeRate: number;    // rad/day
  argPeriRate: number; // rad/day
}

type Params = [number, number, number, number, number, number, number, number, number];
// a, λ0, λ̇, h, k, ϖ̇, p, q, Ω̇
const RATE_INDICES = [5, 8];

function solveKepler(M: number, e: number): number {
  let E = M + e * Math.sin(M);
  for (let iteration = 0; iteration < 30; iteration++) {
    const delta = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    E -= delta;
    if (Math.abs(delta) < 1e-14) break;
  }
  return E;
}

function modelPosition(params: Params, dt: number): [number, number, number] {
  const [a, lambda0, lambdaRate, h, k, periRate, p, q, nodeRate] = params;
  const e = Math.hypot(h, k);
  const peri = Math.atan2(k, h) + periRate * dt;
  const node = Math.atan2(q, p) + nodeRate * dt;
  const i = 2 * Math.atan(Math.hypot(p, q));
  const M = lambda0 + lambdaRate * dt - peri;
  const E = solveKepler(M, e);
  const x = a * (Math.cos(E) - e);
  const y = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const w = peri - node;
  const cosO = Math.cos(node);
  const sinO = Math.sin(node);
  const cosW = Math.cos(w);
  const sinW = Math.sin(w);
  const cosI = Math.cos(i);
  const sinI = Math.sin(i);
  return [
    (cosO * cosW - sinO * sinW * cosI) * x + (-cosO * sinW - sinO * cosW * cosI) * y,
    (sinO * cosW + cosO * sinW * cosI) * x + (-sinO * sinW + cosO * cosW * cosI) * y,
    sinW * sinI * x + cosW * sinI * y,
  ];
}

/** Osculating elements from a state vector (km, km/day), for the initial guess. */
export function stateToParams(r: number[], v: number[], mu: number): Params {
  const cross = (u: number[], w: number[]) => [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const dot = (u: number[], w: number[]) => u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
  const rMag = Math.hypot(r[0], r[1], r[2]);
  const vSq = dot(v, v);
  const h = cross(r, v);
  const hMag = Math.hypot(h[0], h[1], h[2]);
  const a = 1 / (2 / rMag - vSq / mu);
  const eVector = r.map((component, index) => ((vSq - mu / rMag) * component - dot(r, v) * v[index]) / mu);
  const e = Math.hypot(eVector[0], eVector[1], eVector[2]);
  const i = Math.acos(Math.max(-1, Math.min(1, h[2] / hMag)));
  const node = Math.atan2(h[0], -h[1]);
  const nodeVector = [Math.cos(node), Math.sin(node), 0];
  const inPlane = cross(h.map((component) => component / hMag), nodeVector);
  const argPeri = e > 1e-10 ? Math.atan2(dot(eVector, inPlane), dot(eVector, nodeVector)) : 0;
  const trueLongitude = Math.atan2(dot(r, inPlane), dot(r, nodeVector));
  const nu = trueLongitude - argPeri;
  const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
  const M = E - e * Math.sin(E);
  const peri = node + argPeri;
  return [
    a,
    peri + M,
    Math.sqrt(mu / a ** 3),
    e * Math.cos(peri),
    e * Math.sin(peri),
    0,
    Math.tan(i / 2) * Math.cos(node),
    Math.tan(i / 2) * Math.sin(node),
    0,
  ];
}

function residuals(params: Params, samples: readonly FitSample[], scale: number, window: number, out: number[]): void {
  let index = 0;
  for (const sample of samples) {
    const model = modelPosition(params, sample.dt);
    out[index++] = (model[0] - sample.position[0]) / scale;
    out[index++] = (model[1] - sample.position[1]) / scale;
    out[index++] = (model[2] - sample.position[2]) / scale;
  }
  // Weak regularization: precession rates the data cannot see (e.g. the
  // periapsis of a circular orbit) stay near zero.
  for (const rateIndex of RATE_INDICES) out[index++] = 1e-4 * params[rateIndex] * window;
}

/** Solve the square system A·x = b by Gaussian elimination with partial pivoting. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, index) => [...row, b[index]]);
  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) if (Math.abs(M[row][column]) > Math.abs(M[pivot][column])) pivot = row;
    if (Math.abs(M[pivot][column]) < 1e-300) return null;
    [M[column], M[pivot]] = [M[pivot], M[column]];
    for (let row = column + 1; row < n; row++) {
      const factor = M[row][column] / M[column][column];
      for (let k = column; k <= n; k++) M[row][k] -= factor * M[column][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = M[row][n];
    for (let k = row + 1; k < n; k++) sum -= M[row][k] * x[k];
    x[row] = sum / M[row][row];
  }
  return x;
}

/** Levenberg–Marquardt over the free parameters. */
function levenbergMarquardt(
  start: Params,
  samples: readonly FitSample[],
  free: readonly number[],
  window: number
): Params {
  let params = [...start] as Params;
  const scale = Math.abs(params[0]);
  const count = samples.length * 3 + RATE_INDICES.length;
  const r = new Array<number>(count).fill(0);
  const trial = new Array<number>(count).fill(0);
  const sumSquares = (values: number[]) => values.reduce((sum, value) => sum + value * value, 0);
  residuals(params, samples, scale, window, r);
  let cost = sumSquares(r);
  let damping = 1e-3;

  const steps = (index: number) => {
    const value = params[index];
    if (index === 0) return Math.abs(value) * 1e-7;
    if (index === 2 || index === 5 || index === 8) return 1e-9 + Math.abs(value) * 1e-7;
    return 1e-7;
  };

  for (let iteration = 0; iteration < 100; iteration++) {
    const J: number[][] = free.map(() => new Array<number>(count).fill(0));
    free.forEach((parameter, column) => {
      const step = steps(parameter);
      const plus = [...params] as Params;
      const minus = [...params] as Params;
      plus[parameter] += step;
      minus[parameter] -= step;
      const rPlus = new Array<number>(count).fill(0);
      const rMinus = new Array<number>(count).fill(0);
      residuals(plus, samples, scale, window, rPlus);
      residuals(minus, samples, scale, window, rMinus);
      for (let row = 0; row < count; row++) J[column][row] = (rPlus[row] - rMinus[row]) / (2 * step);
    });
    const JtJ = free.map((_, a) => free.map((__, b) => J[a].reduce((sum, value, row) => sum + value * J[b][row], 0)));
    const Jtr = free.map((_, a) => J[a].reduce((sum, value, row) => sum + value * r[row], 0));

    let improved = false;
    for (let attempt = 0; attempt < 12 && !improved; attempt++) {
      const A = JtJ.map((row, a) => row.map((value, b) => (a === b ? value * (1 + damping) + 1e-30 : value)));
      const delta = solveLinear(A, Jtr.map((value) => -value));
      if (!delta) {
        damping *= 10;
        continue;
      }
      const candidate = [...params] as Params;
      free.forEach((parameter, column) => { candidate[parameter] += delta[column]; });
      residuals(candidate, samples, scale, window, trial);
      const candidateCost = sumSquares(trial);
      if (Number.isFinite(candidateCost) && candidateCost < cost) {
        const relativeGain = (cost - candidateCost) / cost;
        params = candidate;
        r.splice(0, count, ...trial);
        cost = candidateCost;
        damping = Math.max(1e-12, damping / 5);
        improved = true;
        if (relativeGain < 1e-12) return params;
      } else {
        damping *= 8;
      }
    }
    if (!improved) break;
  }
  return params;
}

/**
 * Fit over progressively longer windows so the mean-longitude rate is never
 * ambiguous: each stage's rate estimate predicts the next window's phase to
 * well within half a revolution.
 * @param period approximate orbital period (days), for staging
 */
export function fitMeanElements(
  initial: Params,
  samples: readonly FitSample[],
  period: number
): { elements: MeanElements; rmsKm: number } {
  const span = Math.max(...samples.map((sample) => Math.abs(sample.dt)));
  let params = initial;
  let window = 3 * period;
  for (;;) {
    const inWindow = samples.filter((sample) => Math.abs(sample.dt) <= window * (1 + 1e-9));
    const free = window >= 20 * period ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : [0, 1, 2, 3, 4, 6, 7];
    if (inWindow.length >= 6) params = levenbergMarquardt(params, inWindow, free, window);
    if (window >= span) break;
    window = Math.min(span, window * 3);
  }

  let sumSquares = 0;
  for (const sample of samples) {
    const model = modelPosition(params, sample.dt);
    sumSquares += (model[0] - sample.position[0]) ** 2 + (model[1] - sample.position[1]) ** 2 + (model[2] - sample.position[2]) ** 2;
  }

  const [a, lambda0, lambdaRate, h, k, periRate, p, q, nodeRate] = params;
  const node = Math.atan2(q, p);
  const peri = Math.atan2(k, h);
  return {
    elements: {
      a,
      e: Math.hypot(h, k),
      i: 2 * Math.atan(Math.hypot(p, q)),
      node,
      argPeri: peri - node,
      meanAnomaly: lambda0 - peri,
      meanMotion: lambdaRate - periRate,
      nodeRate,
      argPeriRate: periRate - nodeRate,
    },
    rmsKm: Math.sqrt(sumSquares / samples.length),
  };
}

export type { Params };
