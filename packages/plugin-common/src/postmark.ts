// A postmark and a postage stamp (from the uk-postcard short), as DOM pieces any block can place: the postmark is a double ring with
// the place along the top arc and its local name along the bottom, the date across, five wavy cancel lines, unevenly inked (specks
// that did not print) and thumped down with a multiply blend; the stamp is perforated paper with a picture (a still of the footage, or
// a painted sun over the sea), a country band and the year. common.postmark puts them on any picture; common.postcard on its cards.
import { clamp, cssCamel, eOut3 as eOut, h, hash01, type ItemType, type MediaApi, prog } from '@tellcut/engine';
import { showStill, stillRef, windowEl, imagesReady, type Still, type Win } from './window.ts';

export const SERIF = "'Noto Serif TC', serif";
/** deterministic hash noise in 0..1 */
export const hash = (n: number) => hash01(n, 1);
const DEG = Math.PI / 180;

export interface Mark { top: string; bottom: string; date: string; at?: number }
export interface MarkEl { el: HTMLElement; cv: HTMLCanvasElement; top: HTMLElement[]; bottom: HTMLElement[]; date: HTMLElement; key: string }

export function markEl(parent: HTMLElement): MarkEl {
  const el = h('div', null, null, parent), cv = h('canvas', null, null, el), date = h('div', null, null, el);
  cssCamel(el, { position: 'absolute', mixBlendMode: 'multiply', pointerEvents: 'none' });
  cssCamel(cv, { position: 'absolute', left: '0', top: '0' });
  cssCamel(date, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1', fontWeight: '700', transform: 'translate(-50%, -50%)' });
  return { el, cv, top: [], bottom: [], date, key: '' };
}

/** the uneven ink: a white sheet with specks punched out, as a mask image (one per size), `dpr` device pixels per px */
const specks = new Map<string, string>();
function speckMask(w: number, hh: number, r: number, dpr = 1) {
  const key = `${w}x${hh}@${r}x${dpr}`;
  if (!specks.has(key)) {
    const c = document.createElement('canvas'); c.width = Math.ceil(w * dpr); c.height = Math.ceil(hh * dpr);
    const g = c.getContext('2d')!;
    g.scale(c.width / w, c.height / hh);
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, hh); g.globalCompositeOperation = 'destination-out';
    const n = Math.round(380 * (w * hh) / 40000);
    for (let i = 0; i < n; i++) {
      const x = hash(i * 1.37 + r) * w, y = hash(i * 2.71 + r) * hh, s = (0.6 + hash(i * 5.3) * 2.2) * (r / 74);
      g.globalAlpha = 0.35 + hash(i * 3.9) * 0.6; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
    }
    specks.set(key, c.toDataURL());
  }
  return specks.get(key)!;
}

/** the mark's size for radius r: the ring and, to its right, the wavy lines */
export const markSize = (r: number) => ({ w: Math.ceil(r * 2 + r * 1.5 + 20), h: Math.ceil(r * 2 + 20), cx: r + 10, cy: r + 10 });

/**
 * Draw postmark `mk` with ring radius r (px) centred at (x, y), tilted −13°: it thumps down at `mk.at` (bigger, then settling);
 * `complete` shows it as landed whatever the time. `waves`: the cancel lines. `dpr`: device pixels per px of the layer the mark sits
 * in (a layer scaled up for a 4K frame: the rings and the uneven ink are drawn at that size, not stretched).
 */
