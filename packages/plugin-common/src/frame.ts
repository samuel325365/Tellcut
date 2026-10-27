// common.frame — a physical frame the footage plays inside: a polaroid, a wooden photo frame, an old TV set or a plain card. It drops
// or slides in, can turn over to a hand-written back and can leave again; while it moves its window shows a still of the footage, and
// once it has settled the window is a hole (window.ts) — the clip on the main track, whose `frame` is frameWindow(params), plays
// through it. The postcard's mechanism (uk-postcard) made general.
import { abs, clamp, type Crop, cssCamel, eBack, eIO3, eOut3, type ItemType, prog, withDefaults } from '@tellcut/engine';
import { drawTexts, handFamily, textLayer, type TextLayer } from './hand.ts';
import { paintDesk } from './postcard.ts';
import { asFrame, imagesReady, punch, showStill, stillRef, windowEl, type Win } from './window.ts';
import { isClear, withAlpha } from './color.ts';
import { freeCanvas } from './inkline.ts';

type Look = 'polaroid' | 'photo' | 'tv' | 'card';
type Move = 'drop' | 'left' | 'right' | 'bottom' | 'top' | 'none';
interface P {
  look: Look; source: string; t: number; crop: Crop; x: number; y: number; w: number; aspect: number; caption: string; back: string;
  enter: Move; enterDur: number; exit: Move; exitDur: number; flipAt: number; flipDur: number; live: boolean;
  backdrop: 'none' | 'desk' | 'color'; bg: string; body: string; ink: string; font: string;
}
interface S { under: HTMLElement; bgCanvas: HTMLCanvasElement; bgKey: string; obj: HTMLElement; front: HTMLElement; body: HTMLCanvasElement; bodyKey: string; win: Win; cap: TextLayer; back: HTMLElement; backTxt: TextLayer; shade: HTMLElement }

/** the frame around the window, in window widths: left, top, right, bottom */
export const FRAME_PADS: Record<Look, [number, number, number, number]> = {
  polaroid: [0.06, 0.06, 0.06, 0.3], photo: [0.14, 0.14, 0.14, 0.2], tv: [0.08, 0.08, 0.08, 0.26], card: [0.05, 0.05, 0.05, 0.18],
};
const BODY: Record<Look, string> = { polaroid: '#fbfaf6', photo: '#6b4a2e', tv: '#2b2a2e', card: '#f6efe1' };

/** the object (body) and its window in a W×H frame, px */
export function frameBox(p: Pick<P, 'look' | 'x' | 'y' | 'w' | 'aspect'>, W: number, H: number) {
  const ww = p.w * Math.min(W, H), wh = ww / Math.max(0.2, p.aspect), [l, t, r, b] = (FRAME_PADS[p.look] ?? FRAME_PADS.polaroid).map((v) => v * ww);
  const bw = ww + l + r, bh = wh + t + b, x0 = p.x * W - bw / 2, y0 = p.y * H - bh / 2;
  return { bw, bh, x0, y0, win: [x0 + l, y0 + t, ww, wh] as [number, number, number, number], pad: [l, t, r, b] };
}

/** the settled window as the main-track clip's `frame` (fractions); `params` as given to the item (the rest are the defaults) */
export function frameWindow(params: Partial<P>, W = 1080, H = 1920) {
  const p = withDefaults(frame.params, params as Record<string, unknown>) as P;
  return asFrame(frameBox(p, W, H).win, W, H);
}

/** where the object is at `local`: offset, turn, scale, opacity; `still`: it is moving (or turned), so the window shows the still */
export function framePose(p: Pick<P, 'enter' | 'enterDur' | 'exit' | 'exitDur' | 'flipAt' | 'flipDur'>, local: number, dur: number, W: number, H: number) {
  const away = (m: Move, q: number) => {
    const d = { left: [-W, 0, -9], right: [W, 0, 9], bottom: [0, H, 6], top: [0, -H, -6], drop: [0, 0, 8], none: [0, 0, 0] }[m] ?? [0, 0, 0];
    return { dx: d[0] * q, dy: d[1] * q, rot: d[2] * q, scale: m === 'drop' ? 1 + 0.4 * q : 1, alpha: m === 'drop' ? 1 - q : 1 };
  };
  const ein = p.enter === 'none' ? 1 : p.enter === 'drop' ? eBack(clamp(local / p.enterDur), 1.4) : eOut3(clamp(local / p.enterDur));
  const eout = p.exit === 'none' ? 0 : eIO3(prog(local, dur - p.exitDur, dur));
  const a = away(p.enter, 1 - ein), b = away(p.exit, eout);
  const fq = p.flipAt >= 0 ? eIO3(clamp((local - p.flipAt) / p.flipDur)) : 0, flipping = p.flipAt >= 0 && local > p.flipAt;
  const sx = flipping ? Math.max(0.002, Math.abs(Math.cos(Math.PI * fq))) : 1, lift = flipping ? Math.sin(Math.PI * fq) : 0;
  const settled = (p.enter === 'none' || local >= p.enterDur) && eout === 0 && !flipping;
  return { dx: a.dx + b.dx, dy: a.dy + b.dy, rot: a.rot + b.rot, scale: a.scale * b.scale * (1 + lift * 0.05), alpha: clamp(a.alpha) * clamp(b.alpha), sx, lift, back: flipping && fq >= 0.5, settled };
}

