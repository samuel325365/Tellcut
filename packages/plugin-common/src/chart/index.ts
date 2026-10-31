// common.chart — data charts drawn on a card, one block with a `kind` per chart, promoted from the shorts that each drew their own:
// bars (chili-history's fx.art bars: two hatched bars, a "× 6.7" and the data source; parenting-brain's countryGap and sleepChart:
// a gap bracket and a baseline; fd-hakka's hkStat: a big number counting up over bars that grow, the first circled), pie (fd-quotes'
// fx.pie: slices coloured in one after another, a tag under it), people (fd-hakka's hkPeople and parenting-brain's brainAge: little
// people flipping over, the first k in colour and circled, "10 人中有 4 人"), rank (parenting-brain's dayRank: a ranking with one row
// lit and tagged "第 12 名"; `reveal: 'up'` and the tie brackets from seoul-bbq's podium: the last place first, the winner last), balance (chili's and parenting-brain's scales: weights drop into the pans and the beam tips to the heavier
// side), table (fd-caibao's fx.table: the rules drawn, the cells rising in diagonal order) and line (parenting-brain's ledgerStrip:
// one or two curves drawn along with a playhead, marks on them, a baseline).
// `look` clean draws flat shapes in the theme colours; hand draws them with the pens of sketch.ts (marker, crayon, pencil, ballpoint;
// hatched or marker-filled, boiling); woodcut is chili's ink outline, flat colour and straight hatching on parchment.
// Every word (labels, numbers counting up, titles, sources) is DOM text; the shapes are on one canvas. The picture is a pure function
// of the time, the params and the theme: chartPlan() lays it out (tested), drawMark() paints it per look.
// The kinds are in chart/<kind>.ts, the shared pieces in shared.ts, the drawing in draw.ts; this file is the block.
import { clamp, cssCamel, eOut3, h, prog, textEm, type ItemType, type Theme } from '@tellcut/engine';
import { canvasAt, freeCanvas } from '../inkline.ts';
import { HAND } from '../hand.ts';
import { grainBegin, grainEnd, hash, type GrainLayer, type PenStyle } from '../sketch.ts';
import { emParts } from '../text.ts';
import { withAlpha } from '../color.ts';
import { textLang, WORDS, wordsLang, type WordsLang } from '../words.ts';
import { CHART_KINDS, type ChartKind, type Look, type ChartP, chartRows, valued, type Txt, type Plan, type Colors, fitSize, chartFrame, type Env, T, circlePad, baseOf } from './shared.ts';
import { planBars } from './bars.ts';
import { planPie } from './pie.ts';
import { peopleGrid, planPeople } from './people.ts';
import { planRank } from './rank.ts';
import { planBalance } from './balance.ts';
import { tableCells, planTable } from './table.ts';
import { planLine } from './line.ts';
import { type R, drawMark, drawCard } from './draw.ts';

export { CHART_KINDS, type ChartKind, type ChartP, type Num, parseNum, fmtNum, type Row, chartRows, chartSeries, hlIndex, countText, ratioText, type Box, type Txt, type Plan, textW, fitSize, chartFrame, boxLoopPts, boxAround, boxReach } from './shared.ts';
export { peopleGrid } from './people.ts';
export { ranks, tieRuns, rankStarts } from './rank.ts';
export { blockCounts, tipAngle } from './balance.ts';
export { tableCells, tableHl } from './table.ts';
export { cutAtX } from './line.ts';
export { markerFill, dashes, personPts, drawMark } from './draw.ts';

/** the words the chart draws besides what it writes by itself: the language of those is read from these (people draws no data) */
export const chartTexts = (p: ChartP) => [p.title, p.source, p.stat, ...(p.kind === 'people' ? [] : [p.data, p.unit, p.base, p.axis])];

/** The whole picture at `local`: the card, the shapes, the words. Pure: the same params, frame and time give the same plan.
 *  `lang`: the language of the words it writes by itself (draw passes the film's, see words.ts; else its own text's, else Chinese). */
