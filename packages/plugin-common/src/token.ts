// Token: a hand-drawn gold coin sticker (white sticker edge) with a marker label beside it. Promoted from a project's own effect
// (fx.wishcoin); still exported the way that file was, as an array of one block.
// It walks through "steps" (one per line: seconds|label|number on the coin|mark none/miss/made).
// When the label or number changes the coin flips over (the new face shows past the half turn);
// a mark change draws a red cross or a green tick over the coin stroke by stroke.
// Everything depends only on ctx.local.
import type { ItemType } from '@tellcut/engine';
import { loadLineFaces } from './brand-text.ts';

/** mark: none, miss (a red cross) or made (a green tick) */
interface Step { t: number; label: string; num: string; mark: string }
interface P { steps: string; x: number; y: number; size: number; enter: boolean; exit: boolean; gold: string; miss: string; made: string; ink: string }
/** the canvas, and the words its steps write (ready() loads a face for any the marker font has no letters for) */
interface S { c: HTMLCanvasElement; text: string }
type Pt = [number, number];

function parseTokenSteps(text: unknown): Step[] {
  const out: Step[] = [];
  for (const line of String(text || '').split('\n')) {
    const f = line.split('|').map((s) => s.trim());
    if (f.length < 2 || f[0] === '') continue;
    const t = Number(f[0]);
    if (!Number.isFinite(t)) continue;
    out.push({ t, label: f[1] || '', num: f[2] || '', mark: f[3] || 'none' });
  }
  out.sort((a, b) => a.t - b.t);
  if (!out.length) out.push({ t: 0, label: '', num: '', mark: 'none' });
  return out;
}

const FLIP = 0.42; // seconds of a coin flip
const STROKE = 0.16; // seconds per mark stroke
// the marker face, then Noto Sans TC for the Chinese and Japanese letters it has not (an English label draws all in the marker)
const MARKER = `"Permanent Marker", 'Noto Sans TC', sans-serif`;

function strokeLine(g: CanvasRenderingContext2D, pts: Pt[], p: number, width: number, color: string, edge: number) {
  // draw a polyline up to fraction p of its length, white edge under coloured ink
  if (p <= 0) return;
  let total = 0;
  const seg: number[] = [];
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
  let left = total * Math.min(1, p);
  const path: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length && left > 0; i++) {
    const d = seg[i - 1];
    if (left >= d) { path.push(pts[i]); left -= d; } else { const k = left / d; path.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k]); left = 0; }
  }
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [w, c] of [[width + edge * 2, '#ffffff'], [width, color]] as Array<[number, string]>) {
    g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length; i++) g.lineTo(path[i][0], path[i][1]);
    g.stroke();
  }
}

