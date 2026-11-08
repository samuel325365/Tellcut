// A city-and-food magazine, promoted 2026-11-06 from the Fashion pilot film's fx.cover / fx.taste / fx.column / fx.wordbands (after the
// user's own Fashion style film):
//   common.masthead   front: a cover over the footage, its masthead typed a letter at a time with a rule drawn under it, issue lines,
//                     contents down the right, an italic line wiped in; back: the back cover, a colour page with NEXT ISSUE, the
//                     masthead, a photo band and an italic line
//   common.spread     a full magazine page: layout swatch, a colour page of a "taste index" (header, photo card, big number and a
//                     name, a swatch card in the page's colour); layout column, a paper page (a big number, a photo card, an outlined
//                     word over its foot, the column's name and a page number)
//   common.wordbands  slanted bands of repeated italic serif words, each wider than the last until they fill the frame, a photo card
//                     in the middle (EAT · EVERY · SINGLE · BITE)
// The giant headline is the title template didone-full, the caption the template editorial-bar. Pure functions of time.
import { clamp, eOut3, type ItemType, type SceneItem } from '@tellcut/engine';
import { canvasIn } from './desktop.ts';
import { canvasAt, freeCanvas } from './inkline.ts';

const DISPLAY = 'Playfair Display', SERIF = 'Noto Serif TC';
const disp = (px: number, w = 900, it = false) => `${it ? 'italic ' : ''}${w} ${px}px "${DISPLAY}", "${SERIF}", serif`;
const ser = (px: number, w = 700) => `${w} ${px}px "${SERIF}", serif`;
const eOut = (q: number) => eOut3(clamp(q));
type G = CanvasRenderingContext2D;

const fontsReady = (text: string) => Promise.all([
  document.fonts.load(`900 80px "${DISPLAY}"`, 'AZ09'), document.fonts.load(`400 40px "${DISPLAY}"`, 'AZ09'),
  document.fonts.load(`italic 700 80px "${DISPLAY}"`, 'Az'), document.fonts.load(`italic 900 80px "${DISPLAY}"`, 'AZ'), document.fonts.load(`700 60px "${SERIF}"`, text || '字'),
]).then(() => undefined);
const stillOf = (source: string, t: number) => ({ source, t, w: 1080 });
const imgReady = (i: HTMLImageElement | null) => (!i || i.complete ? Promise.resolve() : i.decode().catch(() => undefined));
/** the photo for `source` at `t`, made again when either changes */
function photo(s: { img: HTMLImageElement | null; key: string }, media: { stillUrl(r: { source: string; t: number; w?: number }): string }, source: string, t: number) {
  const key = `${source}|${t}`;
  if (s.key === key) return;
  s.key = key;
  s.img = source ? Object.assign(new Image(), { src: media.stillUrl(stillOf(source, t)) }) : null;
}
/** an image covering the box (x, y, w, h), focused at (fx, fy); the box filled with `stand` while the image is not there */
export function coverImage(g: G, img: HTMLImageElement | null, x: number, y: number, w: number, h: number, fx = 0.5, fy = 0.5, stand = '#8a8580') {
  if (!img || !img.complete || !img.naturalWidth) { g.fillStyle = stand; g.fillRect(x, y, w, h); return; }
  const ir = img.naturalWidth / img.naturalHeight, br = w / h;
  let sw = img.naturalWidth, sh = img.naturalHeight;
  if (ir > br) sw = sh * br; else sh = sw / br;
  const sx = clamp(fx * img.naturalWidth - sw / 2, 0, img.naturalWidth - sw), sy = clamp(fy * img.naturalHeight - sh / 2, 0, img.naturalHeight - sh);
  g.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}
const track = (g: G, px: number) => { try { (g as unknown as { letterSpacing: string }).letterSpacing = `${(px * 0.22).toFixed(1)}px`; } catch { /* older canvases */ } };
const untrack = (g: G) => { try { (g as unknown as { letterSpacing: string }).letterSpacing = '0px'; } catch { /* older canvases */ } };
const stillMedia = (item: SceneItem) => {
  const p = item.params as { source?: string; t?: number };
  return { videos: [], stills: p.source ? [stillOf(p.source, Number(p.t) || 0)] : [] };
};

