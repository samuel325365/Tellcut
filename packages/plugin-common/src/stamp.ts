// common.stamp — a rubber stamp that slams onto the picture: a boxed word, tilted, landing with a thump (pair it with common.thud).
// shape "circle" is a round double-ringed seal (from the baking-steps recipe card: 成品 stamped on the photo).
// shape "card" is the podcast-versus short's stance card (fx.vsStance): one person's stance in a line or two on a solid sticker card in
// `color` (white words, 【word】 in `hl`, an ink border and a hard ink shadow), a small `tag` chip on its edge, popped down from 1.35×;
// `anchor` pins its top or bottom edge at y (the edge of a split-screen panel).
// shape "double" is a fact-check short's verdict seal (fx.verdict, the 駁回 stamp of fx.casefile): a double-ruled rounded frame on a
// paper ground with a soft shadow; `head` puts a small widely spaced line above the word (判決, VERDICT) on box, circle and double.
import { clamp, cssCamel, eBack, eOut3, h, prog, textEm, type ItemType } from '@tellcut/engine';
import { emParts } from './text.ts';
import { withAlpha } from './color.ts';

interface P { text: string; size: number; y: number; angle: number; color: string; font: string; shape: 'box' | 'circle' | 'card' | 'double'; x: number; tag: string; anchor: 'center' | 'top' | 'bottom'; ink: string; hl: string; head: string; paper: string }
interface S { box: HTMLElement; head: HTMLElement; label: HTMLElement; tag: HTMLElement; key: string }

/** the slam a box / circle / double stamp lands with: 2.3× down to 1 over 0.16 s, showing at once (common.casefile's stamps too) */
export function stampLand(t: number) { const land = prog(t, 0, 0.16); return { scale: 1 + 1.3 * (1 - eOut3(land)), alpha: Math.min(1, land * 6) }; }
/** shape double's frame: double rules with rounded corners on a see-through paper ground and a soft shadow; k = px per 1080 unit */
export const doubleLook = (color: string, paper: string, stroke: number, k: number) => ({
  padding: '0.13em 0.42em 0.2em', border: `${stroke * 1.75 * k}px double ${color}`, borderRadius: `${24 * k}px`,
  background: withAlpha(paper, 0.88), boxShadow: `0 ${10 * k}px ${30 * k}px rgba(0,0,0,0.35)`, lineHeight: '1.1',
});

export const stamp: ItemType<P, S> = {
  type: 'common.stamp', label: '印章', category: 'mark', kind: 'overlay',
  doc: '一個方框加粗字的印章「蓋」上畫面（先放大再落下、微傾），shape: circle 是雙圈圓章；已驗證、重點、推薦、成品、NG 之類的判定；配 common.thud；shape: card 是貼紙感的立場字卡：主色實心卡、白色粗字（可兩行，【詞】變 hl 色）、黑框硬陰影、邊上一個小標籤（tag），從 1.35 倍彈下來；anchor 讓卡的上緣或下緣貼在 y（對談、辯論裡一個人的立場、一句重點）；shape: double 是判決大章：雙線圓角框、半透明紙色底、柔和陰影（判決、駁回、結案、蓋章認證）；head 在大字上方加一行字距拉開的小字（判決、VERDICT；box、circle、double 都可以）',
  params: [
    { key: 'text', label: '文字（card：可換行，【詞】變色）', type: 'text', default: '重點' },
    { key: 'size', label: '字級（畫面高 %）', type: 'number', min: 2, max: 30, step: 0.5, default: 7 },
    { key: 'y', label: '垂直位置（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'angle', label: '傾斜（度）', type: 'number', min: -45, max: 45, step: 0.5, default: -10 },
    { key: 'color', label: '印泥顏色（card：卡的底色）', type: 'color', default: '#ff4d4f', theme: 'palette.accent' },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'shape', label: '形狀（box 方框、circle 雙圈圓章、card 立場字卡、double 雙框判決章）', type: 'enum', options: ['box', 'circle', 'card', 'double'], default: 'box' },
    { key: 'x', label: '水平位置（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'tag', label: '卡邊的小標籤（card；空＝沒有）', type: 'string', default: '' },
    { key: 'anchor', label: 'y 對齊卡的哪裡（card：center 中間、top 上緣、bottom 下緣）', type: 'enum', options: ['center', 'top', 'bottom'], default: 'center' },
    { key: 'ink', label: '黑框與陰影（card）', type: 'color', default: '#0d0f1a', theme: 'palette.ink' },
    { key: 'hl', label: '【詞】與小標籤的顏色（card）', type: 'color', default: '#ffd23f', theme: 'palette.hl' },
    { key: 'head', label: '大字上方的一行小字（box、circle、double；空＝沒有）', type: 'string', default: '' },
    { key: 'paper', label: '章的紙色底（double）', type: 'color', default: '#fffaf0', theme: 'palette.paper' },
  ],
  build(ctx) {
    const box = h('div', null, null, ctx.root), head = h('div', null, null, box), label = h('div', null, null, box), tag = h('div', null, null, box);
    cssCamel(box, { position: 'absolute', left: '50%', whiteSpace: 'pre', fontWeight: '900', boxSizing: 'border-box', padding: '0.15em 0.5em' });
    cssCamel(head, { display: 'none', whiteSpace: 'pre', lineHeight: '1.2', fontSize: '0.53em', letterSpacing: '0.5em', textIndent: '0.5em' });
    cssCamel(tag, { position: 'absolute', display: 'none', whiteSpace: 'pre', fontWeight: '900', lineHeight: '1.25' });
    return { box, head, label, tag, key: '' };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme } = ctx, k = Math.min(W, H) / 1080, px = (p.size / 100) * H;
    if (p.shape === 'card') { cssCamel(s.head, { display: 'none' }); drawCard(ctx, s, k, px); return; }
    const { scale, alpha } = stampLand(ctx.local), out = 1 - prog(ctx.local, ctx.dur - 0.2, ctx.dur);
    s.label.textContent = p.text; s.key = '';
    s.head.textContent = p.head ?? '';
    cssCamel(s.head, { display: p.head ? 'block' : 'none' });
    // the circle: a double ring a little wider than the word, the word centred in it
    const round = p.shape === 'circle', dbl = p.shape === 'double', d = textEm(p.text) + 1.1, dl = doubleLook(p.color, p.paper, theme.stroke, k);
    cssCamel(s.box, {
      left: `${(p.x ?? 0.5) * W}px`, top: `${p.y * H}px`, width: round ? `${d}em` : '', height: round ? `${d}em` : '', padding: round ? '0' : dbl ? dl.padding : '0.15em 0.5em',
      display: round || p.head || dbl ? 'flex' : '', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color: p.color, border: dbl ? dl.border : `${theme.stroke * (round ? 2.4 : 1.2) * k}px ${round ? 'double' : 'solid'} ${p.color}`, borderRadius: round ? '50%' : dbl ? dl.borderRadius : `${theme.radius * 0.4 * k}px`,
      background: dbl ? dl.background : '', boxShadow: dbl ? dl.boxShadow : '', lineHeight: dbl ? dl.lineHeight : '',
      fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, fontSize: `${px}px`, opacity: String(alpha * out * (dbl ? 1 : 0.92)),
      transform: `translate(-50%, -50%) rotate(${p.angle}deg) scale(${scale})`,
    });
  },
};