export function drawMark(m: MarkEl, mk: Mark | null | undefined, r: number, x: number, y: number, local: number, complete: boolean, color: string, waves = true, alpha = 0.82, dpr = 1) {
  const p = !mk ? 0 : complete || mk.at === undefined ? 1 : clamp((local - mk.at) / 0.16);
  cssCamel(m.el, { display: p > 0 ? 'block' : 'none' });
  if (!mk || p <= 0) return;
  const S = markSize(r), key = JSON.stringify([mk.top, mk.bottom, mk.date, r, color, waves, dpr]);
  if (m.key !== key) {
    m.key = key;
    const g = m.cv.getContext('2d')!;
    m.cv.width = Math.ceil(S.w * dpr); m.cv.height = Math.ceil(S.h * dpr);
    cssCamel(m.cv, { width: `${S.w}px`, height: `${S.h}px` });
    g.scale(m.cv.width / S.w, m.cv.height / S.h);
    g.strokeStyle = color;
    g.lineWidth = r * 0.043; g.beginPath(); g.arc(S.cx, S.cy, r - 2, 0, 7); g.stroke();
    g.lineWidth = r * 0.022; g.beginPath(); g.arc(S.cx, S.cy, r * 0.66, 0, 7); g.stroke();
    g.lineWidth = r * 0.019; g.beginPath(); g.moveTo(S.cx - r * 0.42, S.cy - r * 0.24); g.lineTo(S.cx + r * 0.42, S.cy - r * 0.24); g.moveTo(S.cx - r * 0.42, S.cy + r * 0.24); g.lineTo(S.cx + r * 0.42, S.cy + r * 0.24); g.stroke();
    if (waves) {
      g.lineWidth = r * 0.04;
      for (let k = 0; k < 5; k++) {
        const yy = S.cy - r * 0.56 + k * r * 0.28;
        g.beginPath();
        for (let xx = 0; xx <= r * 1.5; xx += 3) { const w = yy + Math.sin(xx / (r * 0.16)) * r * 0.07; if (xx) g.lineTo(S.cx + r + 6 + xx, w); else g.moveTo(S.cx + r + 6 + xx, w); }
        g.stroke();
      }
    }
    // the letters along the arcs: one span each, turned to follow the ring
    for (const e of [...m.top, ...m.bottom]) e.remove();
    const arc = (text: string, top: boolean) => {
      const chars = [...String(text ?? '')], size = Math.round(r * 0.24), step = (top ? 1 : -1) * Math.min(0.32, 2.3 / Math.max(1, chars.length)) * (size / 20);
      return chars.map((ch, i) => {
        const a = (top ? -Math.PI / 2 : Math.PI / 2) + (i - (chars.length - 1) / 2) * step, e = h('div', null, null, m.el);
        e.textContent = ch;
        cssCamel(e, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1', fontWeight: '700', fontSize: `${size}px`, left: `${S.cx + Math.cos(a) * r * 0.83}px`, top: `${S.cy + Math.sin(a) * r * 0.83}px`,
          transform: `translate(-50%, -50%) rotate(${(a + (top ? Math.PI / 2 : -Math.PI / 2)) / DEG}deg)` });
        return e;
      });
    };
    m.top = arc(mk.top, true); m.bottom = arc(mk.bottom, false);
    m.date.textContent = mk.date ?? '';
    m.el.appendChild(m.date);
    const mask = `url(${speckMask(S.w, S.h, r, dpr)})`;
    cssCamel(m.el, { width: `${S.w}px`, height: `${S.h}px`, color, fontFamily: SERIF, maskImage: mask, webkitMaskImage: mask, maskSize: '100% 100%', webkitMaskSize: '100% 100%' });
    cssCamel(m.date, { left: `${S.cx}px`, top: `${S.cy}px`, fontSize: `${Math.round(r * (String(mk.date ?? '').length > 6 ? 0.19 : 0.3))}px` });
  }
  const s = 1 + (1 - eOut(p)) * 0.22;
  cssCamel(m.el, { left: `${x - S.cx}px`, top: `${y - S.cy}px`, transformOrigin: `${S.cx}px ${S.cy}px`, transform: `rotate(-13deg) scale(${s.toFixed(4)})`, opacity: String(alpha * clamp(p * 1.4)) });
}

