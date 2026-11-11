// common.notecard — a ruled index card that things are handwritten on, stroke by stroke: a recipe step (a red pencil-ringed number,
// the title, a line or two, labelled fields), a checklist ticked item by item, a title page (a big name underlined in red, a
// subtitle, a Latin name), or a "done!" page with a heart. Promoted from the baking-steps short's recipe card (fx.step,
// fx.ingredients, fx.hook, fx.finale). With `card` off it writes on the card that common.paper painted under the video.
// `tick` (the todo-vlog short's fx.todolist): the list is already written, the card slides in from the left, the items before item
// `tick` are ticked and highlighted, item `tick` is ticked now with a highlighter stroke after it, and the card slides out again.
// From the vlog acceptance film's fx.todo: `ticked` names the rows already done, `strike` crosses a ticked item out in red pen, `stamp`
// lands a red rubber stamp once every item is ticked, `check` off only writes the list, `out` off keeps a ticked card on screen,
// `addInk` writes the items starting with + (added later) in another ink.
import { clamp, cssCamel, eIn3, eOut3 as ease, h, prog, textEm, type ItemType } from '@tellcut/engine';
import { canvasAt, freeCanvas } from './inkline.ts';
import {
  backOut, CARD_W, cardBox, cardParams, drawTexts, handCircle, handFamily, handPath, handRect, heart, LATIN, paintCard, RULE, RULE0, textLayer,
  tick, wrapEm, writeTime, type TextLayer, type Txt,
} from './hand.ts';
import { withAlpha } from './color.ts';
import { fitPx } from './text.ts';

type Mode = 'step' | 'list' | 'title' | 'done';
interface P {
  mode: Mode; no: string; title: string; text: string; fields: string; items: string; size: number; every: number; count: string; sub: string; latin: string; note: string;
  card: boolean; x: number; y: number; w: number; h: number; tilt: number; font: string; ink: string; accent: string; paper: string; rule: string;
  tick: number; marker: string; ticked: string; strike: boolean; stamp: string; check: boolean; out: boolean; addInk: string;
}
/** `top`: the strike-throughs, over the words; `stamp`: the rubber stamp, over everything */
interface S { wrap: HTMLElement; cv: HTMLCanvasElement; txt: TextLayer; top: HTMLCanvasElement; stamp: HTMLElement }

