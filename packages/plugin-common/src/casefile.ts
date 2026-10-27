// common.casefile — a fact-check case file, from a fact-check short's fx.casefile: a kraft folder on paper with a taped-down window the
// footage plays through, a header (who said it, the claim typed in, a row of evidence boxes stamped one by one), the claim struck
// out with common.strike's two marker strokes and a double-ruled "rejected" stamp (common.stamp's double look), and at the end a
// flap folding down over the window with a "case closed" stamp. Every word is a parameter; it sizes by min(W, H) inside the theme's
// safe area, the header above the window on tall and square frames, beside it on wide ones. The clip on the track below plays in
// the window: its `frame` is casefileWindow(params, W, H).
import { abs, clamp, cssCamel, defaultSafe, eOut3, h, type ItemType, textEm, type Theme } from '@tellcut/engine';
import { tape } from './hand.ts';
import { canvasAt } from './inkline.ts';
import { parseSteps } from './phone.ts';
import { doubleLook, stampLand } from './stamp.ts';
import { markerStrokes } from './strike.ts';
import { asFrame } from './window.ts';
import { withAlpha } from './color.ts';

interface P {
  who: string; quote: string; quoteLabel: string; typeEnd: number; slots: string; slotLabel: string; strikeAt: number; veto: string;
  closeAt: number; done: string; win: string; aspect: number; red: string; ink: string; paper: string; kraft: string; tapeColor: string;
  font: string; serif: string;
}
interface S {
  bg: HTMLCanvasElement; bgKey: string; ink: HTMLCanvasElement; who: HTMLElement; chip: HTMLElement; quote: HTMLElement; chars: HTMLElement[]; quoteKey: string;
  slots: HTMLElement; slotKey: string; boxes: Array<{ box: HTMLElement; idle: HTMLElement; st: HTMLElement; head: HTMLElement; label: HTMLElement }>;
  veto: HTMLElement; flap: HTMLElement; done: HTMLElement;
}
type Rect = [number, number, number, number];

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩';
/** "秒|標籤" lines: when each evidence box is stamped and what it says */
export const parseSlots = (text: string) => parseSteps(text).map(({ t, v }) => ({ at: t, label: v.join('|') })).slice(0, CIRCLED.length);

/** Where everything goes in a W×H frame (px): the window, the header block, the header's rows, k = px per 1080 unit.
 *  Tall and square frames: the header across the top of the safe area, the window under it; wide frames: the window at the left,
 *  the header beside it. `win` "x,y,w,h" (fractions) puts the window somewhere else. */
export function casefileLayout(p: Pick<P, 'win' | 'aspect'>, W: number, H: number, safe: Theme['safe'] = defaultSafe(W, H)) {
  const k = Math.min(W, H) / 1080, aspect = Math.max(0.3, Number(p.aspect) || 1), side = Math.max(safe.side * W, 40 * k);
  const top = safe.top * H, bottom = H * (1 - safe.bottom), wide = W / H >= 1.3, headH = 308 * k;
  let win: Rect, head: Rect;
  if (wide) {
    const hh = bottom - top - 60 * k, ww = Math.min(hh * aspect, W * 0.55), wh = ww / aspect;
    win = [side, top + 30 * k + (hh - wh) / 2, ww, wh];
    const hx = side + ww + 70 * k;
    head = [hx, (top + bottom) / 2 - headH / 2 - 40 * k, W - side - hx, headH];
  } else {
    head = [side, top, W - 2 * side, headH];
    const y = top + headH + 44 * k, availH = bottom - y - 20 * k, availW = W - 2 * Math.max(40 * k, Math.min(side, 60 * k));
    const ww = Math.min(availW, availH * aspect), wh = ww / aspect;
    win = [(W - ww) / 2, y, ww, wh];
  }
  const v = String(p.win ?? '').split(/[,\s]+/).filter(Boolean).map(Number);
  if (v.length === 4 && v.every(Number.isFinite)) win = [v[0] * W, v[1] * H, v[2] * W, v[3] * H];
  return { k, wide, win, head };
}

