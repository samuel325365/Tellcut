// One WebGL2 context for every shader block on the page (a page may hold only about 16): each block's frame is drawn here at an
// exact time, then copied onto the block's own 2D canvas. The fragment shaders are Paper Shaders' (@paper-design/shaders,
// Apache-2.0, see LICENSE.paper-shaders and NOTICE.paper-shaders); the time is ours, so the same moment always draws the same picture.
import { getShaderNoiseTexture } from '@paper-design/shaders';
import { parseColor } from './color.ts';
import { PAPER_VERTEX } from './shader-vertex.ts';

export type Uniform = number | number[] | number[][] | 'noise';
interface Gl { gl: WebGL2RenderingContext; cv: HTMLCanvasElement; programs: Map<string, { prog: WebGLProgram; loc: Map<string, WebGLUniformLocation | null> }>; noise: WebGLTexture | null }

let shared: Gl | null | undefined;
let noiseImg: HTMLImageElement | undefined;

/** the noise picture several shaders sample; resolves when it is decoded (ItemType.ready) */
export function noiseReady(): Promise<void> {
  noiseImg ??= getShaderNoiseTexture();
  const img = noiseImg;
  if (!img) return Promise.resolve();
  return img.complete && img.naturalWidth ? Promise.resolve() : img.decode().catch(() => {});
}

/** the shared context, or null where WebGL2 does not work (the block then draws a plain gradient) */
function context(): Gl | null {
  if (shared !== undefined) return shared;
  const cv = document.createElement('canvas'), gl = cv.getContext('webgl2', { preserveDrawingBuffer: true });
  if (!gl) return (shared = null);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  // a lost context (driver reset) is made again on the next draw
  cv.addEventListener('webglcontextlost', () => { shared = undefined; });
  return (shared = { gl, cv, programs: new Map(), noise: null });
}

function program(g: Gl, key: string, fragment: string) {
  const hit = g.programs.get(key);
  if (hit) return hit;
  const { gl } = g, sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`shader ${key}: ${gl.getShaderInfoLog(s)}`);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, PAPER_VERTEX)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fragment));
  gl.bindAttribLocation(prog, 0, 'a_position');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`shader ${key}: ${gl.getProgramInfoLog(prog)}`);
  const made = { prog, loc: new Map<string, WebGLUniformLocation | null>() };
  g.programs.set(key, made);
  return made;
}

function noiseTexture(g: Gl): WebGLTexture | null {
  if (g.noise || !noiseImg?.complete || !noiseImg.naturalWidth) return g.noise;
  const { gl } = g, tex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, noiseImg);
  return (g.noise = tex);
}

/** a colour as the shaders take it (rgba 0–1), read by the blocks' shared parser; one that can't be read is mid grey (as Paper Shaders) */
export const rgba = (c: string): number[] => { const x = parseColor(c); return x ? [x[0] / 255, x[1] / 255, x[2] / 255, x[3]] : [0.5, 0.5, 0.5, 1]; };

/**
 * Draw one frame of a fragment shader at `w`×`h` and return the canvas holding it (valid until the next call), or null without
 * WebGL2. `pixelRatio` scales the pattern sizes (1 for a 1080-px short side).
 */
export function renderShader(key: string, fragment: string, uniforms: Record<string, Uniform>, w: number, h: number, pixelRatio: number): HTMLCanvasElement | null {
  const g = context();
  if (!g) return null;
  const { gl, cv } = g, p = program(g, key, fragment);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  gl.viewport(0, 0, w, h);
  gl.useProgram(p.prog);
  const at = (name: string) => { if (!p.loc.has(name)) p.loc.set(name, gl.getUniformLocation(p.prog, name)); return p.loc.get(name)!; };
  gl.uniform2f(at('u_resolution'), w, h);
  gl.uniform1f(at('u_pixelRatio'), pixelRatio);
  for (const [name, v] of Object.entries(uniforms)) {
    const loc = at(name);
    if (!loc) continue;
    if (v === 'noise') { const tex = noiseTexture(g); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(loc, 0); }
    else if (typeof v === 'number') gl.uniform1f(loc, v);
    else if (Array.isArray(v[0])) gl.uniform4fv(loc, (v as number[][]).flat());
    else if ((v as number[]).length === 4) gl.uniform4fv(loc, v as number[]);
    else if ((v as number[]).length === 2) gl.uniform2fv(loc, v as number[]);
    else gl.uniform3fv(loc, v as number[]);
  }
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  return cv;
}
