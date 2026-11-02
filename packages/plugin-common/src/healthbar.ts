// common.healthbar — a live-replay header with a game health bar, from the reaction-clip acceptance film's fx.livebar. The top row:
// a red LIVE pill with a blinking dot, a grey replay pill and a one-line title (any of them can be left out; all three empty drops the
// row). Under it a name and a segmented health bar that loses and regains HP over `stops` ("s:0–100", x = broken): a hit shakes the
// card and leaves a white trail that catches up; a heal flashes the cells white; a word on the right says how it stands (high, mid,
// low). The x stop shatters it: the cells fly apart, the frame turns red and dashed, and the last state word is stamped on.
// Drawn on a canvas (every word reported with ctx.reportText); draw(t) is a pure function of t. Sized by the short side.
import { clamp, cssCamel, type ItemType } from '@tellcut/engine';
import { canvasAt, freeCanvas } from './inkline.ts';
import { faceWeight } from './text.ts';

interface P { title: string; live: string; replay: string; label: string; states: string; stops: string; cells: number; x: number; y: number; w: number; font: string; accent: string; hl: string }
interface S { cv: HTMLCanvasElement; words: string }

export interface HpStop { t: number; v: number | 'x' }
/** "0:100, 2:60, 4:x" → stops sorted by time; values clamped to 0–100, x = broken */
export function parseHp(s: string): HpStop[] {
  return String(s ?? '').split(/[,，\n]/).map((x) => x.trim()).filter(Boolean).flatMap((x): HpStop[] => {
    const [a, b = ''] = x.split(':'), t = parseFloat(a);
    if (!Number.isFinite(t)) return [];
    if (b.trim().toLowerCase() === 'x') return [{ t, v: 'x' }];
    const v = parseFloat(b);
    return Number.isFinite(v) ? [{ t, v: clamp(v, 0, 100) }] : [];
  }).sort((p, q) => p.t - q.t);
}
const num = (v: number | 'x') => (v === 'x' ? 0 : v);
/** the HP at `time`: each stop eases from where the bar was (over 0.32 s; `lag` delays it and slows it to 0.7 s, the white trail) */
export function hpAt(stops: HpStop[], time: number, lag = 0, ease: (x: number) => number = (x) => 1 - (1 - x) ** 3) {
  let v = stops.length && stops[0].v !== 'x' ? stops[0].v : 100;
  for (let i = 1; i < stops.length; i++) {
    const s0 = stops[i].t + lag, d = lag ? 0.7 : 0.32;
    if (time <= s0) break;
    v += (num(stops[i].v) - v) * ease(Math.min(1, (time - s0) / d));
  }
  return v;
}
/** when the bar breaks (the first x stop), or undefined */
export const breakTime = (stops: HpStop[]) => stops.find((s) => s.v === 'x')?.t;
/** the latest hit's shake (px on a 1080 short side) and heal's flash (0–1), each fading over 0.6 s */
export function hitAt(stops: HpStop[], t: number) {
  let shake = 0, flash = 0;
  for (let i = 1; i < stops.length; i++) {
    const s = stops[i], prev = num(stops[i - 1].v), dt = t - s.t;
    if (dt < 0 || dt > 0.6) continue;
    if (s.v === 'x' || num(s.v) < prev) shake = Math.max(shake, (1 - dt / 0.6) * (s.v === 'x' ? 16 : 9));
    else flash = Math.max(flash, 1 - dt / 0.6);
  }
  return { shake, flash };
}
/** which state word (0 high, 1 mid, 2 low) and colour an HP shows */
export const hpBand = (hp: number) => (hp > 60 ? { i: 0, color: '#3ddc84' } : hp > 30 ? { i: 1, color: '#ffd23f' } : { i: 2, color: '#ff4d4f' });