/** the window as the clip's `frame` (fractions); `params` as given to the item */
export function casefileWindow(params: Partial<P> = {}, W = 1080, H = 1920, safe?: Theme['safe']) {
  return asFrame(casefileLayout({ win: params.win ?? '', aspect: params.aspect ?? 1 }, W, H, safe).win, W, H);
}

/** the evidence boxes of an n-box row w wide (px): x offset and width of each */
export function slotBoxes(n: number, w: number, k: number): Array<[number, number]> {
  const gap = 16 * k, sw = n > 0 ? (w - gap * (n - 1)) / n : 0;
  return Array.from({ length: n }, (_, i) => [i * (sw + gap), sw]);
}

/** the paper, the folder's tab, the ruled lines, and the window's white border, shadow, hole and two strips of tape */
function paintDesk(c: HTMLCanvasElement, p: P, W: number, H: number, L: ReturnType<typeof casefileLayout>) {
  const g = canvasAt(c, W, H), { k, win, head, wide } = L, [wx, wy, ww, wh] = win;
  g.fillStyle = p.paper; g.fillRect(0, 0, W, H);
  g.fillStyle = p.kraft; g.beginPath(); g.moveTo(0, 0); g.lineTo(W * 0.39, 0); g.lineTo(W * 0.39 + 40 * k, 40 * k); g.lineTo(W, 40 * k); g.lineTo(W, 70 * k); g.lineTo(0, 70 * k); g.closePath(); g.fill();
  // ruled lines and a red margin where nothing else is: under the window (tall) or under the header (wide)
  const rx = wide ? head[0] - 30 * k : 0, rw = wide ? W - rx : W, ry = wide ? head[1] + head[3] + 60 * k : wy + wh + 40 * k;
  g.strokeStyle = 'rgba(120,90,60,0.13)'; g.lineWidth = 2 * k;
  for (let y = ry; y < H; y += 58 * k) { g.beginPath(); g.moveTo(rx, y); g.lineTo(rx + rw, y); g.stroke(); }
  if (ry < H) { g.strokeStyle = 'rgba(200,39,45,0.28)'; g.beginPath(); g.moveTo(rx + 84 * k, ry - 40 * k); g.lineTo(rx + 84 * k, H); g.stroke(); }
  const b = 14 * k;
  g.save(); g.shadowColor = 'rgba(60,40,20,0.35)'; g.shadowBlur = 28 * k; g.shadowOffsetY = 10 * k; g.fillStyle = '#fbf8f2';
  g.beginPath(); g.roundRect(wx - b, wy - b, ww + 2 * b, wh + 2 * b, 16 * k); g.fill(); g.restore();
  g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.roundRect(wx, wy, ww, wh, 10 * k); g.fill(); g.restore();
  const tw = Math.min(170 * k, ww * 0.3);
  tape(g, wx + tw * 0.25, wy - 4 * k, tw, 48 * k, -0.5, p.tapeColor, 3);
  tape(g, wx + ww - tw * 0.25, wy - 4 * k, tw, 48 * k, 0.5, p.tapeColor, 7);
}

const sans = (f: string) => `'${f || 'Noto Sans TC'}', 'Noto Sans TC', sans-serif`;
const serif = (f: string) => `'${f || 'Noto Serif TC'}', 'Noto Serif TC', serif`;

