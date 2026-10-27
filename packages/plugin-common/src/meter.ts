// common.meter — a big number that steps through values (depth, height, temperature, a count, a rank), with the stage it is in
// and a ruler under it. Promoted from a deep-sea explainer short's depth gauge; the stops are levels.ts strings.
// look band (krakow-square's fx.chronicle, the year ruler): a dark band across the top, the number flush left with a small unit,
// a labelled ruler from `min` to `max` under it with a marker sliding along, flags (`pins`) planted at values, and the label of
// the flag the number has reached beside it. look ruler (t2-line's height ruler): an upright ruler at the right edge; every stop
// reached leaves an arrow with its value, the newest big in the accent colour (a pin at the same value adds its label).
import { clamp, cssCamel, eBack, eOut3, h, prog, type ItemType } from '@tellcut/engine';
import { levelAt, levelFrac, parseLevels, parseStages, stageAt } from './levels.ts';
import { canvasAt, freeCanvas } from './inkline.ts';
import { withAlpha } from './color.ts';

interface P {
  stops: string; ease: number; prefix: string; suffix: string; decimals: number; stages: string; stagePrefix: string;
  ruler: boolean; ticks: string; max: number; scale: 'linear' | 'log'; y: number; size: number; font: string; color: string; outline: string; accent: string; glow: number;
  look: 'center' | 'band' | 'ruler'; min: number; pins: string; sep: boolean; hl: string;
}
interface S { num: HTMLElement; stage: HTMLElement; track: HTMLElement; fill: HTMLElement; knob: HTMLElement; ticks: HTMLElement[]; band: HTMLElement; cv: HTMLCanvasElement; unit: HTMLElement; label: HTMLElement; marks: HTMLElement[] }

export type PinKind = 'accent' | 'hl' | 'dashed';
export interface Pin { v: number; kind: PinKind; label: string; on: number; off: number }
/** "值|種類|標籤|出現秒|淡掉秒; …" (semicolons or lines) → flags; the kind accent, hl or dashed (else accent), times from the item start */
export function parsePins(s: string): Pin[] {
  return String(s ?? '').split(/[;；\n]/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const [v, k, label, on, off] = x.split('|').map((y) => y.trim());
    const kind = (k === 'hl' || k === 'dashed' ? k : 'accent') as PinKind;
    return { v: Number(v), kind, label: label ?? '', on: Number(on) || 0, off: off ? Number(off) : Infinity };
  }).filter((p) => Number.isFinite(p.v));
}
/** the flag whose label shows beside the number at `local`: shown, not faded yet, within `tol` of the value; the latest of those */
export function pinAt(pins: Pin[], v: number, local: number, tol: number): Pin | null {
  let cur: Pin | null = null;
  for (const p of pins) if (local >= p.on && local < p.off && Math.abs(p.v - v) <= tol && (!cur || p.on > cur.on)) cur = p;
  return cur;
}
/** a round tick step for a ruler over `span`: the 1, 2 or 5 × 10ⁿ nearest to span / n */
export function niceStep(span: number, n = 8): number {
  const raw = Math.abs(span) / Math.max(1, n), e = Math.pow(10, Math.floor(Math.log10(raw || 1))), m = raw / e;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e;
}

/** 11034.4 → "11,034"; decimals kept as asked */
export const formatValue = (v: number, decimals: number, sep = true) => {
  const [i, f] = Math.abs(v).toFixed(Math.max(0, Math.round(decimals))).split('.');
  return `${v < 0 ? '-' : ''}${sep ? i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : i}${f ? `.${f}` : ''}`;
};

/** the number's baseline (a share of the frame height): `y`, or below 0 the number's top on the top safe margin */
export const meterBaseline = (y: number, size: number, safeTop: number) => (y >= 0 ? y : safeTop + size / 100);

