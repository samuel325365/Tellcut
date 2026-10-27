// common.notecard — a ruled index card that things are handwritten on, stroke by stroke: a recipe step (a red pencil-ringed number,
// the title, a line or two, labelled fields), a checklist ticked item by item, a title page (a big name underlined in red, a
// subtitle, a Latin name), or a "done!" page with a heart. Promoted from the baking-steps short's recipe card (fx.step,
// fx.ingredients, fx.hook, fx.finale). With `card` off it writes on the card that common.paper painted under the video.
import { clamp, cssCamel, eOut3 as ease, h, textEm, type ItemType } from '@tellcut/engine';
import { canvasAt } from './inkline.ts';
import {
  backOut, CARD_W, cardBox, cardParams, drawTexts, handCircle, handFamily, handPath, handRect, heart, LATIN, paintCard, RULE, RULE0, textLayer,
  tick, wrapEm, writeTime, type TextLayer, type Txt,
} from './hand.ts';
import { withAlpha } from './color.ts';

type Mode = 'step' | 'list' | 'title' | 'done';
interface P {
  mode: Mode; no: string; title: string; text: string; fields: string; items: string; every: number; count: string; sub: string; latin: string; note: string;
  card: boolean; x: number; y: number; w: number; h: number; tilt: number; font: string; ink: string; accent: string; paper: string; rule: string;
}
interface S { wrap: HTMLElement; cv: HTMLCanvasElement; txt: TextLayer }

/** "標籤|內容" a line → pairs (at most `max`) */
export const parseFields = (s: string, max = 2): Array<[string, string]> => String(s ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  .map((l) => { const [a, b] = l.split('|').map((x) => x.trim()); return [a ?? '', b ?? ''] as [string, string]; }).slice(0, max);
/** one item a line, or split by | */
export const parseItems = (s: string) => String(s ?? '').split(/\n|\|/).map((x) => x.trim()).filter(Boolean);

/** the checklist's place for item i of n: two columns once there are more than four (at most four rows each) */
export function listSlot(i: number, n: number): { col: number; row: number } {
  const rows = n > 4 ? Math.ceil(n / 2) : n;
  return { col: Math.floor(i / rows), row: i % rows };
}

/** when the step card's parts start writing: title, the text lines, the fields */
export function stepTimes(title: string, lines: string[]) {
  let t = 0.2 + writeTime(title, 16) - 0.05;
  const lineAt = lines.map((ln) => { const a = t; t += writeTime(ln, 30) - 0.1; return a; });
  return { lineAt, fieldsAt: t + 0.05 };
}

export const notecard: ItemType<P, S> = {
  type: 'common.notecard', label: '手寫索引卡', category: 'card', kind: 'overlay',
  doc: '一張橫線索引卡，內容用手寫字一筆一筆寫上去：step（紅筆圈的編號、標題、一兩行說明、「標籤|內容」欄位）、list（核取方塊逐項打勾）、title（大字菜名畫紅線、副標、外文名）、done（「完成！」＋手畫愛心）；食譜、教學、手帳風；card 關掉就寫在 common.paper 畫好的卡上',
  params: [
    { key: 'mode', label: '頁面', type: 'enum', options: ['step', 'list', 'title', 'done'], default: 'step' },
    { key: 'no', label: '編號（step）', type: 'string', default: '3' },
    { key: 'title', label: '標題（step／list 標題、title 的大字、done 的大字）', type: 'string', default: '打發鮮奶油' },
    { key: 'text', label: '說明（step；最多兩行）', type: 'text', default: '鮮奶油加糖，打到濃稠綿密、拉起來有小尖角' },
    { key: 'fields', label: '欄位（step；每行「標籤|內容」，最多兩行）', type: 'text', default: '用具|電動打蛋器\n時間|約 3 分鐘' },
    { key: 'items', label: '清單項目（list；一行一個或用 | 分開，最多 8 個）', type: 'text', default: '濃咖啡|粗糖|可可酒|鮮奶油|香草莢|馬斯卡彭|手指餅乾|可可粉' },
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
  ],
  build(ctx) {
    const wrap = h('div', null, null, ctx.root), cv = h('canvas', null, null, wrap);
    cssCamel(wrap, { position: 'absolute', transformOrigin: '50% 50%' });
    cssCamel(cv, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    return { wrap, cv, txt: textLayer(wrap) };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local, dur } = ctx, b = cardBox(p, W, H, theme.safe), u = b.u, ch = b.h / u;
    const fam = handFamily(p.font), pencil = withAlpha(p.ink, 0.62), red = p.accent;
    const out = p.mode === 'done' ? 1 : clamp((dur - local) / 0.28);
    cssCamel(s.wrap, { left: `${b.x0}px`, top: `${b.y0}px`, width: `${b.w}px`, height: `${b.h}px`, transform: `rotate(${p.tilt}deg)`,
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
      const items = parseItems(p.items).slice(0, 8);
      txt({ text: p.title, x: 52, y: 90, px: 60, weight: 700, t0: 0.05, cps: 10 });
      if (p.count) txt({ text: p.count.replace('{n}', String(items.length)), x: CARD_W - 52, y: 88, px: 36, color: pencil, align: 'right', t0: 0.3, cps: 10 });
      items.forEach((name, i) => {
        const { col, row } = listSlot(i, items.length), x = 52 + col * 450, y = RULE0 + RULE * (row + 1) - 14, t0 = 0.45 + i * p.every, e = ease(clamp((local - t0) / 0.25));
        if (e <= 0) return;
        g.globalAlpha = e * out; g.strokeStyle = p.ink; g.lineWidth = 2.6; handRect(g, x, y - 34, 36, 36, 1.4, i + 3); g.stroke(); g.globalAlpha = out;
        g.strokeStyle = red; g.lineWidth = 4.4;
        tick(g, x, y - 34, 36, clamp((local - t0 - 0.12) / 0.14), clamp((local - t0 - 0.26) / 0.18));
        txt({ text: name, x: x + 54, y, px: 44, t0: t0 + 0.05, cps: 26 });
      });
      if (p.note) txt({ text: p.note, x: 52, y: RULE0 + RULE * 5 - 16, px: 32, color: pencil, t0: 0.6 + items.length * p.every, cps: 30 });
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
