// common.slip — a cream queue-number slip, from the food-deep short. mode stub (fx.ticket): a red number stub with a perforation, a
// title and a small line, printed out from the left; one reason, one point. mode board (fx.endboard): the closing slip — a big line,
// a dashed rule, numbered rows coming in one by one and a line at the foot, over a dimmed frame.
// `slot` (the amber-podcast short's fx.ruleCard): in its last 0.55 s the stub shrinks and flies into card `slot` of a
// common.progress slots row (`slots` cards, centre `slotY` — the same numbers as that item's labels count and y).
import { abs, clamp, cssCamel, eIO3, eOut3 as eOut, h, type ItemType, prog } from '@tellcut/engine';
import { fitPx } from './text.ts';
import { withAlpha } from './color.ts';
import { slotRects } from './progress.ts';
import { WORDS, wordsLang } from './words.ts';

interface P { slot: number; slots: number; slotY: number; mode: 'stub' | 'board'; no: string; noLabel: string; title: string; sub: string; items: string; y: number; dim: number; font: string; paper: string; stub: string; ink: string; muted: string }
interface Row { row: HTMLElement; chip: HTMLElement; text: HTMLElement }
interface S { dim: HTMLElement; box: HTMLElement; stubEl: HTMLElement; noLab: HTMLElement; noEl: HTMLElement; perf: HTMLElement; title: HTMLElement; sub: HTMLElement; rule: HTMLElement; rows: Row[]; key: string }

/** the rows of the board: one a line, or split by | */
export const slipRows = (text: string) => String(text ?? '').split(/\n|\|/).map((x) => x.trim()).filter(Boolean);

/** where a stub flying into a slot is at `local`: k 0 (in place) → 1 (in the slot) over the last 0.55 s, the opacity (gone over the
 *  last quarter of the flight), and the move and scale that take the card `card` [x, y, w, h] onto the slot `to` (centre on centre,
 *  width to width) */
export function slipFlight(local: number, dur: number, card: [number, number, number, number], to: [number, number, number, number]) {
  const k = eIO3(clamp((local - (dur - 0.55)) / 0.55)), alpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
  const dx = (to[0] + to[2] / 2 - (card[0] + card[2] / 2)) * k, dy = (to[1] + to[3] / 2 - (card[1] + card[3] / 2)) * k;
  return { k, alpha: clamp(alpha), dx, dy, scale: 1 + (to[2] / card[2] - 1) * k };
}

