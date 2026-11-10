// common.header — a section label at the top: a number chip and a title ("01  開場"); slides in, holds, slides out.
// look 'kicker' is the podcast-quote short's fx.header: what the film asks, as a headline — a small grey line with an accent dot (the
// show's name) and a big title under it, wiped open from the left, 【word】 in the accent colour; it stays for as long as the item.
// `shade` (from the true-crime acceptance film's fx.topshade) lays a dark gradient over the top of the frame, fading in and out with
// the item, so the small grey line still reads over bright footage.
import { clamp, cssCamel, eOut3, h, prog, textEm, type ItemType } from '@tellcut/engine';
import { TOP_LANE } from './progress.ts';
import { emParts } from './text.ts';

interface P { look: 'chip' | 'kicker'; no: string; text: string; kicker: string; y: number; size: number; kickerSize: number; color: string; textColor: string; ink: string; outline: string; muted: string; font: string; shade: number; shadeH: number }
interface S { shade: HTMLElement; box: HTMLElement; chip: HTMLElement; label: HTMLElement; kick: HTMLElement; dot: HTMLElement; kickText: HTMLElement; key: string }

/** the label's top (a share of the frame height): `y`, or below 0 under the lane a top progress bar or dots take */
export const headerTop = (y: number, safeTop: number) => (y >= 0 ? y : safeTop + TOP_LANE);

/** look 'kicker': the small line's font size in px — `kickerSize` (% of the frame height) or 0.44 × the title's — shrunk (to half at
 *  most) so the line with its dot fits in `room` px; past that the line wraps */
export function kickerPx(text: string, kickerSize: number, titlePx: number, H: number, k: number, room: number): number {
  const want = kickerSize > 0 ? (kickerSize / 100) * H : 0.44 * titlePx, n = [...String(text ?? '')].length;
  const fit = (room - 26 * k - n * 3 * k) / Math.max(0.5, textEm(String(text ?? '')) * 1.1);   // dot 14 + gap 12; 3 px letter spacing; Latin capitals run wide
  return Math.max(want * 0.5, Math.min(want, fit));
}

/** the top shade's gradient at item time `local` of `dur` (0.3 s in and out), or null when there is none */
export function topShade(shade: number, local: number, dur: number): string | null {
  const a = clamp(shade) * clamp(Math.min(local, dur - local) / 0.3);
  if (a <= 0) return null;
  return `linear-gradient(180deg, rgba(11,9,8,${a.toFixed(3)}) 0%, rgba(11,9,8,${(a * 0.6).toFixed(3)}) 55%, rgba(11,9,8,0) 100%)`;
}

