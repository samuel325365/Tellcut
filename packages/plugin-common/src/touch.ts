// common.touch — the "show touches" dots of a screen recording, from uk-album's fx.albumTouch (tap, drag, two-finger pinch), with the
// ripple of t2-search's finger and t2-line's touches. Each line of `touches` is one gesture, its times from the item's start and its
// points as fractions of the frame:
//   0.5|tap|0.5,0.4                    a tap
//   1.1-1.9|drag|0.3,0.6>0.7,0.6       a drag (any number of points, eased from one to the next)
//   2.2-2.8|pinch|0.5,0.5|0.4>0.15     two fingers on a diagonal through the point, their distance (short sides) going 0.4 → 0.15
//   1-1.8|press|0.5,0.5                a long press (the dot held, a ring filling while it is)
// The dot comes in 0.1 s before the touch and leaves 0.18 s after it; the ripple rings out from where the finger lands.
// It is drawn in the stage's top container, above every other item, like the phone's own indicator.
import { clamp, cssCamel, eIO3, h, lerp, prog, type ItemType } from '@tellcut/engine';
import { rippleAt } from './phone.ts';
import { nl } from './text.ts';
import { withAlpha } from './color.ts';
import { canvasAt, freeCanvas } from './inkline.ts';

export type Pt = [number, number];
export interface Touch { kind: 'tap' | 'drag' | 'pinch' | 'press'; t0: number; t1: number; pts: Pt[]; span: [number, number] }
interface P { touches: string | string[]; look: 'dot' | 'glow'; size: number; color: string; edge: string; ripple: boolean }
interface S { cv: HTMLCanvasElement }

const KINDS = ['tap', 'drag', 'pinch', 'press'] as const;
const pt = (s: string): Pt | null => { const [x, y] = String(s).split(/[,，]/).map(Number); return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null; };

/** the gestures of `touches` (one per line, or an array of lines); lines that do not read are dropped */
export function parseTouches(v: unknown): Touch[] {
  const lines = Array.isArray(v) ? v.map(String) : nl(v).split(/\n/);
  const out: Touch[] = [];
  for (const line of lines) {
    const [when = '', k = '', a = '', b = ''] = line.split('|').map((x) => x.trim());
    const kind = (KINDS as readonly string[]).includes(k) ? (k as Touch['kind']) : null;
    const m = when.match(/^(-?[\d.]+)\s*(?:[-~～–]\s*([\d.]+))?$/);
    if (!kind || !m) continue;
    const t0 = Number(m[1]), t1 = m[2] !== undefined ? Math.max(t0, Number(m[2])) : kind === 'press' ? t0 + 0.8 : kind === 'tap' ? t0 : t0 + 0.6;
    const pts = a.split('>').map(pt).filter((p): p is Pt => !!p);
    if (!pts.length || !Number.isFinite(t0)) continue;
    const [s0, s1] = b.split('>').map(Number);
    out.push({ kind, t0, t1: kind === 'tap' ? t0 : t1, pts: kind === 'drag' ? pts : [pts[0]], span: [Number.isFinite(s0) ? s0 : 0.4, Number.isFinite(s1) ? s1 : Number.isFinite(s0) ? s0 : 0.15] });
  }
  return out;
}

/** where a path is at progress q (0–1): the points spread evenly over the time, eased in and out between each two */
export function pathAt(pts: Pt[], q: number): Pt {
  if (pts.length < 2) return pts[0];
  const n = pts.length - 1, f = clamp(q) * n, i = Math.min(n - 1, Math.floor(f)), e = eIO3(f - i);
  return [lerp(pts[i][0], pts[i + 1][0], e), lerp(pts[i][1], pts[i + 1][1], e)];
}

/** the fingers of a gesture at time t (fractions of the frame; pinch distances in short sides): [x, y] each, or [] when not touching */
export function fingersAt(g: Touch, t: number, W: number, H: number): Pt[] {
  const q = g.t1 > g.t0 ? prog(t, g.t0, g.t1) : 1;
  if (g.kind !== 'pinch') return [pathAt(g.pts, q)];
  const d = lerp(g.span[0], g.span[1], eIO3(q)) * Math.min(W, H) / 2, [cx, cy] = g.pts[0], ux = d / Math.SQRT2 / W, uy = d / Math.SQRT2 / H;
  return [[cx - ux, cy - uy], [cx + ux, cy + uy]];
}