export const casefile: ItemType<P, S> = {
  type: 'common.casefile', label: '查核檔案夾', category: 'frame', kind: 'overlay',
  doc: '事實查核的檔案夾：牛皮紙卷宗、貼著紙膠帶的影片窗（窗是洞，主軌片段 frame＝casefileWindow(參數) 從洞裡播），標頭寫當事人、說法逐字打出、一排證據欄依 slots「秒|標籤」一格一格蓋章；strikeAt 時說法被紅筆兩筆劃掉、蓋雙框「駁回」章，closeAt 時封蓋從上闔下蓋住影片窗、蓋「結案」章；直式、方形時標頭在上，橫式時在影片窗右邊；所有字都是參數；查核、打臉、說法對照證據、懶人包、判決；配 common.thud、common.whoosh',
  params: [
    { key: 'who', label: '當事人那行（空＝不顯示）', type: 'string', default: '當事人：A 先生' },
    { key: 'quote', label: '說法（自動加「」）', type: 'string', default: '我只是剛好路過' },
    { key: 'quoteLabel', label: '說法前面的小標籤（空＝沒有）', type: 'string', default: '說法' },
    { key: 'typeEnd', label: '說法打完的時間（秒，從 0 開始逐字打出；0＝一開始就整句）', type: 'number', min: 0, max: 60, step: 0.05, default: 0.8 },
    { key: 'slots', label: '證據欄「秒|標籤」一行一格（最多 10 格；空＝沒有證據欄）', type: 'text', default: '1.0|有照片\n1.35|有收據\n1.7|有證人' },
    { key: 'slotLabel', label: '證據欄的字（後面自動接 ①②③）', type: 'string', default: '證據' },
    { key: 'strikeAt', label: '劃掉說法、蓋駁回章的時間（秒；-1＝不劃）', type: 'number', min: -1, max: 600, step: 0.05, default: 2.0 },
    { key: 'veto', label: '駁回章的字', type: 'string', default: '駁回' },
    { key: 'closeAt', label: '封蓋闔上、蓋結案章的時間（秒；-1＝不闔）', type: 'number', min: -1, max: 600, step: 0.05, default: -1 },
    { key: 'done', label: '結案章的字', type: 'string', default: '結案' },
    { key: 'win', label: '影片窗「x,y,寬,高」（畫面比例；空＝自動）', type: 'string', default: '' },
    { key: 'aspect', label: '影片窗的寬高比（寬÷高）', type: 'number', min: 0.3, max: 3, step: 0.01, default: 1 },
    { key: 'red', label: '印泥與紅筆的顏色', type: 'color', default: '#c8272d', theme: 'palette.accent' },
    { key: 'ink', label: '字的顏色', type: 'color', default: '#231a14', theme: 'palette.ink' },
    { key: 'paper', label: '紙的顏色', type: 'color', default: '#efe3cc' },
    { key: 'kraft', label: '卷宗頁籤與封蓋的牛皮紙色', type: 'color', default: '#d9c39b' },
    { key: 'tapeColor', label: '紙膠帶的顏色', type: 'color', default: '#ecd696' },
    { key: 'font', label: '黑體字型', type: 'string', default: 'Noto Sans TC' },
    { key: 'serif', label: '說法與章的明體字型', type: 'string', default: 'Noto Serif TC' },
  ],
  build(ctx) {
    const root = ctx.root, bg = h('canvas', null, null, root), ink = h('canvas', null, null, root);
    for (const c of [bg, ink]) cssCamel(c, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    const who = abs(root, { whiteSpace: 'pre', fontWeight: '900', lineHeight: '1.2' });
    const chip = abs(root, { whiteSpace: 'pre', fontWeight: '900', color: '#fff', lineHeight: '1.25' });
    const quote = abs(root, { whiteSpace: 'pre', fontWeight: '900', lineHeight: '1.2', transform: 'translateY(-50%)' });
    const slots = abs(root), veto = abs(root, { whiteSpace: 'pre', fontWeight: '900', transformOrigin: 'center' });
    const flap = abs(root, { transformOrigin: 'top center' }), done = abs(flap, { left: '50%', top: '50%', whiteSpace: 'pre', fontWeight: '900' });
    return { bg, bgKey: '', ink, who, chip, quote, chars: [], quoteKey: '', slots, slotKey: '', boxes: [], veto, flap, done };
  },
  async ready() {
    if (typeof document === 'undefined' || !document.fonts) return;
    await Promise.all(["900 40px 'Noto Sans TC'", "700 40px 'Noto Sans TC'", "900 40px 'Noto Serif TC'"].map((f) => document.fonts.load(f, '證據說法駁回結案').catch(() => [])));
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, local: t, theme } = ctx, L = casefileLayout(p, W, H, theme.safe), { k, head } = L, [hx, hy, hw] = head;
    const bgKey = JSON.stringify([W, H, L.win, p.paper, p.kraft, p.tapeColor]);
    if (s.bgKey !== bgKey) { s.bgKey = bgKey; paintDesk(s.bg, p, W, H, L); }
    // who, the label chip and the claim typed in
    s.who.textContent = p.who;
    cssCamel(s.who, { display: p.who ? 'block' : 'none', left: `${hx}px`, top: `${hy}px`, fontFamily: sans(p.font), fontSize: `${46 * k}px`, color: p.ink });
    s.chip.textContent = p.quoteLabel;
    const chipPx = 40 * k, chipW = p.quoteLabel ? (textEm(p.quoteLabel) * chipPx + 24 * k + 20 * k) : 0, qy = hy + 70 * k + 60 * k;
    cssCamel(s.chip, { display: p.quoteLabel ? 'block' : 'none', left: `${hx}px`, top: `${qy}px`, transform: 'translateY(-50%)', fontFamily: sans(p.font), fontSize: `${chipPx}px`, background: p.ink, padding: `${4 * k}px ${12 * k}px`, borderRadius: `${6 * k}px` });
    const text = `「${p.quote}」`, qpx = Math.min(86 * k, (hw - chipW) / Math.max(1, textEm(text)));
    if (s.quoteKey !== text) {
      s.quoteKey = text; s.quote.replaceChildren();
      s.chars = [...text].map((ch) => { const e = h('span', null, null, s.quote); e.textContent = ch; return e; });
    }
    const shown = p.typeEnd > 0 ? Math.floor(clamp(t / p.typeEnd) * s.chars.length + 1e-6) : s.chars.length;
    s.chars.forEach((e, i) => cssCamel(e, { visibility: i < shown ? 'visible' : 'hidden' }));
    cssCamel(s.quote, { left: `${hx + chipW}px`, top: `${qy}px`, fontFamily: serif(p.serif), fontSize: `${qpx}px`, color: p.ink, letterSpacing: `${2 * k}px` });
    // the strike: common.strike's two marker strokes, sized to the claim's letters
    const g = canvasAt(s.ink, W, H), striking = p.strikeAt >= 0, qw = textEm(text) * qpx, sk = qpx / 76;
    if (striking) markerStrokes(g, hx + chipW + qw / 2, qw / 2, qy + 26 * sk, sk, p.red, t, p.strikeAt);
    // the rejected stamp: common.stamp's double look, slammed down 0.4 s after the strike
    const vl = stampLand(t - p.strikeAt - 0.4), dl = doubleLook(p.red, p.paper, theme.stroke, k);
    s.veto.textContent = p.veto;
    cssCamel(s.veto, { ...dl, display: striking && p.veto && t >= p.strikeAt + 0.4 ? 'block' : 'none', left: `${Math.min(hx + hw, hx + chipW + qw + 30 * k)}px`, top: `${qy + 6 * k}px`, fontFamily: serif(p.serif), fontSize: `${54 * k}px`, color: p.red,
      opacity: String(vl.alpha), transform: `translate(-100%, -50%) rotate(-9deg) scale(${vl.scale.toFixed(4)})` });
    // the evidence row: dashed boxes that each get a red stamp at their time
    const slots = parseSlots(p.slots), sy = hy + 200 * k, sh = 108 * k, row = slotBoxes(slots.length, hw, k);
    const slotKey = JSON.stringify(slots.map((x) => x.label));
    if (s.slotKey !== slotKey) {
      s.slotKey = slotKey; s.slots.replaceChildren();
      s.boxes = slots.map(() => {
        const box = abs(s.slots, { boxSizing: 'border-box' }), idle = abs(box, { left: '0', right: '0', top: '50%', transform: 'translateY(-50%)', textAlign: 'center', whiteSpace: 'pre', fontWeight: '700' });
        const st = abs(box, { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', transformOrigin: 'center' });
        const head = h('div', null, null, st), label = h('div', null, null, st);
        cssCamel(head, { fontWeight: '900', lineHeight: '1', whiteSpace: 'pre' }); cssCamel(label, { fontWeight: '900', lineHeight: '1.1', whiteSpace: 'pre' });
        return { box, idle, st, head, label };
      });
    }
    s.boxes.forEach((b, i) => {
      const [x, w] = row[i], sl = slots[i], land = stampLand(t - sl.at), no = `${p.slotLabel}${CIRCLED[i]}`;
      cssCamel(b.box, { left: `${hx + x}px`, top: `${sy}px`, width: `${w}px`, height: `${sh}px`, border: `${3 * k}px dashed ${withAlpha(p.ink, 0.35)}`, borderRadius: `${12 * k}px` });
      b.idle.textContent = `${p.slotLabel} ${CIRCLED[i]}`;
      cssCamel(b.idle, { fontFamily: sans(p.font), fontSize: `${Math.min(40 * k, (w - 16 * k) / Math.max(1, textEm(b.idle.textContent)))}px`, color: withAlpha(p.ink, 0.38) });
      b.head.textContent = no; b.label.textContent = sl.label;
      cssCamel(b.st, { inset: `${6 * k}px`, border: `${5 * k}px solid ${p.red}`, borderRadius: `${10 * k}px`, color: p.red, background: p.paper, opacity: String(land.alpha),
        transform: `rotate(-4deg) scale(${land.scale.toFixed(4)})` });
      cssCamel(b.head, { fontFamily: sans(p.font), fontSize: `${24 * k}px`, letterSpacing: `${3 * k}px` });
      cssCamel(b.label, { fontFamily: serif(p.serif), fontSize: `${Math.min(50 * k, (w - 28 * k) / Math.max(1, textEm(sl.label)))}px` });
    });
    // the flap folds down over the window, then the closing stamp
    const [wx, wy, ww, wh] = L.win, f = t - (p.closeAt ?? -1), closing = p.closeAt >= 0 && f >= 0, bb = 14 * k;
    cssCamel(s.flap, { display: closing ? 'block' : 'none', left: `${wx - bb}px`, top: `${wy - bb}px`, width: `${ww + 2 * bb}px`, height: `${wh + 2 * bb}px`, background: p.kraft, borderRadius: `${16 * k}px`,
      boxShadow: `0 ${10 * k}px ${30 * k}px rgba(60,40,20,0.4)`, transform: `scaleY(${eOut3(clamp(f / 0.3)).toFixed(4)})` });
    const dn = stampLand(f - 0.45), dpx = Math.min(150 * k, (ww * 0.7) / Math.max(1, textEm(p.done) * 1.15));
    s.done.textContent = p.done;
    cssCamel(s.done, { ...dl, display: p.done && f >= 0.45 ? 'block' : 'none', fontFamily: serif(p.serif), fontSize: `${dpx}px`, color: p.red, letterSpacing: '0.13em', textIndent: '0.13em',
      opacity: String(dn.alpha), transform: `translate(-50%, -50%) rotate(-8deg) scale(${dn.scale.toFixed(4)})` });
  },
  hide(s) { s.bg.width = 1; s.bg.height = 1; s.bgKey = ''; s.ink.width = 1; s.ink.height = 1; },
};
