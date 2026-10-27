// common.header — a section label at the top: a number chip and a title ("01  開場"); slides in, holds, slides out.
// look 'kicker' is the podcast-quote short's fx.header: what the film asks, as a headline — a small grey line with an accent dot (the
// show's name) and a big title under it, wiped open from the left, 【word】 in the accent colour; it stays for as long as the item.
import { cssCamel, eOut3, h, prog, type ItemType } from '@tellcut/engine';
import { TOP_LANE } from './progress.ts';
import { emParts } from './text.ts';

interface P { look: 'chip' | 'kicker'; no: string; text: string; kicker: string; y: number; size: number; color: string; textColor: string; ink: string; outline: string; muted: string; font: string }
interface S { box: HTMLElement; chip: HTMLElement; label: HTMLElement; kick: HTMLElement; dot: HTMLElement; kickText: HTMLElement; key: string }

/** the label's top (a share of the frame height): `y`, or below 0 under the lane a top progress bar or dots take */
export const headerTop = (y: number, safeTop: number) => (y >= 0 ? y : safeTop + TOP_LANE);

export const header: ItemType<P, S> = {
  type: 'common.header', label: '章節標籤', category: 'chapter', kind: 'overlay',
  doc: '畫面上緣的章節標籤：色塊編號加標題（01 開場、Step 2…）；教學、清單、分段介紹時標示現在講到哪；look kicker 是一整段都掛著的題目抬頭：上面一行主色圓點加灰色小字（節目名），下面一行粗體題目從左刷開，【詞】變主色（這支片在問什麼：訪談、Podcast、評論）',
  params: [
    { key: 'look', label: '樣子（chip 編號色塊、kicker 小字＋大題目）', type: 'enum', options: ['chip', 'kicker'], default: 'chip' },
    { key: 'no', label: '編號（chip）', type: 'string', default: '01' },
    { key: 'text', label: '標題（kicker：【詞】變主色）', type: 'string', default: '開場' },
    { key: 'kicker', label: '題目上面的小字（kicker）', type: 'string', default: 'PODCAST｜午後聊聊' },
    { key: 'y', label: '上緣高度（畫面高比例；-1＝安全區上緣再往下讓出進度條的位置）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'size', label: '字級（畫面高 %）', type: 'number', min: 1, max: 12, step: 0.1, default: 3 },
    { key: 'color', label: '編號色塊顏色（kicker：圓點和【詞】）', type: 'color', default: '#ff4d4f', theme: 'palette.accent' },
    { key: 'textColor', label: '編號字色', type: 'color', default: '#fff8ec', theme: 'palette.paper' },
    { key: 'ink', label: '標題顏色', type: 'color', default: '#ffffff' },
    { key: 'outline', label: '標題描邊（淺色背景上也看得見；kicker 不描邊）', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'muted', label: '小字顏色（kicker）', type: 'color', default: '#8d8478' },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
  ],
  build(ctx) {
    const box = h('div', null, null, ctx.root), kick = h('div', null, null, box), chip = h('div', null, null, box), label = h('div', null, null, box);
    const dot = h('div', null, null, kick), kickText = h('div', null, null, kick);
    cssCamel(box, { position: 'absolute', display: 'flex', alignItems: 'center', gap: '0.5em', whiteSpace: 'pre', fontWeight: '900' });
    cssCamel(kick, { display: 'none', alignItems: 'center', whiteSpace: 'pre' });
    cssCamel(dot, { flex: 'none', borderRadius: '50%' });
    return { box, chip, label, kick, dot, kickText, key: '' };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme } = ctx, k = Math.min(W, H) / 1080, px = (p.size / 100) * H;
    if (p.look === 'kicker') { drawKicker(ctx, s, k, px); return; }
    const inn = eOut3(prog(ctx.local, 0, 0.35)), out = eOut3(prog(ctx.local, ctx.dur - 0.3, ctx.dur));
    s.chip.textContent = p.no; s.label.textContent = p.text; s.key = '';
    cssCamel(s.kick, { display: 'none' }); cssCamel(s.chip, { display: '' });
    cssCamel(s.label, { clipPath: 'none' });
    cssCamel(s.box, {
      flexDirection: 'row', alignItems: 'center', gap: '0.5em',
      left: `${theme.safe.side * W}px`, top: `${headerTop(p.y, theme.safe.top) * H}px`, fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, fontSize: `${px}px`,
      color: p.ink, webkitTextStroke: `${theme.stroke * 0.75 * k}px ${p.outline}`, paintOrder: 'stroke fill', opacity: String(inn * (1 - out)), textShadow: `0 ${2 * k}px ${10 * k}px rgba(0,0,0,.6)`,
      transform: `translateX(${-(1 - inn) * W * 0.12 - out * W * 0.12}px)`,
    });
    cssCamel(s.chip, { background: p.color, color: p.textColor, padding: '0.1em 0.45em', borderRadius: `${theme.radius * 0.5 * k}px`, textShadow: 'none', webkitTextStroke: '0' });
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
  const a = eOut3(prog(local, 0, 0.4));
  cssCamel(s.chip, { display: 'none' });
  cssCamel(s.box, { left: `${theme.safe.side * W}px`, top: `${headerTop(p.y, theme.safe.top) * H}px`, flexDirection: 'column', alignItems: 'flex-start', gap: `${6 * k}px`,
    fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, fontSize: `${px}px`, color: p.ink, webkitTextStroke: '0', textShadow: 'none', transform: 'none',
    opacity: String(Math.min(prog(local, 0, 0.01), prog(dur - local, 0, 0.12))) });
  cssCamel(s.kick, { display: p.kicker ? 'flex' : 'none', gap: `${12 * k}px`, fontSize: `${0.44 * px}px`, fontWeight: '700', letterSpacing: `${3 * k}px`, lineHeight: '1.3', color: p.muted,
    transform: `translateX(${((1 - a) * -24 * k).toFixed(2)}px)` });
  cssCamel(s.dot, { width: `${14 * k}px`, height: `${14 * k}px`, background: p.color });
  cssCamel(s.label, { lineHeight: '1.15', letterSpacing: `${k}px`, clipPath: `inset(0 ${((1 - eOut3(prog(local, 0.05, 0.45))) * 100).toFixed(2)}% 0 0)` });
}