// ---------- the stamp ----------
export const STAMP_W = 140, STAMP_H = 170;
const TINT: Record<string, string> = { FRANCE: '#2f4f86', POLSKA: '#9a3030', EESTI: '#2b5a6e', MORNING: '#b0722c', EUROPA: '#5b4a7a', POSTE: '#7a5230' };
/** the band colour: given, or the country's, or one picked from the label */
export const stampTint = (label: string, tint?: string) => tint || TINT[String(label).toUpperCase()] || ['#2f4f86', '#9a3030', '#2b5a6e', '#b0722c', '#5b4a7a', '#3f6b4a'][[...String(label)].reduce((a, c) => a + c.charCodeAt(0), 0) % 6];

export interface StampSpec { label: string; year?: string; tint?: string }
export interface StampEl { el: HTMLElement; cv: HTMLCanvasElement; win: Win; label: HTMLElement; year: HTMLElement; key: string }

export function stampEl(parent: HTMLElement): StampEl {
  const el = h('div', null, null, parent), cv = h('canvas', null, null, el), win = windowEl(el), label = h('div', null, null, el), year = h('div', null, null, el);
  cssCamel(el, { position: 'absolute', width: `${STAMP_W}px`, height: `${STAMP_H}px`, filter: 'drop-shadow(0 2px 3px rgba(40,25,10,0.35))' });
  cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: `${STAMP_W}px`, height: `${STAMP_H}px` });
  cssCamel(win.box, { left: '12px', top: '12px' });
  cssCamel(label, { position: 'absolute', left: '0', width: '100%', top: `${12 + 116 + 16}px`, textAlign: 'center', transform: 'translateY(-50%)', whiteSpace: 'pre', lineHeight: '1',
    fontFamily: SERIF, fontWeight: '700', fontSize: '17px', color: '#fbf8f1' });
  cssCamel(year, { position: 'absolute', right: '17px', top: '16px', whiteSpace: 'pre', lineHeight: '1', fontFamily: SERIF, fontWeight: '700', fontSize: '16px', color: 'rgba(255,255,255,0.92)',
    textShadow: '0 0 3px rgba(0,0,0,0.6)' });
  return { el, cv, win, label, year, key: '' };
}

/** the stamp (140×170 px before `scale`) with its top-left at (x, y), turned `rot` degrees; the picture is `still` (stamp crop) or the stand-in.
 *  `dpr`: device pixels per stamp px for its paper (at least 2: the stamp's own scale times the layer's for a big or 4K stamp) */
export function drawStamp(media: MediaApi, st: StampEl, spec: StampSpec, still: Still | null | undefined, x: number, y: number, rot: number, scale = 1, dpr = 2) {
  const tint = stampTint(spec.label, spec.tint), d = Math.max(2, dpr), key = `${tint}@${d}`;
  if (st.key !== key) {
    st.key = key;
    const c = st.cv, g = c.getContext('2d')!;
    c.width = Math.ceil(STAMP_W * d); c.height = Math.ceil(STAMP_H * d); g.scale(c.width / STAMP_W, c.height / STAMP_H);
    g.fillStyle = '#fbf8f1'; g.fillRect(0, 0, STAMP_W, STAMP_H);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i <= STAMP_W; i += 14) { g.beginPath(); g.arc(i, 0, 5, 0, 7); g.arc(i, STAMP_H, 5, 0, 7); g.fill(); }
    for (let i = 0; i <= STAMP_H; i += 14) { g.beginPath(); g.arc(0, i, 5, 0, 7); g.arc(STAMP_W, i, 5, 0, 7); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = tint; g.fillRect(10, 10, 120, 150);
  }
  showStill(media, st.win, still ? { ...still, crop: still.crop ?? { x: 0.5, y: 0.45, zoom: 1.6 } } : null, 116, 116);
  st.label.textContent = [...String(spec.label ?? '')].join(' ');
  st.year.textContent = spec.year ?? '';
  cssCamel(st.el, { left: `${x}px`, top: `${y}px`, transformOrigin: '50% 50%', transform: `rotate(${rot}deg) scale(${scale})` });
}

