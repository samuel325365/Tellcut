// common.versus — the cards of a "he says / she says" film, from the podcast-versus short (fx.vsTitle, fx.vsCard, fx.vsTable).
// mode title: over the split picture (common.duo) the two big words land in their panels — a's from above, b's from below — and a VS
// diamond spins in on the band between them, the two names either side of it. mode round: a full-screen round card — a's colour and
// b's colour slide in from both sides and meet on a slant, ROUND n pops, the question rises; it is pulled up and away at the end.
// mode table: the closing comparison — "a vs b", the two names over two columns, one row a question (what a said | what b said),
// sliding in one by one, then a last line that asks the viewer.
import { clamp, cssCamel, eBack, eIn3, eOut3, h, type ItemType } from '@tellcut/engine';
import { duoLayout } from './duo.ts';
import { emParts, nl } from './text.ts';
import { withAlpha } from './color.ts';

interface P {
  mode: 'title' | 'round' | 'table'; words: string; names: string; label: string; text: string; rows: string; ask: string;
  dir: 'v' | 'h'; top: number; band: number; foot: number; colorA: string; colorB: string; hl: string; ink: string; paper: string; font: string;
}
interface S { box: HTMLElement; key: string; el: Record<string, HTMLElement>; rows: HTMLElement[] }

const eOut = (x: number) => eOut3(clamp(x));
const eIn = (x: number) => eIn3(clamp(x));
const backOut = (x: number) => eBack(clamp(x), 1.9);
/** "a|b" as two parts */
const pair = (s: string): [string, string] => { const [a, b] = String(s ?? '').split('|'); return [(a ?? '').trim(), (b ?? '').trim()]; };

/** the rows of the table: "question|what a said|what b said|a's tag|b's tag", one a line */
export function versusRows(text: string): Array<{ q: string; a: string; b: string; at: string; bt: string }> {
  return String(text ?? '').split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((c) => c.length >= 3 && c.some(Boolean))
    .map(([q, a, b, at, bt]) => ({ q, a: nl(a), b: nl(b), at: at ?? '', bt: bt ?? '' }));
}

/** text with 【marked】 words in `hl` */
function rich(node: HTMLElement, text: string, hl: string) {
  node.textContent = '';
  for (const [piece, em] of emParts(nl(text))) { const s = h('span', null, null, node); s.textContent = piece; if (em) cssCamel(s, { color: hl }); }
}
const div = (parent: HTMLElement, css: Record<string, string> = {}, text?: string) => { const d = h('div', null, null, parent); cssCamel(d, css); if (text !== undefined) d.textContent = text; return d; };

