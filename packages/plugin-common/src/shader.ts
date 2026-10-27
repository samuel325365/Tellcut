// common.shader — a moving full-picture background drawn by a GPU shader (Paper Shaders: flowing mesh gradient, grainy gradient,
// god rays, smoke ring, warp, swirl, metaballs, orbiting dots). It lies under the video like common.ambient. The colours come
// from the theme unless given; the time is the item's own, so the same moment always draws the same frame. Without WebGL2 it
// draws a plain gradient of the same colours.
import { cssCamel, h, type ItemType } from '@tellcut/engine';
import { dotOrbitFragmentShader, godRaysFragmentShader, grainGradientFragmentShader, GrainGradientShapes, meshGradientFragmentShader, metaballsFragmentShader, smokeRingFragmentShader, swirlFragmentShader, warpFragmentShader, WarpPatterns } from '@paper-design/shaders';
import { noiseReady, renderShader, rgba, type Uniform } from './shader-gl.ts';
import { canvasAt, freeCanvas } from './inkline.ts';

export const LOOKS = ['mesh', 'grain', 'rays', 'smoke', 'warp', 'swirl', 'blobs', 'dots'] as const;
export type Look = (typeof LOOKS)[number];
interface P { look: Look; colors: string; back: string; speed: number; amount: number; grain: number; scale: number; phase: number }
interface S { cv: HTMLCanvasElement }

/** sizing: an object fitted in the frame (contain) or a pattern laid at its own size (none) */
const OBJECT = { u_fit: 1, u_scale: 1, u_rotation: 0, u_originX: 0.5, u_originY: 0.5, u_offsetX: 0, u_offsetY: 0, u_worldWidth: 0, u_worldHeight: 0 };
const PATTERN = { ...OBJECT, u_fit: 0 };

/**
 * Each look: its shader, its own speed (Paper's default preset), and its uniforms from our few params. `a` is amount scaled so
 * 0.5 gives the preset (0 calm … 1 twice as strong); colours are rgba already.
 */
const DEF: Record<Look, { frag: string; speed: number; max: number; u: (c: number[][], back: number[], a: number, p: P) => Record<string, Uniform> }> = {
  mesh: { frag: meshGradientFragmentShader, speed: 1, max: 10, u: (c, _b, a, p) => ({ ...OBJECT, u_colors: c, u_colorsCount: c.length, u_distortion: Math.min(1, 0.8 * a), u_swirl: Math.min(1, 0.1 + 0.4 * Math.max(0, a - 1)), u_grainMixer: 0, u_grainOverlay: p.grain }) },
  grain: { frag: grainGradientFragmentShader, speed: 1, max: 7, u: (c, b, a, p) => ({ ...OBJECT, u_colorBack: b, u_colors: c, u_colorsCount: c.length, u_softness: 0.5, u_intensity: Math.min(1, 0.5 * a), u_noise: p.grain || 0.25, u_shape: GrainGradientShapes.corners, u_noiseTexture: 'noise' }) },
  rays: { frag: godRaysFragmentShader, speed: 0.75, max: 5, u: (c, b, a) => ({ ...OBJECT, u_offsetY: -0.55, u_colorBack: b, u_colorBloom: c[0], u_colors: c, u_colorsCount: c.length, u_density: 0.3, u_spotty: 0.3, u_midIntensity: 0.4, u_midSize: 0.2, u_intensity: Math.min(1, 0.8 * a), u_bloom: 0.4, u_noiseTexture: 'noise' }) },
  smoke: { frag: smokeRingFragmentShader, speed: 0.5, max: 10, u: (c, b, a) => ({ ...OBJECT, u_scale: 0.8, u_colorBack: b, u_colors: c, u_colorsCount: c.length, u_noiseScale: 3 * a, u_noiseIterations: 8, u_radius: 0.25, u_thickness: 0.65, u_innerShape: 0.7, u_noiseTexture: 'noise' }) },
  warp: { frag: warpFragmentShader, speed: 1, max: 10, u: (c, _b, a) => ({ ...PATTERN, u_colors: c, u_colorsCount: c.length, u_proportion: 0.45, u_softness: 1, u_distortion: Math.min(1, 0.25 * a), u_swirl: 0.8, u_swirlIterations: 10, u_shapeScale: 0.1, u_shape: WarpPatterns.checks, u_noiseTexture: 'noise' }) },
  swirl: { frag: swirlFragmentShader, speed: 0.32, max: 10, u: (c, b, a, p) => ({ ...OBJECT, u_colorBack: b, u_colors: c, u_colorsCount: c.length, u_bandCount: 4, u_twist: Math.min(1, 0.1 * a), u_center: 0.2, u_proportion: 0.5, u_softness: 0, u_noiseFrequency: 0.4, u_noise: p.grain || 0.2 }) },
  blobs: { frag: metaballsFragmentShader, speed: 1, max: 8, u: (c, b, a) => ({ ...OBJECT, u_colorBack: b, u_colors: c, u_colorsCount: c.length, u_count: Math.round(5 + 10 * Math.min(1, a / 2)), u_size: 0.83, u_noiseTexture: 'noise' }) },
  dots: { frag: dotOrbitFragmentShader, speed: 1.5, max: 10, u: (c, b, a) => ({ ...PATTERN, u_colorBack: b, u_colors: c, u_colorsCount: c.length, u_size: 1, u_sizeRange: 0, u_spreading: Math.min(1, a), u_stepsPerColor: 4, u_noiseTexture: 'noise' }) },
};