/** "標籤|內容" a line → pairs (at most `max`) */
export const parseFields = (s: string, max = 2): Array<[string, string]> => String(s ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  .map((l) => { const [a, b] = l.split('|').map((x) => x.trim()); return [a ?? '', b ?? ''] as [string, string]; }).slice(0, max);
/** one item a line, or split by | */
export const parseChecklist = (s: string) => String(s ?? '').split(/\n|\|/).map((x) => x.trim()).filter(Boolean);
/** with `addInk` set, an item starting with + was added later: written "+ item" in that ink; without it every item is written as it is */
export const addedItem = (item: string, addInk: string) =>
  (addInk && /^[+＋]/.test(item) ? { text: `+ ${item.replace(/^[+＋]\s*/, '')}`, ink: addInk } : { text: item, ink: '' });

/** the checklist's place for item i of n: two columns once there are more than four (`cols` 1 keeps one column) */
export function listSlot(i: number, n: number, cols = n > 4 ? 2 : 1): { col: number; row: number } {
  const rows = Math.ceil(n / cols);
  return { col: Math.floor(i / rows), row: i % rows };
}

/** most checklist items (beyond this the rest are left out) */
export const LIST_MAX = 24;
/** the checklist's layout in card units for `items` at `size` (× the 44-unit lettering): the row pitch (one rule, two once the
 *  lettering is too big for one), the columns (two past four items, unless the widest item no longer fits half the card, at any size), the
 *  rows, and how tall the card must be — today's card (`ch`) unless the rows run past where the fourth one sat, then grown */
export function listLayout(items: string[], size: number, ch: number) {
  const z = size > 0 ? size : 1, n = items.length, px = 44 * z, pitch = RULE * Math.max(1, Math.ceil(px / 66));
  const widest = items.reduce((m, x) => Math.max(m, textEm(x)), 0), cols = n > 4 && 54 * z + widest * px <= 440 ? 2 : 1;
  const rows = Math.ceil(n / cols), used = rows * pitch, low = Math.max(used, 4 * RULE);
  return { z, px, pitch, cols, rows, noteY: RULE0 + low + RULE - 16, ch: used > 4 * RULE ? Math.max(ch, RULE0 + used + RULE + 40) : ch };
}

/** list with tick: the card's sideways offset — sliding in from `off` px to the left over 0.32 s (overshooting a little), out again the
 *  same way in the last 0.3 s */
export const tickSlide = (local: number, dur: number, off: number, out = true) => -off * (1 - backOut(local / 0.32)) - (out ? off * eIn3(prog(local, dur - 0.3, dur)) : 0);
/** "2, 4" → [2, 4]: the rows (from 1) already ticked */
export const parseTicked = (s: string) => String(s ?? '').split(/[,，\s]+/).map((x) => parseInt(x, 10)).filter((v) => v > 0);
/** list with tick: whether item i (0-based) was ticked before item `now`: the rows in `ticked` (from 1) when given, else every one before */
export const tickedBefore = (i: number, now: number, ticked: number[] = []) => (ticked.length ? ticked.includes(i + 1) : i < now);
/** list with tick: item i's tick strokes (k1, k2) and highlighter (0–1) when item `now` (0-based) is the one ticked at 0.45 s */
export function tickState(i: number, now: number, local: number, ticked: number[] = []): { k1: number; k2: number; marker: number } {
  if (i === now) return { k1: clamp((local - 0.45) / 0.14), k2: clamp((local - 0.59) / 0.18), marker: clamp((local - 0.7) / 0.3) };
  return tickedBefore(i, now, ticked) ? { k1: 1, k2: 1, marker: 1 } : { k1: 0, k2: 0, marker: 0 };
}
/** list with tick and strike: how far item i's red line is drawn (the one ticked now: after its highlighter, from 1.0 s) */
export const tickStrike = (i: number, now: number, local: number, ticked: number[] = []) =>
  (i === now ? clamp((local - 1) / 0.28) : tickedBefore(i, now, ticked) ? 1 : 0);
/** list with check (no tick): item i's red line, right after its tick (written from t0) */
export const writeStrike = (local: number, t0: number) => clamp((local - t0 - 0.46) / 0.22);
/** when the stamp lands (s), or null when the list never gets all its ticks: with tick, once item `now` is done (at 0.5 s when
 *  every item was already ticked); written with check, after the last item's tick (and strike) */
export function stampTime(n: number, o: { ticking: boolean; now: number; ticked: number[]; check: boolean; strike: boolean; every: number }): number | null {
  if (!n) return null;
  if (o.ticking) {
    for (let i = 0; i < n; i++) if (i !== o.now && !tickedBefore(i, o.now, o.ticked)) return null;
    return o.now < n ? (o.strike ? 1.32 : 1.05) : 0.5;
  }
  return o.check ? 0.45 + (n - 1) * o.every + (o.strike ? 0.75 : 0.5) : null;
}
/** the stamp at `s` s after it lands: dropping from 1.8× with an overshoot, showing within 0.1 s */
export const stampLanding = (s: number) => ({ scale: 1.8 - 0.8 * backOut(s / 0.35), alpha: clamp(s / 0.1) });
/** the done page's big word at its widest, in card units: centred, it ends clear of the heart beside it, whose stroke reaches about 51
 *  units each side of a centre that stops 70 short of the card's edge (a long word ran off the card under the heart) */
export const DONE_TITLE_W = 2 * (CARD_W - 70 - 51 - 9 - CARD_W / 2);

/** when the step card's parts start writing: title, the text lines, the fields */
export function stepTimes(title: string, lines: string[]) {
  let t = 0.2 + writeTime(title, 16) - 0.05;
  const lineAt = lines.map((ln) => { const a = t; t += writeTime(ln, 30) - 0.1; return a; });
  return { lineAt, fieldsAt: t + 0.05 };
}

export const notecard: ItemType<P, S> = {
  type: 'common.notecard', label: '手寫索引卡', category: 'card', kind: 'overlay',
  doc: '一張橫線索引卡，內容用手寫字一筆一筆寫上去：step（紅筆圈的編號、標題、一兩行說明、「標籤|內容」欄位）、list（核取方塊逐項打勾；size 放大清單字，項目多或字大時排成一欄或兩欄、卡片往上長高；tick 是待辦清單打勾：清單已寫好，卡片從左邊滑進來，前面幾項已打勾、畫了螢光筆，第 tick 項現在打勾、螢光筆劃過，再滑出去；ticked 指定哪幾項已經勾好，strike 打勾後用紅筆劃掉，stamp 全部勾完蓋上紅色印章（清空！），check 關掉只寫上清單不打勾，out 關掉卡片不滑走，addInk 讓「+」開頭的後加項目換一個墨色）、title（大字菜名畫紅線、副標、外文名）、done（「完成！」＋手畫愛心）；食譜、教學、手帳風；card 關掉就寫在 common.paper 畫好的卡上',
  params: [
    { key: 'mode', label: '頁面', type: 'enum', options: ['step', 'list', 'title', 'done'], default: 'step' },
    { key: 'no', label: '編號（step）', type: 'string', default: '3' },
    { key: 'title', label: '標題（step／list 標題、title 的大字、done 的大字）', type: 'string', default: '打發鮮奶油' },
    { key: 'text', label: '說明（step；最多兩行）', type: 'text', default: '鮮奶油加糖，打到濃稠綿密、拉起來有小尖角' },
    { key: 'fields', label: '欄位（step；每行「標籤|內容」，最多兩行）', type: 'text', default: '用具|電動打蛋器\n時間|約 3 分鐘' },
    { key: 'items', label: '清單項目（list；一行一個或用 | 分開，最多 24 個；超過四列卡片會長高）', type: 'text', default: '確認重點|動手做|檢查成果' },
    { key: 'size', label: '清單字的大小（list；倍數，1＝原本；字大時一格佔兩條橫線、放不下兩欄就排一欄）', type: 'number', min: 0.5, max: 3, step: 0.05, default: 1 },
    { key: 'every', label: '每項間隔（list，秒）', type: 'number', min: 0.1, max: 2, step: 0.05, default: 0.25 },
    { key: 'count', label: '右上角計數（list；{n}＝項數，空＝不顯示）', type: 'string', default: '{n} 項' },
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
    { key: 'tick', label: '這次打勾的項目（list；第幾項，從 1 數；0＝每項寫上就打勾；比項目數大＝全部已經勾好）：清單已經寫好，卡片從左邊滑進來，前面的項目已經打勾、畫了螢光筆，這一項在 0.45 秒打勾、螢光筆劃過，最後卡片滑出去', type: 'number', min: 0, max: LIST_MAX + 1, step: 1, default: 0 },
    { key: 'marker', label: '螢光筆顏色（list 的 tick）', type: 'color', default: '#cef260' },
    { key: 'ticked', label: '已經勾好的項目（list 的 tick；第幾項，從 1 數，逗號分開；空＝tick 之前的全部）', type: 'string', default: '' },
    { key: 'strike', label: '打勾後用紅筆劃掉（list）', type: 'bool', default: false },
    { key: 'stamp', label: '全部勾完時蓋上的紅色印章字（list；空＝不蓋）', type: 'string', default: '' },
    { key: 'check', label: '每項寫上就打勾（list 沒有 tick 時；關掉＝只把清單寫上去）', type: 'bool', default: true },
    { key: 'out', label: '最後滑出去（list 的 tick；關掉＝停在畫面上）', type: 'bool', default: true },
    { key: 'addInk', label: '後加項目的墨色（list；「+」開頭的項目寫成「+ 項目」換這個墨色；空＝照原樣寫）', type: 'color', default: '' },
  ],
  build(ctx) {
    const wrap = h('div', null, null, ctx.root), cv = h('canvas', null, null, wrap);
    cssCamel(wrap, { position: 'absolute', transformOrigin: '50% 50%' });
    cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    const txt = textLayer(wrap), top = h('canvas', null, null, wrap), stamp = h('div', null, null, wrap);
    cssCamel(top, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    cssCamel(stamp, { position: 'absolute', display: 'none', whiteSpace: 'pre', lineHeight: '1.1', fontFamily: "'Noto Sans TC', sans-serif", fontWeight: '900', boxSizing: 'border-box' });
    freeCanvas(top);
    return { wrap, cv, txt, top, stamp };
  },
  hide(s) { freeCanvas(s.top, s.cv); },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local, dur } = ctx, b0 = cardBox(p, W, H, theme.safe), items = parseChecklist(p.items).slice(0, LIST_MAX);
    const shown = items.map((x) => addedItem(x, p.addInk ?? ''));
    const L = p.mode === 'list' ? listLayout(shown.map((x) => x.text), p.size ?? 1, b0.h / b0.u) : null;
    // a list longer than the card: the card grows upwards (its top moves up when it sits on the bottom safe line)
    const b = L && L.ch > b0.h / b0.u + 0.5 ? cardBox({ ...p, h: (L.ch * p.w) / CARD_W }, W, H, theme.safe) : b0, u = b.u, ch = b.h / u;
    const fam = handFamily(p.font), pencil = withAlpha(p.ink, 0.62), red = p.accent;
    const ticking = p.mode === 'list' && p.tick >= 1, out = p.mode === 'done' || ticking ? 1 : clamp((dur - local) / 0.28);
    const slide = ticking ? tickSlide(local, dur, b.x0 + b.w + 60 * u, p.out !== false) : 0;
    const now = Math.round(p.tick) - 1, ticked = ticking ? parseTicked(p.ticked) : [], check = p.check !== false;
    // the strike-throughs go over the words: a canvas of their own above the text layer, sized only while there are some
    const strikes = p.mode === 'list' && !!p.strike && (ticking || check);
    const gt = strikes ? canvasAt(s.top, b.w, b.h) : null;
    if (!strikes && s.top.width) freeCanvas(s.top);
    if (p.mode !== 'list') cssCamel(s.stamp, { display: 'none' });
    cssCamel(s.wrap, { left: `${b.x0}px`, top: `${b.y0}px`, width: `${b.w}px`, height: `${b.h}px`, transform: `${ticking ? `translateX(${slide.toFixed(1)}px) ` : ''}rotate(${p.tilt}deg)`,
      boxShadow: p.card ? `0 ${10 * u}px ${26 * u}px rgba(60,40,20,0.28)` : 'none' });
    const g = canvasAt(s.cv, b.w, b.h);
    g.save(); g.scale(u, u);
    if (p.card) paintCard(g, CARD_W, ch, p.paper, p.rule, red);
    g.globalAlpha = out; g.lineCap = 'round'; g.lineJoin = 'round';
    const T: Txt[] = [], txt = (t: Omit<Txt, 'family' | 'color'> & { color?: string; family?: string }) => T.push({ family: fam, color: p.ink, ...t, alpha: (t.alpha ?? 1) * out });
    // lines that would run off the card are set smaller to fit between its margins (52 card units each side; maxW)
    const C = CARD_W / 2, M = 52;

    if (p.mode === 'step') {
      // the number in a red pencil ring
      g.strokeStyle = red; g.lineWidth = 4;
      handCircle(g, 86, 64, 48, ease(clamp(local / 0.45)), Number(p.no) * 13 || 7);
      const q = clamp((local - 0.15) / 0.3);
      txt({ text: String(p.no), x: 86, y: 87, px: 64, weight: 700, color: red, align: 'center', alpha: q, scale: 0.7 + 0.3 * backOut(q) });
      txt({ text: p.title, x: 160, y: 90, px: 60, weight: 700, t0: 0.2, cps: 16, maxW: CARD_W - M - 160 });
      const lines = wrapEm(p.text, 830 / 48).slice(0, 2), at = stepTimes(p.title, lines);
      lines.forEach((ln, i) => txt({ text: ln, x: 52, y: RULE0 + RULE * (i + 1) - 12, px: 48, t0: at.lineAt[i], cps: 30 }));
      parseFields(p.fields).forEach(([lab, val], i) => {
        const t0 = at.fieldsAt + i * 0.25, y = RULE0 + RULE * (4 + i) - 14, e = ease(clamp((local - t0) / 0.3)), lw = textEm(lab) * 30 + 28;
        if (e > 0) { g.globalAlpha = e * out; g.strokeStyle = red; g.lineWidth = 2.6; handRect(g, 50, y - 38, lw, 50, 1.6, lab.length * 3 + y); g.stroke(); g.globalAlpha = out; }
        txt({ text: lab, x: 64, y: y - 2, px: 30, weight: 700, color: red, alpha: e });
        txt({ text: val, x: 50 + lw + 22, y, px: 42, t0: t0 + 0.15, cps: 28, maxW: CARD_W - M - (50 + lw + 22) });
      });
    } else if (p.mode === 'list') {
      const { z, px, pitch, cols, rows, noteY } = L!;
      if (gt) { gt.save(); gt.scale(u, u); gt.lineCap = 'round'; gt.lineJoin = 'round'; gt.strokeStyle = red; gt.lineWidth = 4.4; gt.globalAlpha = 0.92 * out; }
      // ticking: everything is written already (no t0), only the ticks and the highlighter move
      const w0 = (t0: number, cps: number) => (ticking ? {} : { t0, cps });
      const count = p.count ? p.count.replace('{n}', String(items.length)) : '';
      txt({ text: p.title, x: 52, y: 90, px: 60, weight: 700, ...w0(0.05, 10), maxW: CARD_W - 2 * M - (count ? textEm(count) * 36 + 24 : 0) });
      if (count) txt({ text: count, x: CARD_W - 52, y: 88, px: 36, color: pencil, align: 'right', ...w0(0.3, 10) });
      shown.forEach(({ text: name, ink }, i) => {
        const { col, row } = listSlot(i, items.length, cols), x = 52 + col * 450, y = RULE0 + pitch * (row + 1) - 14, t0 = 0.45 + i * p.every, e = ticking ? 1 : ease(clamp((local - t0) / 0.25));
        // the room after the box: up to the next column (less a gap) or the card's margin; the highlighter and the red line follow the size
        const room = (cols > 1 && col < cols - 1 ? x + 450 - 18 : CARD_W - M) - (x + 54 * z), ipx = fitPx(name, px, room);
        if (e <= 0) return;
        const tk = ticking ? tickState(i, now, local, ticked) : null;
        if (tk && tk.marker > 0) { g.globalAlpha = 0.88 * out; g.fillStyle = p.marker; g.fillRect(x + 46 * z, y - 38 * z, (textEm(name) * ipx + 16 * z) * tk.marker, 48 * z); g.globalAlpha = out; }
        g.globalAlpha = e * out; g.strokeStyle = p.ink; g.lineWidth = 2.6; handRect(g, x, y - 34 * z, 36 * z, 36 * z, 1.4, i + 3); g.stroke(); g.globalAlpha = out;
        g.strokeStyle = red; g.lineWidth = 4.4;
        if (tk) tick(g, x, y - 34 * z, 36 * z, tk.k1, tk.k2);
        else if (check) tick(g, x, y - 34 * z, 36 * z, clamp((local - t0 - 0.12) / 0.14), clamp((local - t0 - 0.26) / 0.18));
        txt({ text: name, x: x + 54 * z, y, px, ...(ink ? { color: ink } : {}), ...w0(t0 + 0.05, 26), maxW: room });
        // the red line through a ticked item, across the middle of its letters, rising a little
        const k = gt ? (ticking ? tickStrike(i, now, local, ticked) : writeStrike(local, t0)) : 0;
        if (gt && k > 0) {
          const x0 = x + 46 * z, x1 = x + 62 * z + textEm(name) * ipx, ym = y - 15 * z;
          handPath(gt, [[x0, ym + 3 * z], [x0 + (x1 - x0) * k, ym + 3 * z - 6 * z * k]], false, 1.2, i + 5); gt.stroke();
        }
      });
      if (gt) gt.restore();
      if (p.note) txt({ text: p.note, x: 52, y: noteY, px: 32, color: pencil, t0: ticking ? 0.9 : 0.6 + items.length * p.every, cps: 30 });
      // the red rubber stamp once every item is ticked, over the middle of the list
      const at = p.stamp ? stampTime(items.length, { ticking, now, ticked, check, strike: !!p.strike, every: p.every }) : null;
      if (at !== null && local >= at) {
        const st = stampLanding(local - at), spx = 84 * Math.max(1, z * 0.8);
        if (s.stamp.textContent !== p.stamp) s.stamp.textContent = p.stamp;
        cssCamel(s.stamp, { display: 'block', left: `${CARD_W * 0.66 * u}px`, top: `${(RULE0 + (rows * pitch) / 2) * u}px`, fontSize: `${spx * u}px`, color: red,
          background: withAlpha(p.paper, 0.72), border: `${7 * u}px solid ${red}`, borderRadius: `${16 * u}px`, padding: `${0.08 * spx * u}px ${0.3 * spx * u}px`,
          transform: `translate(-50%, -50%) rotate(-12deg) scale(${st.scale})`, opacity: String(0.9 * st.alpha * out) });
      } else cssCamel(s.stamp, { display: 'none' });
    } else if (p.mode === 'title') {
      // the name is there from the first frame (an opening): it only settles in
      const tpx = fitPx(p.title, 150, CARD_W - 2 * M), e = ease(clamp(local / 0.35)), half = Math.min(420, (textEm(p.title) * tpx) / 2 + 10);
      txt({ text: p.title, x: C, y: 250 - (1 - e) * 10, px: 150, weight: 700, align: 'center', alpha: 0.85 + 0.15 * e, maxW: CARD_W - 2 * M });
      g.strokeStyle = red; g.lineWidth = 4;
      const k = ease(clamp((local - 0.2) / 0.5));
      if (k > 0) { handPath(g, [[C - half, 286], [C - half + 2 * half * k, 282]], false, 3, 9); g.stroke(); }
      txt({ text: p.sub, x: C, y: 388, px: 50, align: 'center', t0: 0.35, cps: 22, maxW: CARD_W - 2 * M });
      if (p.latin) txt({ text: p.latin, x: C, y: 470, px: 58, family: LATIN, italic: true, color: red, align: 'center', alpha: ease(clamp((local - 0.9) / 0.5)), maxW: CARD_W - 2 * M });
    } else {
      const k = backOut(local / 0.5), tmax = DONE_TITLE_W;
      txt({ text: p.title, x: C, y: 210, px: 132, weight: 700, color: red, align: 'center', alpha: clamp(local / 0.25), scale: 0.6 + 0.4 * k, maxW: tmax });
      txt({ text: p.sub, x: C, y: 330, px: 56, weight: 700, align: 'center', t0: 0.5, cps: 12, maxW: CARD_W - 2 * M });
      if (p.latin) txt({ text: p.latin, x: C, y: 395, px: 52, family: LATIN, italic: true, color: pencil, align: 'center', alpha: ease(clamp((local - 1) / 0.5)), maxW: CARD_W - 2 * M });
      if (p.note) txt({ text: p.note, x: C, y: RULE0 + RULE * 5 - 16, px: 42, align: 'center', t0: 1.4, cps: 14, maxW: CARD_W - 2 * M });
      // a heart in one stroke beside the big word (as it is drawn: shrunk when long)
      g.strokeStyle = red; g.lineWidth = 4.5;
      heart(g, Math.min(CARD_W - 70, C + (textEm(p.title) * fitPx(p.title, 132, tmax)) / 2 + 110), 175, 3.2, clamp((local - 0.7) / 0.7));
    }
    g.restore();
    drawTexts(s.txt, T, local, u);
  },
};
