// A scrapbook, promoted 2026-11-05 from the Collage pilot film's fx.prints / fx.scraps (after the user's own Collage style film):
//   common.prints  a page of prints: stills of the footage with deckled white borders and a soft shadow, each dropping from a little
//                  big and turned into place at its own second; washi tape over one, a paperclip on another
// The bits pasted round them are common.scraps (scraps.ts), the title card the title template scrapbook-card, the coloured chips the
// caption template scrap-chip. A pure function of time.
import { clamp, coverPlacement, rng, type Crop, type ItemCtx, type ItemType, type SceneItem } from '@tellcut/engine';
import { cropText } from './polaroid.ts';
import { imagesReady } from './window.ts';

/** `source` is the print's own (empty: the item's); `crop` its crop= (null: the older focus=, kept in fx, fy) */
export interface Print { at: number; t: number; x: number; y: number; w: number; tilt: number; ratio: number; tape: string | null; clip: boolean; fx: number; fy: number; source: string; crop: Crop | null }
/** "seconds|source seconds|x,y,width|tilt|width:height|options" a line; options (spaces or ;): tape, tape=#colour, clip, src=source,
 *  crop=x,y,zoom (a clip's crop, as every photo card writes it), or the older focus=x,y (the picture's object-position; crop= wins) */
/** a typed number, or `d` when the piece is missing, empty or not a number */
const num = (v: string | undefined, d: number) => { const n = Number(v); return v !== undefined && v.trim() !== '' && Number.isFinite(n) ? n : d; };
export function parsePrints(text: unknown): Print[] {
  return String(text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [at, t, box = '0.5,0.5,0.5', tilt, ratio, opts = ''] = l.split('|').map((s) => s.trim());
    // a number that does not read (a typo, a word) falls back to its default rather than placing the print at NaN
    const [x, y, w] = [0, 1, 2].map((i) => num(box.split(',')[i], 0.5)), [rw, rh] = String(ratio || '4:3').split(':').map(Number);
    const o: Record<string, string | true> = {};
    for (const kv of opts.split(/[\s;]+/).filter(Boolean)) { const i = kv.indexOf('='); if (i < 0) o[kv] = true; else o[kv.slice(0, i)] = kv.slice(i + 1); }
    const crop = typeof o.crop === 'string' ? cropText(o.crop) : null;
    const [fx, fy] = crop ? [crop.x, crop.y] : [0, 1].map((i) => num(String(o.focus ?? '').split(',')[i], 0.5));
    return { at: Number(at) || 0, t: Number(t) || 0, x, y, w, tilt: Number(tilt) || 0, ratio: rw > 0 && rh > 0 ? rw / rh : 4 / 3,
      tape: o.tape === undefined ? null : o.tape === true ? 'rgba(236,226,190,0.82)' : o.tape, clip: !!o.clip, fx, fy, source: typeof o.src === 'string' ? o.src : '', crop };
  });
}
/** a deckled edge as a CSS clip-path polygon (percent of the box), `n` steps a side nudged in by up to `amp` percent */
export function deckle(r: () => number, n = 14, amp = 0.7): string {
  const pts: Array<[number, number]> = [], j = () => Math.abs((r() - 0.5) * 2 * amp);
  for (let i = 0; i < n; i++) pts.push([(i / n) * 100, j()]);
  for (let i = 0; i < n; i++) pts.push([100 - j(), (i / n) * 100]);
  for (let i = 0; i < n; i++) pts.push([100 - (i / n) * 100, 100 - j()]);
  for (let i = 0; i < n; i++) pts.push([j(), 100 - (i / n) * 100]);
  return `polygon(${pts.map(([x, y]) => `${x.toFixed(2)}% ${y.toFixed(2)}%`).join(',')})`;
}

interface PP { source: string; prints: string; border: number; paper: string; seed: number }
/** `win` is the window a crop= print's picture is placed in (its border's inside); the other prints' picture covers that box itself */
interface PS { list: Array<{ p: Print; wrap: HTMLDivElement; img: HTMLImageElement; win: HTMLDivElement | null }>; key: string }
const stillOf = (source: string, t: number) => ({ source, t, w: 720 });
/** the source a print's still comes from: its own src=, else the item's */
const sourceOf = (q: Print, p: Pick<PP, 'source'>) => q.source || p.source;

