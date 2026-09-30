/**
 * The synthetic Milky Way (see syntheticGalaxy.ts), drawn with WebGL on its
 * own canvas behind the main one: a few hundred thousand soft dots whose
 * light adds up, so dense regions — the bulge, the arms — glow.
 *
 * The layer thins out around the Sun, where the real stars take over.
 * Without WebGL it simply isn't drawn.
 */

import type { SyntheticStars } from "./syntheticGalaxy";

const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec4 a_color;
attribute float a_size;
uniform vec2 u_center;
uniform float u_scale;
uniform vec2 u_resolution;
uniform float u_pixelRatio;
uniform float u_alpha;
uniform vec2 u_sun;
uniform vec2 u_gap;
varying vec4 v_color;
void main() {
  vec2 screen = u_center + a_position * u_scale;
  vec2 clip = screen / u_resolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = max(1.0, a_size * u_pixelRatio);
  float gap = smoothstep(u_gap.x, u_gap.y, distance(screen, u_sun));
  v_color = vec4(a_color.rgb, a_color.a * u_alpha * gap);
}`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec4 v_color;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = v_color.a * (1.0 - smoothstep(0.5, 1.0, r));
  gl_FragColor = vec4(v_color.rgb * a, 1.0);
}`;

/** Dot opacity is full at this zoom (CSS px per kpc) and scales down when zoomed out. */
const DENSITY_REFERENCE_PX_PER_KPC = 60;
const INTENSITY = 0.55;

export interface GalaxyView {
  /** Galactic center on screen, CSS px. */
  centerX: number;
  centerY: number;
  /** CSS px per kpc. */
  scale: number;
  /** Viewport, CSS px, and device pixels per CSS px. */
  width: number;
  height: number;
  pixelRatio: number;
  /** Overall opacity (before the density correction). */
  alpha: number;
  /** The Sun on screen (CSS px), and the radii (CSS px) between which the layer fades in around it. */
  sunX: number;
  sunY: number;
  gapInner: number;
  gapOuter: number;
}

export class GalaxyGl {
  readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext | null;
  private program: WebGLProgram | null = null;
  private count = 0;
  private cleared = false;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();

  constructor(main: HTMLCanvasElement) {
    this.canvas = document.createElement("canvas");
    this.canvas.id = "galaxy-canvas";
    this.canvas.setAttribute("aria-hidden", "true");
    main.parentElement!.insertBefore(this.canvas, main);
    this.gl = this.canvas.getContext("webgl", { alpha: false, antialias: false, premultipliedAlpha: false, depth: false });
    if (this.gl) this.program = this.compile(this.gl);
  }

  get available(): boolean {
    return this.program !== null;
  }

  setStars(stars: SyntheticStars): void {
    const gl = this.gl;
    const program = this.program;
    if (!gl || !program) return;
    const attribute = (name: string, data: ArrayBufferView, size: number, type: number, normalized: boolean) => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const location = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, type, normalized, 0, 0);
    };
    gl.useProgram(program);
    attribute("a_position", stars.positions, 2, gl.FLOAT, false);
    attribute("a_color", stars.colors, 4, gl.UNSIGNED_BYTE, true);
    attribute("a_size", stars.sizes, 1, gl.FLOAT, false);
    this.count = stars.count;
  }

  draw(view: GalaxyView): void {
    const gl = this.gl;
    const program = this.program;
    if (!gl || !program) return;
    const width = Math.round(view.width * view.pixelRatio);
    const height = Math.round(view.height * view.pixelRatio);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.cleared = false;
    if (view.alpha <= 0 || this.count === 0) {
      this.cleared = true;
      return;
    }

    const r = view.pixelRatio;
    gl.useProgram(program);
    gl.uniform2f(this.uniform(program, "u_center"), view.centerX * r, view.centerY * r);
    gl.uniform1f(this.uniform(program, "u_scale"), view.scale * r);
    gl.uniform2f(this.uniform(program, "u_resolution"), width, height);
    gl.uniform1f(this.uniform(program, "u_pixelRatio"), r);
    // Zoomed out, many dots share each pixel and their light adds up: dim
    // each one in proportion, so the Galaxy glows without burning out.
    const density = Math.min(1, Math.max(0.12, (view.scale / DENSITY_REFERENCE_PX_PER_KPC) ** 1.2));
    gl.uniform1f(this.uniform(program, "u_alpha"), view.alpha * density * INTENSITY);
    gl.uniform2f(this.uniform(program, "u_sun"), view.sunX * r, view.sunY * r);
    gl.uniform2f(this.uniform(program, "u_gap"), view.gapInner * r, view.gapOuter * r);
    gl.enable(gl.BLEND);
    // Additive light; the canvas stays opaque.
    gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
    gl.drawArrays(gl.POINTS, 0, this.count);
  }

  /** Blank the layer (once) while it is not shown. */
  clear(): void {
    const gl = this.gl;
    if (!gl || this.cleared) return;
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.cleared = true;
  }

  private uniform(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    if (!this.uniforms.has(name)) this.uniforms.set(name, this.gl!.getUniformLocation(program, name));
    return this.uniforms.get(name)!;
  }

  private compile(gl: WebGLRenderingContext): WebGLProgram | null {
    const shader = (type: number, source: string) => {
      const compiled = gl.createShader(type)!;
      gl.shaderSource(compiled, source);
      gl.compileShader(compiled);
      if (!gl.getShaderParameter(compiled, gl.COMPILE_STATUS)) {
        console.error("Galaxy shader:", gl.getShaderInfoLog(compiled));
        return null;
      }
      return compiled;
    };
    const vertex = shader(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = shader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vertex || !fragment) return null;
    const program = gl.createProgram()!;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Galaxy program:", gl.getProgramInfoLog(program));
      return null;
    }
    return program;
  }
}
