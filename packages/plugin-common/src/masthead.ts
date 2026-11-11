// common.masthead, the covers of the magazine kit (editorial-kit.ts): front, a cover over the footage, its masthead typed a letter at a
// time with a rule drawn under it, issue lines, contents down the right, an italic line wiped in; back, the back cover, a colour page
// with NEXT ISSUE, the masthead, a photo band and an italic line. A pure function of time.
import { clamp, eOut3Clamped, type ItemType } from '@tellcut/engine';
import { coverImage, disp, fitSet, fontsReady, photo, stillMedia, track, untrack } from './editorial-kit.ts';
import { canvasAt, freeCanvas, canvasIn } from './inkline.ts';
import { graphemes } from './text.ts';
import { imagesReady } from './window.ts';

/** how many of the masthead's letters show at `local`: one every 0.07 s from the start */
export const typedLetters = (local: number, count: number) => (local < 0 ? 0 : Math.min(count, Math.floor(local / 0.07) + 1));
/** the letters as they are typed: graphemes (text.ts), so a flag or an emoji joined by ZWJ comes in whole, as in progress.osdShown */
export { graphemes };
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

/** the issue lines' middle and the space kept between their lower edge and the masthead's letters, × u */
const ISSUE_Y = 70, ISSUE_GAP = 26;
/** where the masthead's middle sits: 0.13 H (0.165 H on the back cover), pushed down under the issue lines only when the title,
 *  centred, runs into one of them sideways — in a square frame it is about as wide as the page and they reach its middle; a tall
 *  frame's 0.13 H is already below them and a wide one leaves room on both sides. `asc` is how far the letters rise above the middle,
 *  `left` / `right` the issue lines' widths, `small` their size. */
export function mastheadY(W: number, H: number, u: number, back: boolean, title: { w: number; asc: number }, left: number, right: number, small: number): number {
  const my = (back ? 0.165 : 0.13) * H, x0 = W / 2 - title.w / 2, x1 = W / 2 + title.w / 2;
  const hits = (left > 0 && x0 < 60 * u + left) || (right > 0 && x1 > W - 60 * u - right);
  return hits ? Math.max(my, ISSUE_Y * u + small / 2 + ISSUE_GAP * u + title.asc) : my;
}

// ── common.masthead
interface MP { mode: 'front' | 'back'; title: string; issueL: string; issueR: string; contents: string; script: string; sub: string; source: string; t: number; color: string; ink: string }
interface MS { c: HTMLCanvasElement; img: HTMLImageElement | null; key: string; text: string }
/** common.magazine's names for the same things, taken too (an agent that has just used the magazine writes them): layout cover /
 *  back for mode, issue for the right issue line, no (the issue number) for the left one, accent for the back cover's colour. When
 *  both are given the magazine's name wins: it is the one written on purpose, the other may be a default. */