export const prints: ItemType<PP, PS> = {
  type: 'common.prints', label: '剪貼簿相片', category: 'photo', kind: 'overlay',
  doc: '剪貼簿的一頁相片：prints 一行一張「秒|素材秒|x,y,寬|傾斜|寬:高|選項」（x,y 是畫面比例，寬是畫面短邊的比例），相片是素材那一刻的靜止畫面（source；src=素材 讓這一張用別的素材），白色毛邊、柔和陰影，從稍大、轉一點的地方落下擺正；選項 tape 貼紙膠帶（tape=#色）、clip 夾迴紋針、crop=x,y,zoom 取景（和主軌片段的 crop、其他相片卡一樣：x、y 是對準的點，zoom 1 以上放大；避開原片燒的字；舊寫法 focus=x,y 照收）；一頁一個項目，可以疊在滿版影片上或紙底（common.paper）上，後面那張大的會蓋住前面；配 common.scraps 紙片、字幕範本 scrap-chip 紙條、標題範本 scrapbook-card、common.wipe 的 tiles 格子轉場；旅行、家庭、寵物的剪貼簿、回憶相簿',
  params: [
    { key: 'source', label: '素材', type: 'source-ref', default: '' },
    { key: 'prints', label: '相片（一行一張：秒|素材秒|x,y,寬|傾斜|寬:高|選項 tape、clip、src=素材、crop=x,y,zoom；寬是短邊比例）', type: 'text', default: '0|0|0.32,0.4,0.5|-3|4:3|tape\n0.4|0|0.68,0.55,0.5|3|3:4|clip' },
    { key: 'border', label: '白邊（相片寬的比例）', type: 'number', min: 0, max: 0.2, step: 0.005, default: 0.035 },
    { key: 'paper', label: '相片紙色', type: 'color', default: '#fbf8f1' },
    { key: 'seed', label: '毛邊亂數種子', type: 'number', min: 1, max: 9999, step: 1, default: 3 },
  ],
  media(item: SceneItem) {
    const p = item.params as unknown as PP;
    return { videos: [], stills: parsePrints(p.prints).filter((q) => sourceOf(q, p)).map((q) => stillOf(sourceOf(q, p), q.t)) };
  },
  build(ctx) { const s: PS = { list: [], key: '' }; makePrints(ctx, s); return s; },
  ready(s) { return imagesReady(s.list.map((it) => it.img)); },
  draw(ctx, s) {
    const { local, dur, W, H, params: p, motion } = ctx;
    makePrints(ctx, s);
    const out = clamp((dur - local) / 0.25), spring = motion.spring({ duration: 0.42, bounce: 0.3 });
    for (const { p: q, wrap, img, win } of s.list) {
      const t = local - q.at;
      if (t < 0) { wrap.style.display = 'none'; continue; }
      const k = spring(t), w = q.w * Math.min(W, H), h = w / q.ratio, b = p.border * w, sc = 1.18 - 0.18 * k, rot = q.tilt + (1 - k) * 7, dy = (1 - k) * -0.03 * H;
      Object.assign(wrap.style, { display: 'block', left: `${((q.x * W - w / 2) / W) * 100}%`, top: `${((q.y * H - h / 2 + dy) / H) * 100}%`, width: `${(w / W) * 100}%`, height: `${(h / H) * 100}%`,
        opacity: String(clamp(t / 0.12) * out), transform: `rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(4)})` });
      const inside = { left: `${(b / w) * 100}%`, top: `${(b / h) * 100}%`, width: `${((w - 2 * b) / w) * 100}%`, height: `${((h - 2 * b) / h) * 100}%` };
      if (!win) { Object.assign(img.style, inside); continue; }
      // crop=: the picture placed in the window the way a clip's crop places it (covering it until the still's size is known)
      Object.assign(win.style, inside);
      const iw = img.naturalWidth, ih = img.naturalHeight, bw = w - 2 * b, bh = h - 2 * b;
      const c = iw > 0 && ih > 0 && bw > 0 && bh > 0 ? coverPlacement(iw, ih, bw, bh, q.crop!) : null;
      Object.assign(img.style, c ? { objectFit: 'fill', left: `${(c.left / bw) * 100}%`, top: `${(c.top / bh) * 100}%`, width: `${(c.width / bw) * 100}%`, height: `${(c.height / bh) * 100}%` }
        : { objectFit: 'cover', left: '0%', top: '0%', width: '100%', height: '100%' });
    }
  },
};

/** the prints' elements, (re)made when what they show changes */
function makePrints(ctx: ItemCtx<PP>, s: PS) {
    const { params: p, media, root } = ctx, k = Math.min(ctx.W, ctx.H) / 1080;
    const key = `${p.source}|${p.prints}|${p.seed}|${p.paper}|${k}`;
    if (s.key !== key) {   // (re)build the prints when what they show changes
      for (const it of s.list) it.wrap.remove();
      const r = rng(p.seed);
      s.list = parsePrints(p.prints).map((q) => {
        const wrap = document.createElement('div'), card = document.createElement('div'), img = document.createElement('img');
        wrap.style.cssText = `position:absolute;left:0;top:0;filter:drop-shadow(0 ${6 * k}px ${10 * k}px rgba(40,25,10,0.38));transform-origin:50% 50%`;
        card.style.cssText = `position:absolute;inset:0;background:${p.paper};clip-path:${deckle(r)}`;
        const src = sourceOf(q, p);
        if (src) img.src = media.stillUrl(stillOf(src, q.t));
        let win: HTMLDivElement | null = null;
        if (q.crop) {
          win = document.createElement('div');
          win.style.cssText = 'position:absolute;overflow:hidden';
          img.style.cssText = 'position:absolute;max-width:none';
          win.appendChild(img); card.appendChild(win);
        } else {
          img.style.cssText = `position:absolute;object-fit:cover;object-position:${q.fx * 100}% ${q.fy * 100}%`;
          card.appendChild(img);
        }
        wrap.appendChild(card);
        if (q.tape) {
          const tape = document.createElement('div');
          tape.style.cssText = `position:absolute;left:33%;top:-5%;width:34%;height:11%;background:${q.tape};opacity:0.85;transform:rotate(${((r() - 0.5) * 8).toFixed(1)}deg);clip-path:${deckle(r, 6, 3)}`;
          wrap.appendChild(tape);
        }
        if (q.clip) {
          const clip = document.createElement('div');
          clip.innerHTML = '<svg viewBox="0 0 20 52" width="100%" height="100%"><path d="M6 44 V10 a4 4 0 0 1 8 0 V40 a6 6 0 0 1 -12 0 V8 a8 8 0 0 1 16 0 V44" fill="none" stroke="#9aa3ab" stroke-width="2.4" stroke-linecap="round"/></svg>';
          clip.style.cssText = 'position:absolute;left:12%;top:-9%;width:7%;height:24%';
          wrap.appendChild(clip);
        }
        root.appendChild(wrap);
        return { p: q, wrap, img, win };
      });
      s.key = key;
    }
}
