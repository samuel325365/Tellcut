// common.headline — the documentary title card, from krakow-square's fx.headline (a serif headline and a line under it between two
// thin rules, over a dark band or a black frame), with uk-parallax's serifcap (letter-spaced serif, a soft shadow, rising in) and
// uk-dv's dvTitle (the letters coming in one by one: `type`). The rules grow out from the middle while the card rises in.
// look 'name' (the katie-sweet16 short's fx.title): a celebration's name title — a big italic serif name (CJK characters upright: their
// faces have no italic) whose letters rise in one after another, one shimmer of light across it, a gold rule drawing out from a dot
// under it, and a letter-spaced line below.
// From the bakery acceptance film's fx.rollLine / fx.strikeLine (look doc): `enter: roll` unrolls each character from narrow to its full
// width like dough under a rolling pin; `strikeFrom` / `strikeAt` draw a thin line in the `line` colour through the words from that
// character on, which then fade back.
import { abs, clamp, cssCamel, eIO3, eOut3, h, type ItemType, prog, textEm } from '@tellcut/engine';
import { countUp, drawBlurLine, isProofNumber, loadLineFaces } from './brand-text.ts';
import { ghostLayer, ghostLines, nl, type GhostLine } from './text.ts';
import { mixHex, withAlpha } from './color.ts';
import { isCjk } from './words.ts';

interface P {
  text: string; sub: string; y: number; size: number; spacing: number; bg: 'none' | 'band' | 'black'; rules: boolean; type: number;
  font: string; color: string; line: string; ground: string; look: 'doc' | 'brand' | 'proof' | 'name'; enter: 'rise' | 'roll'; strikeFrom: number; strikeAt: number;
}
interface S { ground: HTMLElement; box: HTMLElement; r1: HTMLElement; r2: HTMLElement; main: HTMLElement; sub: HTMLElement; cv: HTMLCanvasElement; ghost: HTMLElement; p: P; nm: NameEls }
/** look name's parts: the group (name, rule with its dot, the line under it), centred on y */
interface NameEls { box: HTMLElement; name: HTMLElement; rule: HTMLElement; dot: HTMLElement; sub: HTMLElement; key: string }

/** the text's lines (a typed "\\n" too) */
const linesOf = (s: string) => nl(s).split('\n');

/** each line split into the part typed after n characters and the rest (the type-in) */
export function typedSplit(lines: string[], n: number): Array<[string, string]> {
  let left = Math.max(0, Math.floor(n));
  return lines.map((l) => { const c = [...l], k = Math.min(left, c.length); left -= k; return [c.slice(0, k).join(''), c.slice(k).join('')]; });
}

/** enter roll: character i (counted over all lines) unrolling at `local` — from 0.25 s, one every 0.13 s, each over 0.6 s: its width and
 *  height scale and its opacity */
export function rollChar(i: number, local: number) {
  const e = eOut3(prog(local, 0.25 + i * 0.13, 0.85 + i * 0.13));
  return { sx: 0.4 + 0.6 * e, sy: 1.15 - 0.15 * e, a: e * e };
}
/** the strike from character `from` at `at`: how far through each struck character the line has run (0–1, over 1 s for the whole
 *  struck part) and how far they have faded (1 → 0.28 from 0.6 s after `at`, over 0.9 s); characters before `from` are untouched */