const token: ItemType<P, S> = {
  type: 'common.token', category: 'mark', label: '硬幣貼紙', kind: 'overlay',
  doc: '手繪金幣貼紙（白色貼紙邊、輕輕浮動）加旁邊一張白膠帶上的馬克筆標籤；steps 一行一步「秒|標籤|硬幣上的字|none/miss/made」：標籤或硬幣上的字換了，硬幣就翻面換成新的一面，miss 一筆一筆畫上紅叉、made 畫上綠勾（標籤字也變綠）；enter 彈出進場、exit 結尾縮回去；第幾次嘗試、許願、挑戰成功失敗、集點、關卡；配 common.coin（投幣）、common.error（失敗）、common.ding（成功）',
  params: [
    { key: 'steps', label: '步驟（每行：秒|標籤|硬幣上的字|none/miss/made）', type: 'text', default: '0|TRY #1|1|none\n0.8|TRY #1|1|miss\n1.5|TRY #2|2|none\n2.2|TRY #2|2|made' },
    { key: 'x', label: '硬幣中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.235 },
    { key: 'y', label: '硬幣中心 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.19 },
    { key: 'size', label: '硬幣直徑（畫面短邊比例）', type: 'number', min: 0.08, max: 0.4, step: 0.01, default: 0.2 },
    { key: 'enter', label: '彈出進場', type: 'bool', default: true },
    { key: 'exit', label: '結尾縮回去', type: 'bool', default: false },
    { key: 'gold', label: '金色', type: 'color', default: '#f2b632' },
    { key: 'miss', label: '叉的顏色', type: 'color', default: '#ff3b4f' },
    { key: 'made', label: '勾的顏色', type: 'color', default: '#22c55e' },
    { key: 'ink', label: '標籤字色', type: 'color', default: '#1a1a1a' },
  ],
  build({ root, W, H, params }) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    c.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
    root.appendChild(c);
    return { c, text: parseTokenSteps(params.steps).map((s) => `${s.label}${s.num}`).join('') };
  },
  async ready(s) {
    await Promise.all([
      document.fonts.load('400 60px "Permanent Marker"', 'COIN #12 WISH MADE'),
      loadLineFaces(document.fonts, [{ weight: 400, family: 'Permanent Marker', text: s.text }]),
    ]);
  },
  hide(state) { state.c.width = 0; state.c.height = 0; },
  draw(ctx, state) {
    const { local, dur, params, W, H, motion } = ctx;
    const c = state.c;
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const g = c.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
    const steps = parseTokenSteps(params.steps);

    // current step, the previous one (for flips) and when the current began
    let i = 0;
    for (let k = 0; k < steps.length; k++) if (local >= steps[k].t) i = k;
    const cur = steps[i];
    const prev = i > 0 ? steps[i - 1] : null;
    const since = local - cur.t;
    const faceChanged = !!prev && (prev.label !== cur.label || prev.num !== cur.num);

    // pop in / out
    let s = 1;
    if (params.enter) s *= Math.max(0, motion.spring({ duration: 0.45, bounce: 0.45 })(local));
    if (params.exit) s *= motion.interpolate([dur - 0.22, dur], [1, 0], { ease: motion.ease.in })(local);
    if (s <= 0.001) return;

    // flip: scaleX goes 1 → 0 (old face) → 1 (new face)
    let face = cur;
    let sx = 1;
    if (faceChanged && since < FLIP) {
      const p = since / FLIP;
      sx = Math.abs(Math.cos(p * Math.PI));
      if (p < 0.5) face = prev!;
    }
    // the mark: carried over from the old face during a flip only if it had one
    const markKind = face.mark;
    let markP = 1;
    // the first step's mark is already there; a later one draws in (after the flip, if the face changed)
    if (face === cur && prev && (prev.mark !== cur.mark || faceChanged)) {
      const start = faceChanged ? FLIP : 0;
      markP = Math.max(0, Math.min(1, (since - start) / (STROKE * 2)));
    }

    const u = Math.min(W, H);
    const R = (params.size * u) / 2;
    const cx = params.x * W;
    const cy = params.y * H;
    const bob = Math.sin(local * 2.2) * R * 0.03; // gentle float

    g.save();
    g.translate(cx, cy + bob);
    g.scale(s, s);
    g.rotate(-0.08);

    // label sticker to the right of the coin (drawn first so the coin overlaps its edge)
    const label = face.label;
    if (label) {
      const fs = Math.round(R * 0.7);
      g.font = `400 ${fs}px ${MARKER}`;
      g.textBaseline = 'middle'; g.textAlign = 'left';
      const tw = g.measureText(label).width;
      const lx = R * 0.78, ly = R * 0.06;
      const padX = fs * 0.45, padY = fs * 0.38;
      // white tape behind the label
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.28)'; g.shadowBlur = R * 0.12; g.shadowOffsetY = R * 0.05;
      g.fillStyle = '#ffffff';
      const bx = lx, by = ly - fs / 2 - padY, bw = tw + padX * 2 + R * 0.25, bh = fs + padY * 2, br = bh * 0.22;
      g.beginPath();
      g.moveTo(bx + br, by); g.lineTo(bx + bw - br, by); g.quadraticCurveTo(bx + bw, by, bx + bw, by + br);
      g.lineTo(bx + bw, by + bh - br); g.quadraticCurveTo(bx + bw, by + bh, bx + bw - br, by + bh);
      g.lineTo(bx + br, by + bh); g.quadraticCurveTo(bx, by + bh, bx, by + bh - br);
      g.lineTo(bx, by + br); g.quadraticCurveTo(bx, by, bx + br, by); g.closePath(); g.fill();
      g.restore();
      g.fillStyle = cur.mark === 'made' && face === cur ? params.made : params.ink;
      const tx = lx + R * 0.25 + padX, ty = ly + fs * 0.04;
      g.fillText(label, tx, ty);
      ctx.reportText(g, label, tx, ty);
    }

    // coin (flip squashes it horizontally)
    g.save();
    g.scale(Math.max(0.04, sx), 1);
    // white sticker edge + shadow
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = R * 0.18; g.shadowOffsetY = R * 0.07;
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, 0, R * 1.12, 0, Math.PI * 2); g.fill();
    g.restore();
    // rim
    const rim = g.createLinearGradient(-R, -R, R, R);
    rim.addColorStop(0, '#ffe27a'); rim.addColorStop(0.5, params.gold); rim.addColorStop(1, '#a86a12');
    g.fillStyle = rim; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
    // face
    const fc = g.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R * 0.85);
    fc.addColorStop(0, '#fff1b0'); fc.addColorStop(0.55, params.gold); fc.addColorStop(1, '#c58a1c');
    g.fillStyle = fc; g.beginPath(); g.arc(0, 0, R * 0.82, 0, Math.PI * 2); g.fill();
    // little dots round the rim
    g.fillStyle = 'rgba(120,70,10,0.45)';
    for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; g.beginPath(); g.arc(Math.cos(a) * R * 0.91, Math.sin(a) * R * 0.91, R * 0.025, 0, Math.PI * 2); g.fill(); }
    // number
    if (face.num) {
      const ns = Math.round(R * 1.0);
      g.font = `400 ${ns}px ${MARKER}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillText(face.num, R * 0.03, R * 0.07);
      g.fillStyle = '#7a4a08'; g.fillText(face.num, 0, R * 0.04);
      ctx.reportText(g, face.num, 0, R * 0.04);
    }
    // shine sweep
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.beginPath(); g.ellipse(-R * 0.35, -R * 0.42, R * 0.32, R * 0.12, -0.6, 0, Math.PI * 2); g.fill();
    g.restore();

    // mark over the coin, turning with it while it flips (sx is 1 otherwise)
    if (markKind === 'miss' || markKind === 'made') {
      g.save();
      g.scale(Math.max(0.04, sx), 1);
      const p1 = Math.min(1, markP * 2), p2 = Math.max(0, markP * 2 - 1);
      const w = R * 0.24, edge = R * 0.08;
      if (markKind === 'miss') {
        strokeLine(g, [[-R * 0.72, -R * 0.68], [R * 0.7, R * 0.74]], p1, w, params.miss, edge);
        strokeLine(g, [[R * 0.7, -R * 0.7], [-R * 0.68, R * 0.72]], p2, w, params.miss, edge);
      } else {
        strokeLine(g, [[-R * 0.62, R * 0.02], [-R * 0.16, R * 0.5]], p1, w, params.made, edge);
        strokeLine(g, [[-R * 0.16, R * 0.5], [R * 0.78, -R * 0.66]], p2, w, params.made, edge);
      }
      g.restore();
    }
    g.restore();
  },
};

export default [token];
