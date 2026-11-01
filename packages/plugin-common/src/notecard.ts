// common.notecard — a ruled index card that things are handwritten on, stroke by stroke: a recipe step (a red pencil-ringed number,
// the title, a line or two, labelled fields), a checklist ticked item by item, a title page (a big name underlined in red, a
// subtitle, a Latin name), or a "done!" page with a heart. Promoted from the baking-steps short's recipe card (fx.step,
// fx.ingredients, fx.hook, fx.finale). With `card` off it writes on the card that common.paper painted under the video.
// `tick` (the todo-vlog short's fx.todolist): the list is already written, the card slides in from the left, the items before item
// `tick` are ticked and highlighted, item `tick` is ticked now with a highlighter stroke after it, and the card slides out again.
import { clamp, cssCamel, eIn3, eOut3 as ease, h, prog, textEm, type ItemType } from '@tellcut/engine';
import { canvasAt } from './inkline.ts';
import {
  backOut, CARD_W, cardBox, cardParams, drawTexts, handCircle, handFamily, handPath, handRect, heart, LATIN, paintCard, RULE, RULE0, textLayer,
  tick, wrapEm, writeTime, type TextLayer, type Txt,
} from './hand.ts';
import { withAlpha } from './color.ts';

type Mode = 'step' | 'list' | 'title' | 'done';
interface P {
  mode: Mode; no: string; title: string; text: string; fields: string; items: string; size: number; every: number; count: string; sub: string; latin: string; note: string;
  card: boolean; x: number; y: number; w: number; h: number; tilt: number; font: string; ink: string; accent: string; paper: string; rule: string;
  tick: number; marker: string;
}
interface S { wrap: HTMLElement; cv: HTMLCanvasElement; txt: TextLayer }

