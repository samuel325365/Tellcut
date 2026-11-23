// common.shader — a moving full-picture background drawn by a GPU shader (Paper Shaders: flowing mesh gradient, grainy gradient,
// god rays, smoke ring, warp, swirl, metaballs, orbiting dots; since 2026-11-15 also a glowing web, cells and a dithered warp). It lies
// under the video like common.ambient. The colours come from the theme unless given; the time is the item's own, so the same moment
// always draws the same frame. Without WebGL2 it draws a plain gradient of the same colours.
import { cssCamel, h, type ItemType } from '@tellcut/engine';
import { ditheringFragmentShader, DitheringShapes, DitheringTypes, dotOrbitFragmentShader, godRaysFragmentShader, grainGradientFragmentShader, GrainGradientShapes, meshGradientFragmentShader, metaballsFragmentShader, neuroNoiseFragmentShader, smokeRingFragmentShader, swirlFragmentShader, voronoiFragmentShader, warpFragmentShader, WarpPatterns } from '@paper-design/shaders';
import { noiseReady, renderShader, rgba, type Uniform } from './shader-gl.ts';
import { canvasAt, freeCanvas } from './inkline.ts';

export const LOOKS = ['mesh', 'grain', 'rays', 'smoke', 'warp', 'swirl', 'blobs', 'dots', 'neuro', 'cells', 'dither'] as const;
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
  // a web of glowing lines on back: the first colour the lines, the last the hot points where they cross; amount brightens the crossings
  neuro: { frag: neuroNoiseFragmentShader, speed: 1, max: 3, u: (c, b, a) => ({ ...PATTERN, u_colorBack: b, u_colorMid: c[0], u_colorFront: c[c.length - 1], u_brightness: 0.05 * a, u_contrast: 0.3 }) },
  // cells of the colours, back in the gaps between them; amount moves the cells' centres about, grain is a soft shade inside each cell
  cells: { frag: voronoiFragmentShader, speed: 0.5, max: 5, u: (c, b, a, p) => ({ ...PATTERN, u_scale: CELLS_SCALE, u_colors: c, u_colorsCount: c.length, u_stepsPerColor: 1, u_colorGlow: b, u_colorGap: b, u_distortion: Math.min(0.5, 0.4 * a), u_gap: 0.03, u_glow: p.grain, u_noiseTexture: 'noise' }) },
  // the first colour on back in ordered (4×4 Bayer) dither dots over a flowing warp, like an old one-bit screen; amount is the dot size
  dither: { frag: ditheringFragmentShader, speed: 1, max: 1, u: (c, b, a) => ({ ...PATTERN, u_scale: 0.6, u_colorBack: b, u_colorFront: c[0], u_shape: DitheringShapes.warp, u_type: DitheringTypes['4x4'], u_pxSize: ditherPx(a) }) },
};

/** cells' own zoom: Paper's preset (0.5) is drawn for a small canvas and gives a confetti of tiny cells on a 1080-px frame */
const CELLS_SCALE = 1.6;

/** dither's dot size (px at a 1080-px short side) for amount × 2: 2 at amount 0, 4 at 0.5, 6 at 1 */
export const ditherPx = (a: number) => 2 + 2 * Math.max(0, a);

/** the colours to use: the param's list, or the theme's accent, accent2, highlight and paper */
export function shaderColors(list: string, theme: { palette: Record<string, string> }, max: number): string[] {
  const own = list.split(/[,，]/).map((c) => c.trim()).filter(Boolean);
  const pal = theme.palette;
  return (own.length ? own : [pal.accent, pal.accent2, pal.hl, pal.paper].filter(Boolean)).slice(0, max);
}

/** what one frame draws at `local`: the look (an unknown one is mesh), its fragment shader, the colours used and every uniform */
export function shaderFrame(p: P, theme: { palette: Record<string, string> }, local: number): { look: Look; frag: string; names: string[]; uniforms: Record<string, Uniform> } {
  const look = DEF[p.look] ? p.look : 'mesh', d = DEF[look];
  const names = shaderColors(p.colors, theme, d.max), a = p.amount * 2;
  const uniforms: Record<string, Uniform> = { ...d.u(names.map(rgba), rgba(p.back), a, p), u_time: p.phase + local * p.speed * d.speed };
  uniforms.u_scale = (uniforms.u_scale as number) * p.scale;
  return { look, frag: d.frag, names, uniforms };
}

