// common.window, a window of the pastel retro computer kit (desk-kit.ts): file name, three buttons, ink border, hard shadow; it plays
// its own clip or photo, or holds a search box being typed, a profile list or a progress bar; it pops in and at its end flies into its
// chapter's taskbar button on common.desktop, closes, or grows to fill the top of the frame. A pure function of time. (window.ts is the
// picture window the photo blocks share, hence this file's name.)
import { clamp, eIO3 as eIO, lerp, type ItemType, type MediaRef, type Project, type SceneItem } from '@tellcut/engine';
import { CJK, PIX, chrome, deskSlot, fit, fonts, type Report } from './desk-kit.ts';
import { canvasIn } from './inkline.ts';
import { imagesReady, windowEl } from './window.ts';

interface WP {
  content: 'media' | 'search' | 'profile' | 'progress'; source: string; in: number; cx: number; cy: number; zoom: number;
  x: number; y: number; w: number; h: number; title: string; bar: string; text: string; typeAt: number; progFrom: number; progTo: number;
  exit: 'none' | 'min' | 'close' | 'max'; slot: number; slots: number; maxAt: number; maxH: number; ink: string; paper: string;
}
interface WS { wrap: HTMLDivElement; c: HTMLCanvasElement; box: HTMLDivElement; ph: HTMLElement; img: HTMLImageElement | null; text: string }
const isImage = (project: Project | undefined, source: string) => (project?.sources as Record<string, { kind?: string }> | undefined)?.[source]?.kind === 'image';
/** a photo window's <img>, covering the box */
function photoImg(box: HTMLElement, src: string): HTMLImageElement {
  const img = document.createElement('img');
  img.src = src; img.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover';
  box.appendChild(img);
  return img;
}
/** the clip a media window plays: from `in` for the window's whole time */
export const windowRef = (p: Pick<WP, 'source' | 'in'>, dur: number): MediaRef => ({ source: p.source, in: p.in, out: p.in + dur, speed: 1, interp: 'none' });

/** where the window is at `local` (frame px) and how much of its chrome shows: popping in, growing to the top (max) or flying into
 *  its taskbar button (min) / shrinking away (close) at its end */
export function windowRectAt(p: WP, local: number, dur: number, W: number, H: number, pop: number) {
  const k = Math.min(W, H) / 1080;
  let x = p.x * W, y = p.y * H, w = p.w * W, h = p.h * H, sc = pop, alpha = clamp(local / 0.06), chromeA = 1;
  if (p.exit === 'max' && local > p.maxAt) {
    const q = eIO(clamp((local - p.maxAt) / 0.55));
    x = lerp(x, -14 * k, q); y = lerp(y, -50 * k, q); w = lerp(w, W + 28 * k, q); h = lerp(h, p.maxH * H + 50 * k, q); chromeA = 1 - q;
  }
  let cx = x + w / 2, cy = y + h / 2;
  if (p.exit === 'min') {
    const q = Math.pow(clamp((local - (dur - 0.45)) / 0.45), 3), sl = deskSlot(p.slot, p.slots, W, H);
    sc *= lerp(1, 0.05, q); cx = lerp(cx, sl.x, q); cy = lerp(cy, sl.y, q); alpha *= 1 - clamp((q - 0.85) / 0.15);
  }
  if (p.exit === 'close') { const q = clamp((local - (dur - 0.25)) / 0.25); sc *= 1 - 0.2 * q; alpha *= 1 - q; }
  return { left: cx - (w * sc) / 2, top: cy - (h * sc) / 2, w: w * sc, h: h * sc, k: k * sc, alpha, chromeA };
}