function paintBody(c: HTMLCanvasElement, look: Look, bw: number, bh: number, win: [number, number, number, number], color: string) {
  c.width = Math.max(1, Math.round(bw)); c.height = Math.max(1, Math.round(bh));
  const g = c.getContext('2d')!, [wx, wy, ww, wh] = win, u = ww / 600;
  const round = (x: number, y: number, w: number, hh: number, r: number) => { g.beginPath(); g.roundRect(x, y, w, hh, r); };
  if (look === 'tv') {
    const grd = g.createLinearGradient(0, 0, 0, bh); grd.addColorStop(0, '#4a474c'); grd.addColorStop(1, color);
    g.fillStyle = grd; round(0, 0, bw, bh, 40 * u); g.fill();
    g.fillStyle = '#0d0d10'; round(wx - 14 * u, wy - 14 * u, ww + 28 * u, wh + 28 * u, 26 * u); g.fill();
    // the speaker grille and two knobs under the screen
    const by = wy + wh + 28 * u, bhh = bh - by - 24 * u;
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 4 * u;
    for (let x = wx + 10 * u; x < wx + ww * 0.55; x += 16 * u) { g.beginPath(); g.moveTo(x, by + bhh * 0.2); g.lineTo(x, by + bhh * 0.8); g.stroke(); }
    for (const [i, kx] of [ww * 0.72, ww * 0.88].entries()) {
      const cx = wx + kx, cy = by + bhh / 2, r = Math.min(bhh * 0.36, 34 * u);
      g.fillStyle = '#1a191c'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
      g.strokeStyle = '#8a8690'; g.lineWidth = 4 * u; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(-1 + i * 2) * r * 0.8, cy + Math.sin(-1 + i * 2) * r * 0.8); g.stroke();
    }
  } else if (look === 'photo') {
    const grd = g.createLinearGradient(0, 0, bw, bh); grd.addColorStop(0, '#8a6240'); grd.addColorStop(0.5, color); grd.addColorStop(1, '#4a301c');
    g.fillStyle = grd; g.fillRect(0, 0, bw, bh);
    for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(30,16,6,${0.05 + (i % 5) * 0.02})`; g.lineWidth = 1.5 * u; const y = (i / 60) * bh; g.beginPath(); g.moveTo(0, y); g.lineTo(bw, y + Math.sin(i) * 6 * u); g.stroke(); }
    // the mat: cream board inside the wood, a bevel line round the picture
    const m = ww * 0.06; g.fillStyle = '#f3ecdc'; g.fillRect(wx - m, wy - m, ww + 2 * m, wh + m + ww * 0.12);
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3 * u; g.strokeRect(1.5 * u, 1.5 * u, bw - 3 * u, bh - 3 * u);
    g.strokeStyle = 'rgba(60,40,20,0.35)'; g.lineWidth = 3 * u; g.strokeRect(wx - m, wy - m, ww + 2 * m, wh + m + ww * 0.12);
  } else {
    const grd = g.createLinearGradient(0, 0, bw, bh); grd.addColorStop(0, withAlpha('#ffffff', 0.0)); grd.addColorStop(1, 'rgba(120,100,70,0.12)');
    g.fillStyle = color; round(0, 0, bw, bh, look === 'card' ? 6 * u : 3 * u); g.fill(); g.fillStyle = grd; g.fill();
  }
  g.clearRect(wx, wy, ww, wh);   // the window: the still, or the clip below, shows through
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2 * u; g.strokeRect(wx, wy, ww, wh);
}

export const frame: ItemType<P, S> = {
  type: 'common.frame', label: '實體框', category: 'frame', kind: 'scene',
  doc: '會動的實體框，影片在框裡播：拍立得、木相框、老電視或一張卡，掉下來或滑進來、可翻到背面寫字、可離場；移動時窗裡是素材的靜態圖，停好後窗變成洞，主軌片段（frame＝frameWindow(參數)）從洞裡播出來；回憶、作品展示、老電視播放、相框裡的人',
  params: [
    { key: 'look', label: '樣子（polaroid 拍立得、photo 木相框、tv 老電視、card 紙卡）', type: 'enum', options: ['polaroid', 'photo', 'tv', 'card'], default: 'polaroid' },
    { key: 'source', label: '窗裡的素材（移動時顯示它的靜態圖；空＝畫的示意圖、不開洞）', type: 'source-ref', default: '' },
    { key: 't', label: '靜態圖取素材第幾秒', type: 'number', min: 0, max: 36000, step: 0.1, default: 0 },
    { key: 'crop', label: '靜態圖的裁切 { x, y, zoom }（配合主軌片段）', type: 'json', default: { x: 0.5, y: 0.5, zoom: 1 } },
    { key: 'x', label: '中心 x（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.5 },
    { key: 'y', label: '中心 y（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.45 },
    { key: 'w', label: '窗的寬（畫面短邊的比例）', type: 'number', min: 0.1, max: 1, step: 0.01, default: 0.66 },
    { key: 'aspect', label: '窗的寬高比（寬÷高）', type: 'number', min: 0.3, max: 3, step: 0.01, default: 0.8 },
    { key: 'caption', label: '框下方的手寫字（電視是牌子）', type: 'string', default: '那年夏天' },
    { key: 'back', label: '背面的手寫字（翻面時）', type: 'text', default: '謝謝你\n那時候願意出發' },
    { key: 'enter', label: '進場', type: 'enum', options: ['drop', 'left', 'right', 'bottom', 'top', 'none'], default: 'drop' },
    { key: 'enterDur', label: '進場長度（秒）', type: 'number', min: 0.1, max: 5, step: 0.05, default: 0.7 },
    { key: 'exit', label: '離場', type: 'enum', options: ['none', 'drop', 'left', 'right', 'bottom', 'top'], default: 'none' },
    { key: 'exitDur', label: '離場長度（秒）', type: 'number', min: 0.1, max: 5, step: 0.05, default: 0.6 },
    { key: 'flipAt', label: '翻到背面的時間（秒；-1＝不翻）', type: 'number', min: -1, max: 600, step: 0.05, default: -1 },
    { key: 'flipDur', label: '翻面長度（秒）', type: 'number', min: 0.1, max: 3, step: 0.05, default: 0.8 },
    { key: 'live', label: '停好後窗變成洞（主軌片段播出來）', type: 'bool', default: true },
    { key: 'backdrop', label: '底（none 透明、desk 木桌、color 純色）', type: 'enum', options: ['none', 'desk', 'color'], default: 'desk' },
    { key: 'bg', label: '純色底的顏色', type: 'color', default: '#e9e1d3', theme: 'palette.paper' },
    { key: 'body', label: '框的顏色（透明＝依樣子）', type: 'color', default: '#00000000' },
    { key: 'ink', label: '手寫墨色', type: 'color', default: '#2b2622' },
    { key: 'font', label: '手寫字型', type: 'string', default: 'LXGW WenKai TC' },
  ],
  media(item) {
    const p = item.params as Partial<P>;
    return { videos: [], stills: p.source ? [stillRef({ source: p.source, t: Number(p.t) || 0 })] : [] };
  },
  build(ctx) {
    const under = abs(ctx.root), bgCanvas = abs(under, {}, 'canvas') as HTMLCanvasElement, obj = abs(ctx.root), front = abs(obj);
    const win = windowEl(front), body = abs(front, {}, 'canvas') as HTMLCanvasElement, cap = textLayer(front), back = abs(obj), backTxt = textLayer(back), shade = abs(obj);
    cssCamel(under, { inset: '0' });
    cssCamel(bgCanvas, { left: '0', top: '0', width: '100%', height: '100%' });
    cssCamel(obj, { transformOrigin: '50% 50%' });
    for (const e of [front, back, shade]) cssCamel(e, { left: '0', top: '0', width: '100%', height: '100%' });
    cssCamel(body, { left: '0', top: '0', width: '100%', height: '100%' });
    cssCamel(shade, { background: 'rgb(30,18,8)', pointerEvents: 'none' });
    const s: S = { under, bgCanvas, bgKey: '', obj, front, body, bodyKey: '', win, cap, back, backTxt, shade };
    frame.draw(ctx, s);   // starts loading the still now, so ready() can wait for it
    return s;
  },
  ready: (s) => imagesReady([s.win.img]),
  hide(s) { freeCanvas(s.bgCanvas, s.body); s.bgKey = ''; s.bodyKey = ''; },
  draw(ctx, s) {
    const p = ctx.params, { W, H, local, dur } = ctx, b = frameBox(p, W, H), look = FRAME_PADS[p.look] ? p.look : 'polaroid', color = isClear(p.body) ? BODY[look] : p.body;
    const bgKey = `${p.backdrop}|${W}x${H}|${p.bg}`;
    if (s.bgKey !== bgKey) {
      s.bgKey = bgKey;
      if (p.backdrop === 'desk') paintDesk(s.bgCanvas, W, H);
      else { s.bgCanvas.width = 1; s.bgCanvas.height = 1; const g = s.bgCanvas.getContext('2d')!; g.fillStyle = p.bg; g.fillRect(0, 0, 1, 1); }
    }
    cssCamel(s.bgCanvas, { display: p.backdrop === 'none' ? 'none' : 'block' });
    const [wx, wy, ww, wh] = b.win, local0: [number, number, number, number] = [wx - b.x0, wy - b.y0, ww, wh];
    const bodyKey = JSON.stringify([look, b.bw, b.bh, color]);
    if (s.bodyKey !== bodyKey) { s.bodyKey = bodyKey; paintBody(s.body, look, b.bw, b.bh, local0, color); }
    const ps = framePose(p, local, dur, W, H), live = p.live && !!p.source, hole = live && ps.settled;
    cssCamel(s.obj, { left: `${b.x0}px`, top: `${b.y0}px`, width: `${b.bw}px`, height: `${b.bh}px`, opacity: String(ps.alpha),
      transform: `translate(${ps.dx.toFixed(2)}px, ${ps.dy.toFixed(2)}px) rotate(${ps.rot.toFixed(3)}deg) scale(${(ps.scale * ps.sx).toFixed(4)}, ${ps.scale.toFixed(4)})`,
      filter: `drop-shadow(${(4 + ps.lift * 10) * ww / 600}px ${(12 + ps.lift * 24) * ww / 600}px ${18 * ww / 600}px rgba(20,12,6,0.5))` });
    cssCamel(s.front, { display: ps.back ? 'none' : 'block' });
    cssCamel(s.back, { display: ps.back ? 'block' : 'none', background: color, borderRadius: look === 'tv' ? `${40 * ww / 600}px` : '0' });
    cssCamel(s.win.box, { left: `${local0[0]}px`, top: `${local0[1]}px` });
    // the still fades out over 0.3 s once the window opens
    const openAt = p.enter === 'none' ? 0 : p.enterDur, still = { source: p.source, t: Number(p.t) || 0, crop: p.crop };
    showStill(ctx.media, s.win, p.source ? still : null, ww, wh, hole ? 1 - clamp((local - openAt) / 0.3) : 1);
    const hand = handFamily(p.font), px = ww * 0.075, capY = wy - b.y0 + wh + b.pad[3] * 0.55 + px * 0.35;
    drawTexts(s.cap, p.caption ? [{ text: p.caption, x: b.bw / 2, y: capY, px: look === 'tv' ? px * 0.55 : px, color: look === 'tv' ? '#c9c4cc' : look === 'photo' ? '#5a4632' : p.ink, family: look === 'tv' ? "'Noto Sans TC', sans-serif" : hand, align: 'center', weight: look === 'tv' ? 700 : 400 }] : [], local, 1);
    const lines = String(p.back ?? '').split('\n').filter(Boolean).slice(0, 4), lh = px * 1.5;
    drawTexts(s.backTxt, lines.map((text, i) => ({ text, x: b.bw / 2, y: b.bh / 2 - ((lines.length - 1) * lh) / 2 + i * lh + px * 0.35, px, color: look === 'tv' || look === 'photo' ? '#f3ecdc' : p.ink, family: hand, align: 'center',
      t0: p.flipAt + p.flipDur * 0.6 + i * 0.5, cps: 10 })), local, 1);
    cssCamel(s.shade, { opacity: String(0.22 * ps.lift), display: ps.lift > 0 ? 'block' : 'none' });
    punch(s.under, hole ? b.win : null);
  },
};