export const versus: ItemType<P, S> = {
  type: 'common.versus', label: '對決字卡', category: 'card', kind: 'overlay',
  doc: '兩方對決的字卡（配 common.duo）：mode title 片頭——上下兩格各砸進一個大字（他說／她說）、中間字幕帶 VS 菱形轉進來、兩邊是名字；round 整個畫面的回合卡——兩方顏色從兩邊滑進來斜切對撞、ROUND 1 彈出、題目浮上來（【詞】變黃），最後往上抽走；table 收尾對照表——「a vs b」、兩欄名字、每列一題（題目|a 說的|b 說的|a 小標|b 小標，\\n 換行）一列一列滑進來、最後一句問觀眾；雙人訪談、辯論、兩種做法比較',
  params: [
    { key: 'mode', label: '樣式（title 片頭、round 回合卡、table 對照表）', type: 'enum', options: ['title', 'round', 'table'], default: 'round' },
    { key: 'words', label: '兩方的大字（a|b）', type: 'string', default: '他說|她說' },
    { key: 'names', label: '兩方的名字（a|b；title 在 VS 兩邊、table 是欄名）', type: 'string', default: '阿明|Mia 教練' },
    { key: 'label', label: '回合（round）', type: 'string', default: 'ROUND 1' },
    { key: 'text', label: '題目（round；【詞】變色、\\n 換行）', type: 'text', default: '每天早起\n真的有用？' },
    { key: 'rows', label: '對照表（table；一行一列「題目|a 說的|b 說的|a 小標|b 小標」）', type: 'text', default: '早起真的比較有效率？|鬧鐘一響，\\n整個上午都在發呆|你只是沒睡飽，\\n要先早點上床\n週末補眠，到底算不算數？|平日欠的覺，\\n週末一次睡回來|補眠補不回來，\\n作息才是重點\n討厭早起，還要硬撐嗎？|天生的夜貓子\\n要怎麼辦？|有理由就早起；\\n沒理由就別逼|他問|她答' },
    { key: 'ask', label: '最後一句（table）', type: 'string', default: '你站哪一邊？' },
    { key: 'dir', label: '分割方向（title；同 common.duo）', type: 'enum', options: ['v', 'h'], default: 'v' },
    { key: 'top', label: '頁首高度（title；同 common.duo）', type: 'number', min: 0, max: 0.4, step: 0.002, default: 0.104 },
    { key: 'band', label: '字幕帶高度（title；同 common.duo）', type: 'number', min: 0, max: 0.4, step: 0.002, default: 0.078 },
    { key: 'foot', label: '頁尾高度（title；同 common.duo）', type: 'number', min: 0, max: 0.4, step: 0.002, default: 0.026 },
    { key: 'colorA', label: 'a 的顏色', type: 'color', default: '#3d7bff', theme: 'palette.accent2' },
    { key: 'colorB', label: 'b 的顏色', type: 'color', default: '#ff5c7a', theme: 'palette.accent' },
    { key: 'hl', label: '強調色（VS、ROUND、【詞】）', type: 'color', default: '#ffd23f', theme: 'palette.hl' },
    { key: 'ink', label: '底色與描邊', type: 'color', default: '#0d0f1a', theme: 'palette.ink' },
    { key: 'paper', label: '字色', type: 'color', default: '#f7f4ee', theme: 'palette.paper' },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
  ],
  build(ctx) {
    const box = h('div', null, null, ctx.root);
    cssCamel(box, { position: 'absolute', inset: '0', overflow: 'hidden' });
    return { box, key: '', el: {}, rows: [] };
  },
  draw(ctx, s) {
    const p = ctx.params, k = Math.min(ctx.W, ctx.H) / 1080, key = JSON.stringify([p.mode, p.words, p.names, p.label, p.text, p.rows, p.ask, p.colorA, p.colorB, p.hl, p.ink, p.paper, p.font, ctx.W, ctx.H]);
    if (s.key !== key) {   // the card is rebuilt only when what it says changes
      s.key = key; s.box.textContent = ''; s.el = {}; s.rows = [];
      cssCamel(s.box, { fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, background: 'none', opacity: '1' });
      (p.mode === 'title' ? buildTitle : p.mode === 'table' ? buildTable : buildRound)(ctx, s, k);
    }
    (p.mode === 'title' ? drawTitle : p.mode === 'table' ? drawTable : drawRound)(ctx, s, k);
  },
};

type Ctx = Parameters<typeof versus.draw>[0];

function buildTitle(ctx: Ctx, s: S, k: number) {
  const p = ctx.params, { W, H } = ctx, L = duoLayout(p), [wa, wb] = pair(p.words), [na, nb] = pair(p.names);
  const big = (text: string, color: string) => div(s.box, { position: 'absolute', left: '0', width: '100%', textAlign: 'center', color: '#ffffff', fontWeight: '900', fontSize: `${210 * k}px`, lineHeight: '1',
    letterSpacing: `${10 * k}px`, webkitTextStroke: `${10 * k}px ${p.ink}`, paintOrder: 'stroke fill', textShadow: `${14 * k}px ${14 * k}px 0 ${color}`, whiteSpace: 'pre' }, text);
  const he = big(wa, p.colorA), she = big(wb, p.colorB);
  const [bx, by, bw, bh] = L.band, cx = (bx + bw / 2) * W, cy = (by + bh / 2) * H, side = p.dir === 'h';
  // vertical: a's word just above the band, b's just below it; side by side: each in the middle of its panel
  const place = (el: HTMLElement, r: number[], below: boolean) => cssCamel(el, side
    ? { left: `${r[0] * W}px`, width: `${r[2] * W}px`, top: `${(r[1] + r[3] / 2) * H - 105 * k}px`, fontSize: `${Math.min(210 * k, (r[2] * W * 0.9) / Math.max(1, [...el.textContent!].length))}px` }
    : { top: below ? `${(by + bh) * H + 40 * k}px` : `${by * H - 520 * k}px` });
  place(he, L.a, false); place(she, L.b, true);
  const badge = div(s.box, { position: 'absolute', left: `${cx - 82 * k}px`, top: `${cy - 82 * k}px`, width: `${164 * k}px`, height: `${164 * k}px` });
  div(badge, { position: 'absolute', inset: '0', background: p.hl, border: `${8 * k}px solid ${p.ink}`, transform: 'rotate(45deg)', borderRadius: `${18 * k}px` });
  div(badge, { position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: p.ink, fontWeight: '900', fontSize: `${78 * k}px`, fontStyle: 'italic' }, 'VS');
  const sub = div(s.box, { position: 'absolute', left: '0', width: '100%', top: `${cy}px`, fontWeight: '900', fontSize: `${46 * k}px`, lineHeight: '1.2' });
  div(sub, { position: 'absolute', right: `${W - cx + 120 * k}px`, transform: 'translateY(-50%)', color: p.colorA, filter: 'brightness(1.25)', whiteSpace: 'pre' }, na);
  div(sub, { position: 'absolute', left: `${cx + 120 * k}px`, transform: 'translateY(-50%)', color: p.colorB, whiteSpace: 'pre' }, nb);
  s.el = { he, she, badge, sub };
}