export const deskWindow: ItemType<WP, WS> = {
  type: 'common.window', label: '復古視窗', category: 'phone', kind: 'overlay',
  doc: '復古電腦的視窗：標題列（檔名 title、三顆鈕，bar 是 lav／pink／mint／yellow 或色碼）、深紫外框、硬陰影；content media 播它自己的片段或照片（source、in，cx、cy、zoom 對焦），search 是搜尋框把 text 打出來，profile 是「名稱|值」清單一行一列地出現，progress 是進度條（text「進行中|完成」，progFrom 到 progTo 跑滿）；media 加 progTo 時進度條在片子下面；從小彈出來，結尾 exit：min 縮小飛進工作列第 slot 顆（共 slots 顆，和 common.desktop 的章節一樣）、close 關掉、max 在 maxAt 秒放大到畫面上方（maxH 高、標題列淡掉）、none 留著；一章幾個視窗斜斜疊起來；配 common.desktop、common.popup',
  params: [
    { key: 'content', label: '內容（media 片段或照片、search 搜尋框、profile 清單、progress 進度條）', type: 'enum', options: ['media', 'search', 'profile', 'progress'], default: 'media' },
    { key: 'source', label: '素材', type: 'source-ref', default: '' },
    { key: 'in', label: '從素材第幾秒', type: 'number', min: 0, max: 99999, step: 0.01, default: 0 },
    { key: 'cx', label: '對焦 x（素材比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'cy', label: '對焦 y（素材比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'zoom', label: '放大', type: 'number', min: 1, max: 4, step: 0.01, default: 1 },
    { key: 'x', label: '左緣（畫面寬比例）', type: 'number', min: -1, max: 1, step: 0.005, default: 0.08 },
    { key: 'y', label: '上緣（畫面高比例）', type: 'number', min: -1, max: 1, step: 0.005, default: 0.1 },
    { key: 'w', label: '寬（畫面寬比例）', type: 'number', min: 0.1, max: 1, step: 0.005, default: 0.8 },
    { key: 'h', label: '高（畫面高比例，含標題列）', type: 'number', min: 0.05, max: 1, step: 0.005, default: 0.28 },
    { key: 'title', label: '標題列的檔名', type: 'string', default: 'photo_01.jpg' },
    { key: 'bar', label: '標題列顏色（lav、pink、mint、yellow 或色碼）', type: 'string', default: 'lav' },
    { key: 'text', label: '內容的字（search 要打的字；profile 一行一列「名稱|值」；progress「進行中|完成」）', type: 'text', default: '' },
    { key: 'typeAt', label: '開始打字（秒）', type: 'number', min: 0, max: 60, step: 0.05, default: 0.3 },
    { key: 'progFrom', label: '進度條開始（秒）', type: 'number', min: 0, max: 60, step: 0.05, default: 0.3 },
    { key: 'progTo', label: '進度條跑滿（秒；0＝沒有）', type: 'number', min: 0, max: 60, step: 0.05, default: 0 },
    { key: 'exit', label: '結尾（min 飛進工作列、close 關掉、max 放到最大、none 不動）', type: 'enum', options: ['min', 'close', 'max', 'none'], default: 'min' },
    { key: 'slot', label: '飛進工作列第幾顆', type: 'number', min: 1, max: 12, step: 1, default: 1 },
    { key: 'slots', label: '工作列共幾顆', type: 'number', min: 1, max: 12, step: 1, default: 5 },
    { key: 'maxAt', label: '放到最大（秒）', type: 'number', min: 0, max: 60, step: 0.05, default: 0.8 },
    { key: 'maxH', label: '放到最大的高（畫面高比例）', type: 'number', min: 0.2, max: 1, step: 0.01, default: 0.72 },
    { key: 'ink', label: '線和字的顏色', type: 'color', default: '#4b3a8c' },
    { key: 'paper', label: '視窗底色', type: 'color', default: '#fffaf0' },
  ],
  media(item: SceneItem, project?: Project) {
    const p = item.params as unknown as WP;
    if ((p.content ?? 'media') !== 'media' || !p.source) return { videos: [], stills: [] };
    if (isImage(project, p.source)) return { videos: [], stills: [{ source: p.source, t: 0, w: 1080 }] };
    return { videos: [windowRef(p, item.end - item.start)], stills: [] };
  },
  build(ctx) {
    const wrap = document.createElement('div'); wrap.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
    ctx.root.appendChild(wrap);
    const c = canvasIn(wrap), box = document.createElement('div'); box.style.cssText = 'position:absolute;overflow:hidden;background:#222';
    wrap.appendChild(box);
    // the painted stand-in (window.ts) under the clip, shown when the window has no footage
    const ph = windowEl(box).box;
    ph.style.cssText += ';left:0;top:0;width:100%;height:100%';
    // a photo's <img> is made here, not at the first draw, so the player's ready (which collects the stage's images) waits for it
    const p = ctx.params;
    const img = (p.content ?? 'media') === 'media' && p.source && isImage(ctx.project, p.source) ? photoImg(box, ctx.media.stillUrl({ source: p.source, t: 0, w: 1080 })) : null;
    return { wrap, c, box, ph, img, text: `${ctx.params.text}${ctx.params.title}` };
  },
  ready(s) { return Promise.all([fonts(s.text), imagesReady(s.img ? [s.img] : [])]).then(() => undefined); },
  hide(s) { s.c.width = 0; s.c.height = 0; },
  draw(ctx, s) {
    const { local, dur, W, H, params: p, motion, media, project } = ctx;
    const pop = local < 0 ? 0 : 0.55 + 0.45 * motion.spring({ duration: 0.35, bounce: 0.45 })(local);
    const R = windowRectAt(p, local, dur, W, H, pop), k = R.k, sh = 12 * k;
    Object.assign(s.wrap.style, { left: `${(R.left / W) * 100}%`, top: `${(R.top / H) * 100}%`, width: `${((R.w + sh) / W) * 100}%`, height: `${((R.h + sh) / H) * 100}%`,
      opacity: String(R.alpha), display: R.w > 2 ? 'block' : 'none' });
    const cw = Math.max(1, Math.round(R.w + sh)), chh = Math.max(1, Math.round(R.h + sh));
    if (s.c.width !== cw || s.c.height !== chh) { s.c.width = cw; s.c.height = chh; }
    const g = s.c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, cw, chh);
    const report: Report = (gg, text, x, y) => ctx.reportText(gg, text, x, y);
    g.save(); g.globalAlpha = R.chromeA; const { tb, bw } = chrome(g, R.w, R.h, k, p.bar, p.title, p.ink, p.paper, report); g.restore();
    const foot = p.progTo > 0 && p.content === 'media' ? 120 * k : 0, pad = 8 * k * R.chromeA;
    const bx = bw * R.chromeA + pad, by = tb * R.chromeA + pad, bwid = R.w - 2 * bx, bh = R.h - by - pad - foot;
    if (p.content === 'media') {
      s.ph.style.display = p.source ? 'none' : 'block';
      Object.assign(s.box.style, { display: 'block', background: p.source ? '#222' : 'none', left: `${(bx / (R.w + sh)) * 100}%`, top: `${(by / (R.h + sh)) * 100}%`, width: `${(bwid / (R.w + sh)) * 100}%`, height: `${(bh / (R.h + sh)) * 100}%`,
        outline: R.chromeA > 0.5 ? `${(3 * k).toFixed(1)}px solid ${p.ink}` : 'none' });
      const src = (project.sources as Record<string, { kind?: string; width?: number; height?: number }>)[p.source];
      if (!p.source) { /* the stand-in only */ } else if (src?.kind === 'image') {
        s.img ??= photoImg(s.box, media.stillUrl({ source: p.source, t: 0, w: 1080 }));
        Object.assign(s.img.style, { objectPosition: `${p.cx * 100}% ${p.cy * 100}%`, transformOrigin: `${p.cx * 100}% ${p.cy * 100}%`, transform: `scale(${p.zoom})` });
      } else {
        const v = media.video(windowRef(p, dur), s.box, Math.min(local, dur - 0.04), false);
        // the box is bwid × bh by construction: reading clientWidth here forced a layout every frame
        media.place(v, bwid, bh, { x: p.cx, y: p.cy, zoom: p.zoom }, src?.width, src?.height);
      }
    } else s.box.style.display = 'none';
    g.save(); g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = p.ink;
    const fs = 52 * k;
    if (p.content === 'search') {
      const fx = bx + 14 * k, fy = by + (bh - 84 * k) / 2, fw = bwid - 28 * k;
      g.fillStyle = '#ffffff'; g.fillRect(fx, fy, fw, 84 * k); g.strokeStyle = p.ink; g.lineWidth = 3 * k; g.strokeRect(fx, fy, fw, 84 * k);
      g.beginPath(); g.arc(fx + 40 * k, fy + 38 * k, 15 * k, 0, Math.PI * 2); g.moveTo(fx + 51 * k, fy + 49 * k); g.lineTo(fx + 64 * k, fy + 62 * k); g.stroke();
      const chars = [...String(p.text)], n = Math.floor(clamp((local - p.typeAt) / Math.max(0.01, chars.length * 0.12)) * chars.length), typed = chars.slice(0, n).join('');
      // sized for the whole query (so it does not change while typed) to end before the caret's room at the box's right
      g.fillStyle = p.ink; g.font = `${fit(g, String(p.text), fs, `"${CJK}"`, fw - 104 * k)}px "${CJK}"`;
      if (typed) { g.fillText(typed, fx + 84 * k, fy + 44 * k); report(g, typed, fx + 84 * k, fy + 44 * k); }
      if (Math.floor(local * 2.5) % 2 === 0) g.fillRect(fx + 84 * k + g.measureText(typed).width + 4 * k, fy + 18 * k, 4 * k, 50 * k);
    }
    if (p.content === 'profile') {
      // the values start three ems in, or half an em after the widest name when that is wider
      const rows = String(p.text).split('\n').filter(Boolean);
      g.font = `${fs}px "${CJK}"`;
      const nameW = Math.max(0, ...rows.map((l) => g.measureText(l.split('|')[0]).width)), valX = bx + 26 * k + Math.max(fs * 3, nameW + fs * 0.5);
      rows.forEach((line, i) => {
        const [name, val = ''] = line.split('|'), ly = by + 50 * k + i * 82 * k, show = clamp((local - 0.25 - i * 0.25) / 0.15);
        if (ly > by + bh || show <= 0) return;
        g.globalAlpha = show; g.font = `${fs}px "${CJK}"`;
        g.fillStyle = 'rgba(75,58,140,0.6)'; g.fillText(name, bx + 26 * k, ly); report(g, name, bx + 26 * k, ly);
        g.fillStyle = p.ink; g.fillText(val, valX, ly); report(g, val, valX, ly); g.globalAlpha = 1;
      });
    }
    if (p.content === 'progress' || foot > 0) {
      // no progTo (or one not after progFrom): the bar fills by half a second before the window's end, rather than at once
      const end = p.progTo > p.progFrom ? p.progTo : Math.max(p.progFrom + 0.01, dur - 0.5);
      const [doing = '', done] = String(p.text).split('|'), q = clamp((local - p.progFrom) / Math.max(0.01, end - p.progFrom)), label = local >= end ? (done || doing) : doing;
      const top0 = foot > 0 ? by + bh + 10 * k : by + 20 * k, fx = bx + 18 * k, fw = bwid - 36 * k;
      g.font = `${50 * k}px "${CJK}"`; g.fillStyle = p.ink; g.fillText(label, fx, top0 + 30 * k); report(g, label, fx, top0 + 30 * k);
      g.font = `${38 * k}px "${PIX}"`; g.textAlign = 'right'; g.fillText(`${Math.round(q * 100)}%`, fx + fw, top0 + 30 * k); g.textAlign = 'left';
      const barY = top0 + 62 * k, barH = 34 * k, cells = 24, cg = 3 * k, cwid = (fw - cg * (cells + 1)) / cells;
      g.fillStyle = '#ffffff'; g.fillRect(fx, barY, fw, barH); g.strokeStyle = p.ink; g.lineWidth = 3 * k; g.strokeRect(fx, barY, fw, barH);
      for (let i = 0; i < Math.round(q * cells); i++) { g.fillStyle = i % 2 ? '#f7a8c8' : '#f48fbf'; g.fillRect(fx + cg + i * (cwid + cg), barY + cg + k, cwid, barH - 2 * cg - 2 * k); }
    }
    g.restore();
  },
};