export const healthbar: ItemType<P, S> = {
  type: 'common.healthbar', label: '直播抬頭＋血條', category: 'number', kind: 'overlay',
  doc: '直播回放的抬頭卡：上面一行紅色 LIVE 膠囊（點會閃）、灰色回放膠囊、一行題目（三個都可以空，全空就沒有這一行），下面一行名稱加一條分格的遊戲血條；stops「秒:血量 0–100」逗號分開，掉血時整張卡晃一下、白色殘血慢慢追上，回血時格子閃白，右邊的狀態字跟著血量換（states「高,中,低,碎」）；寫 x 的那一站血條碎掉：格子噴散、外框變紅虛線、蓋上最後一個狀態字（破防）；直播精華、反應片、挑戰、對決、撐不撐得住；y -1 貼著上方安全區；音效配 common.hit 或 common.thud（掉血）、common.glass（碎掉）',
  params: [
    { key: 'title', label: '題目（空＝沒有）', type: 'string', default: '挑戰：一小時不看手機' },
    { key: 'live', label: '紅膠囊的字（空＝沒有）', type: 'string', default: 'LIVE' },
    { key: 'replay', label: '灰膠囊的字（空＝沒有）', type: 'string', default: '回放' },
    { key: 'label', label: '血條名稱', type: 'string', default: '體力' },
    { key: 'states', label: '狀態字（高,中,低,碎）', type: 'string', default: '穩住,動搖,危險,破防' },
    { key: 'stops', label: '血量（秒:0–100，逗號分開；x＝碎掉）', type: 'text', default: '0:100, 1:60, 1.8:85, 2.4:20, 3.2:x' },
    { key: 'cells', label: '血條格數', type: 'number', min: 3, max: 20, step: 1, default: 10 },
    { key: 'x', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.5 },
    { key: 'y', label: '上緣（畫面高比例；-1＝貼著上方安全區）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'w', label: '寬（畫面短邊的比例）', type: 'number', min: 0.5, max: 1.6, step: 0.01, default: 0.9 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'accent', label: '主色（LIVE 膠囊、碎掉的外框和印章）', type: 'color', default: '#ff2d55', theme: 'palette.accent' },
    { key: 'hl', label: '血條名稱的顏色', type: 'color', default: '#ffd23f', theme: 'palette.hl' },
  ],
  build(ctx) {
    const cv = document.createElement('canvas');
    cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    ctx.root.appendChild(cv);
    const p = ctx.params;
    return { cv, words: [p.title, p.replay, p.label, p.states].join('') };
  },
  ready(s) {
    return Promise.all([document.fonts.load('700 52px "Noto Sans TC"', s.words), document.fonts.load('900 64px "Noto Sans TC"', s.words), document.fonts.load('700 48px "Inter"', 'LIVE')]).then(() => {});
  },
  hide(s) { freeCanvas(s.cv); },
  draw(ctx, s) {
    const { local: t, params: p, W, H, theme, motion } = ctx, g = canvasAt(s.cv, W, H), k = Math.min(W, H) / 1080;
    const font = (wt: number, px: number) => `${wt} ${px}px '${p.font}', 'Noto Sans TC', sans-serif`;
    const say = (text: string, x: number, y: number) => { g.fillText(text, x, y); ctx.reportText(g, text, x, y); };
    const stops = parseHp(p.stops), breakAt = breakTime(stops), broken = breakAt !== undefined && t >= breakAt;
    const hp = hpAt(stops, t, 0, motion.ease.out), ghost = Math.max(hp, hpAt(stops, t, 0.35, motion.ease.out)), { shake, flash } = hitAt(stops, t);
    const sx = shake * Math.sin(t * 70) * k, sy = shake * 0.5 * Math.cos(t * 55) * k;
    // the card: the header row only when it has something in it
    const head = !!(p.live || p.replay || p.title), safeW = W * (1 - 2 * theme.safe.side);
    const w = Math.min(p.w * Math.min(W, H), safeW), hh = (head ? 206 : 116) * k, r = 30 * k;
    const enter = motion.ease.out(Math.min(1, t / 0.18));
    const x0 = clamp(p.x * W - w / 2, theme.safe.side * W, (1 - theme.safe.side) * W - w) + sx;
    const y0 = (p.y >= 0 ? p.y * H : theme.safe.top * H) - (1 - enter) * 24 * k + sy;
    g.save(); g.globalAlpha = enter; g.textBaseline = 'middle'; g.textAlign = 'left';
    const rr = (x: number, y: number, ww: number, h: number, rad: number) => { g.beginPath(); g.roundRect(x, y, ww, h, rad); };
    rr(x0, y0, w, hh, r); g.fillStyle = 'rgba(12,12,18,0.62)'; g.fill();
    if (broken) { g.lineWidth = 5 * k; g.strokeStyle = p.accent; g.globalAlpha = enter * (0.55 + 0.45 * Math.sin((t - breakAt!) * 6)); g.stroke(); g.globalAlpha = enter; }

    // the header row: LIVE pill (a blinking dot), the replay pill, the title shrunk to the room left
    if (head) {
      const row1 = y0 + 22 * k, ph = 60 * k, mid = row1 + ph / 2 + 2 * k;
      let x = x0 + 24 * k;
      if (p.live) {
        g.font = `700 ${46 * k}px Inter, 'Noto Sans TC', sans-serif`;
        const lw = g.measureText(p.live).width + 78 * k;
        rr(x, row1, lw, ph, ph / 2); g.fillStyle = p.accent; g.fill();
        g.fillStyle = `rgba(255,255,255,${0.55 + 0.45 * Math.sin(t * 5)})`; g.beginPath(); g.arc(x + 32 * k, row1 + ph / 2, 10 * k, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ffffff'; say(p.live, x + 54 * k, mid);
        x += lw + 12 * k;
      }
      if (p.replay) {
        g.font = font(700, 48 * k);
        const rw = g.measureText(p.replay).width + 36 * k;
        rr(x, row1, rw, ph, ph / 2); g.fillStyle = 'rgba(255,255,255,0.22)'; g.fill();
        g.fillStyle = '#ffffff'; say(p.replay, x + 18 * k, mid);
        x += rw + 22 * k;
      }
      if (p.title) {
        g.font = font(700, 52 * k);
        const room = x0 + w - 24 * k - x, tw = g.measureText(p.title).width;
        if (tw > room) g.font = font(700, Math.max(26 * k, (52 * k * room) / tw));
        g.fillStyle = '#ffffff'; say(p.title, x, mid);
      }
    }

    // the bar row: the name, the cells, the state word
    const row2 = y0 + (head ? 112 : 26) * k, bh = 64 * k, mid2 = row2 + bh / 2 + 2 * k;
    g.font = font(700, 48 * k); g.fillStyle = p.hl;
    if (p.label) say(p.label, x0 + 24 * k, mid2);
    const labW = p.label ? g.measureText(p.label).width + 22 * k : 0, states = String(p.states ?? '').split(/[,，]/).map((x) => x.trim());
    const N = clamp(Math.round(p.cells) || 10, 3, 20), wordX = x0 + w - 24 * k - 75 * k;
    const bx = x0 + 24 * k + labW, bw = Math.max(N * 8 * k, x0 + w - 24 * k - 150 * k - bx), by = row2 + 8 * k, bb = bh - 16 * k;
    const gap = 6 * k, sw = (bw - gap * (N - 1)) / N, band = hpBand(hp), per = 100 / N;
    if (!broken) {
      for (let i = 0; i < N; i++) {
        const cx = bx + i * (sw + gap), segG = clamp(ghost / per - i), segH = clamp(hp / per - i);
        g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(cx, by, sw, bb);
        if (segG > 0) { g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(cx, by, sw * segG, bb); }
        if (segH > 0) {
          g.fillStyle = band.color; g.fillRect(cx, by, sw * segH, bb);
          if (flash > 0) { g.globalAlpha = enter * flash; g.fillStyle = '#ffffff'; g.fillRect(cx, by, sw * segH, bb); g.globalAlpha = enter; }
        }
      }
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 3 * k; g.strokeRect(bx - 5 * k, by - 5 * k, bw + 10 * k, bb + 10 * k);
      const word = states[band.i] ?? '';
      if (word) { g.font = font(900, 50 * k); g.fillStyle = band.color; g.textAlign = 'center'; say(word, wordX, mid2); g.textAlign = 'left'; }
    } else {
      // broken: the cells fly apart, spin and fade; the empty frame turns red and dashed
      const dt = t - breakAt!;
      let seed = 977;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < N; i++) {
        const vx = (rnd() - 0.5) * 900 * k, vy = -(200 + rnd() * 500) * k, rot = (rnd() - 0.5) * 9, a = Math.max(0, 1 - dt / 0.9);
        if (a <= 0) continue;
        g.save(); g.globalAlpha = enter * a;
        g.translate(bx + i * (sw + gap) + sw / 2 + vx * dt, by + bb / 2 + vy * dt + 1400 * k * dt * dt); g.rotate(rot * dt);
        g.fillStyle = '#ff4d4f'; g.fillRect(-sw / 2, -bb / 2, sw, bb); g.restore();
      }
      g.strokeStyle = p.accent; g.lineWidth = 3 * k; g.setLineDash([14 * k, 10 * k]);
      g.strokeRect(bx - 5 * k, by - 5 * k, bw + 10 * k, bb + 10 * k); g.setLineDash([]);
      // the last state word stamped on
      const word = states[3] ?? '';
      if (word) {
        const sc = 1.9 - 0.9 * motion.spring({ duration: 0.45, bounce: 0.45 })(dt);
        g.save(); g.translate(wordX, row2 + bh / 2); g.rotate(-0.12); g.scale(sc, sc);
        // stroked: a weight the font really has (a fake bold's outline shows rings)
        g.font = font(faceWeight(p.font, 900), 60 * k); g.textAlign = 'center';
        g.lineWidth = 10 * k; g.strokeStyle = '#ffffff'; g.lineJoin = 'round'; g.strokeText(word, 0, 2 * k);
        g.fillStyle = p.accent; say(word, 0, 2 * k);
        g.restore();
      }
    }
    g.restore();
  },
};