export function strikeChar(i: number, from: number, n: number, at: number, local: number) {
  if (from < 0 || i < from) return { line: 0, fade: 1 };
  const run = eIO3(prog(local, at, at + 1)) * Math.max(1, n - from);
  return { line: clamp(run - (i - from)), fade: 1 - 0.72 * prog(local, at + 0.6, at + 1.5) };
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
  type: 'common.headline', label: '明體字卡（劃字、名字片頭）', category: 'text', kind: 'overlay',
  doc: '片名、章節、地名這類標題用 common.heading（範本 doc-rules 就是上下細線的明體字卡，其他外觀、版面、底和進出場都在那裡，跟著片子的標題範本）；headline 留給 heading 沒有的：strikeFrom／strikeAt 劃掉字、enter roll 擀開、look name 的名字片頭。紀錄片式的標題卡：明體大字（可多行）加一行小字，上下兩條細線從中間長出來，整張卡浮上來、最後淡出；bg band 是字後面一條暗色橫帶、black 整個畫面變黑（嚴肅的字卡、章節、年代、地名）、none 只有字和陰影；type 讓字一個一個打出來、enter roll 每個字像被擀開一樣從扁窄展開；strikeFrom＋strikeAt 到時間用一條細線劃掉第幾個字以後的字、那幾個字淡下去（「不加○○」「原本以為…」）；歷史、紀錄片、散文、旅行、品牌片的章節開場；look name 是慶生、婚禮、畢業的名字片頭：斜體襯線的大名字（text；中日韓文字沒有斜體，保持直立）一個字母一個字母浮上來、一道光掃過，下面一條金色細線從小圓點長出來，再一行加寬字距的小字（sub，例如 SWEET SIXTEEN）；片尾的感謝名單用 common.outro 的 look credits',
  params: [
    { key: 'text', label: '大字（可換行）', type: 'text', default: '一座廣場的七百年' },
    { key: 'sub', label: '小字（空＝不顯示）', type: 'text', default: '第一章　規劃' },
    { key: 'y', label: '高度（畫面高比例：doc、proof 是卡片中心，brand 是最後一行字的基線；-1＝預設：doc 安全區正中間、brand 安全區底部、proof 畫面正中間）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'size', label: '大字字級（以 1080 短邊計的 px）', type: 'number', min: 30, max: 260, step: 1, default: 100 },
    { key: 'spacing', label: '字距（em）', type: 'number', min: 0, max: 0.5, step: 0.01, default: 0.06 },
    { key: 'bg', label: '底（none 沒有、band 暗色橫帶、black 整個畫面變黑）', type: 'enum', options: ['none', 'band', 'black'], default: 'band' },
    { key: 'rules', label: '上下細線', type: 'bool', default: true },
    { key: 'type', label: '逐字打出（每秒幾個字；0＝整行一起浮上來；打字時 enter roll 和劃掉都不作用）', type: 'number', min: 0, max: 60, step: 1, default: 0 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Serif TC' },
    { key: 'color', label: '大字顏色', type: 'color', default: '#f3e9d2', theme: 'palette.paper' },
    { key: 'line', label: '小字與細線的顏色', type: 'color', default: '#d9b13b' },
    { key: 'ground', label: '橫帶／黑底的顏色', type: 'color', default: '#0f0b08' },
    { key: 'enter', label: '大字怎麼進來（doc；rise 整張卡浮上來、roll 每個字從扁窄擀開到正常寬度）', type: 'enum', options: ['rise', 'roll'], default: 'rise' },
    { key: 'strikeFrom', label: '從第幾個字起劃掉（doc；從 0 數、換行接著數；-1＝不劃）', type: 'number', min: -1, max: 200, step: 1, default: -1 },
    { key: 'strikeAt', label: '幾秒劃掉（strikeFrom；細線用小字的顏色，劃掉的字淡下去）', type: 'number', min: 0, max: 600, step: 0.05, default: 1.4 },
    { key: 'look', label: '樣子（doc 紀錄片標題卡；brand 品牌片：左下角一行一行從模糊變清楚，小字變成上方的小標；proof 品牌片的證明：左邊一個往上數的大數字，小字是下方加寬字距的標籤；name 慶生、婚禮的名字片頭：斜體襯線大名字一個字母一個字母浮上來、一道光掃過，下面一條細線從中間的小圓點長出來，再一行加寬字距的小字）', type: 'enum', options: ['doc', 'brand', 'proof', 'name'], default: 'doc' },
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
    return { ground, box, r1, r2, main, sub, cv, ghost: ghostLayer(ctx.root), p: ctx.params, nm: nameEls(ctx.root) };
  },
  async ready(s) {
    // look brand draws on a canvas: its faces loaded first
    if (s.p.look === 'brand' || s.p.look === 'proof') {
      await loadLineFaces((document as Document & { fonts?: FontFaceSet }).fonts, [{ weight: 300, family: brandFace(s.p.font), text: s.p.text }, { weight: 600, family: brandFace(s.p.font), text: s.p.sub }]);
    }
  },
  draw(ctx, s) {
    const brand = ctx.params.look === 'brand' || ctx.params.look === 'proof';
    const named = ctx.params.look === 'name';
    for (const e of [s.ground, s.box]) cssCamel(e, { visibility: brand ? 'hidden' : '' });
    cssCamel(s.box, { display: named ? 'none' : '' });
    cssCamel(s.nm.box, { display: named ? 'flex' : 'none' });
    cssCamel(s.cv, { display: brand ? 'block' : 'none' });
    if (named) { ghostLines(s.ghost, []); drawName(ctx, s); return; }
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
    const shadow = p.bg === 'black' ? 'none' : `0 ${3 * k}px ${14 * k}px rgba(0,0,0,.75), 0 0 ${2 * k}px rgba(0,0,0,.9)`;
    // a faded character's shadow fades with it
    const shadowA = (o: number) => (p.bg === 'black' ? 'none' : `0 ${3 * k}px ${14 * k}px rgba(0,0,0,${(0.75 * o).toFixed(3)}), 0 0 ${2 * k}px rgba(0,0,0,${(0.9 * o).toFixed(3)})`);
    const roll = !typing && p.enter === 'roll', strike = !typing && (p.strikeFrom ?? -1) >= 0, thick = Math.max(1, fs * 0.055);
    if (typing) { setTyped(s.main, lines, n); setTyped(s.sub, subLines, n - total); }
    else if (roll || strike) {
      charSpans(s.main, lines, thick, p.line, (i, sp) => {
        const r = roll ? rollChar(i, local) : { sx: 1, sy: 1, a: 1 }, st = strikeChar(i, strike ? Math.round(p.strikeFrom) : -1, total, p.strikeAt ?? 0, local), o = r.a * st.fade;
        cssCamel(sp, { display: roll ? 'inline-block' : 'inline', transform: roll ? `scale(${r.sx.toFixed(4)}, ${r.sy.toFixed(4)})` : 'none', transformOrigin: 'left bottom',
          color: withAlpha(p.color, o), textShadow: shadowA(o), backgroundSize: `${(st.line * 100).toFixed(2)}% ${thick.toFixed(2)}px` });
      });
      s.sub.textContent = subLines.join('\n');
    } else { s.main.textContent = lines.join('\n'); s.sub.textContent = subLines.join('\n'); }
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
    cssCamel(s.box, { top: `${cy}px`, padding: `${pad}px 0`, opacity: String(a), transform: `translateY(calc(-50% + ${(roll ? 0 : (1 - a) * 24 * k).toFixed(2)}px))` });
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

/** the spans charSpans made in an element, and the text they were made for */
const spanCache = new WeakMap<HTMLElement, { key: string; spans: HTMLElement[] }>();

/** the lines in el as one span a character (`each(i, span)` styles character i, counted over all lines), each carrying a strike line
 *  `thick` px in `color` as its background (sized by `each`; a background, so the line runs on through the letter spacing). The
 *  spans are made again only when the text changes or something else (the typed or plain card) has taken the element over, not
 *  every frame; they are styled every frame. */
function charSpans(el: HTMLElement, lines: string[], thick: number, color: string, each: (i: number, sp: HTMLElement) => void) {
  const key = JSON.stringify(lines);
  let c = spanCache.get(el);
  const mine = c && c.key === key && (c.spans.length ? c.spans.every((sp) => sp.parentNode === el) : !el.childNodes.length);
  if (!c || !mine) {
    el.replaceChildren();
    const spans: HTMLElement[] = [];
    lines.forEach((l, j) => {
      if (j) el.append('\n');
      for (const ch of l) { const sp = h('span', null, null, el); sp.textContent = ch; spans.push(sp); }
    });
    c = { key, spans };
    spanCache.set(el, c);
  }
  c.spans.forEach((sp, i) => {
    cssCamel(sp, { whiteSpace: 'pre', backgroundImage: `linear-gradient(${color}, ${color})`, backgroundRepeat: 'no-repeat', backgroundPosition: '0 55%', backgroundSize: `0% ${thick.toFixed(2)}px` });
    each(i, sp);
  });
}

/** look proof (the spike's facts): on the left, a big number counting up to its value with what follows it ('+', ' clips.'), the sub
 *  line under it as a small spaced-out label; a text that is not a number shows as lines at the brand size, from a blur */
function drawProof(ctx: Parameters<typeof headline.draw>[0], s: S): GhostLine[] {
  const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080;
  if (s.cv.width !== W || s.cv.height !== H) { s.cv.width = W; s.cv.height = H; }
  const g = s.cv.getContext('2d');
  if (!g) return [];
  g.clearRect(0, 0, W, H);
  const family = `'${brandFace(p.font)}', 'Noto Sans TC', sans-serif`, x = theme.safe.side * W, cy = p.y >= 0 ? p.y * H : H * 0.5;
  const lines = linesOf(p.text).filter((l) => l !== ''), numeric = lines.length === 1 && isProofNumber(lines[0]);
  if (numeric) {
    const big = fitMeasuredSize(g, [lines[0]], (p.size / 100) * 200 * k, family, 300, W - 2 * x);
    const n = drawBlurLine(g, { text: countUp(lines[0], local, 0.05), x, y: cy + big * 0.35, size: big, family, weight: 300, color: p.color }, local, 0, dur);
    const label = linesOf(p.sub).join(' ').trim();
    return [n, ...(label ? [drawBlurLine(g, { text: label, x: x + big * 0.04, y: cy + big * 0.35 + 46 * k, size: 22 * k, family, weight: 600, color: p.line, spacing: 6 * k, rise: 6 * k }, local, 0.25, dur)] : [])];
  }
  const size = fitMeasuredSize(g, lines, (p.size / 100) * 60 * k, family, 300, W - 2 * x), gap = size * 1.25, first = cy - ((lines.length - 1) * gap) / 2;
  return lines.map((l, i) => drawBlurLine(g, { text: l, x, y: first + i * gap, size, family, weight: 300, color: p.color }, local, i * 0.35, dur));
}

/** the size at which the widest of the lines, measured on `g`, fits in `room` px (as look doc shrinks its headline), at most `size`; `spacing` the
 *  letter spacing in px per character */
export function fitMeasuredSize(g: CanvasRenderingContext2D, lines: string[], size: number, family: string, weight: number, room: number, spacing = 0): number {
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
  const lines = linesOf(p.text).filter((l) => l !== ''), size = fitMeasuredSize(g, lines, (p.size / 100) * 60 * k, family, 300, room), gap = size * 1.25;
  const last = p.y >= 0 ? p.y * H : (1 - theme.safe.bottom) * H - size * 0.4, first = last - (lines.length - 1) * gap;
  const kicker = linesOf(p.sub).join(' ').trim(), ks = kicker ? fitMeasuredSize(g, [kicker], Math.max(size * 0.3, 17 * k), family, 600, room, 6 * k) : 0;
  const out = kicker ? [drawBlurLine(g, { text: kicker, x, y: first - size * 1.1, size: ks, family, weight: 600, color: p.line, spacing: 6 * k, rise: 6 * k }, local, 0, dur)] : [];
  return [...out, ...lines.map((l, i) => drawBlurLine(g, { text: l, x, y: first + i * gap, size, family, weight: 300, color: p.color }, local, 0.2 + i * 0.35, dur))];
}


// ---- look name ----------------------------------------------------------------------------------------------------------------------
function nameEls(root: HTMLElement): NameEls {
  const box = abs(root, { left: '0', right: '0', display: 'none', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none' });
  const name = h('div', null, null, box), rule = h('div', null, null, box), dot = h('div', null, null, rule), sub = h('div', null, null, box);
  cssCamel(name, { whiteSpace: 'pre', lineHeight: '1.2', fontWeight: '700' });
  cssCamel(rule, { position: 'relative' });
  cssCamel(dot, { position: 'absolute', left: '50%', top: '50%', borderRadius: '50%' });
  cssCamel(sub, { whiteSpace: 'pre', lineHeight: '1.2', fontWeight: '500' });
  return { box, name, rule, dot, sub, key: '' };
}

/** look name: how far letter i of the name has risen in (0.15 s in, one every 0.09 s, each over 0.7 s) */
export const nameLetter = (i: number, local: number) => eOut3(prog(local, 0.15 + i * 0.09, 0.85 + i * 0.09));
/** look name: where the shimmer's middle is across the name (0–1 from 1.3 s over 1.2 s), or null when there is none */
export const nameShimmer = (local: number): number | null => (local > 1.3 && local < 2.5 ? (local - 1.3) / 1.2 : null);

/** look name's face: Playfair Display unless the font was changed from the documentary serif */
const nameFace = (font: string) => (font === 'Noto Serif TC' ? 'Playfair Display' : font);

function drawName(ctx: Parameters<typeof headline.draw>[0], s: S) {
  const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080, n = s.nm;
  const text = linesOf(p.text).join(' ').trim(), sub = linesOf(p.sub).join(' ').trim(), room = W * (1 - 2 * theme.safe.side);
  const family = `'${nameFace(p.font)}', 'Noto Serif TC', serif`;
  // the name's size: 1.9× the size param (in px at a 1080 short side), shrunk to fit across the safe area
  const fs = Math.min((p.size / 100) * 190 * k, room / Math.max(0.5, textEm(text) * 1.02)), sfs = Math.max(fs * 0.29, 26 * k);
  const out = clamp((dur - local) / 0.7);
  if (n.key !== text) {   // one span a letter, rebuilt only when the name changes; CJK faces have no italic, so their characters stand upright
    n.key = text;
    n.name.replaceChildren(...[...text].map((c) => { const sp = h('span'); sp.textContent = c; cssCamel(sp, { display: 'inline-block', whiteSpace: 'pre', fontStyle: isCjk(c) ? 'normal' : 'italic' }); return sp; }));
  }
  const spans = [...n.name.children] as HTMLElement[], sh = nameShimmer(local), total = n.name.offsetWidth || fs * textEm(text);
  spans.forEach((sp, i) => {
    const q = nameLetter(i, local), band = sh === null ? null : sh * (total + 1.4 * fs) - 0.7 * fs - sp.offsetLeft;
    cssCamel(sp, { opacity: String(q), transform: `translateY(${((1 - q) * 0.19 * fs).toFixed(2)}px)`,
      ...(band === null ? { color: p.color, backgroundImage: 'none', webkitBackgroundClip: 'border-box', backgroundClip: 'border-box' }
        : { color: 'transparent', webkitBackgroundClip: 'text', backgroundClip: 'text',
          backgroundImage: `linear-gradient(90deg, ${p.color} ${(band - 0.6 * fs).toFixed(1)}px, ${mixHex(p.line, '#ffffff', 0.55)} ${band.toFixed(1)}px, ${p.color} ${(band + 0.6 * fs).toFixed(1)}px)` }) });
  });
  // a soft dark glow behind the words (filter, so it also follows the shimmer's clipped letters)
  const glow = `drop-shadow(0 ${(6 * k).toFixed(1)}px ${(22 * k).toFixed(1)}px rgba(10,6,20,0.7))`;
  cssCamel(n.name, { fontFamily: family, fontSize: `${fs.toFixed(2)}px`, filter: glow });
  // the rule draws out from its dot, then the line under it opens its spacing as it fades in
  const rk = eOut3(prog(local, 0.7, 1.7)), sk = eOut3(prog(local, 1.0, 1.9));
  cssCamel(n.rule, { width: `${(600 * k * rk).toFixed(1)}px`, height: `${Math.max(1, 3 * k).toFixed(2)}px`, background: p.line, marginTop: `${(0.02 * fs).toFixed(1)}px`, overflow: 'visible' });
  cssCamel(n.dot, { width: `${(12 * k * rk).toFixed(2)}px`, height: `${(12 * k * rk).toFixed(2)}px`, background: p.line, transform: 'translate(-50%, -50%)' });
  n.sub.textContent = sub;
  const track = (14 + (1 - sk) * 10) * k;
  cssCamel(n.sub, { display: sub ? 'block' : 'none', fontFamily: `'Cormorant Garamond', ${family}`, fontSize: `${sfs.toFixed(2)}px`, color: p.color, opacity: String(sk),
    letterSpacing: `${track.toFixed(2)}px`, textIndent: `${track.toFixed(2)}px`, marginTop: `${(0.25 * sfs).toFixed(1)}px`, filter: glow });
  const cy = p.y >= 0 ? p.y * H : ((theme.safe.top + 1 - theme.safe.bottom) / 2) * H;
  cssCamel(n.box, { top: `${cy.toFixed(1)}px`, transform: 'translateY(-50%)', opacity: String(out) });
  // the ground as in look doc: a dark band behind the group, the whole frame black, or nothing
  const hgt = n.box.offsetHeight + 1.2 * fs, a = eOut3(prog(local, 0, 0.6)) * out;
  if (p.bg === 'black') cssCamel(s.ground, { display: 'block', top: '0', bottom: '0', height: 'auto', transform: 'none', background: p.ground, opacity: String(clamp(eOut3(prog(local, 0, 0.2)) * out)) });
  else if (p.bg === 'band') {
    const c = withAlpha(p.ground, 0.55);
    cssCamel(s.ground, { display: 'block', top: `${cy}px`, bottom: 'auto', height: `${hgt}px`, transform: 'translateY(-50%)', opacity: String(a),
      background: `linear-gradient(180deg, ${withAlpha(p.ground, 0)}, ${c} 25%, ${c} 75%, ${withAlpha(p.ground, 0)})` });
  } else cssCamel(s.ground, { display: 'none' });
}