export const header: ItemType<P, S> = {
  type: 'common.header', label: '章節標籤', category: 'chapter', kind: 'overlay',
  doc: '畫面上緣的章節標籤：色塊編號加標題（01 開場、Step 2…）；教學、清單、分段介紹時標示現在講到哪；look kicker 是一整段都掛著的題目抬頭：上面一行主色圓點加灰色小字（節目名，kickerSize 自訂字級），下面一行粗體題目從左刷開，【詞】變主色（這支片在問什麼：訪談、Podcast、評論）；放不下時小字縮小、題目換行，都留在左右安全區內；shade 在畫面上緣壓一層深色漸層（shadeH 高），亮的畫面上小字也讀得到',
  params: [
    { key: 'look', label: '樣子（chip 編號色塊、kicker 小字＋大題目）', type: 'enum', options: ['chip', 'kicker'], default: 'chip' },
    { key: 'no', label: '編號（chip）', type: 'string', default: '01' },
    { key: 'text', label: '標題（kicker：【詞】變主色）', type: 'string', default: '開場' },
    { key: 'kicker', label: '題目上面的小字（kicker）', type: 'string', default: 'PODCAST｜午後聊聊' },
    { key: 'y', label: '上緣高度（畫面高比例；-1＝安全區上緣再往下讓出進度條的位置）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'size', label: '字級（畫面高 %）', type: 'number', min: 1, max: 12, step: 0.1, default: 3 },
    { key: 'kickerSize', label: '小字字級（kicker，畫面高 %；0＝題目的 0.44 倍；太長會縮小、再換行）', type: 'number', min: 0, max: 8, step: 0.1, default: 0 },
    { key: 'color', label: '編號色塊顏色（kicker：圓點和【詞】）', type: 'color', default: '#ff4d4f', theme: 'palette.accent' },
    { key: 'textColor', label: '編號字色', type: 'color', default: '#fff8ec', theme: 'palette.paper' },
    { key: 'ink', label: '標題顏色', type: 'color', default: '#ffffff' },
    { key: 'outline', label: '標題描邊（淺色背景上也看得見；kicker 不描邊）', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'muted', label: '小字顏色（kicker）', type: 'color', default: '#8d8478' },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'shade', label: '上緣壓暗（0–1；0＝沒有；亮的畫面上讓小字讀得到）', type: 'number', min: 0, max: 1, step: 0.05, default: 0 },
    { key: 'shadeH', label: '壓暗的高度（畫面高比例）', type: 'number', min: 0.05, max: 0.6, step: 0.01, default: 0.3 },
  ],
  build(ctx) {
    const shade = h('div', null, null, ctx.root), box = h('div', null, null, ctx.root), kick = h('div', null, null, box), chip = h('div', null, null, box), label = h('div', null, null, box);
    const dot = h('div', null, null, kick), kickText = h('div', null, null, kick);
    cssCamel(box, { position: 'absolute', display: 'flex', alignItems: 'center', gap: '0.5em', whiteSpace: 'pre', fontWeight: '900' });
    cssCamel(kick, { display: 'none', alignItems: 'center', whiteSpace: 'pre' });
    cssCamel(dot, { flex: 'none', borderRadius: '50%' });
    cssCamel(shade, { position: 'absolute', left: '0', right: '0', top: '0', display: 'none', pointerEvents: 'none' });
    return { shade, box, chip, label, kick, dot, kickText, key: '' };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme } = ctx, k = Math.min(W, H) / 1080, px = (p.size / 100) * H;
    const sh = topShade(p.shade ?? 0, ctx.local, ctx.dur);
    cssCamel(s.shade, sh ? { display: 'block', height: `${((p.shadeH ?? 0.3) * H).toFixed(1)}px`, background: sh } : { display: 'none' });
    if (p.look === 'kicker') { drawKicker(ctx, s, k, px); return; }
    const inn = eOut3(prog(ctx.local, 0, 0.35)), out = eOut3(prog(ctx.local, ctx.dur - 0.3, ctx.dur));
    s.chip.textContent = p.no; s.label.textContent = p.text; s.key = '';
    cssCamel(s.kick, { display: 'none' }); cssCamel(s.chip, { display: '' });
    // like the kicker, kept between the side safe margins: a long title wraps beside its chip instead of running off the right edge.
    // The limit is the label's (the room less the chip, its padding and the gap, estimated with bold digits a little wide), so the
    // box itself and a title that fits are as they always were
    const left = theme.safe.side * W, chipW = (textEm(String(p.no ?? '')) * 1.1 + 0.9 + 0.5) * px;
    cssCamel(s.label, { clipPath: 'none', whiteSpace: 'pre-wrap', maxWidth: `${Math.max(px, W - 2 * left - chipW)}px` });
    cssCamel(s.box, {
      flexDirection: 'row', alignItems: 'center', gap: '0.5em', whiteSpace: 'pre', maxWidth: 'none',
      left: `${left}px`, top: `${headerTop(p.y, theme.safe.top) * H}px`, fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, fontSize: `${px}px`,
      color: p.ink, webkitTextStroke: `${theme.stroke * 0.75 * k}px ${p.outline}`, paintOrder: 'stroke fill', opacity: String(inn * (1 - out)), textShadow: `0 ${2 * k}px ${10 * k}px rgba(0,0,0,.6)`,
      transform: `translateX(${-(1 - inn) * W * 0.12 - out * W * 0.12}px)`,
    });
    cssCamel(s.chip, { flex: 'none', background: p.color, color: p.textColor, padding: '0.1em 0.45em', borderRadius: `${theme.radius * 0.5 * k}px`, textShadow: 'none', webkitTextStroke: '0' });
  },
};

/** look 'kicker': the small line slides in from the left, the title is wiped open (0.05–0.45 s); a short fade at the end */
function drawKicker(ctx: Parameters<typeof header.draw>[0], s: S, k: number, px: number) {
  const p = ctx.params, { W, H, theme, local, dur } = ctx;
  const key = JSON.stringify([p.text, p.color]);
  if (s.key !== key) {   // the title's runs are rebuilt only when they change
    s.key = key; s.label.textContent = '';
    for (const [piece, em] of emParts(p.text)) { const sp = h('span', null, null, s.label); sp.textContent = piece; if (em) cssCamel(sp, { color: p.color }); }
  }
  s.kickText.textContent = p.kicker;
  const a = eOut3(prog(local, 0, 0.4)), left = theme.safe.side * W, room = W - 2 * left, kpx = kickerPx(p.kicker, p.kickerSize ?? 0, px, H, k, room);
  cssCamel(s.chip, { display: 'none' });
  // kept between the side safe margins: a title too long for one line wraps (it used to run off the right edge)
  cssCamel(s.box, { left: `${left}px`, top: `${headerTop(p.y, theme.safe.top) * H}px`, flexDirection: 'column', alignItems: 'flex-start', gap: `${6 * k}px`, whiteSpace: 'pre-wrap', maxWidth: `${room}px`,
    fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, fontSize: `${px}px`, color: p.ink, webkitTextStroke: '0', textShadow: 'none', transform: 'none',
    opacity: String(Math.min(prog(local, 0, 0.01), prog(dur - local, 0, 0.12))) });
  cssCamel(s.kick, { display: p.kicker ? 'flex' : 'none', whiteSpace: 'pre-wrap', gap: `${12 * k}px`, fontSize: `${kpx}px`, fontWeight: '700', letterSpacing: `${3 * k}px`, lineHeight: '1.3', color: p.muted,
    transform: `translateX(${((1 - a) * -24 * k).toFixed(2)}px)` });
  cssCamel(s.dot, { width: `${14 * k}px`, height: `${14 * k}px`, background: p.color });
  cssCamel(s.label, { whiteSpace: '', maxWidth: 'none', lineHeight: '1.15', letterSpacing: `${k}px`, clipPath: `inset(0 ${((1 - eOut3(prog(local, 0.05, 0.45))) * 100).toFixed(2)}% 0 0)` });
}