/** how many of the masthead's letters show at `local`: one every 0.07 s from the start */
export const typedLetters = (local: number, count: number) => (local < 0 ? 0 : Math.min(count, Math.floor(local / 0.07) + 1));
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
/** the letters as they are typed: graphemes, not code points, so a flag or an emoji joined by ZWJ comes in whole (as progress.osdShown) */
export const graphemes = (text: string) => [...GRAPHEMES.segment(String(text ?? ''))].map((x) => x.segment);
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
/** the front cover's italic line in two: its words half and half; a line with no spaces in Chinese, Japanese or Korean is cut in the
 *  middle between its characters when it is wider than `room` (`width` measures a line) */
export function scriptLines(text: string, width: (line: string) => number, room: number): string[] {
  const all = String(text ?? ''), words = all.split(' ');
  if (words.filter(Boolean).length === 1 && CJK.test(all) && width(all.trim()) > room) {
    const ch = graphemes(all.trim()), half = Math.ceil(ch.length / 2);
    return [ch.slice(0, half).join(''), ch.slice(half).join('')];
  }
  const half = Math.ceil(words.length / 2);
  return [words.slice(0, half).join(' '), words.slice(half).join(' ')].filter(Boolean);
}

// ── common.masthead
interface MP { mode: 'front' | 'back'; title: string; issueL: string; issueR: string; contents: string; script: string; sub: string; source: string; t: number; color: string; ink: string }
interface MS { c: HTMLCanvasElement; img: HTMLImageElement | null; key: string; text: string }
export const masthead: ItemType<MP, MS> = {
  type: 'common.masthead', label: '雜誌刊頭', category: 'frame', kind: 'overlay',
  doc: '雜誌的封面與封底：mode front 疊在滿版影片上，刊頭（title）一個字一個字打出來、下面拉出一條細線，左右上角兩行期別小字（issueL、issueR），右邊目錄（contents 一行一條）一行行出現，左下斜體一行（script）擦出來；mode back 是封底：color 色的整頁，上方 NEXT ISSUE／SEE YOU AGAIN、刊頭、細線、期別（sub），中間一條相片（source 在 t 秒的畫面），下面斜體一行（script）；旅行、城市、美食的雜誌風開場和結尾，中間配 common.spread 雜誌頁、common.wordbands 字帶、標題範本 didone-full、字幕範本 editorial-bar',
  params: [
    { key: 'mode', label: '樣式（front 封面、back 封底）', type: 'enum', options: ['front', 'back'], default: 'front' },
    { key: 'title', label: '刊頭', type: 'string', default: 'SEATTLE' },
    { key: 'issueL', label: '左上小字（front）', type: 'string', default: 'N° 07 — JULY 2025' },
    { key: 'issueR', label: '右上小字（front）', type: 'string', default: 'THE CITY & MARKET ISSUE' },
    { key: 'contents', label: '目錄（front，一行一條）', type: 'text', default: '01 — TASTE\n02 — SEE\n03 — WALK' },
    { key: 'script', label: '斜體一行（front 左下、back 下方）', type: 'string', default: 'Market Days' },
    { key: 'sub', label: '刊頭下的期別（back）', type: 'string', default: 'THE CITY & MARKET ISSUE · N° 07' },
    { key: 'source', label: '相片素材（back）', type: 'source-ref', default: '' },
    { key: 't', label: '相片取素材第幾秒（back）', type: 'number', min: 0, max: 99999, step: 0.01, default: 0 },
    { key: 'color', label: '封底底色（back）', type: 'color', default: '#c23b2c', theme: 'palette.accent' },
    { key: 'ink', label: '字色', type: 'color', default: '#ffffff' },
  ],
  media: (item) => ((item.params as Partial<MP>).mode === 'back' ? stillMedia(item) : { videos: [], stills: [] }),
  build(ctx) {
    const s: MS = { c: canvasIn(ctx.root), img: null, key: '', text: `${ctx.params.title}${ctx.params.script}${ctx.params.sub}` };
    if (ctx.params.mode === 'back') photo(s, ctx.media, ctx.params.source, ctx.params.t);
    return s;
  },
  ready(s) { return Promise.all([fontsReady(s.text), imgReady(s.img)]).then(() => undefined); },
  hide(s) { freeCanvas(s.c); },
  draw(ctx, s) {
    const { local, dur, W, H, params: p } = ctx, u = Math.min(W, H) / 1080, g = canvasAt(s.c, W, H);
    const back = p.mode === 'back', out = clamp((dur - local) / 0.2);
    if (back) photo(s, ctx.media, p.source, p.t);
    g.globalAlpha = back ? 1 : out;
    if (back) {
      g.fillStyle = p.color; g.fillRect(0, 0, W, H);
      const by = 0.33 * H, bh = 0.43 * H, k = eOut((local - 0.3) / 0.5);
      g.save(); g.beginPath(); g.rect(0, by + (bh / 2) * (1 - k), W, bh * k); g.clip(); coverImage(g, s.img, 0, by, W, bh, 0.5, 0.45); g.restore();
    }
    const small = 22 * u;
    g.fillStyle = p.ink; g.textBaseline = 'middle'; g.font = disp(small, 400); track(g, small);
    g.textAlign = 'left'; g.fillText(back ? 'NEXT ISSUE' : p.issueL, 60 * u, 70 * u);
    g.textAlign = 'right'; g.fillText(back ? 'SEE YOU AGAIN' : p.issueR, W - 60 * u, 70 * u); untrack(g);
    const chars = graphemes(p.title);
    let px = 190 * u; g.font = disp(px);
    const full = g.measureText(p.title).width;
    if (full > W * 0.86) { px *= (W * 0.86) / full; g.font = disp(px); }
    const my = back ? 0.165 * H : 0.13 * H, typed = chars.slice(0, typedLetters(local, chars.length)).join(''), mw = g.measureText(p.title).width;
    g.textAlign = 'left'; g.shadowColor = back ? 'transparent' : 'rgba(0,0,0,0.35)'; g.shadowBlur = 16 * u;
    if (typed) { g.fillText(typed, W / 2 - mw / 2, my); ctx.reportText(g, typed, W / 2 - mw / 2, my); }
    g.shadowColor = 'transparent';
    const rule = eOut((local - 0.07 * chars.length) / 0.4);
    g.fillRect(W / 2 - (mw / 2) * rule, my + px * 0.5, mw * rule, 3 * u);
    if (back) {
      g.font = disp(small, 400); track(g, small); g.textAlign = 'center'; g.fillText(p.sub, W / 2, my + px * 0.5 + 44 * u); untrack(g);
      g.globalAlpha = eOut((local - 1.0) / 0.5); g.font = disp(60 * u, 700, true);
      const sw = g.measureText(p.script).width, room = W - 120 * u;
      if (sw > room) g.font = disp((60 * u * room) / sw, 700, true);
      g.fillText(p.script, W / 2, 0.79 * H); ctx.reportText(g, p.script, W / 2, 0.79 * H);
      g.globalAlpha = 1;
      return;
    }
    String(p.contents).split('\n').filter(Boolean).forEach((line, i) => {   // the contents, a line at a time
      const a = eOut((local - 0.9 - i * 0.22) / 0.3);
      if (a <= 0) return;
      g.globalAlpha = a * out; g.font = disp(32 * u, 400); track(g, 20 * u); g.textAlign = 'right';
      g.fillText(line, W - 60 * u + (1 - a) * 30 * u, 0.5 * H + i * 52 * u); untrack(g);
    });
    const w = eOut((local - 1.3) / 0.6);   // the italic line, wiped in, broken in two and shrunk to the width like the masthead
    if (w > 0) {
      let spx = 110 * u; g.font = disp(spx, 700, true);
      const room = W - 120 * u, lines = scriptLines(p.script, (l) => g.measureText(l).width, room), widest = Math.max(1, ...lines.map((l) => g.measureText(l).width));
      if (widest > room) { spx *= room / widest; g.font = disp(spx, 700, true); }
      g.globalAlpha = out; g.textAlign = 'left'; g.shadowColor = 'rgba(0,0,0,0.4)'; g.shadowBlur = 14 * u;
      g.save(); g.beginPath(); g.rect(0, 0, 60 * u + W * w, H); g.clip();
      lines.forEach((l, i) => { const y = 0.66 * H + i * spx; g.fillText(l, 60 * u, y); ctx.reportText(g, l, 60 * u, y); });
      g.restore(); g.shadowColor = 'transparent';
    }
    g.globalAlpha = 1;
  },
};