export function chartPlan(p: ChartP, W: number, H: number, theme: Theme, local: number, lang: WordsLang = textLang(...chartTexts(p)) ?? 'zh'): Plan {
  const C: Colors = { ink: p.ink, paper: p.paper, color: p.color, accent: p.accent, tag: p.tag, dim: withAlpha(p.ink, 0.62), mute: withAlpha(p.ink, 0.22) };
  const F0 = chartFrame(p, W, H, theme.safe), F = chartFrame(p, W, H, theme.safe, naturalBody({ p, F: F0, C, local, W, H, texts: [], marks: [], lang })), u = F.u;
  const e: Env = { p, F, C, local, W, H, texts: [], marks: [], lang };
  if (p.title) T(e, { id: 'title', text: p.title, x: F.inner.x + F.inner.w / 2, y: F.inner.y + Math.max(F.ts, 40 * u) * 0.62, size: F.ts, align: 'c', color: p.ink, weight: 900, a: clamp((local - 0.05) / 0.3) });
  ({ bars: planBars, pie: planPie, people: planPeople, rank: planRank, balance: planBalance, table: planTable, line: planLine } as Record<ChartKind, (e: Env) => void>)[CHART_KINDS.includes(p.kind) ? p.kind : 'bars'](e);
  if (p.source) T(e, { id: 'source', text: p.source, x: F.inner.x + F.inner.w, y: F.inner.y + F.inner.h - Math.max(F.ss, 22 * u) * 0.55, size: F.ss, align: 'r', color: C.dim, weight: 500, a: clamp((local - p.at - 0.2) / 0.4) });
  return { card: p.card ? F.card : null, inner: F.inner, texts: e.texts, marks: e.marks, u };
}

/** the body height a kind looks best at for the card's width (the card is cut down to it when the frame has more room) */
export function naturalBody(e: Env): number {
  const { p, F } = e, u = F.u, b = F.body, kind = CHART_KINDS.includes(p.kind) ? p.kind : 'bars', rows = chartRows(p.data);
  const statH = p.stat ? fitSize(p.stat, 100 * u, b.w, 1.7) * 1.7 * 1.25 : 0;
  switch (kind) {
    case 'bars': return p.dir === 'v' ? Math.max(b.w * 0.8, 420 * u + statH) : statH + valued(rows).length * (220 * u + circlePad(p, rows, u)) + 40 * u + (baseOf(p.base)?.label ? 50 * u : 0);
    case 'pie': return Math.min(b.w, 760 * u) * 1.02 + (p.note ? 120 * u : 0);
    case 'people': {
      const n = clamp(Math.round(p.n), 1, 200), stat = p.stat || WORDS.people[e.lang](n, n), room = fitSize(stat, 84 * u, b.w, 1.5) * 1.5 * 1.45;
      const G = peopleGrid(n, b.w, b.w * 2);
      return G.rows * Math.min(G.cell, 200 * u) * 1.15 + room;
    }
    case 'rank': return rows.length * 100 * u;
    case 'balance': { const S = b.w / 3.1; return (p.note ? 100 * u : 0) + S * 0.28 + Math.max(S * 1.3, S * 1.12 + 130 * u) + 20 * u; }
    case 'table': { const cells = tableCells(p.data), Cn = Math.max(1, ...cells.map((r) => r.length)), em = Array.from({ length: Cn }, (_, c) => Math.max(1.5, ...cells.map((r) => textEm(r[c] ?? ''))) + 1.2);
      return cells.length * Math.min(46 * u, (b.w / em.reduce((a, x) => a + x, 0)) * 0.95) * 2.5 + 40 * u; }
    default: return b.w * 0.8;
  }
}

// ---------- the block ----------
interface S { cv: HTMLCanvasElement; tx: HTMLElement; layer: GrainLayer; key: string; els: Map<string, HTMLElement> }

