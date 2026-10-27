// common.progress — how far through the item the film is: a bar along the top or bottom safe edge, a row of chapter dots,
// or a row of chapter tabs (icon + name; finished ones ticked, the current one lit — from the pancake-class short's recipe tabs),
// or pencil circles (a handwritten title on the left, "步驟 3／8" and a row of hand-drawn circles on the right: the current one
// filled red with a hop, the done ones ticked — from the baking-steps recipe card's header), or a timeline (uk-parallax's
// fx.summerline): a thin line through evenly spaced dates (`labels`), a glowing dot sliding from stop `from` to stop `step`, the
// date (and `place`) written under the line; `step` −1 draws the whole line out and writes "first — last" (the ending).
import { clamp, cssCamel, eIO3, eOut3, h, lerp, prog, textEm, type ItemType } from '@tellcut/engine';
import { backOut, handCircle, handFamily, handPath, tick } from './hand.ts';
import { canvasAt, freeCanvas } from './inkline.ts';
import { fitPx } from './text.ts';
import { withAlpha } from './color.ts';

interface P {
  mode: 'bar' | 'dots' | 'tabs' | 'pencil' | 'timeline'; from: number; place: string; at: string; title: string; counter: string; handFont: string; position: 'top' | 'bottom'; color: string; track: string; thickness: number; dots: number; icons: string; iconSize: number; step: number; y: number;
  labels: string; size: number; align: 'left' | 'center' | 'right'; done: string; ink: string; paper: string; font: string;
}
interface S { track: HTMLElement; fill: HTMLElement; dots: HTMLElement[]; row: HTMLElement; tabs: HTMLElement[]; seps: HTMLElement[]; key: string; cv: HTMLCanvasElement; title: HTMLElement; count: HTMLElement }

const EMOJI = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji'";
const list = (s: string) => String(s).split(/[,，]/).map((x) => x.trim());

/** the chapter that is lit and when it began (item seconds): a fixed `step`, or the one the time has reached */
export function activeStep(step: number, n: number, local: number, dur: number): { active: number; since: number } {
  if (step >= 0) return { active: Math.min(n - 1, Math.floor(step)), since: local };
  const active = Math.min(n - 1, Math.floor(clamp(local / dur) * n));
  return { active, since: local - (active * dur) / n };
}

/** the room a progress bar or row of dots at the top takes under the top safe margin (a share of the frame height): a header keeps below it */
export const TOP_LANE = 0.035;

/** pencil mode: chapter starts ("秒,秒,…"; empty = the item shared evenly) → the step that is on (−1 before the first) and whether all are done
 *  (an extra time after the last start marks "all done") */
export function pencilState(at: string, n: number, local: number, dur: number): { cur: number; starts: number[]; done: boolean; doneAt: number } {
  const given = String(at ?? '').split(/[,，]/).map((x) => x.trim()).filter(Boolean).map(Number).filter(Number.isFinite);
  const starts = given.length ? given.slice(0, n) : Array.from({ length: n }, (_, i) => (i * dur) / n), doneAt = given.length > n ? given[n] : Infinity;
  let cur = -1;
  for (let i = 0; i < starts.length; i++) if (local >= starts[i]) cur = i;
  return { cur, starts, done: local >= doneAt, doneAt };
}
/** the counter's words: "before|during|done", {n} and {N} filled in */
export function counterText(tpl: string, cur: number, n: number, done: boolean): string {
  const [before = '', during = '', fin = ''] = String(tpl ?? '').split('|');
  return (done ? fin : cur >= 0 ? during : before).replace('{n}', String(cur + 1)).replace('{N}', String(n));
}

