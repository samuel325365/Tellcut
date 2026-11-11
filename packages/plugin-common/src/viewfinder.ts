// common.viewfinder, the one-colour kit's (onecolor-kit.ts) frame for the whole film: corner brackets, a title and chapter line, a
// route and a shot counter, a tick ruler with a needle walking down. A pure function of time.
import { clamp, eOut3Clamped, type ItemType } from '@tellcut/engine';
import { canvasIn } from './desk-kit.ts';
import { canvasAt, freeCanvas } from './inkline.ts';
import { brackets, fontsReady, noSteps, sans, spaced, stepsOf, valueAt, type StepsMemo } from './onecolor-kit.ts';

/** the shot counter: how many of the cut times have come by `local` (at least 1) */
export function shotNo(cuts: string, local: number): { n: number; total: number } {
  const list = String(cuts).split(',').map((s) => s.trim()).filter(Boolean).map(Number).filter((v) => Number.isFinite(v));
  return { n: Math.max(1, list.filter((c) => c <= local + 1e-6).length), total: Math.max(1, list.length) };
}

interface VP { title: string; chapters: string; route: string; cuts: string; color: string; ink: string }
interface CS { c: HTMLCanvasElement }
export const viewfinder: ItemType<VP, CS & { steps: StepsMemo }> = {
  type: 'common.viewfinder', label: '取景框', category: 'frame', kind: 'overlay',
  doc: '整支片的取景框：四角 color 色的 L 角（開場長出來）、左上片名（title）和一行章節（chapters「秒|字」，項目內秒數，到點換字）、右上路線（route）和鏡頭計數（cuts 每次換鏡頭的秒數，逗號分隔，顯示「05 / 16」）、左邊一排刻度和一根跟著片子往下走的指針；小字是裝飾，不算字幕；配 common.grade、common.echo',
  params: [
    { key: 'title', label: '左上片名', type: 'string', default: 'EUROPE · 3 PLACES' },
    { key: 'chapters', label: '左上第二行（秒|字，一行一個）', type: 'text', default: '0|BY FOOT' },
    { key: 'route', label: '右上路線', type: 'string', default: 'PAR / KRK / EST' },
    { key: 'cuts', label: '換鏡頭的秒數（逗號分隔）', type: 'string', default: '0,1,2' },
    { key: 'color', label: '角和指針的顏色', type: 'color', default: '#ff5a1f', theme: 'palette.accent' },
    { key: 'ink', label: '小字顏色', type: 'color', default: '#ffffff' },
  ],
  build: (ctx) => ({ c: canvasIn(ctx.root), steps: noSteps() }),
  ready: () => fontsReady(''),
  hide: (s) => freeCanvas(s.c),
  draw(ctx, s) {
    const { local, dur, W, H, params: p } = ctx, u = Math.min(W, H) / 1080, g = canvasAt(s.c, W, H);
    const m = 34 * u;
    brackets(g, m, m, W - 2 * m, H - 2 * m, 54 * u * eOut3Clamped(local / 0.3), 5 * u, p.color);
    g.fillStyle = p.ink; g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 6 * u; g.textBaseline = 'alphabetic';
    const { n, total } = shotNo(p.cuts, local), pad = (v: number) => String(v).padStart(2, '0');
    const x0 = 72 * u, x1 = W - 72 * u, y0 = 92 * u, y1 = 122 * u;
    g.textAlign = 'left'; g.font = sans(24 * u); spaced(g, 4 * u); g.fillText(p.title, x0, y0);
    g.font = sans(19 * u, 600); spaced(g, 3 * u); g.fillText(valueAt(stepsOf(s.steps, p.chapters), local, ''), x0, y1);
    g.textAlign = 'right'; g.font = sans(24 * u); spaced(g, 4 * u); g.fillText(p.route, x1, y0);
    g.font = sans(19 * u, 600); spaced(g, 3 * u); g.fillText(`${pad(n)} / ${pad(total)}`, x1, y1);
    spaced(g, 0); g.shadowBlur = 0;
    const rx = 40 * u, ry0 = 0.22 * H, ry1 = 0.74 * H, step = 22 * u;
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0, y = ry0; y <= ry1; i++, y += step) g.fillRect(rx, y, (i % 5 ? 10 : 20) * u, 2 * u);
    g.fillStyle = p.color; g.fillRect(rx, ry0 + (ry1 - ry0) * clamp(local / dur), 28 * u, 5 * u);
  },
};