export function mastheadParams(p: MP & { layout?: unknown; issue?: unknown; no?: unknown; accent?: unknown }): MP {
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const mode = p.layout === 'cover' || p.layout === 'front' ? 'front' : p.layout === 'back' ? 'back' : p.mode;
  return { ...p, mode, issueR: str(p.issue) ?? p.issueR, issueL: str(p.no) ?? p.issueL, color: (str(p.accent) || undefined) ?? p.color };
}
export const masthead: ItemType<MP, MS> = {
  type: 'common.masthead', label: '雜誌刊頭', category: 'frame', kind: 'overlay',
  doc: '雜誌的封面與封底：mode front 疊在滿版影片上，刊頭（title）一個字一個字打出來、下面拉出一條細線，左右上角兩行期別小字（issueL、issueR），右邊目錄（contents 一行一條）一行行出現，左下斜體一行（script）擦出來；mode back 是封底：color 色的整頁，上方 NEXT ISSUE／SEE YOU AGAIN、刊頭、細線、期別（sub），中間一條相片（source 在 t 秒的畫面），下面斜體一行（script）；旅行、城市、美食的雜誌風開場和結尾，中間配 common.spread 雜誌頁、common.wordbands 字帶、標題範本 didone-full、字幕範本 editorial-bar；影片要在雜誌版面的窗格裡播（內頁、清單、封面加封面標、封底按鈕）用 common.magazine，masthead 是刊頭疊在滿版影片上、封底整頁色；也收 common.magazine 的參數名：layout（cover＝front、back）、issue（右上）、no（左上）、accent（封底底色）',
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
  media: (item) => (mastheadParams(item.params as unknown as MP).mode === 'back' ? stillMedia(item) : { videos: [], stills: [] }),
  build(ctx) {
    const s: MS = { c: canvasIn(ctx.root), img: null, key: '', text: `${ctx.params.title}${ctx.params.script}${ctx.params.sub}` };
    if (mastheadParams(ctx.params).mode === 'back') photo(s, ctx.media, ctx.params.source, ctx.params.t);
    return s;
  },
  ready(s) { return Promise.all([fontsReady(s.text), imagesReady([s.img])]).then(() => undefined); },
  hide(s) { freeCanvas(s.c); },
  draw(ctx, s) {
    const { local, dur, W, H } = ctx, p = mastheadParams(ctx.params), u = Math.min(W, H) / 1080, g = canvasAt(s.c, W, H);
    const back = p.mode === 'back', out = clamp((dur - local) / 0.2);
    if (back) photo(s, ctx.media, p.source, p.t);
    g.globalAlpha = back ? 1 : out;
    if (back) {
      g.fillStyle = p.color; g.fillRect(0, 0, W, H);
      const by = 0.33 * H, bh = 0.43 * H, k = eOut3Clamped((local - 0.3) / 0.5);
      g.save(); g.beginPath(); g.rect(0, by + (bh / 2) * (1 - k), W, bh * k); g.clip(); coverImage(g, s.img, 0, by, W, bh, 0.5, 0.45); g.restore();
    }
    let small = 22 * u;
    g.fillStyle = p.ink; g.textBaseline = 'middle'; g.font = disp(small, 400); track(g, small);
    const issueL = back ? 'NEXT ISSUE' : String(p.issueL ?? ''), issueR = back ? 'SEE YOU AGAIN' : String(p.issueR ?? '');
    let lw = issueL ? g.measureText(issueL).width : 0, rw = issueR ? g.measureText(issueR).width : 0;
    // the two issue lines shrink together (with their tracking) when they would come within 40 px of each other
    const iroom = W - 160 * u;
    if (lw + rw > iroom) {
      small *= iroom / (lw + rw); g.font = disp(small, 400); track(g, small);
      lw = issueL ? g.measureText(issueL).width : 0; rw = issueR ? g.measureText(issueR).width : 0;
    }
    g.textAlign = 'left'; g.fillText(issueL, 60 * u, ISSUE_Y * u);
    g.textAlign = 'right'; g.fillText(issueR, W - 60 * u, ISSUE_Y * u); untrack(g);
    const chars = graphemes(p.title);
    let px = 190 * u; g.font = disp(px);
    const full = g.measureText(p.title).width;
    if (full > W * 0.86) { px *= (W * 0.86) / full; g.font = disp(px); }
    const m = g.measureText(p.title), mw = m.width, asc = Number.isFinite(m.actualBoundingBoxAscent) ? m.actualBoundingBoxAscent : px * 0.36;
    const my = mastheadY(W, H, u, back, { w: mw, asc }, lw, rw, small), typed = chars.slice(0, typedLetters(local, chars.length)).join('');
    g.textAlign = 'left'; g.shadowColor = back ? 'transparent' : 'rgba(0,0,0,0.35)'; g.shadowBlur = 16 * u;
    if (typed) { g.fillText(typed, W / 2 - mw / 2, my); ctx.reportText(g, typed, W / 2 - mw / 2, my); }
    g.shadowColor = 'transparent';
    const rule = eOut3Clamped((local - 0.07 * chars.length) / 0.4);
    g.fillRect(W / 2 - (mw / 2) * rule, my + px * 0.5, mw * rule, 3 * u);
    if (back) {
      fitSet(g, String(p.sub ?? ''), 22 * u, (q) => disp(q, 400), W - 120 * u, 22 * u); g.textAlign = 'center'; g.fillText(p.sub, W / 2, my + px * 0.5 + 44 * u); untrack(g);
      g.globalAlpha = eOut3Clamped((local - 1.0) / 0.5); g.font = disp(60 * u, 700, true);
      const sw = g.measureText(p.script).width, room = W - 120 * u;
      if (sw > room) g.font = disp((60 * u * room) / sw, 700, true);
      g.fillText(p.script, W / 2, 0.79 * H); ctx.reportText(g, p.script, W / 2, 0.79 * H);
      g.globalAlpha = 1;
      return;
    }
    // the contents, a line at a time, 52 apart; a long list closes up (and its lines get smaller with it) to stay within 0.13 H,
    // clear of the italic line under it
    const rows = String(p.contents).split('\n').filter(Boolean), step = rows.length > 1 ? Math.min(52 * u, (0.13 * H) / (rows.length - 1)) : 52 * u, ck = step / (52 * u);
    rows.forEach((line, i) => {
      const a = eOut3Clamped((local - 0.9 - i * 0.22) / 0.3);
      if (a <= 0) return;
      g.globalAlpha = a * out; g.font = disp(32 * u * ck, 400); track(g, 20 * u * ck); g.textAlign = 'right';
      g.fillText(line, W - 60 * u + (1 - a) * 30 * u, 0.5 * H + i * 52 * u * ck); untrack(g);
    });
    const w = eOut3Clamped((local - 1.3) / 0.6);   // the italic line, wiped in, broken in two and shrunk to the width like the masthead
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