export const shader: ItemType<P, S> = {
  type: 'common.shader', label: '動態背景（GPU）', category: 'background', kind: 'scene',
  doc: '整片會流動的質感背景，GPU 即時畫；顏色預設取 theme，放在影片之下（片頭、片尾卡、沒素材的段落、面板底）',
  variants: { param: 'look', list: [
    { value: 'mesh', label: '流動漸層', doc: '幾個顏色像顏料一樣慢慢流動、互相暈開的柔和漸層；片頭、片尾卡、品牌感的底；amount 越大扭得越多，grain 加一層顆粒' },
    { value: 'grain', label: '顆粒漸層', doc: 'back 色的底，從角落湧出帶粗顆粒的彩色漸層、慢慢變形；有質感的片頭、沒素材的段落；grain 填 0 是它自己的顆粒量 0.25' },
    { value: 'rays', label: '光束', doc: 'back 色的底上，從上方一點放射下來的一束束光芒、帶光暈；舞台、宣布、頒獎的底' },
    { value: 'smoke', label: '煙圈', doc: 'back 色的底中間一圈彩色煙霧繞成的環，邊緣絲絲飄散；品牌、沉靜的段落底' },
    { value: 'warp', label: '扭曲格紋', doc: '格紋被扭轉、拉扯成大理石般流動的色塊，鋪滿整個畫面（不用 back）；熱鬧、迷幻的片頭或段落底' },
    { value: 'swirl', label: '漩渦', doc: '幾種顏色和 back 色的寬帶從中心轉出去的漩渦；復古、迷幻的片頭；grain 填 0 是它自己的顆粒量 0.2' },
    { value: 'blobs', label: '流體球', doc: 'back 色的底上幾顆彩色的流體球融在一起、慢慢變形；簡潔的片頭、片尾卡；amount 越大球越多' },
    { value: 'dots', label: '點陣軌道', doc: 'back 色的底上滿滿的彩色小圓點，各自繞著軌道轉；熱鬧、派對感的段落底；amount 越大散得越開' },
    { value: 'neuro', label: '發光神經網', doc: '深色底上一張會流動的發光細線網，交叉點特別亮；科技、AI、神經網路、深夜、懸疑的片頭或段落底；第一個顏色是線、最後一個是亮點，amount 越大交叉點越亮' },
    { value: 'cells', label: '細胞色塊', doc: '一格格不規則的色塊（像細胞或彩繪玻璃），慢慢蠕動，格子之間是 back 色的細縫；自然、生物、拼貼、活潑的資訊底；amount 越大格子越歪，grain 給每格一點往內的暗影' },
    { value: 'dither', label: '復古點陣', doc: '復古點陣：只用第一個顏色和 back 兩色，用規則排列的網點畫出一片流動的扭曲圖樣，像老電腦、Game Boy 的單色螢幕；復古、像素、遊戲、駭客、Lo-fi；amount 是網點大小' },
  ] },
  params: [
    { key: 'look', label: '樣式', type: 'enum', options: [...LOOKS], default: 'mesh' },
    { key: 'colors', label: '顏色（逗號分隔；空白＝theme 的主色、副色、強調色、紙色）', type: 'string', default: '' },
    { key: 'back', label: '底色（mesh、warp 不用；cells 是格子間的細縫）', type: 'color', default: '#101018', theme: 'palette.ink' },
    { key: 'speed', label: '速度（1＝原速，0＝不動）', type: 'number', min: 0, max: 4, step: 0.05, default: 1 },
    { key: 'amount', label: '強度（0 平靜 … 0.5 標準 … 1 強烈；dither 是網點大小）', type: 'number', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'grain', label: '顆粒（0–1；mesh、grain、swirl；grain、swirl 填 0 是樣式自己的顆粒量 0.25、0.2；cells 是每格往內的暗影）', type: 'number', min: 0, max: 1, step: 0.05, default: 0 },
    { key: 'scale', label: '圖樣大小', type: 'number', min: 0.2, max: 4, step: 0.05, default: 1 },
    { key: 'phase', label: '起始時間（秒；換一個就是另一個樣子）', type: 'number', min: 0, max: 1000, step: 1, default: 0 },
  ],
  // named sets of these params (engine templates.ts); their golden samples are shader-tpl-<id>
  templates: [
    { id: 'neuro-tech', label: '科技神經網', doc: '科技、AI、資料的段落底：深色底上一張發光的細線網，流動得比 look neuro 慢', params: { look: 'neuro', speed: 0.6 } },
    { id: 'cells-glass', label: '彩繪玻璃', doc: '手作、彩繪玻璃、藝術的底：比 look cells 更歪的一格格色塊，慢慢蠕動', params: { look: 'cells', amount: 0.7, speed: 0.5 } },
    { id: 'dither-retro', label: '復古點陣', doc: '復古遊戲、電子音樂的底：大一點的網點畫出大片流動的圖樣，像老電腦的單色螢幕', params: { look: 'dither', amount: 0.6, scale: 1.4 } },
    { id: 'smoke-slow', label: '沉靜煙霧', doc: '品牌、沉靜的段落底：煙圈放大到滿出畫面，煙霧鋪滿整個畫面、中間留一塊暗處，比 look smoke 平靜，慢慢飄', params: { look: 'smoke', speed: 0.4, amount: 0.35, scale: 2.75 } },
    { id: 'rays-stage', label: '舞台光束', doc: '舞台、宣布、頒獎的底：從上面打下來、比 look rays 更強的光束', params: { look: 'rays', amount: 0.8 } },
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
    const p = ctx.params, { W, H } = ctx, g = canvasAt(s.cv, W, H);
    const { look, frag, names, uniforms } = shaderFrame(p, ctx.theme as never, ctx.local);
    const frame = renderShader(look, frag, uniforms, W, H, Math.min(W, H) / 1080);
    g.clearRect(0, 0, W, H);
    if (frame) { g.drawImage(frame, 0, 0); return; }
    // no WebGL2: the same colours as a still gradient
    const lg = g.createLinearGradient(0, 0, W, H);
    [p.back, ...names].forEach((c, i, all) => lg.addColorStop(i / Math.max(1, all.length - 1), c));
    g.fillStyle = lg; g.fillRect(0, 0, W, H);
  },
};
