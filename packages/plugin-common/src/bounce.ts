// common.bounce — big kinetic type: words entering character by character on the beat, from the outdoor-brand acceptance film's
// fx.words (its tide line, float and brand colours left behind). Each line of `items` is one phrase with its own time, size, colour,
// place and way of entering: drop (falls in and squashes), pop (springs up from nothing), slam (lands from big), float (rises and
// drifts up), sway (pops, then rocks) and knock: a sheet over the frame with the letters cut out of it, the video showing through
// them. Per phrase: `jump` makes it hop at given seconds, `sink` drops its 【stressed】 characters off the bottom, `out` pops it away,
// `wob` wobbles it once landed, `shadow` and `scrim` set it off from bright footage.
// Drawn on a canvas (each phrase reported with ctx.reportText); draw(t) is a pure function of t. Sized by the short side.
import { clamp, type ItemType, type MotionKit } from '@tellcut/engine';
import { canvasAt, freeCanvas } from './inkline.ts';
import { isClear } from './color.ts';
import { faceWeight } from './text.ts';

export type BounceMode = 'drop' | 'pop' | 'slam' | 'float' | 'sway' | 'knock';
const MODES: BounceMode[] = ['drop', 'pop', 'slam', 'float', 'sway', 'knock'];
interface P { items: string; font: string; color: string; hl: string; outline: string; hlScale: number; sheet: string; sheetTo: number }
interface S { cv: HTMLCanvasElement; words: string; font: string }

export interface BounceChar { ch: string; em: boolean }
export interface BounceItem { at: number; text: string; chars: BounceChar[]; size: number; color: string; x: number; y: number; mode: BounceMode; kv: Record<string, string> }

/** "秒|文字|大小|顏色|x|y|模式|key=value;key=value" per line → phrases; 【】 marks the stressed characters, blank fields take defaults
 *  (size 200, the block's colour, x 0.5, y 0.5, drop) */
export function parseBounce(s: string): BounceItem[] {
  return String(s ?? '').split('\n').map((l) => l.trim()).filter(Boolean).flatMap((l): BounceItem[] => {
    const [at, text = '', size, color, x, y, mode, extra] = l.split('|').map((f) => f.trim());
    const t = parseFloat(at);
    if (!Number.isFinite(t) || !text) return [];
    const kv: Record<string, string> = {};
    for (const part of String(extra ?? '').split(/[;；]/)) { const [k, v] = part.split('='); if (k?.trim()) kv[k.trim()] = (v ?? '1').trim(); }
    const chars: BounceChar[] = [];
    let em = false;
    for (const ch of text) { if (ch === '【') { em = true; continue; } if (ch === '】') { em = false; continue; } chars.push({ ch, em }); }
    const num = (v: string | undefined, d: number) => { const n = parseFloat(v ?? ''); return Number.isFinite(n) ? n : d; };
    return [{ at: t, text: chars.map((c) => c.ch).join(''), chars, size: Math.max(10, num(size, 200)), color: color ?? '', x: num(x, 0.5), y: num(y, 0.5),
      mode: MODES.includes(mode as BounceMode) ? (mode as BounceMode) : 'drop', kv }];
  });
}

export interface Pose { dx: number; dy: number; sx: number; sy: number; rot: number; a: number }
/** character i's pose at the item's time t (null before it enters); offsets in px at a 1080 short side */
export function charPose(it: BounceItem, i: number, t: number, motion: Pick<MotionKit, 'spring'>): Pose | null {
  const st = it.kv.stagger !== undefined ? +it.kv.stagger || 0 : it.mode === 'float' ? 0.07 : it.mode === 'slam' ? 0 : 0.05;
  const lt = t - it.at - i * st;
  if (lt < 0) return null;
  let dx = 0, dy = 0, sx = 1, sy = 1, rot = 0, a = 1;
  if (it.mode === 'drop') {
    dy = (1 - motion.spring({ duration: 0.5, bounce: 0.5 })(lt)) * -420; a = clamp(lt / 0.08);
    const q = Math.sin(Math.PI * clamp((lt - 0.16) / 0.26)); sy = 1 - 0.16 * q; sx = 1 + 0.14 * q;
  } else if (it.mode === 'pop' || it.mode === 'sway' || it.mode === 'knock') {
    sx = sy = Math.max(0, motion.spring({ duration: 0.45, bounce: 0.55 })(lt)); a = clamp(lt / 0.06);
    if (it.mode === 'sway') { rot = 0.08 * Math.sin(t * 2.6 + i * 0.7); dx = 22 * Math.sin(t * 1.4); dy = 8 * Math.sin(t * 2.6 + i); }
  } else if (it.mode === 'slam') {
    sx = sy = 1 + 0.8 * (1 - motion.spring({ duration: 0.35, bounce: 0.4 })(lt)); a = clamp(lt / 0.06);
  } else {
    const p = 1 - (1 - clamp(lt / 0.7)) ** 3; dy = (1 - p) * 90 - lt * 7 + 5 * Math.sin(t * 2 + i * 0.9); a = p;
  }
  if (it.kv.wob) rot += 0.06 * Math.sin(t * 15 + i * 1.7) * clamp((t - it.at - 0.5) / 0.3);
  if (it.kv.jump) for (const j of String(it.kv.jump).split('/').map(Number).filter(Number.isFinite)) {
    const u = t - j - i * 0.03;
    if (u > 0 && u < 0.55) { const p = u / 0.55; dy -= 130 * 4 * p * (1 - p); sy *= 1 + 0.08 * Math.sin(p * Math.PI); }
  }
  if (it.kv.out !== undefined) { const o = +it.kv.out + i * 0.02, q = clamp((t - o) / 0.16); sx *= 1 - q; sy *= 1 - q; a *= 1 - q; }
  return { dx, dy, sx, sy, rot, a };
}

