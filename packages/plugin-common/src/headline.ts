// common.headline — the documentary title card, from krakow-square's fx.headline (a serif headline and a line under it between two
// thin rules, over a dark band or a black frame), with uk-parallax's serifcap (letter-spaced serif, a soft shadow, rising in) and
// uk-dv's dvTitle (the letters coming in one by one: `type`). The rules grow out from the middle while the card rises in.
import { abs, clamp, cssCamel, eOut3, h, type ItemType, prog, textEm } from '@tellcut/engine';
import { countUp, drawBlurLine, loadLineFaces } from './brand-text.ts';
import { ghostLayer, ghostLines, nl, type GhostLine } from './text.ts';
import { withAlpha } from './color.ts';

interface P {
  text: string; sub: string; y: number; size: number; spacing: number; bg: 'none' | 'band' | 'black'; rules: boolean; type: number;
  font: string; color: string; line: string; ground: string; look: 'doc' | 'brand' | 'proof';
}
interface S { ground: HTMLElement; box: HTMLElement; r1: HTMLElement; r2: HTMLElement; main: HTMLElement; sub: HTMLElement; cv: HTMLCanvasElement; ghost: HTMLElement; p: P }

/** the text's lines (a typed "\\n" too) */
const linesOf = (s: string) => nl(s).split('\n');

/** each line split into the part typed after n characters and the rest (the type-in) */
export function typedSplit(lines: string[], n: number): Array<[string, string]> {
  let left = Math.max(0, Math.floor(n));
  return lines.map((l) => { const c = [...l], k = Math.min(left, c.length); left -= k; return [c.slice(0, k).join(''), c.slice(k).join('')]; });
}

/** the lines in el, the untyped rest of each kept in place but hidden, so the typed letters do not slide while the line fills */
function setTyped(el: HTMLElement, lines: string[], n: number) {
  el.replaceChildren();
  typedSplit(lines, n).forEach(([shown, rest], i) => {
    if (i) el.append('\n');
    if (shown) el.append(shown);
    if (rest) { const sp = h('span', null, null, el); sp.textContent = rest; cssCamel(sp, { visibility: 'hidden' }); }
  });
}