// ── common.spread
interface SP { layout: 'swatch' | 'column'; source: string; t: number; fx: number; fy: number; no: string; total: string; name: string; header: string; code: string; cname: string; word: string; page: string; color: string; ink: string; paper: string }
interface SS { c: HTMLCanvasElement; img: HTMLImageElement | null; key: string; text: string }
export const spread: ItemType<SP, SS> = {
  type: 'common.spread', label: '雜誌跨頁', category: 'frame', kind: 'scene',
  doc: '一整頁雜誌（放在影片下面當底，layer: under，字幕疊在上面），相片是素材（source）在 t 秒的畫面（fx、fy 對焦）：layout swatch 是「味道索引」的色頁：color 色整頁，上方欄目名（header）和頁數（no／total）、一張大相片、大號襯線數字（no）＋名稱（name）、右下一張色票卡（色塊就是頁面的顏色，下面色號 code 和色名 cname，可以是設計用的字樣）；layout column 是專欄頁：paper 紙色，左上大號數字、一張相片卡疊上去、相片下緣壓一個空心大字（word）、右上欄目名、右下頁碼（page）；一頁一個項目，頁與頁直接切換（配 common.page 翻頁聲）；美食清單（一道菜一個顏色）、一個城市的幾個地方、商品型錄；配 common.masthead 封面封底、字幕範本 editorial-bar',
  params: [
    { key: 'layout', label: '版型（swatch 色票色頁、column 專欄頁）', type: 'enum', options: ['swatch', 'column'], default: 'swatch' },
    { key: 'source', label: '相片素材', type: 'source-ref', default: '' },
    { key: 't', label: '相片取素材第幾秒', type: 'number', min: 0, max: 99999, step: 0.01, default: 0 },
    { key: 'fx', label: '相片對焦 x', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'fy', label: '相片對焦 y', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'no', label: '編號', type: 'string', default: '01' },
    { key: 'total', label: '總數（swatch）', type: 'string', default: '04' },
    { key: 'name', label: '名稱（swatch，數字旁）', type: 'string', default: '海鮮' },
    { key: 'header', label: '欄目名', type: 'string', default: 'THE TASTE INDEX' },
    { key: 'code', label: '色號（swatch）', type: 'string', default: 'SEA 18-1550' },
    { key: 'cname', label: '色名（swatch）', type: 'string', default: 'CRAB RED' },
    { key: 'word', label: '空心大字（column）', type: 'string', default: 'MARKET' },
    { key: 'page', label: '頁碼（column）', type: 'string', default: 'P.041' },
    { key: 'color', label: '頁面顏色（swatch）', type: 'color', default: '#b23a2e' },
    { key: 'ink', label: '墨色（column）', type: 'color', default: '#161412', theme: 'palette.ink' },
    { key: 'paper', label: '紙色（column）', type: 'color', default: '#ece8e1' },
  ],
  media: stillMedia,
  build(ctx) { const s: SS = { c: canvasIn(ctx.root), img: null, key: '', text: ctx.params.name }; photo(s, ctx.media, ctx.params.source, ctx.params.t); return s; },
  ready(s) { return Promise.all([fontsReady(s.text), imgReady(s.img)]).then(() => undefined); },
  hide(s) { freeCanvas(s.c); },
  draw(ctx, s) {
    const { local, W, H, params: p } = ctx, u = Math.min(W, H) / 1080, g = canvasAt(s.c, W, H);
    photo(s, ctx.media, p.source, p.t);
    const small = 22 * u;
    if (p.layout === 'column') {
      g.fillStyle = p.paper; g.fillRect(0, 0, W, H);
      g.fillStyle = p.ink; g.font = disp(small * 0.9, 400); track(g, small); g.textBaseline = 'middle'; g.textAlign = 'right';
      g.fillText(p.header, W - 60 * u, 0.09 * H); g.fillText(p.page, W - 60 * u, 0.94 * H); untrack(g);
      // the big number is an ornament bleeding off the edge, not words to read: it is not reported
      const a = eOut(local / 0.35); g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.font = disp(380 * u);
      g.save(); g.globalAlpha = a; g.fillText(p.no, 40 * u - (1 - a) * 80 * u, 0.25 * H); g.restore();
      const b = eOut((local - 0.12) / 0.35), cx = 0.2 * W, cy = 0.17 * H + (1 - b) * 50 * u, cw = 0.74 * W, ch = 0.5 * H;
      g.save(); g.globalAlpha = b; g.shadowColor = 'rgba(0,0,0,0.25)'; g.shadowBlur = 18 * u; g.fillStyle = '#fff'; g.fillRect(cx, cy, cw, ch); g.shadowColor = 'transparent';
      coverImage(g, s.img, cx, cy, cw, ch, p.fx, p.fy); g.restore();
      const c = eOut((local - 0.35) / 0.45);
      if (c <= 0) return;
      let px = 230 * u; g.font = disp(px);
      const ww = g.measureText(p.word).width;
      if (ww > W * 0.76) { px *= (W * 0.76) / ww; g.font = disp(px); }
      const wx = 0.12 * W, wy = 0.67 * H + px * 0.32;
      g.save(); g.beginPath(); g.rect(0, 0, wx + (W - wx) * c, H); g.clip();
      g.lineJoin = 'round'; g.fillStyle = p.paper; g.fillText(p.word, wx, wy); g.strokeStyle = p.ink; g.lineWidth = 3.5 * u; g.strokeText(p.word, wx, wy); ctx.reportText(g, p.word, wx, wy);
      g.restore();
      return;
    }
    g.fillStyle = p.color; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffffff'; g.font = disp(small, 400); track(g, small); g.textBaseline = 'middle';
    g.textAlign = 'left'; g.fillText(p.header, 64 * u, 0.04 * H); g.textAlign = 'right'; g.fillText(`${p.no} / ${p.total}`, W - 64 * u, 0.04 * H); untrack(g);
    g.fillRect(64 * u, 0.04 * H + 26 * u, W - 128 * u, 2 * u);
    const a = eOut(local / 0.3);
    g.save(); g.globalAlpha = a; coverImage(g, s.img, 64 * u, 0.065 * H + (1 - a) * 40 * u, W - 128 * u, 0.52 * H, p.fx, p.fy); g.restore();
    const b = eOut((local - 0.15) / 0.3), ny = 0.69 * H + (1 - b) * 30 * u;
    g.save(); g.globalAlpha = b; g.fillStyle = '#ffffff'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.font = disp(230 * u); g.fillText(p.no, 64 * u, ny + 120 * u);   // an ornament, not reported
    const nw = g.measureText(p.no).width; g.font = ser(64 * u);
    g.fillText(p.name, 64 * u + nw + 26 * u, ny - 20 * u); ctx.reportText(g, p.name, 64 * u + nw + 26 * u, ny - 20 * u);
    g.restore();
    const sc = eOut((local - 0.3) / 0.3);   // the swatch card, popping on
    if (sc <= 0) return;
    // sized by the short side (in 9:16 0.27 W × 0.17 H), so its two lines stay on the card in any frame
    const sw = 291.6 * u, sh = 326.4 * u, sx = W - 64 * u - sw, sy = Math.min(0.625 * H, H - sh - 40 * u);
    g.save(); g.globalAlpha = sc; g.translate(sx + sw / 2, sy + sh / 2); g.scale(0.9 + 0.1 * sc, 0.9 + 0.1 * sc); g.translate(-(sx + sw / 2), -(sy + sh / 2));
    g.fillStyle = '#ffffff'; g.fillRect(sx, sy, sw, sh);
    g.fillStyle = p.color; g.fillRect(sx + 14 * u, sy + 14 * u, sw - 28 * u, sh * 0.62);
    g.fillStyle = '#1d1a17'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = disp(24 * u, 700); g.fillText(p.code, sx + 16 * u, sy + sh * 0.62 + 44 * u);
    g.font = disp(16 * u, 400); track(g, 14 * u); g.fillText(p.cname, sx + 16 * u, sy + sh * 0.62 + 78 * u); untrack(g);
    g.restore();
  },
};