/** shape 'card': lands from 1.35× with a little overshoot over 0.26 s; the tag sits on the edge facing away from `anchor` bottom */
function drawCard(ctx: Parameters<typeof stamp.draw>[0], s: S, k: number, px: number) {
  const p = ctx.params, { W, H } = ctx;
  const key = JSON.stringify([p.text, p.hl]);
  if (s.key !== key) {
    s.key = key; s.label.textContent = '';
    for (const [piece, em] of emParts(p.text.replace(/\\n/g, '\n'))) { const sp = h('span', null, null, s.label); sp.textContent = piece; if (em) cssCamel(sp, { color: p.hl }); }
  }
  const q = clamp(ctx.local / 0.26), scale = 1.35 - 0.35 * eBack(q, 1.9), out = 1 - prog(ctx.local, ctx.dur - 0.15, ctx.dur);
  const ty = p.anchor === 'top' ? '0%' : p.anchor === 'bottom' ? '-100%' : '-50%', below = p.anchor === 'top';
  cssCamel(s.box, {
    left: `${(p.x ?? 0.5) * W}px`, top: `${p.y * H}px`, width: '', height: '', display: 'block', padding: '0.3em 0.54em 0.35em', maxWidth: `${0.86 * W}px`,
    color: '#ffffff', background: p.color, border: `${5 * k}px solid ${p.ink}`, borderRadius: `${16 * k}px`, boxShadow: `${10 * k}px ${10 * k}px 0 ${p.ink}`,
    fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, fontSize: `${px}px`, lineHeight: '1.22', opacity: String(clamp(ctx.local / 0.08) * out),
    transformOrigin: below ? '20% 0%' : '20% 100%', transform: `translate(-50%, ${ty}) rotate(${p.angle}deg) scale(${scale.toFixed(4)})`,
  });
  // the tag: on the top edge (or the bottom one when the card hangs from its top), overlapping it a little
  s.tag.textContent = p.tag ?? '';
  cssCamel(s.tag, { display: p.tag ? 'block' : 'none', left: `${18 * k}px`, top: below ? '' : '0', bottom: below ? '0' : '', fontSize: '0.54em', padding: '0.14em 0.57em',
    borderRadius: `${8 * k}px`, background: p.hl, color: p.ink, border: `${4 * k}px solid ${p.ink}`, transform: below ? 'translateY(70%)' : 'translateY(-70%)' });
}