export const progress: ItemType<P, S> = {
  type: 'common.progress', label: '進度條', category: 'chapter', kind: 'overlay',
  doc: '沿安全區上緣或下緣的進度條、一排章節點，或一排章節籤（圖示＋章名，做過的打勾、目前這章亮起來彈一下），或 pencil：左邊手寫標題畫紅線、右邊「步驟 3／8」和一排手繪圓圈（目前那顆塗紅、做完的打勾），或 timeline 時間軸：一條細線串起等距的日期（labels），發光的圓點從第 from 站滑到第 step 站，線下寫大日期和地點（place），step -1 是整條畫滿、寫「第一天 — 最後一天」（片尾）；表示影片走到哪裡，鉤子短片、教學片、食譜、旅行日記常用',
  params: [
    { key: 'mode', label: '樣式（timeline 日期時間軸）', type: 'enum', options: ['bar', 'dots', 'tabs', 'pencil', 'timeline'], default: 'bar' },
    { key: 'position', label: '位置', type: 'enum', options: ['top', 'bottom'], default: 'top' },
    { key: 'color', label: '顏色（tabs：目前這章）', type: 'color', default: '#ff4d4f', theme: 'palette.accent' },
    { key: 'track', label: '底色', type: 'color', default: '#ffffff40' },
    { key: 'thickness', label: '粗細（以 1080 短邊計的 px）', type: 'number', min: 2, max: 60, step: 1, default: 12 },
    { key: 'dots', label: '點數（dots 樣式）', type: 'number', min: 2, max: 12, step: 1, default: 5 },
    { key: 'step', label: '停在第幾個點／章（0 起算；-1＝隨時間走完全程；timeline：這一站，-1＝整條畫滿）', type: 'number', min: -1, max: 11, step: 1, default: -1 },
    { key: 'iconSize', label: '圖示／點的大小倍數', type: 'number', min: 0.5, max: 3, step: 0.05, default: 1 },
    { key: 'y', label: '高度（畫面高比例；-1＝依「位置」放在安全區上緣或下緣）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'icons', label: '點上／章名前的圖示（emoji，逗號分隔，空＝一般圓點）', type: 'string', default: '' },
    { key: 'labels', label: '章名（tabs 樣式，逗號分隔；timeline：刻度上的日期）', type: 'string', default: '準備,開始,完成' },
    { key: 'size', label: '章名字級（tabs，畫面高 %；放不下會自動縮小）', type: 'number', min: 1, max: 8, step: 0.1, default: 2.4 },
    { key: 'align', label: '對齊（tabs）', type: 'enum', options: ['left', 'center', 'right'], default: 'center' },
    { key: 'done', label: '做過的章的底色（tabs）', type: 'color', default: '#ffe14d', theme: 'palette.hl' },
    { key: 'ink', label: '字與外框（tabs）', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'paper', label: '還沒到的章的底色（tabs）', type: 'color', default: '#fff8ec', theme: 'palette.paper' },
    { key: 'font', label: '字型（tabs）', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'at', label: '每步開始的秒數（pencil；逗號分隔，多給一個＝全部完成的時間；空＝平均分配）', type: 'string', default: '' },
    { key: 'title', label: '左邊的手寫標題（pencil；空＝不顯示）', type: 'string', default: '一分鐘食譜' },
    { key: 'counter', label: '計數字（pencil；開始前|進行中|全部完成，{n}/{N}）', type: 'string', default: '準備中|步驟 {n}／{N}|全部完成' },
    { key: 'handFont', label: '手寫字型（pencil）', type: 'string', default: 'LXGW WenKai TC' },
    { key: 'from', label: '從第幾站滑過來（timeline，0 起算；-1＝線先畫出來）', type: 'number', min: -1, max: 30, step: 1, default: -1 },
    { key: 'place', label: '日期旁的地點（timeline；空＝不顯示）', type: 'string', default: '' },
  ],
  build(ctx) {
    const track = h('div', null, null, ctx.root), fill = h('div', null, null, track), row = h('div', null, null, ctx.root);
    cssCamel(track, { position: 'absolute' });
    cssCamel(fill, { position: 'absolute', left: '0', top: '0', height: '100%' });
    cssCamel(row, { position: 'absolute', display: 'flex', alignItems: 'center', whiteSpace: 'pre', fontWeight: '900', lineHeight: '1' });
    const dots = Array.from({ length: ctx.params.mode === 'dots' ? ctx.params.dots : 0 }, () => { const d = h('div', null, null, ctx.root); cssCamel(d, { position: 'absolute', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: '1', fontFamily: `${EMOJI}, sans-serif` }); return d; });
    const cv = h('canvas', null, null, ctx.root), title = h('div', null, null, ctx.root), count = h('div', null, null, ctx.root);
    cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', display: 'none' });
    for (const el of [title, count]) cssCamel(el, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1.3', display: 'none' });
    return { track, fill, dots, row, tabs: [], seps: [], key: '', cv, title, count };
  },
  hide(s) { freeCanvas(s.cv); },
  draw(ctx, s) {
    const { mode, position, color, thickness } = ctx.params, { W, H, theme } = ctx, k = Math.min(W, H) / 1080, th = thickness * k;
    const p = clamp(ctx.local / ctx.dur), x = theme.safe.side * W, w = W - 2 * x;
    if (mode === 'pencil') { cssCamel(s.track, { display: 'none' }); cssCamel(s.row, { display: 'none' }); drawPencil(ctx, s, x, w); return; }
    if (mode === 'timeline') { cssCamel(s.track, { display: 'none' }); cssCamel(s.row, { display: 'none' }); drawTimeline(ctx, s, x, w); return; }
    if (s.cv.style.display !== 'none') for (const el of [s.cv, s.title, s.count]) cssCamel(el, { display: 'none' });
    if (mode === 'tabs') { cssCamel(s.track, { display: 'none' }); drawTabs(ctx, s, x, w); return; }
    cssCamel(s.row, { display: 'none' });
    const y = ctx.params.y >= 0 ? ctx.params.y * H - th / 2 : position === 'top' ? theme.safe.top * H : H * (1 - theme.safe.bottom) - th;
    if (mode === 'bar') {
      cssCamel(s.track, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${th}px`, borderRadius: `${th / 2}px`, background: ctx.params.track, overflow: 'hidden', display: 'block' });
      cssCamel(s.fill, { width: `${p * 100}%`, background: color });
      return;
    }
    cssCamel(s.track, { display: 'none' });
    const n = s.dots.length, active = ctx.params.step >= 0 ? Math.min(n - 1, Math.floor(ctx.params.step)) : Math.min(n - 1, Math.floor(p * n)), gap = n > 1 ? (w - th * 2.7) / (n - 1) : 0;
    const icons = ctx.params.icons.split(/[,，]/).map((x: string) => x.trim()).filter(Boolean);
    s.dots.forEach((d, i) => {
      const base = th * (icons.length ? 3.2 : 1.8) * ctx.params.iconSize, size = i === active ? base * 1.35 : base;
      d.textContent = icons.length ? icons[i % icons.length] : '';
      cssCamel(d, { left: `${x + th * 1.35 + i * gap - size / 2}px`, top: `${y + th / 2 - size / 2}px`, width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.62}px`, background: i <= active ? color : ctx.params.track, opacity: icons.length && i > active ? '0.55' : '1' });
    });
  },
};