/** the colours to use: the param's list, or the theme's accent, accent2, highlight and paper */
export function shaderColors(list: string, theme: { palette: Record<string, string> }, max: number): string[] {
  const own = list.split(/[,，]/).map((c) => c.trim()).filter(Boolean);
  const pal = theme.palette;
  return (own.length ? own : [pal.accent, pal.accent2, pal.hl, pal.paper].filter(Boolean)).slice(0, max);
}

export const shader: ItemType<P, S> = {
  type: 'common.shader', label: '動態背景（GPU）', category: 'look', kind: 'scene',
  doc: '整片會流動的質感背景，GPU 即時畫：mesh 流動漸層、grain 顆粒漸層、rays 光束、smoke 煙圈、warp 扭曲格紋、swirl 漩渦、blobs 流體球、dots 點陣軌道；顏色預設取 theme，放在影片之下（片頭、片尾卡、沒素材的段落、面板底）',
  params: [
    { key: 'look', label: '樣式', type: 'enum', options: [...LOOKS], default: 'mesh' },
    { key: 'colors', label: '顏色（逗號分隔；空白＝theme 的主色、副色、強調色、紙色）', type: 'string', default: '' },
    { key: 'back', label: '底色（mesh、warp 不用）', type: 'color', default: '#101018', theme: 'palette.ink' },
    { key: 'speed', label: '速度（1＝原速，0＝不動）', type: 'number', min: 0, max: 4, step: 0.05, default: 1 },
    { key: 'amount', label: '強度（0 平靜 … 0.5 標準 … 1 強烈）', type: 'number', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'grain', label: '顆粒（0–1；mesh、grain、swirl；grain、swirl 填 0 是樣式自己的顆粒量 0.25、0.2）', type: 'number', min: 0, max: 1, step: 0.05, default: 0 },
    { key: 'scale', label: '圖樣大小', type: 'number', min: 0.2, max: 4, step: 0.05, default: 1 },
    { key: 'phase', label: '起始時間（秒；換一個就是另一個樣子）', type: 'number', min: 0, max: 1000, step: 1, default: 0 },
  ],
  build(ctx) {
    const cv = h('canvas', null, null, ctx.root);
    cv.width = ctx.W; cv.height = ctx.H;
    cssCamel(cv, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    return { cv };
  },
  ready: () => noiseReady(),
  hide(s) { freeCanvas(s.cv); },
  draw(ctx, s) {
    const p = ctx.params, d = DEF[p.look] ?? DEF.mesh, { W, H } = ctx, g = canvasAt(s.cv, W, H);
    const names = shaderColors(p.colors, ctx.theme as never, d.max), a = p.amount * 2;
    const uniforms: Record<string, Uniform> = { ...d.u(names.map(rgba), rgba(p.back), a, p), u_time: p.phase + ctx.local * p.speed * d.speed };
    uniforms.u_scale = (uniforms.u_scale as number) * p.scale;
    const frame = renderShader(p.look, d.frag, uniforms, W, H, Math.min(W, H) / 1080);
    g.clearRect(0, 0, W, H);
    if (frame) { g.drawImage(frame, 0, 0); return; }
    // no WebGL2: the same colours as a still gradient
    const lg = g.createLinearGradient(0, 0, W, H);
    [p.back, ...names].forEach((c, i, all) => lg.addColorStop(i / Math.max(1, all.length - 1), c));
    g.fillStyle = lg; g.fillRect(0, 0, W, H);
  },
};