/** "標籤|內容" a line → pairs (at most `max`) */
export const parseFields = (s: string, max = 2): Array<[string, string]> => String(s ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  .map((l) => { const [a, b] = l.split('|').map((x) => x.trim()); return [a ?? '', b ?? ''] as [string, string]; }).slice(0, max);
/** one item a line, or split by | */
export const parseItems = (s: string) => String(s ?? '').split(/\n|\|/).map((x) => x.trim()).filter(Boolean);

/** the checklist's place for item i of n: two columns once there are more than four (`cols` 1 keeps one column) */
export function listSlot(i: number, n: number, cols = n > 4 ? 2 : 1): { col: number; row: number } {
  const rows = Math.ceil(n / cols);
  return { col: Math.floor(i / rows), row: i % rows };
}

/** most checklist items (beyond this the rest are left out) */
export const LIST_MAX = 24;
/** the checklist's layout in card units for `items` at `size` (× the 44-unit lettering): the row pitch (one rule, two once the
 *  lettering is too big for one), the columns (two past four items, unless the widest item no longer fits half the card), the
 *  rows, and how tall the card must be — today's card (`ch`) unless the rows run past where the fourth one sat, then grown */
export function listLayout(items: string[], size: number, ch: number) {
  const z = size > 0 ? size : 1, n = items.length, px = 44 * z, pitch = RULE * Math.max(1, Math.ceil(px / 66));
  const widest = items.reduce((m, x) => Math.max(m, textEm(x)), 0), cols = n > 4 && (z <= 1 || 54 * z + widest * px <= 440) ? 2 : 1;
  const rows = Math.ceil(n / cols), used = rows * pitch, low = Math.max(used, 4 * RULE);
  return { z, px, pitch, cols, rows, noteY: RULE0 + low + RULE - 16, ch: used > 4 * RULE ? Math.max(ch, RULE0 + used + RULE + 40) : ch };
}

/** list with tick: the card's sideways offset — sliding in from `off` px to the left over 0.32 s (overshooting a little), out again the
 *  same way in the last 0.3 s */
export const tickSlide = (local: number, dur: number, off: number) => -off * (1 - backOut(local / 0.32)) - off * eIn3(prog(local, dur - 0.3, dur));
/** list with tick: item i's tick strokes (k1, k2) and highlighter (0–1) when item `now` (0-based) is the one ticked at 0.45 s */
export function tickState(i: number, now: number, local: number): { k1: number; k2: number; marker: number } {
  if (i < now) return { k1: 1, k2: 1, marker: 1 };
  if (i > now) return { k1: 0, k2: 0, marker: 0 };
  return { k1: clamp((local - 0.45) / 0.14), k2: clamp((local - 0.59) / 0.18), marker: clamp((local - 0.7) / 0.3) };
}

/** when the step card's parts start writing: title, the text lines, the fields */
export function stepTimes(title: string, lines: string[]) {
  let t = 0.2 + writeTime(title, 16) - 0.05;
  const lineAt = lines.map((ln) => { const a = t; t += writeTime(ln, 30) - 0.1; return a; });
  return { lineAt, fieldsAt: t + 0.05 };
}

export const notecard: ItemType<P, S> = {
  type: 'common.notecard', label: '手寫索引卡', category: 'card', kind: 'overlay',
  doc: '一張橫線索引卡，內容用手寫字一筆一筆寫上去：step（紅筆圈的編號、標題、一兩行說明、「標籤|內容」欄位）、list（核取方塊逐項打勾；size 放大清單字，項目多或字大時排成一欄或兩欄、卡片往上長高；tick 是待辦清單打勾：清單已寫好，卡片從左邊滑進來，前面幾項已打勾、畫了螢光筆，第 tick 項現在打勾、螢光筆劃過，再滑出去）、title（大字菜名畫紅線、副標、外文名）、done（「完成！」＋手畫愛心）；食譜、教學、手帳風；card 關掉就寫在 common.paper 畫好的卡上',
  params: [
    { key: 'mode', label: '頁面', type: 'enum', options: ['step', 'list', 'title', 'done'], default: 'step' },
    { key: 'no', label: '編號（step）', type: 'string', default: '3' },
    { key: 'title', label: '標題（step／list 標題、title 的大字、done 的大字）', type: 'string', default: '打發鮮奶油' },
    { key: 'text', label: '說明（step；最多兩行）', type: 'text', default: '鮮奶油加糖，打到濃稠綿密、拉起來有小尖角' },
    { key: 'fields', label: '欄位（step；每行「標籤|內容」，最多兩行）', type: 'text', default: '用具|電動打蛋器\n時間|約 3 分鐘' },
    { key: 'items', label: '清單項目（list；一行一個或用 | 分開，最多 24 個；超過四列卡片會長高）', type: 'text', default: '濃咖啡|粗糖|可可酒|鮮奶油|香草莢|馬斯卡彭|手指餅乾|可可粉' },
    { key: 'size', label: '清單字的大小（list；倍數，1＝原本；字大時一格佔兩條橫線、放不下兩欄就排一欄）', type: 'number', min: 0.5, max: 3, step: 0.05, default: 1 },
    { key: 'every', label: '每項間隔（list，秒）', type: 'number', min: 0.1, max: 2, step: 0.05, default: 0.25 },
    { key: 'count', label: '右上角計數（list；{n}＝項數，空＝不顯示）', type: 'string', default: '{n} 樣' },
    { key: 'sub', label: '副標（title；done 的菜名）', type: 'string', default: '不用烤箱・8 個步驟' },
    { key: 'latin', label: '外文名（title、done；斜體）', type: 'string', default: '' },
    { key: 'note', label: '最下面一行小字（list、done）', type: 'string', default: '' },
    { key: 'card', label: '畫出卡片（關掉＝寫在 common.paper 的卡上）', type: 'bool', default: true },
    ...cardParams,
    { key: 'font', label: '手寫字型', type: 'string', default: 'LXGW WenKai TC' },
    { key: 'ink', label: '墨色', type: 'color', default: '#4a3a2e', theme: 'palette.ink' },
    { key: 'accent', label: '紅筆顏色', type: 'color', default: '#c2533b', theme: 'palette.accent' },
    { key: 'paper', label: '卡片紙色', type: 'color', default: '#fbf7ee', theme: 'palette.paper' },
    { key: 'rule', label: '橫線顏色', type: 'color', default: '#9db6c6' },
    { key: 'tick', label: '這次打勾的項目（list；第幾項，從 1 數；0＝每項寫上就打勾）：清單已經寫好，卡片從左邊滑進來，前面的項目已經打勾、畫了螢光筆，這一項在 0.45 秒打勾、螢光筆劃過，最後卡片滑出去', type: 'number', min: 0, max: 24, step: 1, default: 0 },
    { key: 'marker', label: '螢光筆顏色（list 的 tick）', type: 'color', default: '#cef260' },
  ],
  build(ctx) {
    const wrap = h('div', null, null, ctx.root), cv = h('canvas', null, null, wrap);
    cssCamel(wrap, { position: 'absolute', transformOrigin: '50% 50%' });
    cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    return { wrap, cv, txt: textLayer(wrap) };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local, dur } = ctx, b0 = cardBox(p, W, H, theme.safe), items = parseItems(p.items).slice(0, LIST_MAX);
    const L = p.mode === 'list' ? listLayout(items, p.size ?? 1, b0.h / b0.u) : null;
    // a list longer than the card: the card grows upwards (its top moves up when it sits on the bottom safe line)
    const b = L && L.ch > b0.h / b0.u + 0.5 ? cardBox({ ...p, h: (L.ch * p.w) / CARD_W }, W, H, theme.safe) : b0, u = b.u, ch = b.h / u;
    const fam = handFamily(p.font), pencil = withAlpha(p.ink, 0.62), red = p.accent;
    const ticking = p.mode === 'list' && p.tick >= 1, out = p.mode === 'done' || ticking ? 1 : clamp((dur - local) / 0.28);
    const slide = ticking ? tickSlide(local, dur, b.x0 + b.w + 60 * u) : 0;
    cssCamel(s.wrap, { left: `${b.x0}px`, top: `${b.y0}px`, width: `${b.w}px`, height: `${b.h}px`, transform: `${ticking ? `translateX(${slide.toFixed(1)}px) ` : ''}rotate(${p.tilt}deg)`,
      boxShadow: p.card ? `0 ${10 * u}px ${26 * u}px rgba(60,40,20,0.28)` : 'none' });
    const g = canvasAt(s.cv, b.w, b.h);
    g.save(); g.scale(u, u);
    if (p.card) paintCard(g, CARD_W, ch, p.paper, p.rule, red);
    g.globalAlpha = out; g.lineCap = 'round'; g.lineJoin = 'round';
    const T: Txt[] = [], txt = (t: Omit<Txt, 'family' | 'color'> & { color?: string; family?: string }) => T.push({ family: fam, color: p.ink, ...t, alpha: (t.alpha ?? 1) * out });
    const C = CARD_W / 2;

    if (p.mode === 'step') {
      // the number in a red pencil ring
      g.strokeStyle = red; g.lineWidth = 4;
      handCircle(g, 86, 64, 48, ease(clamp(local / 0.45)), Number(p.no) * 13 || 7);
      const q = clamp((local - 0.15) / 0.3);
      txt({ text: String(p.no), x: 86, y: 87, px: 64, weight: 700, color: red, align: 'center', alpha: q, scale: 0.7 + 0.3 * backOut(q) });
      txt({ text: p.title, x: 160, y: 90, px: 60, weight: 700, t0: 0.2, cps: 16 });
      const lines = wrapEm(p.text, 830 / 48).slice(0, 2), at = stepTimes(p.title, lines);
      lines.forEach((ln, i) => txt({ text: ln, x: 52, y: RULE0 + RULE * (i + 1) - 12, px: 48, t0: at.lineAt[i], cps: 30 }));
      parseFields(p.fields).forEach(([lab, val], i) => {
        const t0 = at.fieldsAt + i * 0.25, y = RULE0 + RULE * (4 + i) - 14, e = ease(clamp((local - t0) / 0.3)), lw = textEm(lab) * 30 + 28;
        if (e > 0) { g.globalAlpha = e * out; g.strokeStyle = red; g.lineWidth = 2.6; handRect(g, 50, y - 38, lw, 50, 1.6, lab.length * 3 + y); g.stroke(); g.globalAlpha = out; }
        txt({ text: lab, x: 64, y: y - 2, px: 30, weight: 700, color: red, alpha: e });
        txt({ text: val, x: 50 + lw + 22, y, px: 42, t0: t0 + 0.15, cps: 28 });
      });
    } else if (p.mode === 'list') {
      const { z, px, pitch, cols, noteY } = L!;
      // ticking: everything is written already (no t0), only the ticks and the highlighter move
      const w0 = (t0: number, cps: number) => (ticking ? {} : { t0, cps });
      txt({ text: p.title, x: 52, y: 90, px: 60, weight: 700, ...w0(0.05, 10) });
      if (p.count) txt({ text: p.count.replace('{n}', String(items.length)), x: CARD_W - 52, y: 88, px: 36, color: pencil, align: 'right', ...w0(0.3, 10) });
      items.forEach((name, i) => {
        const { col, row } = listSlot(i, items.length, cols), x = 52 + col * 450, y = RULE0 + pitch * (row + 1) - 14, t0 = 0.45 + i * p.every, e = ticking ? 1 : ease(clamp((local - t0) / 0.25));
        if (e <= 0) return;
        const tk = ticking ? tickState(i, Math.round(p.tick) - 1, local) : null;
        if (tk && tk.marker > 0) { g.globalAlpha = 0.88 * out; g.fillStyle = p.marker; g.fillRect(x + 46 * z, y - 38 * z, (textEm(name) * px + 16 * z) * tk.marker, 48 * z); g.globalAlpha = out; }
        g.globalAlpha = e * out; g.strokeStyle = p.ink; g.lineWidth = 2.6; handRect(g, x, y - 34 * z, 36 * z, 36 * z, 1.4, i + 3); g.stroke(); g.globalAlpha = out;
        g.strokeStyle = red; g.lineWidth = 4.4;
        if (tk) tick(g, x, y - 34 * z, 36 * z, tk.k1, tk.k2);
        else tick(g, x, y - 34 * z, 36 * z, clamp((local - t0 - 0.12) / 0.14), clamp((local - t0 - 0.26) / 0.18));
        txt({ text: name, x: x + 54 * z, y, px, ...w0(t0 + 0.05, 26) });
      });
      if (p.note) txt({ text: p.note, x: 52, y: noteY, px: 32, color: pencil, t0: ticking ? 0.9 : 0.6 + items.length * p.every, cps: 30 });
    } else if (p.mode === 'title') {
      // the name is there from the first frame (an opening): it only settles in
      const e = ease(clamp(local / 0.35)), half = Math.min(420, (textEm(p.title) * 150) / 2 + 10);
      txt({ text: p.title, x: C, y: 250 - (1 - e) * 10, px: 150, weight: 700, align: 'center', alpha: 0.85 + 0.15 * e });
      g.strokeStyle = red; g.lineWidth = 4;
      const k = ease(clamp((local - 0.2) / 0.5));
      if (k > 0) { handPath(g, [[C - half, 286], [C - half + 2 * half * k, 282]], false, 3, 9); g.stroke(); }
      txt({ text: p.sub, x: C, y: 388, px: 50, align: 'center', t0: 0.35, cps: 22 });
      if (p.latin) txt({ text: p.latin, x: C, y: 470, px: 58, family: LATIN, italic: true, color: red, align: 'center', alpha: ease(clamp((local - 0.9) / 0.5)) });
    } else {
      const k = backOut(local / 0.5);
      txt({ text: p.title, x: C, y: 210, px: 132, weight: 700, color: red, align: 'center', alpha: clamp(local / 0.25), scale: 0.6 + 0.4 * k });
      txt({ text: p.sub, x: C, y: 330, px: 56, weight: 700, align: 'center', t0: 0.5, cps: 12 });
      if (p.latin) txt({ text: p.latin, x: C, y: 395, px: 52, family: LATIN, italic: true, color: pencil, align: 'center', alpha: ease(clamp((local - 1) / 0.5)) });
      if (p.note) txt({ text: p.note, x: C, y: RULE0 + RULE * 5 - 16, px: 42, align: 'center', t0: 1.4, cps: 14 });
      // a heart in one stroke beside the big word
      g.strokeStyle = red; g.lineWidth = 4.5;
      heart(g, Math.min(CARD_W - 70, C + (textEm(p.title) * 132) / 2 + 110), 175, 3.2, clamp((local - 0.7) / 0.7));
    }
    g.restore();
    drawTexts(s.txt, T, local, u);
  },
};