/** The tabs row: rebuilt only when the names change; each tab says ✓ once its chapter is done. */
function drawTabs(ctx: Parameters<typeof progress.draw>[0], s: S, x: number, w: number) {
  const p = ctx.params, { H, theme } = ctx, labels = list(p.labels).filter(Boolean), icons = list(p.icons), n = labels.length;
  if (s.key !== `${p.labels}|${p.icons}`) {
    s.key = `${p.labels}|${p.icons}`;
    s.row.innerHTML = '';
    s.tabs = []; s.seps = [];
    labels.forEach((_, i) => {
      if (i) s.seps.push(h('div', null, null, s.row));
      const t = h('div', null, null, s.row); s.tabs.push(t);
    });
  }
  if (!n) { cssCamel(s.row, { display: 'none' }); return; }
  const { active, since } = activeStep(p.step, n, ctx.local, ctx.dur), pop = clamp(since / 0.35), glow = Math.sin(Math.PI * pop);
  const texts = labels.map((l, i) => `${i < active ? '✓' : icons[i] ?? ''} ${l}`.trim());
  // shrink the type until the whole row fits between the side safe margins (pads 0.6em, gaps 1.3em)
  const em = texts.reduce((a, t, i) => a + textEm(t) + (i === active ? 1.5 : 1.1), 0) + (n - 1) * 1.3;
  const fs = Math.min((p.size / 100) * H, w / em), bw = Math.max(1, fs * 0.12);
  const top = p.y >= 0 ? p.y * H - fs : p.position === 'top' ? theme.safe.top * H : H * (1 - theme.safe.bottom) - fs * 2;
  const left = p.align === 'left' ? x : p.align === 'right' ? x + w : x + w / 2, shift = p.align === 'left' ? '0' : p.align === 'right' ? '-100%' : '-50%';
  cssCamel(s.row, { display: 'flex', left: `${left}px`, top: `${top}px`, transform: `translateX(${shift})`, fontSize: `${fs}px`, gap: '0.3em',
    fontFamily: `'${p.font}', 'Noto Sans TC', ${EMOJI}, sans-serif`, opacity: String(1 - clamp((ctx.local - ctx.dur + 0.2) / 0.2)) });
  s.tabs.forEach((t, i) => {
    const on = i === active, past = i < active;
    t.textContent = texts[i];
    cssCamel(t, { padding: `0.45em ${on ? 0.75 : 0.55}em`, borderRadius: '999px', color: on ? '#ffffff' : p.ink,
      background: on ? p.color : past ? p.done : p.paper, opacity: on || past ? '1' : '0.8',
      border: `${bw}px ${on || past ? 'solid' : 'dashed'} ${on ? p.color : withAlpha(p.ink, 0.4)}`,
      boxShadow: on ? `0 ${0.16 + glow * 0.1}em 0 ${p.ink}` : 'none', transform: `translateY(${on ? -glow * 0.25 : 0}em)` });
  });
  s.seps.forEach((d) => cssCamel(d, { width: '0.7em', height: '0', borderTop: `${bw}px dotted ${withAlpha(p.ink, 0.55)}` }));
}