/** how far stressed character n (counted among the stressed ones) has fallen at t after `sink` (px at a 1080 short side), and its spin */
export const sinkAt = (sink: number, n: number, t: number) => { const u = t - sink - n * 0.09; return u > 0 ? { dy: 0.5 * 2600 * u * u, rot: u * 0.7 * (n % 2 ? 1 : -1) } : { dy: 0, rot: 0 }; };

export const bounce: ItemType<P, S> = {
  type: 'common.bounce', label: '彈跳大字', category: 'text', kind: 'overlay',
  doc: '動態大字：items 一行一句「秒|文字|大小|顏色|x|y|模式|參數」，字一個一個照拍子進來；模式 drop 掉下來壓扁再彈起、pop 從無彈出、slam 從大砸下、float 浮上來慢慢飄、sway 彈出後搖晃、knock 挖空字：整片色紙（sheet，到 sheetTo 為止）蓋住畫面，字是洞、看得到底下的影片；參數 jump=秒/秒 跳一下、sink=秒 讓【強調】字掉出畫面下緣、out=秒 縮小消失、wob=1 落定後抖一下、stagger=秒 每個字的間隔、shadow=1 陰影、scrim=1 字後面壓一條暗帶、emph=顏色 強調字顏色；大小是以 1080 短邊計的 px（太寬會縮到安全區內），顏色空＝color、hl＝強調色；宣言、品牌片、口號、對拍字卡、開場鉤子',
  params: [
    { key: 'items', label: '字（每行「秒|文字|大小|顏色|x|y|模式|參數」；【強調】）', type: 'text', default: '0.1|出發！|260||0.5|0.36|drop\n0.8|就是【現在】|150||0.5|0.6|pop|jump=2' },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'color', label: '文字顏色', type: 'color', default: '#fff8ec', theme: 'palette.paper' },
    { key: 'hl', label: '強調顏色（【強調】、顏色欄寫 hl）', type: 'color', default: '#ff4d4f', theme: 'palette.accent' },
    { key: 'outline', label: '描邊顏色（knock 是洞的外框；透明＝沒有）', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'hlScale', label: '強調字放大（倍）', type: 'number', min: 1, max: 2, step: 0.05, default: 1.5 },
    { key: 'sheet', label: 'knock 的色紙顏色', type: 'color', default: '#fff8ec', theme: 'palette.paper' },
    { key: 'sheetTo', label: 'knock 色紙的下緣（畫面高比例；1＝蓋滿）', type: 'number', min: 0.1, max: 1, step: 0.01, default: 1 },
  ],
  build(ctx) {
    const cv = document.createElement('canvas');
    cv.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
    ctx.root.appendChild(cv);
    return { cv, words: parseBounce(ctx.params.items).map((it) => it.text).join(''), font: ctx.params.font };
  },
  ready(s) {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    // draw sets the whole font list (the fallback Noto Sans TC too) in the weight the block's own font has: load that one
    const wt = faceWeight(s.font, 900);
    return fonts ? Promise.all([...new Set([s.font, 'Noto Sans TC'])].map((f) => fonts.load(`${wt} 120px "${f}"`, s.words || '字').catch(() => []))).then(() => {}) : Promise.resolve();
  },
  hide(s) { freeCanvas(s.cv); },
  draw(ctx, s) {
    const { local: t, params: p, W, H, theme, motion } = ctx, g = canvasAt(s.cv, W, H), k = Math.min(W, H) / 1080;
    const wt = faceWeight(p.font, 900), face = (px: number) => `${wt} ${px.toFixed(1)}px '${p.font}', 'Noto Sans TC', sans-serif`;
    const side = theme.safe.side * W, room = W - 2 * side, stroke = !isClear(p.outline);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const lines = parseBounce(p.items).map((it) => {
      // the characters' sizes and places: stressed ones hlScale bigger, the line shrunk to the safe width and kept inside it
      let sizes = it.chars.map((c) => (c.em ? it.size * p.hlScale : it.size) * k);
      let ws = it.chars.map((c, i) => { g.font = face(sizes[i]); return g.measureText(c.ch).width; });
      const total = ws.reduce((a, b) => a + b, 0), fit = total > room ? room / total : 1;
      sizes = sizes.map((v) => v * fit); ws = ws.map((v) => v * fit);
      const lineW = total * fit, x0 = clamp(it.x * W - lineW / 2, side, Math.max(side, W - side - lineW)), cy = it.y * H;
      const cx: number[] = [];
      ws.reduce((x, w) => { cx.push(x + w / 2); return x + w; }, x0);
      const poses = it.chars.map((_, i) => charPose(it, i, t, motion));
      let n = 0;
      const sink = it.kv.sink !== undefined ? +it.kv.sink : NaN;
      const placed = it.chars.map((c, i) => {
        const q = poses[i];
        if (!q) return null;
        let dy = q.dy * k, rot = q.rot;
        if (c.em && Number.isFinite(sink)) { const f = sinkAt(sink, n++, t); dy += Math.min(H * 1.2, f.dy * k); rot += f.rot; }
        return { ...q, x: cx[i] + q.dx * k, y: cy + dy, rot, size: sizes[i], w: ws[i] };
      });
      return { it, fit, cy, placed };
    });
    type Line = (typeof lines)[number];
    const scrim = ({ it, fit, cy }: Line) => {
      if (!it.kv.scrim) return;
      const a = clamp((t - it.at) / 0.4), hh = it.size * fit * k * 1.6, grd = g.createLinearGradient(0, cy - hh, 0, cy + hh);
      grd.addColorStop(0, 'rgba(10,14,28,0)'); grd.addColorStop(0.5, `rgba(10,14,28,${(0.5 * a).toFixed(3)})`); grd.addColorStop(1, 'rgba(10,14,28,0)');
      g.fillStyle = grd; g.fillRect(0, cy - hh, W, hh * 2);
    };
    // knock: one sheet down to sheetTo with every knock phrase's letters cut out of it, then their outlines; drawn before the other
    // phrases, so a second knock phrase does not cover the first one's holes, nor its sheet the phrases above it
    const knocks = lines.filter((l) => l.it.mode === 'knock');
    if (knocks.length) {
      knocks.forEach(scrim);
      g.save();
      g.fillStyle = p.sheet; g.fillRect(0, 0, W, clamp(p.sheetTo, 0.1, 1) * H);
      g.globalCompositeOperation = 'destination-out';
      for (const { it, placed } of knocks) placed.forEach((q, i) => { if (!q || q.sx <= 0.001) return; g.save(); g.translate(q.x, q.y); g.rotate(q.rot); g.scale(q.sx, q.sy); g.font = face(q.size); g.fillStyle = '#000'; g.fillText(it.chars[i].ch, 0, 0); g.restore(); });
      g.globalCompositeOperation = 'source-over';
      if (stroke) for (const { it, placed } of knocks) placed.forEach((q, i) => {
        if (!q || q.sx <= 0.001) return;
        g.save(); g.translate(q.x, q.y); g.rotate(q.rot); g.scale(q.sx, q.sy); g.font = face(q.size);
        g.lineWidth = (9 * k) / Math.max(0.2, q.sx); g.strokeStyle = p.outline; g.strokeText(it.chars[i].ch, 0, 0); g.restore();
      });
      g.restore();
    }
    for (const l of lines) {
      if (l.it.mode === 'knock') continue;
      const { it, placed } = l, color = it.color === 'hl' ? p.hl : it.color || p.color, emColor = it.kv.emph ? (it.kv.emph === 'hl' ? p.hl : it.kv.emph) : p.hl;
      scrim(l);
      placed.forEach((q, i) => {
        if (!q || q.a <= 0.001 || q.sx <= 0.001) return;
        g.save(); g.globalAlpha = q.a; g.translate(q.x, q.y); g.rotate(q.rot); g.scale(q.sx, q.sy); g.font = face(q.size);
        if (it.kv.shadow) { g.shadowColor = 'rgba(10,14,28,0.6)'; g.shadowBlur = 26 * k; g.shadowOffsetY = 6 * k; }
        if (stroke) { g.lineWidth = Math.max(2, q.size * 0.08); g.strokeStyle = p.outline; g.strokeText(it.chars[i].ch, 0, 0); g.shadowColor = 'transparent'; }
        g.fillStyle = it.chars[i].em ? emColor : color; g.fillText(it.chars[i].ch, 0, 0);
        g.restore();
      });
    }
    // check measures each phrase: one box round its characters on screen
    for (const { it, fit, placed } of lines) {
      const seen = placed.filter((q): q is NonNullable<typeof q> => !!q && q.sx > 0.001 && q.a > 0.05 && q.y - q.size < H);
      if (seen.length) {
        const xa = Math.min(...seen.map((q) => q.x - (q.w * q.sx) / 2)), xb = Math.max(...seen.map((q) => q.x + (q.w * q.sx) / 2));
        const ya = Math.min(...seen.map((q) => q.y - q.size * 0.6 * q.sy)), yb = Math.max(...seen.map((q) => q.y + q.size * 0.6 * q.sy));
        ctx.reportText({ text: it.text, x: xa, y: ya, w: xb - xa, h: yb - ya, size: it.size * fit * k });
      }
    }
  },
};