// ── common.wordbands
export interface Band { t: number; word: string; bc: string; tc: string }
/** "seconds|WORD|band colour|word colour" a line */
export function parseBands(text: unknown): Band[] {
  return String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [t, word = '', bc, tc] = l.split('|').map((x) => x.trim());
    return { t: Number(t) || 0, word, bc: bc || '#c23b2c', tc: tc || '#ffffff' };
  });
}
/** band k of n's height (px) once it has grown in: the last just covers the W×H frame tipped `angle` degrees (W |sin| + H |cos|,
 *  across the band), each before it 2.1 times thinner than the next, or less (but at least 0.12 H) when there are many */
export function bandHeight(k: number, n: number, W: number, H: number, angle: number): number {
  const a = (angle * Math.PI) / 180, full = W * Math.abs(Math.sin(a)) + H * Math.abs(Math.cos(a));
  const step = n > 1 ? clamp(Math.pow(full / (0.12 * H), 1 / (n - 1)), 1, 2.1) : 1;
  return full / Math.pow(step, Math.max(0, n - 1 - k));
}

interface BP { source: string; t: number; bands: string; bg: string; angle: number }
interface BS { c: HTMLCanvasElement; img: HTMLImageElement | null; key: string; bandsText?: string; bands: Band[] }
export const wordbands: ItemType<BP, BS> = {
  type: 'common.wordbands', label: '斜字帶', category: 'moment', kind: 'scene',
  doc: '一串斜的色帶，帶上重複的斜體粗襯線字慢慢滑動，中間一張白框相片（source 在 t 秒的畫面）：bands 一行一條「秒|字|帶色|字色」，每一條在自己的秒出現、比上一條寬一倍，最後一條蓋滿畫面；bg 是底色；放在影片下面當整頁（layer: under）；「EAT · EVERY · SINGLE · BITE」這種一字一拍的口號、章節之間的節奏段、美食雜誌風；配 common.masthead、common.spread',
  params: [
    { key: 'source', label: '相片素材', type: 'source-ref', default: '' },
    { key: 't', label: '相片取素材第幾秒', type: 'number', min: 0, max: 99999, step: 0.01, default: 0 },
    { key: 'bands', label: '色帶（一行一條：秒|字|帶色|字色）', type: 'text', default: '0|TASTE|#c23b2c|#f6efe4\n0.4|EVERY|#f2b730|#1d1a17\n0.8|SINGLE|#141414|#f6efe4\n1.2|BITE|#8e7cc3|#f6efe4' },
    { key: 'bg', label: '底色', type: 'color', default: '#efe9df' },
    { key: 'angle', label: '斜度（度）', type: 'number', min: -30, max: 30, step: 1, default: -9 },
  ],
  media: stillMedia,
  build(ctx) { const s: BS = { c: canvasIn(ctx.root), img: null, key: '', bands: [] }; photo(s, ctx.media, ctx.params.source, ctx.params.t); return s; },
  ready(s) { return Promise.all([fontsReady(''), imgReady(s.img)]).then(() => undefined); },
  hide(s) { freeCanvas(s.c); },
  draw(ctx, s) {
    const { local, W, H, params: p } = ctx, u = Math.min(W, H) / 1080, g = canvasAt(s.c, W, H);
    photo(s, ctx.media, p.source, p.t);
    g.globalAlpha = clamp(local / 0.1);
    g.fillStyle = p.bg; g.fillRect(0, 0, W, H);
    if (s.bandsText !== p.bands) { s.bandsText = p.bands; s.bands = parseBands(p.bands); }   // parsed once per value, not every frame
    const bands = s.bands;
    let k = -1; bands.forEach((b, i) => { if (local >= b.t) k = i; });
    if (k < 0) { g.globalAlpha = 1; return; }
    const b = bands[k], R = Math.hypot(W, H), h = bandHeight(k, bands.length, W, H, p.angle) * (0.75 + 0.25 * eOut((local - b.t) / 0.25));
    g.save(); g.translate(W / 2, H / 2); g.rotate((p.angle * Math.PI) / 180);
    g.fillStyle = b.bc; g.fillRect(-R / 2, -h / 2, R, h);
    g.beginPath(); g.rect(-R / 2, -h / 2, R, h); g.clip();
    const fs = Math.min(h * 0.62, 170 * u), rows = Math.max(1, Math.floor(h / (fs * 1.05)));
    g.font = disp(fs, 900, true); g.fillStyle = b.tc; g.textBaseline = 'middle';
    const tw = Math.max(1, g.measureText(b.word + ' ').width);
    for (let r = 0; r < rows; r++) {
      const y = -h / 2 + (r + 0.5) * (h / rows), off = (((local * 160 * u * (r % 2 ? 1 : -1) + r * 97 * u) % tw) + tw) % tw;
      for (let x = -R / 2 - off; x < R / 2; x += tw) g.fillText(b.word, x, y);
    }
    g.restore();
    const ph = Math.min(H * 0.42, h * 0.72), pw = ph * 0.78, bd = 10 * u;   // the photo card in the middle
    g.save(); g.translate(W / 2, H / 2); g.rotate((p.angle * Math.PI) / 360);
    g.shadowColor = 'rgba(0,0,0,0.3)'; g.shadowBlur = 20 * u; g.fillStyle = '#fff'; g.fillRect(-pw / 2 - bd, -ph / 2 - bd, pw + 2 * bd, ph + 2 * bd); g.shadowColor = 'transparent';
    coverImage(g, s.img, -pw / 2, -ph / 2, pw, ph, 0.5, 0.6); g.restore();
    g.globalAlpha = 1;
  },
};