export const touch: ItemType<P, S> = {
  type: 'common.touch', label: '觸控點', category: 'mark', kind: 'overlay',
  doc: '螢幕錄影的「顯示觸控」圓點：touches 一行一個手勢「秒|tap|x,y」點一下、「秒-秒|drag|x,y>x,y」拖曳（可以很多點）、「秒-秒|pinch|x,y|0.4>0.15」兩指捏合（距離以短邊計，變大就是放大）、「秒-秒|press|x,y」長按；位置是畫面比例；手指落下時一圈漣漪（ripple）；look dot 是手機系統的灰色半透明圓點、glow 是白色發亮的指尖；畫在所有項目的最上面；操作手機、App 教學、相簿、聊天、搜尋的螢幕錄影',
  params: [
    { key: 'touches', label: '手勢（一行一個：秒|tap|x,y、秒-秒|drag|x,y>x,y、秒-秒|pinch|x,y|起距離>終距離、秒-秒|press|x,y）', type: 'text', default: '0.5|tap|0.5,0.38\n1.1-1.9|drag|0.3,0.6>0.7,0.6\n2.2-2.8|pinch|0.5,0.5|0.4>0.15' },
    { key: 'look', label: '樣子（dot 系統的灰色圓點、glow 白色發亮的指尖）', type: 'enum', options: ['dot', 'glow'], default: 'dot' },
    { key: 'size', label: '圓點半徑（以 1080 短邊計的 px）', type: 'number', min: 10, max: 120, step: 1, default: 46 },
    { key: 'color', label: '圓點顏色', type: 'color', default: '#e4e4ea' },
    { key: 'edge', label: '圓點外框顏色（dot）', type: 'color', default: '#3c3c43' },
    { key: 'ripple', label: '手指落下時的漣漪', type: 'bool', default: true },
  ],
  build(ctx) {
    const cv = h('canvas', null, null, ctx.top ?? ctx.root);
    cv.width = Math.round(ctx.W); cv.height = Math.round(ctx.H);
    cssCamel(cv, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    return { cv };
  },
  hide(s) { freeCanvas(s.cv); },
  draw(ctx, s) {
    const p = ctx.params, { W, H, local: t } = ctx, k = Math.min(W, H) / 1080, g = canvasAt(s.cv, W, H), glow = p.look === 'glow';
    g.clearRect(0, 0, s.cv.width, s.cv.height);
    const R = p.size * k, out = glow ? 0.3 : 0.18;
    for (const ges of parseTouches(p.touches)) {
      if (t < ges.t0 - 0.1 || t > Math.max(ges.t1 + out, ges.t0 + 0.5)) continue;
      // the dot: in over 0.1 s (a little bigger while it comes down), out over `out` after the finger lifts
      const a = Math.min(prog(t, ges.t0 - 0.1, ges.t0), 1 - prog(t, ges.t1, ges.t1 + out)), down = t >= ges.t0;
      const held = ges.kind === 'press' ? prog(t, ges.t0, ges.t1) : 0;
      for (const [fx, fy] of fingersAt(ges, t, W, H)) {
        const x = fx * W, y = fy * H;
        const rp = p.ripple && down ? rippleAt(t, ges.t0, R, k) : null;   // the ripple: a ring from the dot's edge outwards, fading
        if (rp) {
          g.strokeStyle = withAlpha(p.color, rp.a); g.lineWidth = rp.w;
          g.beginPath(); g.arc(x, y, rp.r, 0, Math.PI * 2); g.stroke();
        }
        if (a <= 0) continue;
        const r = R * (down ? 1 : 1.15 - 0.15 * a) * (glow ? 0.85 : 0.8 + 0.2 * a);
        g.globalAlpha = a;
        if (glow) {
          const grd = g.createRadialGradient(x, y, 0, x, y, r * 1.6);
          grd.addColorStop(0, withAlpha(p.color, 0.95)); grd.addColorStop(0.6, withAlpha(p.color, 0.85)); grd.addColorStop(0.62, withAlpha(p.color, 0.25)); grd.addColorStop(1, withAlpha(p.color, 0));
          g.fillStyle = grd; g.beginPath(); g.arc(x, y, r * 1.6, 0, Math.PI * 2); g.fill();
        } else {
          g.fillStyle = withAlpha(p.color, 0.55); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
          g.strokeStyle = withAlpha(p.edge, 0.55); g.lineWidth = 4 * k; g.stroke();
        }
        if (held > 0) {   // a long press: a ring filling round the dot while it is held
          g.strokeStyle = withAlpha(glow ? p.color : p.edge, 0.7); g.lineWidth = 5 * k;
          g.beginPath(); g.arc(x, y, r + 12 * k, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * held); g.stroke();
        }
        g.globalAlpha = 1;
      }
    }
  },
};
