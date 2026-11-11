// common.spread, a full page of the magazine kit (editorial-kit.ts): layout swatch, a colour page of a "taste index" (header, photo
// card, big number and a name, a swatch card in the page's colour); layout column, a paper page (a big number, a photo card, an outlined
// word over its foot, the column's name and a page number). A pure function of time.
import { eOut3Clamped, type ItemType } from '@tellcut/engine';
import { SERIF, coverImage, disp, fitSet, fontsReady, photo, stillMedia, track, untrack } from './editorial-kit.ts';
import { canvasAt, freeCanvas, canvasIn } from './inkline.ts';
import { imagesReady } from './window.ts';

const ser = (px: number, w = 700) => `${w} ${px}px "${SERIF}", serif`;

interface SP { layout: 'swatch' | 'column'; source: string; t: number; fx: number; fy: number; no: string; total: string; name: string; header: string; code: string; cname: string; word: string; page: string; color: string; ink: string; paper: string }
interface SS { c: HTMLCanvasElement; img: HTMLImageElement | null; key: string; text: string }
/** common.magazine's name for the same thing, taken too: kicker (the column's name) for header (layout and page already match) */
export function spreadParams(p: SP & { kicker?: unknown }): SP {
  return typeof p.kicker === 'string' ? { ...p, header: p.kicker } : p;
}
export const spread: ItemType<SP, SS> = {
  type: 'common.spread', label: '雜誌跨頁', category: 'frame', kind: 'scene',
  doc: '一整頁雜誌（放在影片下面當底，layer: under，字幕疊在上面），相片是素材（source）在 t 秒的畫面（fx、fy 對焦）：layout swatch 是「味道索引」的色頁：color 色整頁，上方欄目名（header）和頁數（no／total）、一張大相片、大號襯線數字（no）＋名稱（name）、右下一張色票卡（色塊就是頁面的顏色，下面色號 code 和色名 cname，可以是設計用的字樣）；layout column 是專欄頁：paper 紙色，左上大號數字、一張相片卡疊上去、相片下緣壓一個空心大字（word）、右上欄目名、右下頁碼（page）；一頁一個項目，頁與頁直接切換（配 common.page 翻頁聲）；美食清單（一道菜一個顏色）、一個城市的幾個地方、商品型錄；配 common.masthead 封面封底、字幕範本 editorial-bar；spread 的相片是靜圖、整頁在影片下面，要影片在版面的窗格裡播用 common.magazine；也收 common.magazine 的參數名 kicker（＝header）',
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
  ready(s) { return Promise.all([fontsReady(s.text), imagesReady([s.img])]).then(() => undefined); },
  hide(s) { freeCanvas(s.c); },
  draw(ctx, s) {
    const { local, W, H } = ctx, p = spreadParams(ctx.params), u = Math.min(W, H) / 1080, g = canvasAt(s.c, W, H);
    photo(s, ctx.media, p.source, p.t);
    const small = 22 * u;
    if (p.layout === 'column') {
      g.fillStyle = p.paper; g.fillRect(0, 0, W, H);
      g.fillStyle = p.ink; g.font = disp(small * 0.9, 400); track(g, small); g.textBaseline = 'middle'; g.textAlign = 'right';
      g.fillText(p.header, W - 60 * u, 0.09 * H); g.fillText(p.page, W - 60 * u, 0.94 * H); untrack(g);
      // the big number is an ornament bleeding off the edge, not words to read: it is not reported
      const a = eOut3Clamped(local / 0.35); g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.font = disp(380 * u);
      g.save(); g.globalAlpha = a; g.fillText(p.no, 40 * u - (1 - a) * 80 * u, 0.25 * H); g.restore();
      const b = eOut3Clamped((local - 0.12) / 0.35), cx = 0.2 * W, cy = 0.17 * H + (1 - b) * 50 * u, cw = 0.74 * W, ch = 0.5 * H;
      g.save(); g.globalAlpha = b; g.shadowColor = 'rgba(0,0,0,0.25)'; g.shadowBlur = 18 * u; g.fillStyle = '#fff'; g.fillRect(cx, cy, cw, ch); g.shadowColor = 'transparent';
      coverImage(g, s.img, cx, cy, cw, ch, p.fx, p.fy); g.restore();
      const c = eOut3Clamped((local - 0.35) / 0.45);
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
    const a = eOut3Clamped(local / 0.3);
    g.save(); g.globalAlpha = a; coverImage(g, s.img, 64 * u, 0.065 * H + (1 - a) * 40 * u, W - 128 * u, 0.52 * H, p.fx, p.fy); g.restore();
    const b = eOut3Clamped((local - 0.15) / 0.3), ny = 0.69 * H + (1 - b) * 30 * u;
    g.save(); g.globalAlpha = b; g.fillStyle = '#ffffff'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.font = disp(230 * u); g.fillText(p.no, 64 * u, ny + 120 * u);   // an ornament, not reported
    const sw = 291.6 * u, sh = 326.4 * u, sx = W - 64 * u - sw, sy = Math.min(0.625 * H, H - sh - 40 * u);
    // the name ends 20 px before the swatch card beside it (smaller when it would run under it)
    const nw = g.measureText(p.no).width;
    fitSet(g, String(p.name ?? ''), 64 * u, (q) => ser(q), sx - 20 * u - (64 * u + nw + 26 * u));
    g.fillText(p.name, 64 * u + nw + 26 * u, ny - 20 * u); ctx.reportText(g, p.name, 64 * u + nw + 26 * u, ny - 20 * u);
    g.restore();
    const sc = eOut3Clamped((local - 0.3) / 0.3);   // the swatch card, popping on
    if (sc <= 0) return;
    // sized by the short side (in 9:16 0.27 W × 0.17 H), so its two lines stay on the card in any frame (sw, sh, sx, sy above)
    g.save(); g.globalAlpha = sc; g.translate(sx + sw / 2, sy + sh / 2); g.scale(0.9 + 0.1 * sc, 0.9 + 0.1 * sc); g.translate(-(sx + sw / 2), -(sy + sh / 2));
    g.fillStyle = '#ffffff'; g.fillRect(sx, sy, sw, sh);
    g.fillStyle = p.color; g.fillRect(sx + 14 * u, sy + 14 * u, sw - 28 * u, sh * 0.62);
    g.fillStyle = '#1d1a17'; g.textAlign = 'left'; g.textBaseline = 'middle';
    // the code and the colour's name shrink to the card's width less its margins
    fitSet(g, String(p.code ?? ''), 24 * u, (q) => disp(q, 700), sw - 32 * u); g.fillText(p.code, sx + 16 * u, sy + sh * 0.62 + 44 * u);
    fitSet(g, String(p.cname ?? ''), 16 * u, (q) => disp(q, 400), sw - 32 * u, 14 * u); g.fillText(p.cname, sx + 16 * u, sy + sh * 0.62 + 78 * u); untrack(g);
    g.restore();
  },
};