/** pencil mode: the title on the left (shrunk to leave room), the counter above a row of hand-drawn circles on the right */
function drawPencil(ctx: Parameters<typeof progress.draw>[0], s: S, x: number, w: number) {
  const p = ctx.params, { W, H, theme, local, dur } = ctx, n = Math.max(1, Math.min(12, Math.round(p.dots))), u = ((p.size / 100) * H) / 46;
  const st = pencilState(p.at, n, local, dur), fam = handFamily(p.handFont), out = 1 - clamp((local - dur + 0.2) / 0.2);
  const r = 17 * u, gap = 44 * u, top = p.y >= 0 ? p.y * H : p.position === 'top' ? theme.safe.top * H : H * (1 - theme.safe.bottom) - 110 * u, cy = top + 84 * u;
  const right = x + w, x0 = right - r - (n - 1) * gap, room = x0 - r - x - 24 * u;
  for (const el of [s.cv, s.title, s.count]) cssCamel(el, { display: 'block', opacity: String(out) });
  s.title.textContent = p.title;
  const tpx = fitPx(p.title, 50 * u, room), tw = textEm(p.title) * tpx;
  cssCamel(s.title, { display: p.title ? 'block' : 'none', left: `${x}px`, top: `${cy - tpx * 0.72}px`, fontSize: `${tpx}px`, fontWeight: '700', fontFamily: fam, color: p.ink });
  s.count.textContent = counterText(p.counter, st.cur, n, st.done);
  cssCamel(s.count, { left: `${right}px`, top: `${cy - 78 * u}px`, transform: 'translateX(-100%)', fontSize: `${34 * u}px`, fontFamily: fam, color: withAlpha(p.ink, 0.62) });
  const g = canvasAt(s.cv, W, H);
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (p.title) { g.strokeStyle = p.color; g.lineWidth = 3 * u; handPath(g, [[x - 2 * u, cy + 22 * u], [x + tw, cy + 24 * u]], false, 2 * u, 4); g.stroke(); }
  for (let i = 0; i < n; i++) {
    const cx = x0 + i * gap, on = !st.done && i === st.cur, finished = st.done || i < st.cur;
    g.globalAlpha = 0.8; g.strokeStyle = p.ink; g.lineWidth = 2.6 * u; handCircle(g, cx, cy, r, 1, i + 11);
    g.globalAlpha = 1;
    if (on) {
      const q = backOut((local - st.starts[i]) / 0.35);
      g.fillStyle = p.color; g.beginPath(); g.arc(cx, cy, Math.max(0, r * 0.78 * q), 0, Math.PI * 2); g.fill();
    } else if (finished) {
      const end = st.done ? Math.min(st.doneAt, i + 1 < n ? st.starts[i + 1] : st.doneAt) : st.starts[i + 1], q = eOut3(clamp((local - end) / 0.3));
      g.globalAlpha = 0.9; g.strokeStyle = p.color; g.lineWidth = 3.4 * u;
      tick(g, cx - 13 * u, cy - 15 * u, 26 * u, clamp(q * 2), clamp(q * 2 - 1));
    }
  }
}

/** timeline mode at `local`: how much of the line is drawn in (0–1), where the dot is (a stop index, fractional while sliding),
 *  how far the travelled part reaches (a stop index), and how far the words are in */