const fontOf = (p: ChartP, theme: Theme) => (p.look === 'hand' ? `'${HAND}', 'Noto Sans TC', sans-serif` : p.look === 'woodcut' ? `'Noto Serif TC', 'Noto Sans TC', serif`
  : `'${p.font || theme.fonts.display}', 'Noto Sans TC', sans-serif`);
const weightOf = (look: Look, w: number) => (look === 'hand' ? (w >= 700 ? 700 : 400) : w);

export const chart: ItemType<ChartP, S> = {
  type: 'common.chart', label: '資料圖表', category: 'number', kind: 'overlay',
  doc: '資料圖表卡，kind 換圖：bars 長條長出來、數字往上跳（dir h 橫條／v 直條；compare ratio 標「× 6.7」倍數、gap 標差距括號；base 一條基準虛線；stat 一行大數字往上跳）、pie 圓餅一片一片塗上（note 掛在下面的標籤）、people 一排小人一個個翻牌、前 k 個上色被圈起來（10 人中有 4 人）、rank 排名清單、亮起一列並掛「第 12 名」（reveal up 從最後一名往上一列列揭曉、同名次一起、第一名最後；名次相同的列右邊一道括號標 tie 並列）、balance 天秤（兩邊砝碼掉進盤子、往重的那邊傾斜）、table 對照表（線畫出來、格子沿對角線浮上來）、line 一兩條曲線隨時間畫出（播放頭、曲線上的標記、基準線）；data 一行一筆「名稱|數值|顯示的字」，hl 亮哪一筆（max、min 或第幾筆）、mark circle 把它圈起來，title 標題、source 資料來源、時間 at 相對項目開始；look clean 簡潔（theme 色）、hand 手繪（pen 選 marker 麥克筆／crayon 蠟筆／pencil 鉛筆／ballpoint 原子筆，boil 抖動）、woodcut 木刻排線羊皮紙；數據、統計、比較、排名、比例、趨勢',
  params: [
    { key: 'kind', label: '圖（bars 長條、pie 圓餅、people 人形圖、rank 排名、balance 天秤、table 對照表、line 曲線）', type: 'enum', options: [...CHART_KINDS], default: 'bars' },
    { key: 'look', label: '樣子（clean 簡潔、hand 手繪、woodcut 木刻排線）', type: 'enum', options: ['clean', 'hand', 'woodcut'], default: 'clean' },
    { key: 'pen', label: '手繪的筆（hand；marker 麥克筆、crayon 蠟筆、pencil 鉛筆、ballpoint 原子筆）', type: 'enum', options: ['marker', 'crayon', 'pencil', 'ballpoint'], default: 'crayon' },
    { key: 'boil', label: '手繪線每秒抖幾次（0＝不抖）', type: 'number', min: 0, max: 24, step: 1, default: 8 },
    { key: 'title', label: '標題（空＝沒有）', type: 'string', default: '全球產量：乾辣椒 vs 黑胡椒' },
    { key: 'data', label: '資料：一行一筆「名稱|數值|顯示的字」（rank 第三欄是名次、table 一行一列「格|格|格」第一行是表頭、line「名稱|1,3,2,5」）', type: 'text', default: '黑胡椒|69\n乾辣椒|463' },
    { key: 'unit', label: '數字後面的單位', type: 'string', default: ' 萬噸' },
    { key: 'hl', label: '亮哪一筆（max 最大、min 最小、第幾筆從 1 數；table「列,欄」；空＝不亮）', type: 'string', default: 'max' },
    { key: 'mark', label: '把亮的那筆圈起來', type: 'enum', options: ['none', 'circle'], default: 'none' },
    { key: 'compare', label: '比較（bars；ratio 倍數、gap 差距括號，比亮的那根和另一根）', type: 'enum', options: ['none', 'ratio', 'gap'], default: 'ratio' },
    { key: 'note', label: '註解（bars 比較的字、pie 下面的標籤、rank 亮的那列的標籤、balance 上方的字、line 線尾的字；空＝自動，跟標題同一種語言）', type: 'string', default: '' },
    { key: 'base', label: '基準線「數值|標籤」（bars、line；空＝沒有）', type: 'string', default: '' },
    { key: 'stat', label: '大數字一行（bars、people；【數字】或第一個數字會往上跳；people 空＝「N 人中有 K 人」，標題是英文、日文就寫英文、日文）', type: 'string', default: '' },
    { key: 'source', label: '資料來源（右下小字；空＝沒有）', type: 'string', default: 'FAO 2017' },
    { key: 'n', label: '總人數（people）', type: 'number', min: 1, max: 200, step: 1, default: 10 },
    { key: 'k', label: '上色的人數（people）', type: 'number', min: 0, max: 200, step: 1, default: 4 },
    { key: 'axis', label: '橫軸兩端「起|迄」（line）', type: 'string', default: '' },
    { key: 'marks', label: '曲線上的標記，一行一個「位置 0–1|第幾條線|符號」（line）', type: 'text', default: '' },
    { key: 'reveal', label: '排名出現的順序（rank；down 由上往下、up 從最後一名往上揭曉，同名次一起出來、第一名最後）', type: 'enum', options: ['down', 'up'], default: 'down' },
    { key: 'tie', label: '名次相同的列旁邊括號標的字（rank；空＝不標）', type: 'string', default: '並列' },
    { key: 'dir', label: '長條方向（bars；h 橫、v 直）', type: 'enum', options: ['h', 'v'], default: 'h' },
    { key: 'at', label: '開始動的時間（秒，相對項目開始）', type: 'number', min: 0, max: 30, step: 0.05, default: 0.3 },
    { key: 'grow', label: '長出來／畫出來的時間（秒；line 是播放頭走完全程的時間；rank 的 reveal up 是最後一名到第一名出來的時間）', type: 'number', min: 0.1, max: 600, step: 0.1, default: 1.2 },
    { key: 'card', label: '底卡', type: 'bool', default: true },
    { key: 'x', label: '中心 x（畫面寬比例；-1＝安全區中間）', type: 'number', min: -1, max: 1, step: 0.01, default: -1 },
    { key: 'y', label: '中心 y（畫面高比例；-1＝安全區中間）', type: 'number', min: -1, max: 1, step: 0.01, default: -1 },
    { key: 'w', label: '寬（畫面寬比例；-1＝自動）', type: 'number', min: -1, max: 1, step: 0.01, default: -1 },
    { key: 'h', label: '高（畫面高比例；-1＝自動）', type: 'number', min: -1, max: 1, step: 0.01, default: -1 },
    { key: 'ink', label: '字與線的顏色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'paper', label: '底卡顏色', type: 'color', default: '#fff8ec', theme: 'palette.paper' },
    { key: 'color', label: '一般資料的顏色', type: 'color', default: '#2ec4b6', theme: 'palette.accent2' },
    { key: 'accent', label: '亮起來那筆的顏色', type: 'color', default: '#ff4d4f', theme: 'palette.accent' },
    { key: 'tag', label: '標籤與天秤盤的顏色', type: 'color', default: '#ffe14d', theme: 'palette.hl' },
    { key: 'colors', label: '圓餅和曲線的顏色（逗號分隔；空＝用上面的顏色）', type: 'string', default: '' },
    { key: 'font', label: '字型（clean；空＝theme 字型）', type: 'string', default: '', theme: 'fonts.display' },
  ],
  build(ctx) {
    const cv = h('canvas', null, null, ctx.root), tx = h('div', null, null, ctx.root);
    cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    cssCamel(tx, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    return { cv, tx, layer: {}, key: '', els: new Map() };
  },
  hide(s) { freeCanvas(s.cv); s.layer.cv = undefined; },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local, dur } = ctx, plan = chartPlan(p, W, H, theme, local, wordsLang(chartTexts(p), ctx)), u = plan.u;
    const alpha = clamp(local / 0.2) * (1 - prog(local, dur - 0.3, dur)), dy = (1 - eOut3(clamp(local / 0.35))) * 40 * u;
    const look: Look = p.look === 'hand' || p.look === 'woodcut' ? p.look : 'clean';
    const r: R = { look, pen: (['marker', 'crayon', 'pencil', 'ballpoint'].includes(p.pen) ? p.pen : 'crayon') as PenStyle, u, boil: look === 'hand' ? p.boil : 0, t: local, ink: p.ink };
    for (const el of [s.cv, s.tx]) cssCamel(el, { opacity: alpha.toFixed(3), transform: `translateY(${dy.toFixed(2)}px)` });
    const main = canvasAt(s.cv, W, H), crayon = look === 'hand' && r.pen === 'crayon';
    if (plan.card) drawCard(main, plan.card, p, r, theme.radius * u, local);
    const g = crayon ? grainBegin(s.layer, W, H) : main;
    for (const m of plan.marks) drawMark(g, m, r);
    if (crayon) grainEnd(s.layer, main, 0.4, u);
    syncTexts(s, plan.texts, fontOf(p, theme), look, u);
  },
};