export const slip: ItemType<P, S> = {
  type: 'common.slip', label: '號碼票', category: 'chapter', kind: 'overlay',
  doc: '奶油色號碼票：mode stub 是左邊紅色號碼聯（理由 01）＋虛線撕口、右邊標題與小字，從左邊一路印出來（第幾個理由、一句重點）；mode board 是片尾號碼票：大字、虛線、一行一行彈進來的編號回顧（items）、最下面一行小字，背後壓暗；排隊名店、三個理由、回顧總結；slot 讓號碼聯最後 0.55 秒縮小飛進 common.progress slots 卡列的第幾格（slots 張數、slotY 卡列高度要跟那一項一樣），講完一條規則就收進上面的編號卡',
  params: [
    { key: 'mode', label: '樣式（stub 號碼聯、board 片尾回顧）', type: 'enum', options: ['stub', 'board'], default: 'stub' },
    { key: 'no', label: '號碼（stub；空＝顯示 !）', type: 'string', default: '01' },
    { key: 'noLabel', label: '號碼上的小字（stub；號碼空時顯示「重點」，標題是英文就是 POINT、日文是ポイント）', type: 'string', default: '理由' },
    { key: 'title', label: '標題（board 的大字）', type: 'string', default: '沒有蒜蓉醬' },
    { key: 'sub', label: '小字（board 最下面一行）', type: 'string', default: '老闆自己用味噌炒醬' },
    { key: 'items', label: '回顧（board；一行一個或用 | 分開）', type: 'text', default: '沒有蒜蓉，自己炒味噌醬\n方的嫩　三角的脆\n不接電話訂，只賣現炸' },
    { key: 'y', label: '上緣（畫面高比例；-1＝stub 貼在下方安全區上面、board 畫面中間）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'dim', label: '背後壓暗（board；0–1）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.42 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'paper', label: '票的紙色', type: 'color', default: '#f3e6c8' },
    { key: 'stub', label: '號碼聯與編號的顏色', type: 'color', default: '#d8352a', theme: 'palette.accent' },
    { key: 'ink', label: '字色', type: 'color', default: '#1b1410', theme: 'palette.ink' },
    { key: 'muted', label: '小字顏色', type: 'color', default: '#6d5644' },
    { key: 'slot', label: '最後飛進第幾格（stub；0 起算，-1＝不飛；配 common.progress 的 slots 卡列）', type: 'number', min: -1, max: 11, step: 1, default: -1 },
    { key: 'slots', label: '卡列共幾格（slot 用；跟 progress 的關鍵字數一樣）', type: 'number', min: 1, max: 12, step: 1, default: 3 },
    { key: 'slotY', label: '卡列中心的高度（slot 用；畫面高比例，-1＝安全區上緣下方，跟 progress 的 y 一樣）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
  ],
  build(ctx) {
    const dim = abs(ctx.root), box = abs(ctx.root), stubEl = abs(box), noLab = abs(stubEl), noEl = abs(stubEl), perf = abs(box), title = abs(box), sub = abs(box), rule = abs(box);
    cssCamel(dim, { inset: '0' });
    cssCamel(box, { overflow: 'hidden', boxSizing: 'border-box' });
    for (const e of [noLab, noEl, title, sub]) cssCamel(e, { whiteSpace: 'pre', lineHeight: '1.12' });
    return { dim, box, stubEl, noLab, noEl, perf, title, sub, rule, rows: [], key: '' };
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080, font = `'${p.font}', 'Noto Sans TC', sans-serif`;
    const side = theme.safe.side * W, w = W - 2 * side, out = 1 - prog(local, dur - 0.18, dur), board = p.mode === 'board';
    const items = board ? slipRows(p.items) : [];
    if (s.key !== JSON.stringify(items)) {
      s.key = JSON.stringify(items);
      for (const r of s.rows) r.row.remove();
      s.rows = items.map(() => {
        const row = h('div', null, null, s.box), chip = h('div', null, null, row), text = h('div', null, null, row);
        cssCamel(row, { position: 'absolute', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' });
        cssCamel(chip, { flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: '#ffffff', fontVariantNumeric: 'tabular-nums' });
        cssCamel(text, { fontWeight: '900', lineHeight: '1.2' });
        return { row, chip, text };
      });
    }
    cssCamel(s.dim, { display: board && p.dim > 0 ? 'block' : 'none', background: `rgba(10,6,4,${p.dim})`, opacity: String(eOut(clamp(local / 0.3)) * out) });
    s.title.textContent = p.title; s.sub.textContent = p.sub;
    if (!board) {
      // the stub: 118 units tall, printed out from the left in 0.32 s
      const hh = 118 * k, top = p.y >= 0 ? p.y * H : (1 - theme.safe.bottom) * H - hh, a = eOut(clamp(local / 0.32)), sw = 170 * k;
      const lift = `translateY(${((1 - eOut(clamp(local / 0.22))) * -14 * k).toFixed(2)}px)`;
      let transform = lift, alpha = out;
      if (p.slot >= 0) {   // flying into a slot: no fade at the end, the flight fades it instead
        const n = Math.max(1, Math.round(p.slots)), f = slipFlight(local, dur, [side, top, w, hh], slotRects(n, W, H, theme.safe, p.slotY)[Math.min(n - 1, Math.round(p.slot))]);
        if (f.k > 0) transform = `translate(${f.dx.toFixed(2)}px, ${f.dy.toFixed(2)}px) scale(${f.scale.toFixed(4)}) ${lift}`;
        alpha = f.alpha;
      }
      cssCamel(s.box, { left: `${side}px`, top: `${top}px`, width: `${w}px`, height: `${hh}px`, padding: '0', borderRadius: `${14 * k}px`, background: p.paper, fontFamily: font,
        boxShadow: `0 ${8 * k}px ${22 * k}px rgba(0,0,0,.45)`, clipPath: `inset(0 ${((1 - a) * 100).toFixed(2)}% 0 0)`,
        transform, opacity: String(alpha) });
      cssCamel(s.stubEl, { display: 'block', left: '0', top: '0', width: `${sw}px`, height: '100%', background: p.stub });
      s.noLab.textContent = p.no ? p.noLabel : WORDS.slipPoint[wordsLang([p.title, p.sub], ctx)]; s.noEl.textContent = p.no || '!';
      cssCamel(s.noLab, { left: '0', width: '100%', textAlign: 'center', top: `${18 * k}px`, fontSize: `${20 * k}px`, fontWeight: '700', letterSpacing: `${4 * k}px`, color: withAlpha('#ffffff', 0.85) });
      cssCamel(s.noEl, { left: '0', width: '100%', textAlign: 'center', top: `${42 * k}px`, fontSize: `${fitPx(p.no || '!', 66 * k, sw - 20 * k)}px`, fontWeight: '900', color: '#ffffff', lineHeight: '1' });
      cssCamel(s.perf, { display: 'block', left: `${sw}px`, top: `${8 * k}px`, height: `${hh - 16 * k}px`, width: '0', borderLeft: `${3 * k}px dashed ${withAlpha(p.ink, 0.35)}` });
      const room = w - sw - 54 * k, ts = fitPx(p.title, (p.sub ? 50 : 58) * k, room), ss = fitPx(p.sub, 28 * k, room), th = ts * 1.12 + (p.sub ? 4 * k + ss * 1.12 : 0);
      cssCamel(s.title, { display: 'block', left: `${sw + 30 * k}px`, top: `${(hh - th) / 2}px`, fontSize: `${ts}px`, fontWeight: '900', color: p.ink, letterSpacing: `${k}px`, textAlign: 'left', width: 'auto' });
      cssCamel(s.sub, { display: p.sub ? 'block' : 'none', left: `${sw + 30 * k}px`, top: `${(hh - th) / 2 + ts * 1.12 + 4 * k}px`, fontSize: `${ss}px`, fontWeight: '700', color: p.muted, textAlign: 'left', width: 'auto', opacity: '1' });
      cssCamel(s.rule, { display: 'none' });
      return;
    }
    // the board: head, dashed rule, numbered rows, foot; unrolled downwards
    const padX = 44 * k, inner = w - 2 * padX, hs = fitPx(p.title, 74 * k, inner), rs = 42 * k, chipW = 74 * k, rowH = 58 * k, gap = 12 * k;
    const ruleY = 30 * k + hs * 1.12 + 18 * k, rowsY = ruleY + 13 * k, footY = rowsY + items.length * (rowH + gap) + 22 * k, fs = fitPx(p.sub, 32 * k, inner), hh = footY + (p.sub ? fs * 1.12 : 0) + 30 * k;
    const top = p.y >= 0 ? p.y * H : Math.max(theme.safe.top * H, H * 0.45 - hh / 2), a = eOut(clamp(local / 0.3));
    cssCamel(s.box, { left: `${side}px`, top: `${top}px`, width: `${w}px`, height: `${hh}px`, borderRadius: `${18 * k}px`, background: p.paper, fontFamily: font, boxShadow: `0 ${14 * k}px ${36 * k}px rgba(0,0,0,.55)`,
      clipPath: `inset(0 0 ${((1 - a) * 100).toFixed(2)}% 0)`, transform: `translateY(${((1 - a) * -30 * k).toFixed(1)}px)`, opacity: String(out) });
    cssCamel(s.stubEl, { display: 'none' }); cssCamel(s.perf, { display: 'none' });
    cssCamel(s.title, { display: 'block', left: '0', width: '100%', textAlign: 'center', top: `${30 * k}px`, fontSize: `${hs}px`, fontWeight: '900', color: p.ink, letterSpacing: '0' });
    cssCamel(s.rule, { display: 'block', left: `${padX}px`, width: `${inner}px`, top: `${ruleY}px`, height: '0', borderTop: `${3 * k}px dashed ${withAlpha(p.ink, 0.3)}` });
    s.rows.forEach((r, i) => {
      const q = eOut(clamp((local - 0.35 - i * 0.22) / 0.2));
      r.chip.textContent = String(i + 1).padStart(2, '0'); r.text.textContent = items[i];
      cssCamel(r.row, { left: `${padX}px`, top: `${rowsY + i * (rowH + gap)}px`, height: `${rowH}px`, opacity: String(q), transform: `translateX(${((1 - q) * 40 * k).toFixed(1)}px)` });
      cssCamel(r.chip, { width: `${chipW}px`, height: `${rowH}px`, borderRadius: `${8 * k}px`, background: p.stub, fontSize: `${36 * k}px` });
      cssCamel(r.text, { marginLeft: `${20 * k}px`, color: p.ink, fontSize: `${fitPx(items[i], rs, inner - chipW - 20 * k)}px` });
    });
    cssCamel(s.sub, { display: p.sub ? 'block' : 'none', left: '0', width: '100%', textAlign: 'center', top: `${footY}px`, fontSize: `${fs}px`, fontWeight: '700', color: p.muted,
      letterSpacing: `${2 * k}px`, opacity: String(eOut(clamp((local - 0.35 - items.length * 0.22 - 0.2) / 0.25))) });
  },
};