export function timelineState(n: number, step: number, from: number, local: number): { intro: number; dot: number; reach: number; text: number; full: boolean } {
  const last = Math.max(0, n - 1), full = step < 0, idx = Math.min(last, Math.max(0, Math.floor(step))), slid = from >= 0 && !full;
  const intro = slid ? 1 : eOut3(prog(local, 0, 0.8));
  if (full) { const r = last * eIO3(prog(local, 0, 1)); return { intro, dot: r, reach: r, text: eOut3(prog(local, 0.2, 0.7)), full }; }
  const dot = slid ? lerp(Math.min(last, from), idx, eIO3(prog(local, 0.05, 0.8))) : idx;
  return { intro, dot, reach: dot, text: !slid ? eOut3(prog(local, 0.2, 0.7)) : from === idx ? 1 : eOut3(prog(local, 0.35, 0.85)), full };
}

/** timeline mode: the line, its stops, the travelling dot (canvas) and the date and place under the line's start (DOM) */
function drawTimeline(ctx: Parameters<typeof progress.draw>[0], s: S, x: number, w: number) {
  const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080, stops = list(p.labels).filter(Boolean), n = Math.max(1, stops.length);
  const st = timelineState(n, p.step, p.from ?? -1, local), out = 1 - prog(local, dur - 0.3, dur), X = (i: number) => (n > 1 ? x + (w * i) / (n - 1) : x + w / 2);
  const y = p.y >= 0 ? p.y * H : (theme.safe.top + 0.02) * H, r = p.thickness * k, end = lerp(x, x + w, st.intro), tx = X(st.reach);
  for (const el of [s.cv, s.title, s.count]) cssCamel(el, { display: 'block', opacity: String(out) });
  const g = canvasAt(s.cv, W, H);
  g.shadowColor = 'rgba(0,0,0,0.45)'; g.shadowBlur = 10 * k; g.lineCap = 'round';
  g.strokeStyle = p.track; g.lineWidth = 3 * k; g.beginPath(); g.moveTo(x, y); g.lineTo(end, y); g.stroke();
  g.strokeStyle = p.paper; g.lineWidth = 5 * k; g.beginPath(); g.moveTo(x, y); g.lineTo(Math.max(x, Math.min(end, tx)), y); g.stroke();
  for (let i = 0; i < n; i++) {
    const xi = X(i);
    if (xi > end + 1) continue;
    g.beginPath(); g.arc(xi, y, (xi <= tx + 0.5 ? 7 : 6) * k, 0, Math.PI * 2);
    if (xi <= tx + 0.5) { g.fillStyle = p.paper; g.fill(); } else { g.strokeStyle = withAlpha(p.paper, 0.7); g.lineWidth = 2.5 * k; g.stroke(); }
  }
  g.shadowColor = withAlpha(p.done, 0.9); g.shadowBlur = 18 * k;
  g.fillStyle = p.done; g.beginPath(); g.arc(X(st.dot), y, r, 0, Math.PI * 2); g.fill();
  g.shadowBlur = 0; g.shadowColor = 'transparent';
  // the words: the date (or "first — last"), the place beside it
  const fs = (p.size / 100) * H * (st.full ? 0.85 : 1), shadow = `0 ${2 * k}px ${4 * k}px rgba(0,0,0,0.35), 0 ${4 * k}px ${22 * k}px rgba(0,0,0,0.45)`, font = `'${p.font}', 'Noto Sans TC', sans-serif`;
  const top = y + 0.45 * fs + 18 * k + (1 - st.text) * 8 * k;
  s.title.textContent = st.full && n > 1 ? `${stops[0]} — ${stops[n - 1]}` : stops[Math.min(n - 1, Math.max(0, Math.floor(p.step)))] ?? '';
  cssCamel(s.title, { left: `${x - 4 * k}px`, top: `${top}px`, fontSize: `${fs}px`, fontWeight: '700', fontFamily: font, color: p.paper, lineHeight: '1.1', textShadow: shadow, opacity: String(out * st.text) });
  s.count.textContent = st.full ? '' : p.place ?? '';
  cssCamel(s.count, { display: s.count.textContent ? 'block' : 'none', left: `${x - 4 * k + s.title.offsetWidth + 0.34 * fs}px`, top: `${top + 0.24 * fs}px`, transform: 'none', fontSize: `${0.68 * fs}px`,
    fontWeight: '700', fontFamily: font, color: p.paper, lineHeight: '1.1', textShadow: shadow, opacity: String(out * st.text) });
}
