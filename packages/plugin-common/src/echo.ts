// common.echo, the one-colour kit's (onecolor-kit.ts) big word: a heavy slanted word with outlined copies stacked above and below it,
// a small number over its left end, turning white over the stretches common.grade makes one colour. A pure function of time.
// 2026-11-24: `look` places the outlined copies another way: a depth trail behind the word (trail), a ripple of ever larger copies
// round it (zoom), or the stack swaying in a travelling wave (wave); `echoCopies` says where each copy is at a moment.
import { eOut3Clamped, resolveTimes, type ItemType, type Project, type SceneItem } from '@tellcut/engine';
import { grade } from './grade.ts';
import { canvasAt, freeCanvas, canvasIn } from './inkline.ts';
import { disp, fitted, fontsReady, noSteps, parseValueSteps, said, slanted, stepsOf, valueAt, type StepsMemo } from './onecolor-kit.ts';

interface CS { c: HTMLCanvasElement }
/** the film's grade items with their steps, read once per project (an edit hands the stage a new project object) */
export interface GradeMemo { project?: Project; grades?: Array<{ start: number; end: number; steps: Array<{ t: number; v: string }> }>; own?: StepsMemo }
/** Whether the picture under an echo is one colour at film time `t` (`local` its own seconds): its own steps when given, else the
 *  film's common.grade at that moment (the last one listed, the top one, when two overlap), in the grade's own seconds. Leaving the
 *  steps out is then right: an echo written over a grade turns onMono on the grade's mono stretches without copying its steps. */
export function echoMono(m: GradeMemo, project: Project | undefined, steps: string, t: number, local: number): boolean {
  if (String(steps ?? '').trim()) return valueAt(stepsOf(m.own ??= noSteps(), steps), local) === 'mono';
  if (!project?.tracks) return false;
  if (m.project !== project) {
    const times = resolveTimes(project), def = grade.params.find((d) => d.key === 'steps')!.default as string;
    m.project = project;
    m.grades = project.tracks.flatMap((tr) => (tr.items as SceneItem[]).filter((it) => it.type === grade.type && times.has(it.id)).map((it) => ({
      ...times.get(it.id)!, steps: parseValueSteps(typeof it.params?.steps === 'string' ? it.params.steps : def) })));
  }
  const on = (m.grades ?? []).filter((g) => t >= g.start - 1e-6 && t < g.end - 1e-6).pop();
  return !!on && valueAt(on.steps, t - on.start) === 'mono';
}
export type EchoLook = 'stack' | 'trail' | 'zoom' | 'wave';
export interface EchoCopy { dx: number; dy: number; scale: number; alpha: number }
const TAU = Math.PI * 2;
/** The outlined copies of a look at `local`, in drawing order (the farthest first): each one's offset from the word's centre (px),
 *  its size as a multiple of the word's and its opacity. `echoes` is the copies a side in stack and wave, the copies in all in
 *  trail and zoom; `px` the word's size. A pure function of its arguments. */