interface P { top: string; bottom: string; date: string; at: number; x: number; y: number; size: number; waves: boolean; color: string; stamp: boolean; label: string; year: string; source: string; t: number }
interface S { mark: MarkEl; stamp: StampEl; layer: HTMLElement }

export const postmark: ItemType<P, S> = {
  type: 'common.postmark', label: '郵戳', category: 'travel', kind: 'overlay',
  doc: '一個郵戳「蓋」上畫面：雙圈、上弧地名、下弧中文地名、中間日期、右邊五條波浪線、墨色不均，可附一張打孔郵票（圖是素材某一刻的畫面，沒給就是畫的夕陽海）；旅行、寄信、到此一遊、日期戳',
  params: [
    { key: 'top', label: '上弧文字', type: 'string', default: 'PARIS' },
    { key: 'bottom', label: '下弧文字', type: 'string', default: '巴黎' },
    { key: 'date', label: '中間日期', type: 'string', default: '2022.05.26' },
    { key: 'at', label: '蓋下的時間（秒）', type: 'number', min: 0, max: 60, step: 0.05, default: 0.4 },
    { key: 'x', label: '圓心 x（畫面寬比例；郵票在它右上方）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.42 },
    { key: 'y', label: '圓心 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.62 },
    { key: 'size', label: '半徑（畫面短邊 %）', type: 'number', min: 3, max: 40, step: 0.5, default: 13 },
    { key: 'waves', label: '波浪線', type: 'bool', default: true },
    { key: 'color', label: '墨色', type: 'color', default: '#2a3550' },
    { key: 'stamp', label: '附郵票', type: 'bool', default: true },
    { key: 'label', label: '郵票國名', type: 'string', default: 'FRANCE' },
    { key: 'year', label: '郵票年份', type: 'string', default: '2022' },
    { key: 'source', label: '郵票的圖（素材；空＝畫的）', type: 'source-ref', default: '' },
    { key: 't', label: '郵票的圖取素材第幾秒', type: 'number', min: 0, max: 36000, step: 0.1, default: 0 },
  ],
  media(item) {
    const p = item.params as Partial<P>;
    return { videos: [], stills: p.stamp !== false && p.source ? [stillRef({ source: p.source, t: Number(p.t) || 0 })] : [] };
  },
  build(ctx) {
    const layer = h('div', null, null, ctx.root);
    cssCamel(layer, { position: 'absolute', left: '0', top: '0', transformOrigin: '0 0' });
    const stamp = stampEl(layer), s: S = { stamp, mark: markEl(layer), layer };
    postmark.draw(ctx, s);   // starts loading the stamp's still now, so ready() can wait for it
    return s;
  },
  ready: (s) => imagesReady([s.stamp.win.img]),
  draw(ctx, s) {
    const p = ctx.params, { W, H, local, dur } = ctx, k = Math.min(W, H) / 1080, r = ((p.size / 100) * Math.min(W, H)) / k, cx = (p.x * W) / k, cy = (p.y * H) / k;
    // drawn in 1080-wide units, scaled as one layer
    cssCamel(s.layer, { transform: `scale(${k})`, opacity: String(1 - prog(local, dur - 0.25, dur)) });
    cssCamel(s.stamp.el, { display: p.stamp ? 'block' : 'none' });
    if (p.stamp) {
      const sc = r / 74, q = eOut(clamp(local / 0.35));
      // the stamp sits up and to the right of the mark (as on the postcards), the mark over its lower-left corner
      drawStamp(ctx.media, s.stamp, { label: p.label, year: p.year }, p.source ? { source: p.source, t: p.t } : null, cx + r * 1.63 - STAMP_W / 2, cy - r * 0.8 - STAMP_H / 2 + (1 - q) * 30, 2.2, sc, sc * k);
      cssCamel(s.stamp.el, { opacity: String(q) });
    }
    drawMark(s.mark, { top: p.top, bottom: p.bottom, date: p.date, at: p.at }, r, cx, cy, local, false, p.color, p.waves, 0.82, Math.max(1, k));
  },
};
