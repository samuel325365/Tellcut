// common.echo, the one-colour kit's (onecolor-kit.ts) big word: a heavy slanted word with outlined copies stacked above and below it,
// a small number over its left end, turning white over the stretches common.grade makes one colour. A pure function of time.
import { eOut3Clamped, resolveTimes, type ItemType, type Project, type SceneItem } from '@tellcut/engine';
import { canvasIn } from './desk-kit.ts';
import { grade } from './grade.ts';
import { canvasAt, freeCanvas } from './inkline.ts';
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
interface EP { word: string; label: string; color: string; echo: string; echoes: number; size: number; y: number; steps: string; onMono: string }
/** the word's size fitted to the width and its width at that size, measured once per word, size and frame (and again once the fonts are in) */
interface EchoFit { key: string; px: number; ww: number }
export const echo: ItemType<EP, CS & { text: string; grades: GradeMemo; fit?: EchoFit }> = {
  type: 'common.echo', label: '回音大字', category: 'text', kind: 'overlay',
  doc: '畫面上一個粗窄斜體的大字（Anton），上下各疊 echoes 層空心的同一個字、開場從字的位置散開，字先大一點再落定；label 是字左上的小號碼（01、02，地點、章節）；字太寬自動縮到畫面寬 74%；畫面是單色（common.grade 的 mono）那幾段字和空心字換成 onMono 色（橘色畫面上的橘字會看不見）：steps 空著就照片子裡那一刻的 common.grade，要自己定才填 steps（這個項目自己的秒數；0|none＝永遠不換）；運動、旅行快剪的地名、動作字（RIDE、WALK、PARIS）',
  params: [
    { key: 'word', label: '大字', type: 'string', default: 'RIDE' },
    { key: 'label', label: '左上小號碼（空＝沒有）', type: 'string', default: '' },
    { key: 'color', label: '字色', type: 'color', default: '#ff5a1f', theme: 'palette.accent' },
    { key: 'echo', label: '空心字的顏色', type: 'color', default: '#ff5a1f', theme: 'palette.accent' },
    { key: 'echoes', label: '上下各幾層空心字', type: 'number', min: 0, max: 4, step: 1, default: 2 },
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
    const cx = W / 2, cy = p.y * H, k = eOut3Clamped(local / 0.3), gap = 0.8 * px * k;
    // the copies stay clear of the top's small lines (a viewfinder's) and of the captions' band
    g.save(); g.beginPath(); g.rect(0, 0.115 * H, W, 0.7 * H); g.clip();
    for (let j = Math.round(p.echoes); j >= 1; j--) {
      g.globalAlpha = (0.75 / j) * k;
      for (const d of [-1, 1]) slanted(g, p.word, cx, cy + d * j * gap, px, null, ecol, 3 * u);
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