/** the plan's words as absolutely placed divs (rebuilt only when which words there are changes) */
function syncTexts(s: S, texts: Txt[], family: string, look: Look, u: number) {
  const key = texts.map((t) => `${t.id}${t.em ? '*' : ''}${t.bg ? '#' : ''}`).join('|');
  if (key !== s.key) {
    s.key = key; s.tx.textContent = ''; s.els = new Map();
    for (const t of texts) {
      const el = h('div', null, null, s.tx);
      cssCamel(el, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1.2', fontFamily: family });
      s.els.set(t.id, el);
    }
  }
  texts.forEach((t, i) => {
    const el = s.els.get(t.id)!, a = clamp(t.a ?? 1), sh = t.align === 'l' ? '0' : t.align === 'r' ? '-100%' : '-50%';
    const sig = `${t.text}\u0001${t.em?.color ?? ''}`;
    if (el.dataset.v !== sig) {
      el.dataset.v = sig; el.textContent = '';
      if (t.em) for (const [piece, em] of emParts(t.text)) { const sp = h('span', null, null, el); sp.textContent = piece; if (em) cssCamel(sp, { color: t.em.color, fontSize: `${t.em.scale}em` }); }
      else el.textContent = t.text;
    }
    const rot = (t.rot ?? 0) + (look === 'hand' ? (hash(i, 5) - 0.5) * 3 : 0);
    cssCamel(el, { display: t.text && a > 0 ? 'block' : 'none', left: `${t.x.toFixed(2)}px`, top: `${t.y.toFixed(2)}px`, fontSize: `${t.size.toFixed(2)}px`, color: t.color,
      fontWeight: String(weightOf(look, t.weight ?? 700)), opacity: a.toFixed(3), transformOrigin: t.align === 'l' ? '0 50%' : t.align === 'r' ? '100% 50%' : '50% 50%',
      transform: `translate(${sh}, -50%) scale(${Math.max(0.01, t.sc ?? 1).toFixed(4)}) rotate(${rot.toFixed(2)}deg)`,
      background: t.bg ?? 'none', padding: t.bg ? '0.1em 0.45em' : '0', borderRadius: t.bg ? `${10 * u}px` : '0',
      border: t.bg && look !== 'clean' ? `${3 * u}px solid currentColor` : 'none', boxShadow: t.bg && look === 'clean' ? `0 ${6 * u}px ${16 * u}px rgba(0,0,0,0.18)` : 'none',
      webkitTextStroke: t.halo ? `${(t.size * 0.16).toFixed(2)}px ${t.halo}` : '0', paintOrder: 'stroke fill' });
  });
}