function drawTitle(ctx: Ctx, s: S) {
  const { local, dur } = ctx, { he, she, badge, sub } = s.el, k = Math.min(ctx.W, ctx.H) / 1080;
  const p1 = backOut(local / 0.28), p2 = backOut((local - 0.12) / 0.28), p3 = backOut((local - 0.3) / 0.3);
  cssCamel(he, { transform: `translateY(${((1 - p1) * -260 * k).toFixed(1)}px)`, opacity: clamp(local / 0.08).toFixed(3) });
  cssCamel(she, { transform: `translateY(${((1 - p2) * 260 * k).toFixed(1)}px)`, opacity: clamp((local - 0.12) / 0.08).toFixed(3) });
  cssCamel(badge, { transform: `rotate(${((1 - p3) * -180).toFixed(1)}deg) scale(${clamp(p3, 0, 2).toFixed(4)})` });
  cssCamel(sub, { opacity: eOut((local - 0.45) / 0.25).toFixed(3) });
  cssCamel(s.box, { opacity: (1 - eIn((local - (dur - 0.12)) / 0.12)).toFixed(3) });
}

function buildRound(ctx: Ctx, s: S, k: number) {
  const p = ctx.params, { H } = ctx, [wa, wb] = pair(p.words);
  const inner = div(s.box, { position: 'absolute', inset: '0', background: p.ink });
  const a = div(inner, { position: 'absolute', inset: '0', background: p.colorA, clipPath: 'polygon(0 0,100% 0,100% 41%,0 49%)' });
  const b = div(inner, { position: 'absolute', inset: '0', background: p.colorB, clipPath: 'polygon(0 57%,100% 49%,100% 100%,0 100%)' });
  const small = { position: 'absolute', color: '#ffffff', opacity: '0.9', fontWeight: '900', fontSize: `${64 * k}px`, letterSpacing: `${4 * k}px`, whiteSpace: 'pre' };
  div(a, { ...small, left: `${70 * k}px`, top: `${0.172 * H}px` }, wa);
  div(b, { ...small, right: `${150 * k}px`, top: `${0.75 * H}px` }, wb);
  const num = div(inner, { position: 'absolute', left: '0', width: '100%', top: `${0.333 * H}px`, textAlign: 'center', color: p.hl, fontWeight: '900', fontSize: `${120 * k}px`, lineHeight: '1',
    letterSpacing: `${6 * k}px`, webkitTextStroke: `${6 * k}px ${p.ink}`, paintOrder: 'stroke fill', whiteSpace: 'pre' }, p.label);
  const q = div(inner, { position: 'absolute', left: `${90 * k}px`, right: `${150 * k}px`, top: `${0.484 * H}px`, textAlign: 'center', color: p.paper, fontWeight: '900', fontSize: `${76 * k}px`,
    lineHeight: '1.25', whiteSpace: 'pre-line', textShadow: `0 ${6 * k}px 0 rgba(0,0,0,.35)` });
  rich(q, p.text, p.hl);
  s.el = { inner, a, b, num, q };
}

function drawRound(ctx: Ctx, s: S, k: number) {
  const { local, dur } = ctx, { inner, a, b, num, q } = s.el, pa = eOut(local / 0.3), n = (local - 0.12) / 0.3, qp = eOut((local - 0.25) / 0.25);
  cssCamel(a, { transform: `translateX(${((1 - pa) * -100).toFixed(2)}%)` });
  cssCamel(b, { transform: `translateX(${((1 - pa) * 100).toFixed(2)}%)` });
  cssCamel(num, { opacity: clamp(n * 3).toFixed(3), transform: `scale(${(1.6 - 0.6 * backOut(n)).toFixed(4)})` });
  cssCamel(q, { opacity: qp.toFixed(3), transform: `translateY(${((1 - qp) * 40 * k).toFixed(1)}px)` });
  cssCamel(inner, { transform: `translateY(${(-eIn((local - (dur - 0.2)) / 0.2) * 100).toFixed(2)}%)` });
}

/** the table's vertical plan (px): head, the name chips, the first row, the row pitch, the last line */
export function tableLayout(rows: number, H: number, k: number, safe: { top: number; bottom: number }) {
  const head = safe.top * H + 9 * k, cols = head + 150 * k, first = cols + 100 * k, ask = (1 - safe.bottom) * H - 68 * k;
  return { head, cols, first, pitch: Math.min(320 * k, (ask - 40 * k - first) / Math.max(1, rows)), ask };
}