export const meter: ItemType<P, S> = {
  type: 'common.meter', label: '數值計', category: 'number', kind: 'overlay',
  doc: '一個大數字隨時間跳到各個值（深度、海拔、溫度、次數、排名…），下面標目前的階段名稱和一條刻度尺；主線是「越來越…」的片子用它讓進度看得見；look band 是年代尺：上方一條深色帶，數字靠左、單位小一號，下面一把從 min 到 max 有數字刻度的尺，標記沿尺滑動，pins 在某些值插小旗（accent 主色、hl 高亮色、dashed 虛線空心旗），數字到了某面旗時旁邊出現它的標籤（年份、歷史、時代）；look ruler 是右側直立的量尺（身高、高度、排名）：每到一個數值留下一個箭頭和數字，最新的放大、主色，同一個值的 pin 會加上它的標籤；stops 的第三段寫數字＝那一站自己的跳動時間（和 ambient 共用）',
  params: [
    { key: 'stops', label: '數值（秒:值[:s]，逗號分隔；:s＝直接跳，:數字＝這一站的跳動秒數）', type: 'text', default: '0:0, 0.6:500, 1.6:2000' },
    { key: 'ease', label: '跳動時間 (s)', type: 'number', min: 0, max: 3, step: 0.05, default: 0.8 },
    { key: 'prefix', label: '數字前（例：−）', type: 'string', default: '' },
    { key: 'suffix', label: '數字後（例： m）', type: 'string', default: '' },
    { key: 'decimals', label: '小數位數', type: 'number', min: 0, max: 3, step: 1, default: 0 },
    { key: 'stages', label: '階段（值:名稱，逗號分隔；空＝不顯示）', type: 'text', default: '' },
    { key: 'stagePrefix', label: '階段名稱前（例：水深・）', type: 'string', default: '' },
    { key: 'ruler', label: '刻度尺', type: 'bool', default: true },
    { key: 'ticks', label: '刻度（值，逗號分隔；空＝用階段的起點）', type: 'string', default: '' },
    { key: 'max', label: '尺的最大值（0＝最大的那個數值）', type: 'number', min: 0, max: 1e9, step: 1, default: 0 },
    { key: 'scale', label: '尺的刻度', type: 'enum', options: ['linear', 'log'], default: 'linear' },
    { key: 'y', label: '數字的底線高度（畫面高比例；-1＝數字上緣貼齊安全區上緣）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'size', label: '字級（畫面高 %）', type: 'number', min: 2, max: 20, step: 0.1, default: 6.4 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'color', label: '數字顏色', type: 'color', default: '#ffffff' },
    { key: 'outline', label: '數字描邊（淺色背景上也看得見）', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'accent', label: '強調色（階段、尺、光暈）', type: 'color', default: '#5fe3ff', theme: 'palette.accent' },
    { key: 'glow', label: '光暈（0–1）', type: 'number', min: 0, max: 1, step: 0.05, default: 0.6 },
    { key: 'look', label: '樣子（center 置中大數字、band 年代尺、ruler 右側直立量尺）', type: 'enum', options: ['center', 'band', 'ruler'], default: 'center' },
    { key: 'min', label: '尺的起點（0＝從 0 起；年份、身高這種不從 0 開始的尺）', type: 'number', min: -1e9, max: 1e9, step: 1, default: 0 },
    { key: 'pins', label: '小旗（值|accent/hl/dashed|標籤|出現秒|淡掉秒，分號或換行分隔；band、ruler）', type: 'text', default: '' },
    { key: 'sep', label: '千分位逗號', type: 'bool', default: true },
    { key: 'hl', label: 'hl 小旗的顏色', type: 'color', default: '#ffe14d', theme: 'palette.hl' },
  ],
  build(ctx) {
    const mk = (parent: HTMLElement) => { const d = h('div', null, null, parent); cssCamel(d, { position: 'absolute' }); return d; };
    const look = ctx.params.look ?? 'center';
    const band = mk(ctx.root), cv = h('canvas', null, null, ctx.root) as HTMLCanvasElement;
    cssCamel(band, { display: 'none', left: '0', width: '100%', pointerEvents: 'none' });
    cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', display: 'none', pointerEvents: 'none' });
    const num = mk(ctx.root), stage = mk(ctx.root), track = mk(ctx.root), fill = mk(track), knob = mk(ctx.root);
    for (const el of [num, stage]) cssCamel(el, { left: '50%', whiteSpace: 'pre', lineHeight: '1', textAlign: 'center' });
    const unit = h('span', null, null, ctx.root), label = mk(ctx.root);
    cssCamel(unit, { display: 'none' });
    cssCamel(label, { display: 'none', whiteSpace: 'pre', lineHeight: '1.1' });
    const n = look === 'band' ? 24 : ctx.params.ruler ? (ctx.params.ticks || ctx.params.stages ? 16 : 0) : 0;
    const m = look === 'ruler' ? parseLevels(ctx.params.stops).length * 2 : 0;
    const marks = Array.from({ length: m }, () => { const d = mk(ctx.root); cssCamel(d, { whiteSpace: 'pre', lineHeight: '1' }); return d; });
    return { num, stage, track, fill, knob, ticks: Array.from({ length: n }, () => mk(ctx.root)), band, cv, unit, label, marks };
  },
  hide(s) { freeCanvas(s.cv); },
  draw(ctx, s) {
    if (ctx.params.look === 'band') { drawBand(ctx, s); return; }
    if (ctx.params.look === 'ruler') { drawRuler(ctx, s); return; }
    hide(s.band, s.cv, s.unit, s.label, ...s.marks);
    const p = ctx.params, { W, H, theme } = ctx, k = Math.min(W, H) / 1080, levels = parseLevels(p.stops), stages = parseStages(p.stages);
    const v = levelAt(levels, ctx.local, p.ease), f = levelFrac(v, levels, p.max, p.scale, p.min ?? 0), y = meterBaseline(p.y, p.size, theme.safe.top);
    const fade = Math.min(prog(ctx.local, 0, 0.25), 1 - prog(ctx.local, ctx.dur - 0.25, ctx.dur)), px = (p.size / 100) * H, glow = p.glow * 26 * k;
    s.num.textContent = `${p.prefix}${formatValue(v, p.decimals, p.sep ?? true)}${p.suffix}`;
    cssCamel(s.num, { top: `${y * H}px`, transform: 'translate(-50%, -100%)', fontSize: `${px}px`, fontWeight: '900', fontFamily: `'${p.font}', sans-serif`,
      color: p.color, webkitTextStroke: `${theme.stroke * 0.75 * k}px ${p.outline}`, paintOrder: 'stroke fill',
      textShadow: glow ? `0 0 ${glow}px ${p.accent}` : 'none', opacity: String(fade) });
    const name = stageAt(stages, v);
    s.stage.textContent = name ? `${p.stagePrefix}${name}` : '';
    cssCamel(s.stage, { top: `${y * H + px * 0.18}px`, transform: 'translateX(-50%)', fontSize: `${px * 0.38}px`, fontWeight: '700',
      fontFamily: `'${p.font}', sans-serif`, color: p.accent, opacity: String(fade), display: name ? 'block' : 'none' });
    // the ruler: within the side safe margins, under the stage name
    const x = theme.safe.side * W, w = W - 2 * x, ry = y * H + px * (name ? 0.85 : 0.35), th = 5 * k;
    cssCamel(s.track, { display: p.ruler ? 'block' : 'none', left: `${x}px`, top: `${ry - th / 2}px`, width: `${w}px`, height: `${th}px`,
      borderRadius: `${th}px`, background: withAlpha(p.accent, 0.3), opacity: String(fade) });
    cssCamel(s.fill, { left: '0', top: '0', height: '100%', width: `${f * 100}%`, borderRadius: `${th}px`, background: p.accent });
    const kr = 11 * k;
    cssCamel(s.knob, { display: p.ruler ? 'block' : 'none', left: `${x + w * f - kr}px`, top: `${ry - kr}px`, width: `${2 * kr}px`, height: `${2 * kr}px`,
      borderRadius: '50%', background: '#ffffff', boxShadow: glow ? `0 0 ${glow * 0.7}px ${p.accent}` : 'none', opacity: String(fade) });
    const marks = (p.ticks ? p.ticks.split(/[,，]/).map(Number) : stages.map((x) => x.from)).filter((t) => Number.isFinite(t) && t > 0);
    s.ticks.forEach((el, i) => {
      const t = marks[i];
      if (t === undefined) { cssCamel(el, { display: 'none' }); return; }
      const tx = x + w * levelFrac(t, levels, p.max, p.scale, p.min ?? 0);
      cssCamel(el, { display: 'block', left: `${tx - 1.5 * k}px`, top: `${ry - 9 * k}px`, width: `${3 * k}px`, height: `${18 * k}px`, background: withAlpha(p.accent, 0.6), opacity: String(fade) });
    });
  },
};

type Ctx = Parameters<typeof meter.draw>[0];
const hide = (...els: HTMLElement[]) => { for (const e of els) cssCamel(e, { display: 'none' }); };
const pinColor = (p: P, kind: PinKind) => (kind === 'hl' ? p.hl : kind === 'dashed' ? withAlpha(p.color, 0.75) : p.accent);
/** the ruler's ends: min (or 0) and max (or the biggest stop) */
const rulerEnds = (p: P, levels: ReturnType<typeof parseLevels>) => [p.min ?? 0, p.max > 0 ? p.max : Math.max(p.min ?? 0, ...levels.map((l) => l.v))] as const;

/** look band: the chronicle — a dark band, the number flush left, a labelled ruler with flags and a marker under it */
function drawBand(ctx: Ctx, s: S) {
  const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080, levels = parseLevels(p.stops), pins = parsePins(p.pins);
  hide(s.stage, s.track, s.knob, ...s.marks);
  const v = levelAt(levels, local, p.ease), intro = eOut3(prog(local, 0, 0.6)), fade = intro * (1 - prog(local, dur - 0.25, dur)), dy = (1 - intro) * -40 * k;
  const fs = (p.size / 100) * H, top = (p.y >= 0 ? p.y : theme.safe.top) * H + dy, x0 = theme.safe.side * W, x1 = W - x0, font = `'${p.font}', 'Noto Sans TC', sans-serif`;
  cssCamel(s.band, { display: 'block', top: `${top - 0.4 * fs}px`, height: `${3.3 * fs}px`, opacity: String(fade),
    background: 'linear-gradient(180deg, rgba(18,14,10,0) 0%, rgba(18,14,10,.62) 22%, rgba(18,14,10,.62) 78%, rgba(18,14,10,0) 100%)' });
  // the number, its unit (half size) and the label of the flag it has reached
  s.num.textContent = `${p.prefix}${formatValue(v, p.decimals, p.sep ?? true)}`;
  cssCamel(s.num, { display: 'block', left: `${x0}px`, top: `${top}px`, transform: 'none', textAlign: 'left', fontSize: `${fs}px`, fontWeight: '900', fontFamily: font, color: p.color,
    webkitTextStroke: '0', textShadow: `0 ${3 * k}px ${10 * k}px rgba(0,0,0,.55)`, opacity: String(fade), letterSpacing: `${2 * k}px` });
  const nw = s.num.offsetWidth;
  s.unit.textContent = p.suffix;
  cssCamel(s.unit, { display: p.suffix ? 'block' : 'none', position: 'absolute', whiteSpace: 'pre', lineHeight: '1', left: `${x0 + nw + 0.1 * fs}px`, top: `${top + 0.42 * fs}px`, fontSize: `${0.5 * fs}px`,
    fontWeight: '700', fontFamily: font, color: p.color, textShadow: `0 ${3 * k}px ${10 * k}px rgba(0,0,0,.55)`, opacity: String(fade) });
  const [lo, hi] = rulerEnds(p, levels), cur = pinAt(pins, v, local, Math.max(0.6, Math.abs(hi - lo) * 0.002));
  const lx = x0 + nw + (p.suffix ? s.unit.offsetWidth + 0.1 * fs : 0) + 0.45 * fs, la = cur ? eOut3(prog(local, cur.on, cur.on + 0.35)) : 0;
  s.label.textContent = cur?.label ?? '';
  cssCamel(s.label, { display: cur?.label ? 'block' : 'none', left: `${lx}px`, top: `${top + 0.32 * fs}px`, fontSize: `${0.52 * fs}px`, fontWeight: '700', fontFamily: font,
    color: cur ? pinColor(p, cur.kind) : p.color, textShadow: `0 ${2 * k}px ${8 * k}px rgba(0,0,0,.6)`, opacity: String(fade * la), transform: `translateX(${((1 - la) * 20 * k).toFixed(2)}px)` });
  // the ruler: round ticks (a label every other one, or at `ticks`), the flags, the marker
  const ry = top + 1.87 * fs, X = (val: number) => x0 + (x1 - x0) * levelFrac(val, levels, p.max, p.scale, lo);
  cssCamel(s.cv, { display: 'block', opacity: String(fade) });
  const g = canvasAt(s.cv, W, H);
  g.strokeStyle = withAlpha(p.color, 0.75); g.lineWidth = 3 * k; g.lineCap = 'butt';
  g.beginPath(); g.moveTo(x0, ry); g.lineTo(x1, ry); g.stroke();
  const given = String(p.ticks ?? '').split(/[,，]/).map((x) => x.trim()).filter(Boolean).map(Number).filter(Number.isFinite);
  const step = niceStep(hi - lo, 8), labels: number[] = [];
  for (let t = Math.ceil(lo / step) * step, i = 0; t <= hi + 1e-9 && i < 200; t += step, i++) {
    const major = given.length ? given.some((x) => Math.abs(x - t) < 1e-9) : Math.round(t / step) % 2 === 0;
    g.beginPath(); g.moveTo(X(t), ry); g.lineTo(X(t), ry + (major ? 16 : 9) * k); g.stroke();
    if (major && !given.length) labels.push(+t.toFixed(6));
  }
  for (const t of given) { g.beginPath(); g.moveTo(X(t), ry); g.lineTo(X(t), ry + 16 * k); g.stroke(); labels.push(t); }
  s.ticks.forEach((el, i) => {
    const t = labels[i];
    if (t === undefined) { hide(el); return; }
    el.textContent = formatValue(t, 0, p.sep ?? true);
    cssCamel(el, { display: 'block', left: `${X(t)}px`, top: `${ry + 20 * k}px`, transform: 'translateX(-50%)', whiteSpace: 'pre', lineHeight: '1', fontSize: `${0.26 * fs}px`,
      fontFamily: font, color: withAlpha(p.color, 0.7), opacity: String(fade) });
  });
  for (const pin of pins) {
    if (local < pin.on) continue;
    const a = eOut3(prog(local, pin.on, pin.on + 0.4)), x = X(pin.v), hg = 34 * k * a, c = pinColor(p, pin.kind);
    g.save(); g.globalAlpha = local >= pin.off ? 0.3 : 1; g.strokeStyle = c; g.fillStyle = c; g.lineWidth = 4 * k;
    if (pin.kind === 'dashed') g.setLineDash([5 * k, 5 * k]);
    g.beginPath(); g.moveTo(x, ry); g.lineTo(x, ry - hg); g.stroke(); g.setLineDash([]);
    g.beginPath(); g.moveTo(x, ry - hg); g.lineTo(x + 18 * k * a, ry - hg + 7 * k); g.lineTo(x, ry - hg + 14 * k); g.closePath();
    if (pin.kind === 'dashed') { g.lineWidth = 2.5 * k; g.stroke(); } else g.fill();
    g.restore();
  }
  const mx = X(v);
  g.fillStyle = p.color; g.beginPath(); g.moveTo(mx, ry + 4 * k); g.lineTo(mx - 13 * k, ry + 24 * k); g.lineTo(mx + 13 * k, ry + 24 * k); g.closePath(); g.fill();
  g.strokeStyle = withAlpha(p.color, 0.9); g.lineWidth = 2 * k; g.beginPath(); g.moveTo(mx, ry - 44 * k); g.lineTo(mx, ry); g.stroke();
}

/** look ruler: an upright ruler at the right edge, from min (bottom) to max (top); every stop reached keeps an arrow and its value */
function drawRuler(ctx: Ctx, s: S) {
  const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080, levels = parseLevels(p.stops), pins = parsePins(p.pins);
  hide(s.num, s.stage, s.track, s.knob, s.band, s.unit, s.label, ...s.ticks);
  const enter = eOut3(prog(local, 0, 0.4)), fade = clamp(local / 0.1) * (1 - prog(local, dur - 0.25, dur)), dx = (1 - enter) * 160 * k, px = (p.size / 100) * H;
  const x = W * (1 - theme.safe.side) - 36 * k + dx, cy = (p.y >= 0 ? p.y : 0.49) * H, y0 = cy + 0.2 * H, y1 = cy - 0.2 * H, font = `'${p.font}', 'Noto Sans TC', sans-serif`;
  const [lo, hi] = rulerEnds(p, levels), Y = (val: number) => y0 + (y1 - y0) * levelFrac(val, levels, p.max, p.scale, lo);
  cssCamel(s.cv, { display: 'block', opacity: String(fade) });
  const g = canvasAt(s.cv, W, H);
  g.fillStyle = withAlpha('#ffffff', 0.88); g.beginPath(); g.roundRect(x - 26 * k, y1 - 40 * k, 52 * k, y0 - y1 + 80 * k, 26 * k); g.fill();
  g.strokeStyle = theme.palette.ink; g.lineWidth = 4 * k;
  const step = niceStep(hi - lo, 6) / 2;
  for (let t = Math.ceil(lo / step) * step, i = 0; t <= hi + 1e-9 && i < 400; t += step, i++) {
    const yy = Y(t), half = (Math.round(t / step) % 2 ? 8 : 16) * k;
    g.beginPath(); g.moveTo(x - half, yy); g.lineTo(x + half, yy); g.stroke();
  }
  const shown = levels.filter((l) => l.t <= local + 1e-9), last = shown.length - 1;
  s.marks.forEach((el, i) => hide(el));
  shown.forEach((m, i) => {
    const on = i === last, yy = Y(m.v), q = eBack(prog(local, m.t, m.t + 0.45), 1.7);
    g.fillStyle = on ? p.accent : '#7d8a84'; g.beginPath(); g.moveTo(x - 30 * k, yy); g.lineTo(x - 54 * k, yy - 16 * k); g.lineTo(x - 54 * k, yy + 16 * k); g.closePath(); g.fill();
    const val = s.marks[i], name = s.marks[levels.length + i], fsz = on ? 0.78 * px * (0.6 + 0.4 * q) : 0.36 * px;
    if (!val) return;
    val.textContent = `${p.prefix}${formatValue(m.v, p.decimals, p.sep ?? true)}${p.suffix}`;
    cssCamel(val, { display: 'block', left: `${x - 64 * k}px`, top: `${yy}px`, transform: 'translate(-100%, -50%)', fontSize: `${fsz}px`, fontWeight: '900', fontFamily: font,
      color: on ? '#ffffff' : '#e6ece9', webkitTextStroke: `${(on ? 14 : 8) * k}px ${on ? p.accent : 'rgba(0,0,0,0.55)'}`, paintOrder: 'stroke fill', opacity: String(fade) });
    const pin = pins.find((x) => Math.abs(x.v - m.v) < 1e-9 && x.label);
    if (!pin || !name) return;
    name.textContent = pin.label;
    cssCamel(name, { display: 'block', left: `${x - 64 * k - val.offsetWidth - 16 * k}px`, top: `${yy}px`, transform: 'translate(-100%, -50%)', fontSize: `${0.36 * px}px`, fontWeight: '900',
      fontFamily: font, color: '#ffffff', webkitTextStroke: `${8 * k}px rgba(0,0,0,0.6)`, paintOrder: 'stroke fill', opacity: String(fade) });
  });
}