export const headline: ItemType<P, S> = {
  type: 'common.headline', label: '明體標題卡', category: 'text', kind: 'overlay',
  doc: '紀錄片式的標題卡：明體大字（可多行）加一行小字，上下兩條細線從中間長出來，整張卡浮上來、最後淡出；bg band 是字後面一條暗色橫帶、black 整個畫面變黑（嚴肅的字卡、章節、年代、地名）、none 只有字和陰影；type 讓字一個一個打出來；歷史、紀錄片、散文、旅行的章節開場',
  params: [
    { key: 'text', label: '大字（可換行）', type: 'text', default: '一座廣場的七百年' },
    { key: 'sub', label: '小字（空＝不顯示）', type: 'text', default: '第一章　規劃' },
    { key: 'y', label: '高度（畫面高比例：doc、proof 是卡片中心，brand 是最後一行字的基線；-1＝預設：doc 安全區正中間、brand 安全區底部、proof 畫面正中間）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'size', label: '大字字級（以 1080 短邊計的 px）', type: 'number', min: 30, max: 260, step: 1, default: 100 },
    { key: 'spacing', label: '字距（em）', type: 'number', min: 0, max: 0.5, step: 0.01, default: 0.06 },
    { key: 'bg', label: '底（none 沒有、band 暗色橫帶、black 整個畫面變黑）', type: 'enum', options: ['none', 'band', 'black'], default: 'band' },
    { key: 'rules', label: '上下細線', type: 'bool', default: true },
    { key: 'type', label: '逐字打出（每秒幾個字；0＝整行一起浮上來）', type: 'number', min: 0, max: 60, step: 1, default: 0 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Serif TC' },
    { key: 'color', label: '大字顏色', type: 'color', default: '#f3e9d2', theme: 'palette.paper' },
    { key: 'line', label: '小字與細線的顏色', type: 'color', default: '#d9b13b' },
    { key: 'ground', label: '橫帶／黑底的顏色', type: 'color', default: '#0f0b08' },
    { key: 'look', label: '樣子（doc 紀錄片標題卡；brand 品牌片：左下角一行一行從模糊變清楚，小字變成上方的小標；proof 品牌片的證明：左邊一個往上數的大數字，小字是下方加寬字距的標籤）', type: 'enum', options: ['doc', 'brand', 'proof'], default: 'doc' },
  ],
  build(ctx) {
    const ground = abs(ctx.root, { left: '0', right: '0', pointerEvents: 'none' });
    const box = abs(ctx.root, { left: '0', right: '0', textAlign: 'center', willChange: 'transform' });
    const r1 = h('div', null, null, box), main = h('div', null, null, box), sub = h('div', null, null, box), r2 = h('div', null, null, box);
    for (const r of [r1, r2]) cssCamel(r, { margin: '0 auto' });
    cssCamel(main, { whiteSpace: 'pre', fontWeight: '900', lineHeight: '1.15' });
    cssCamel(sub, { whiteSpace: 'pre', fontWeight: '700', lineHeight: '1.25' });
    const cv = h('canvas', null, null, ctx.root) as HTMLCanvasElement;
    cssCamel(cv, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', display: 'none' });
    return { ground, box, r1, r2, main, sub, cv, ghost: ghostLayer(ctx.root), p: ctx.params };
  },
  async ready(s) {
    // look brand draws on a canvas: its faces loaded first
    if (s.p.look === 'brand' || s.p.look === 'proof') {
      await loadLineFaces((document as Document & { fonts?: FontFaceSet }).fonts, [{ weight: 300, family: brandFace(s.p.font), text: s.p.text }, { weight: 600, family: brandFace(s.p.font), text: s.p.sub }]);
    }
  },
  draw(ctx, s) {
    const brand = ctx.params.look === 'brand' || ctx.params.look === 'proof';
    for (const e of [s.ground, s.box]) cssCamel(e, { visibility: brand ? 'hidden' : '' });
    cssCamel(s.cv, { display: brand ? 'block' : 'none' });
    // the canvas looks' words for check and the editor: transparent copies over the canvas
    ghostLines(s.ghost, brand ? (ctx.params.look === 'proof' ? drawProof(ctx, s) : drawBrand(ctx, s)) : []);
    if (brand) return;
    const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080, lines = linesOf(p.text), subLines = p.sub ? linesOf(p.sub) : [];
    const face = `'${p.font}', 'Noto Serif TC', serif`, side = theme.safe.side * W, room = W - 2 * side;
    // sizes: the headline shrinks to fit across the safe area (its letter spacing counted), the line under it follows
    const em = (l: string) => textEm(l) + [...l].length * p.spacing;
    let fs = p.size * k;
    const widest = Math.max(0.5, ...lines.map(em));
    fs = Math.min(fs, room / widest);
    let sfs = Math.max(fs * 0.46, 30 * k);
    const subWidest = Math.max(0.5, ...subLines.map((l) => textEm(l) + [...l].length * 0.12));
    sfs = Math.min(sfs, room / subWidest);
    // in: rise 0.45 s; out: the last 0.3 s
    const a = eOut3(prog(local, 0, 0.45)) * (1 - prog(local, dur - 0.3, dur));
    const typing = p.type > 0, n = typing ? local * p.type : Infinity, total = lines.reduce((x, l) => x + [...l].length, 0);
    if (typing) { setTyped(s.main, lines, n); setTyped(s.sub, subLines, n - total); }
    else { s.main.textContent = lines.join('\n'); s.sub.textContent = subLines.join('\n'); }
    const shadow = p.bg === 'black' ? 'none' : `0 ${3 * k}px ${14 * k}px rgba(0,0,0,.75), 0 0 ${2 * k}px rgba(0,0,0,.9)`;
    cssCamel(s.main, { fontFamily: face, fontSize: `${fs.toFixed(2)}px`, color: p.color, letterSpacing: `${p.spacing}em`, textIndent: `${p.spacing}em`, textShadow: shadow });
    cssCamel(s.sub, { display: subLines.length ? 'block' : 'none', fontFamily: face, fontSize: `${sfs.toFixed(2)}px`, color: p.line, letterSpacing: '0.12em', textIndent: '0.12em',
      marginTop: `${fs * 0.18}px`, textShadow: shadow, opacity: typing ? '1' : String(eOut3(prog(local, 0.15, 0.6))) });
    // the rules: from a fifth of the short side, growing to 60 % of it
    const base = Math.min(W, H), rw = Math.min(base * 0.6, base * 0.2 + local * base * 0.5);
    for (const r of [s.r1, s.r2]) cssCamel(r, { width: `${rw.toFixed(1)}px`, height: `${Math.max(1, 3 * k).toFixed(2)}px`, background: p.line, opacity: p.rules ? '0.85' : '0' });
    cssCamel(s.r1, { marginBottom: `${fs * 0.28}px` });
    cssCamel(s.r2, { marginTop: `${fs * 0.3}px` });
    // the box: centred on y (or the middle of the safe area), its padding the band's height
    const cy = p.y >= 0 ? p.y * H : ((theme.safe.top + 1 - theme.safe.bottom) / 2) * H, pad = fs * 0.9;
    cssCamel(s.box, { top: `${cy}px`, padding: `${pad}px 0`, opacity: String(a), transform: `translateY(calc(-50% + ${((1 - a) * 24 * k).toFixed(2)}px))` });
    if (p.bg === 'black') {
      const ba = eOut3(prog(local, 0, 0.2)) * (1 - prog(local, dur - 0.25, dur));
      cssCamel(s.ground, { display: 'block', top: '0', bottom: '0', height: 'auto', transform: 'none', background: p.ground, opacity: String(clamp(ba)) });
    } else if (p.bg === 'band') {
      const c = withAlpha(p.ground, 0.55), hgt = s.box.offsetHeight || (lines.length * fs * 1.15 + (subLines.length ? subLines.length * sfs * 1.25 + fs * 0.18 : 0) + fs * 0.58 + 2 * pad + 6 * k);
      cssCamel(s.ground, { display: 'block', top: `${cy}px`, bottom: 'auto', height: `${hgt}px`, transform: 'translateY(-50%)', opacity: String(a),
        background: `linear-gradient(180deg, ${withAlpha(p.ground, 0)}, ${c} 25%, ${c} 75%, ${withAlpha(p.ground, 0)})` });
    } else cssCamel(s.ground, { display: 'none' });
  },
  hide(s) { s.cv.width = 0; s.cv.height = 0; },
};

/** look proof (the spike's facts): on the left, a big number counting up to its value with what follows it ('+', ' clips.'), the sub
 *  line under it as a small spaced-out label; a text that is not a number shows as lines at the brand size, from a blur */
function drawProof(ctx: Parameters<typeof headline.draw>[0], s: S): GhostLine[] {
  const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080;
  if (s.cv.width !== W || s.cv.height !== H) { s.cv.width = W; s.cv.height = H; }
  const g = s.cv.getContext('2d');
  if (!g) return [];
  g.clearRect(0, 0, W, H);
  const family = `'${brandFace(p.font)}', 'Noto Sans TC', sans-serif`, x = theme.safe.side * W, cy = p.y >= 0 ? p.y * H : H * 0.5;
  const lines = linesOf(p.text).filter((l) => l !== ''), numeric = lines.length === 1 && /^\d/.test(lines[0]);
  if (numeric) {
    const big = fitSize(g, [lines[0]], (p.size / 100) * 200 * k, family, 300, W - 2 * x);
    const n = drawBlurLine(g, { text: countUp(lines[0], local, 0.05), x, y: cy + big * 0.35, size: big, family, weight: 300, color: p.color }, local, 0, dur);
    const label = linesOf(p.sub).join(' ').trim();
    return [n, ...(label ? [drawBlurLine(g, { text: label, x: x + big * 0.04, y: cy + big * 0.35 + 46 * k, size: 22 * k, family, weight: 600, color: p.line, spacing: 6 * k, rise: 6 * k }, local, 0.25, dur)] : [])];
  }
  const size = fitSize(g, lines, (p.size / 100) * 60 * k, family, 300, W - 2 * x), gap = size * 1.25, first = cy - ((lines.length - 1) * gap) / 2;
  return lines.map((l, i) => drawBlurLine(g, { text: l, x, y: first + i * gap, size, family, weight: 300, color: p.color }, local, i * 0.35, dur));
}

/** the size at which the widest of the lines fits in `room` px (as look doc shrinks its headline), at most `size`; `spacing` the
 *  letter spacing in px per character */
export function fitSize(g: CanvasRenderingContext2D, lines: string[], size: number, family: string, weight: number, room: number, spacing = 0): number {
  g.font = `${weight} ${size}px ${family}`;
  const widest = Math.max(0, ...lines.map((l) => g.measureText(l).width + [...l].length * spacing));
  return widest > room && room > 0 ? size * (room / widest) : size;
}

/** look brand's face: Inter unless the font was changed from the documentary serif */
const brandFace = (font: string) => (font === 'Noto Serif TC' ? 'Inter' : font);

/** look brand (spec 2026-10-25-brand-preset §6.2-5): bottom-left, each line resolving from a blur 0.35 s after the one above,
 *  the sub line as a small spaced-out kicker above them, everything softening out in the last 0.4 s */
function drawBrand(ctx: Parameters<typeof headline.draw>[0], s: S): GhostLine[] {
  const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080;
  if (s.cv.width !== W || s.cv.height !== H) { s.cv.width = W; s.cv.height = H; }
  const g = s.cv.getContext('2d');
  if (!g) return [];
  g.clearRect(0, 0, W, H);
  // the lines (and the kicker) shrink until the widest fits across the safe area, as look doc's headline does
  const family = `'${brandFace(p.font)}', 'Noto Sans TC', sans-serif`, x = theme.safe.side * W, room = W - 2 * x;
  const lines = linesOf(p.text).filter((l) => l !== ''), size = fitSize(g, lines, (p.size / 100) * 60 * k, family, 300, room), gap = size * 1.25;
  const last = p.y >= 0 ? p.y * H : (1 - theme.safe.bottom) * H - size * 0.4, first = last - (lines.length - 1) * gap;
  const kicker = linesOf(p.sub).join(' ').trim(), ks = kicker ? fitSize(g, [kicker], Math.max(size * 0.3, 17 * k), family, 600, room, 6 * k) : 0;
  const out = kicker ? [drawBlurLine(g, { text: kicker, x, y: first - size * 1.1, size: ks, family, weight: 600, color: p.line, spacing: 6 * k, rise: 6 * k }, local, 0, dur)] : [];
  return [...out, ...lines.map((l, i) => drawBlurLine(g, { text: l, x, y: first + i * gap, size, family, weight: 300, color: p.color }, local, 0.2 + i * 0.35, dur))];
}