function buildTable(ctx: Ctx, s: S, k: number) {
  const p = ctx.params, { W, H, theme } = ctx, rows = versusRows(p.rows), T = tableLayout(rows.length, H, k, theme.safe), [wa, wb] = pair(p.words), [na, nb] = pair(p.names);
  const x0 = 54 * k, w = W - 2 * x0;
  cssCamel(s.box, { background: p.ink });
  div(s.box, { position: 'absolute', left: '0', top: '0', width: '50%', height: '100%', background: `linear-gradient(90deg, ${withAlpha(p.colorA, 0.13)}, rgba(0,0,0,0))` });
  div(s.box, { position: 'absolute', right: '0', top: '0', width: '50%', height: '100%', background: `linear-gradient(270deg, ${withAlpha(p.colorB, 0.13)}, rgba(0,0,0,0))` });
  const head = div(s.box, { position: 'absolute', left: `${x0}px`, width: `${w}px`, top: `${T.head}px`, textAlign: 'center', fontWeight: '900', fontSize: `${92 * k}px`, lineHeight: '1.1', letterSpacing: `${4 * k}px`, whiteSpace: 'pre' });
  div(head, { display: 'inline', color: p.colorA }, wa);
  div(head, { display: 'inline', color: p.hl, fontStyle: 'italic', margin: `0 ${22 * k}px`, fontSize: `${76 * k}px` }, 'vs');
  div(head, { display: 'inline', color: p.colorB }, wb);
  const cols = div(s.box, { position: 'absolute', left: `${x0}px`, width: `${w}px`, top: `${T.cols}px`, display: 'flex', gap: `${16 * k}px` });
  for (const [name, c] of [[na, p.colorA], [nb, p.colorB]]) div(cols, { flex: '1', textAlign: 'center', padding: `${8 * k}px 0`, borderRadius: `${12 * k}px`, background: c, color: '#ffffff', fontWeight: '900', fontSize: `${38 * k}px`, lineHeight: '1.2', whiteSpace: 'pre' }, name);
  // rows closer than the 9:16 plan's 320 units shrink together (down to 70 %)
  const f = clamp(T.pitch / (230 * k), 0.7, 1), u = k * f;
  s.rows = rows.map((r, i) => {
    const row = div(s.box, { position: 'absolute', left: `${x0}px`, width: `${w}px`, top: `${T.first + i * T.pitch}px` });
    div(row, { color: p.hl, fontWeight: '900', fontSize: `${34 * u}px`, lineHeight: '1.3', margin: `0 0 ${10 * u}px ${4 * k}px`, whiteSpace: 'pre' }, `R${i + 1}｜${r.q}`);
    const cells = div(row, { display: 'flex', gap: `${16 * k}px` });
    for (const [text, tag, c] of [[r.a, r.at, p.colorA], [r.b, r.bt, p.colorB]]) {
      const d = div(cells, { flex: '1', boxSizing: 'border-box', minHeight: `${Math.max(0, T.pitch - 124 * k)}px`, padding: `${18 * u}px ${20 * k}px`, borderRadius: `${14 * k}px`, background: withAlpha(c, 0.18),
        borderLeft: `${10 * k}px solid ${c}`, color: p.paper, fontWeight: '700', fontSize: `${42 * u}px`, lineHeight: '1.3', whiteSpace: 'pre-line' });
      if (tag) div(d, { color: c, fontWeight: '900', fontSize: `${26 * u}px`, lineHeight: '1.2', marginBottom: `${6 * u}px`, filter: 'brightness(1.35)' }, tag);
      rich(div(d), text, p.hl);
    }
    return row;
  });
  const ask = div(s.box, { position: 'absolute', left: `${x0}px`, width: `${w}px`, top: `${T.ask}px`, textAlign: 'center', color: p.paper, fontWeight: '900', fontSize: `${50 * k}px`, lineHeight: '1.3', whiteSpace: 'pre' }, p.ask);
  s.el = { head, ask };
}

function drawTable(ctx: Ctx, s: S, k: number) {
  const { local } = ctx, { head, ask } = s.el, hp = eOut(local / 0.3);
  cssCamel(head, { opacity: hp.toFixed(3), transform: `scale(${(1.2 - 0.2 * hp).toFixed(4)})` });
  s.rows.forEach((r, i) => { const q = eOut((local - 0.3 - i * 0.32) / 0.3); cssCamel(r, { opacity: q.toFixed(3), transform: `translateX(${((1 - q) * (i % 2 ? 80 : -80) * k).toFixed(1)}px)` }); });
  const ap = backOut((local - 1.5) / 0.3);
  cssCamel(ask, { opacity: clamp((local - 1.5) / 0.1).toFixed(3), transform: `scale(${clamp(ap, 0, 2).toFixed(4)})` });
}