export function echoCopies(look: EchoLook, echoes: number, local: number, px: number): EchoCopy[] {
  const n = Math.round(echoes), out: EchoCopy[] = [];
  if (look === 'trail') {   // behind the word, each a step further down and to the right and fainter, slid out from under it
    for (let j = n; j >= 1; j--) {
      const k = eOut3Clamped((local - 0.05 * (j - 1)) / 0.4);
      out.push({ dx: 0.15 * px * j * k, dy: 0.12 * px * j * k, scale: 1, alpha: (0.95 / Math.pow(j, 0.6)) * Math.min(1, k * 3) });
    }
    return out;
  }
  if (look === 'zoom') {   // on the word's centre, ever larger and fainter (1.25×, 1.55×, 1.9×, 2.3×), pushed out and then breathing
    for (let j = n; j >= 1; j--) {
      const k = eOut3Clamped((local - 0.06 * (j - 1)) / 0.5), size = 0.25 * j + 0.025 * j * (j - 1);
      const breath = 1 + 0.035 * Math.sin(TAU * 0.5 * local - j * 0.8) * k;
      out.push({ dx: 0, dy: 0, scale: (1 + size * k) * breath, alpha: (0.7 / Math.pow(j, 0.75)) * k });
    }
    return out;
  }
  // stack (and wave, which sways it): above and below, spread out from the word at the start
  const k = eOut3Clamped(local / 0.3), gap = 0.8 * px * k;
  for (let j = n; j >= 1; j--) {
    const alpha = (0.75 / j) * k, dx = look === 'wave' ? 0.2 * px * k * Math.sin(TAU * 0.6 * local - j * 1.5) : 0;
    for (const d of [-1, 1]) out.push({ dx, dy: d * j * gap, scale: 1, alpha });
  }
  return out;
}
interface EP { word: string; look: EchoLook; label: string; color: string; echo: string; echoes: number; size: number; y: number; steps: string; onMono: string }
/** the word's size fitted to the width and its width at that size, measured once per word, size and frame (and again once the fonts are in) */
interface EchoFit { key: string; px: number; ww: number }
export const echo: ItemType<EP, CS & { text: string; grades: GradeMemo; fit?: EchoFit }> = {
  type: 'common.echo', label: '回音大字', category: 'text', kind: 'overlay',
  doc: '畫面上一個粗窄斜體的大字（Anton），旁邊幾層空心的同一個字（look 選怎麼排，echoes 幾層），字先大一點再落定；label 是字左上的小號碼（01、02，地點、章節）；字太寬自動縮到畫面寬 74%；畫面是單色（common.grade 的 mono）那幾段字和空心字換成 onMono 色（橘色畫面上的橘字會看不見）：steps 空著就照片子裡那一刻的 common.grade，要自己定才填 steps（這個項目自己的秒數；0|none＝永遠不換）；運動、旅行快剪的地名、動作字（RIDE、WALK、PARIS）',
  variants: { param: 'look', list: [
    { value: 'stack', label: '上下疊', doc: '字的上下各疊 echoes 層空心的同一個字，開場從字的位置散開，越外層越淡；預設的回音字，地名、動作字、章節開頭' },
    { value: 'trail', label: '拖影', doc: '空心字躲在字的後面，一層比一層往右下偏、越來越淡，開場從字底下滑出來，像有厚度的立體拖影；衝出去、速度感、要有份量的標題；echoes 是總共幾層' },
    { value: 'zoom', label: '擴散', doc: '空心字和字同一個中心，一層比一層大（約 1.25、1.55、1.9 倍）、越來越淡，開場往外推開再慢慢呼吸，像字周圍的漣漪；重音、震撼、心跳、要大家看這個字；echoes 是總共幾層' },
    { value: 'wave', label: '波浪', doc: '上下疊的空心字左右擺動，一層比一層慢半拍，像一道往外傳的波，實心字不動；音樂、海、搖擺、輕鬆的段落；echoes 是上下各幾層' },
  ] },
  params: [
    { key: 'word', label: '大字', type: 'string', default: 'RIDE' },
    { key: 'look', label: '樣子', type: 'enum', options: ['stack', 'trail', 'zoom', 'wave'], default: 'stack' },
    { key: 'label', label: '左上小號碼（空＝沒有）', type: 'string', default: '' },
    { key: 'color', label: '字色', type: 'color', default: '#ff5a1f', theme: 'palette.accent' },
    { key: 'echo', label: '空心字的顏色', type: 'color', default: '#ff5a1f', theme: 'palette.accent' },
    { key: 'echoes', label: '空心字層數（stack、wave 上下各幾層；trail、zoom 總共幾層）', type: 'number', min: 0, max: 4, step: 1, default: 2 },
    { key: 'size', label: '字高（以 1080 短邊計的 px）', type: 'number', min: 60, max: 600, step: 5, default: 250 },
    { key: 'y', label: '中心高度（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.26 },
    { key: 'steps', label: '調色（秒|bw／mono／none，項目內秒數；空＝跟著片子的 common.grade）', type: 'text', default: '' },
    { key: 'onMono', label: '單色畫面上的字色', type: 'color', default: '#ffffff' },
  ],
  build: (ctx) => ({ c: canvasIn(ctx.root), text: `${ctx.params.word}${ctx.params.label}`, grades: {} }),
  ready: (s) => fontsReady(s.text).then(() => { s.fit = undefined; }),
  hide: (s) => freeCanvas(s.c),
  draw(ctx, s) {
    const { local, W, H, params: p } = ctx, u = Math.min(W, H) / 1080, g = canvasAt(s.c, W, H);
    const key = `${p.word}|${p.size * u}|${W}`;
    if (s.fit?.key !== key) { const px = fitted(g, p.word, p.size * u, 0.74 * W); g.font = disp(px); s.fit = { key, px, ww: g.measureText(p.word).width }; }
    const { px, ww } = s.fit, mono = echoMono(s.grades, ctx.project, p.steps, ctx.t, local);
    const col = mono ? p.onMono : p.color, ecol = mono ? p.onMono : p.echo;
    const cx = W / 2, cy = p.y * H;
    // the copies stay clear of the top's small lines (a viewfinder's) and of the captions' band
    g.save(); g.beginPath(); g.rect(0, 0.115 * H, W, 0.7 * H); g.clip();
    for (const e of echoCopies(p.look ?? 'stack', p.echoes, local, px)) {
      g.globalAlpha = e.alpha;
      slanted(g, p.word, cx + e.dx, cy + e.dy, px * e.scale, null, ecol, 3 * u);
    }
    g.restore();
    const big = px * (1 + 0.12 * (1 - eOut3Clamped(local / 0.18)));
    slanted(g, p.word, cx, cy, big, col);
    said(ctx, g, p.word, cx, cy, big);
    if (p.label) {
      const lpx = 70 * u, lx = Math.max(0.12 * W + 40 * u, cx - ww / 2 + 40 * u), ly = cy - 0.62 * px;
      slanted(g, p.label, lx, ly, lpx, col);
      said(ctx, g, p.label, lx, ly, lpx);
    }
  },
};
