// common.card — an index card on a little stack: a picture window on top, then the step number, title, amount (highlighter) and a tip
// on ruled lines; it flips to a new page, deals in from below or slides away. Promoted from the pancake-class short's crayon recipe card.
// The picture window draws any other block (`art`, e.g. a project's own illustration fx) at the window's size, or a big emoji.
import { abs, clamp, cssCamel, eBack, eOut3, h, type ItemType, resolveTheme, rng, withDefaults } from '@tellcut/engine';
import { fitPx } from './text.ts';
import { withAlpha } from './color.ts';

interface P {
  no: string; title: string; detail: string; tip: string; art: string; artParams: Record<string, unknown>; emoji: string;
  x: number; y: number; w: number; h: number; tilt: number; enter: 'flip' | 'deal' | 'none'; exit: boolean; lines: boolean;
  accent: string; hl: string; ink: string; paper: string; tape: string; font: string;
}
interface Art { key: string; type?: ItemType; state?: unknown; params?: Record<string, any>; root?: HTMLElement; w?: number; h?: number }
interface S {
  group: HTMLElement; under: HTMLElement[]; card: HTMLElement; rule: HTMLElement; win: HTMLElement; emoji: HTMLElement; flip: HTMLElement; tape: HTMLElement;
  badge: HTMLElement; rings: HTMLElement[]; num: HTMLElement; title: HTMLElement; detail: HTMLElement; tip: HTMLElement; art: Art;
}

const EMOJI = "'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";

/** the card's inner layout in px for a card `cw` wide and `ch` tall. k: the size it was drawn at (768 wide), shrunk on a short,
 *  wide card (16:9) so the text rows (348 px at k = 1) take at most 60 % of its height and stay inside it */
export function cardLayout(cw: number, ch: number) {
  const k = Math.min(cw / 768, (ch * 0.6) / 348), artH = ch - 348 * k, win = { x: 26 * k, y: 34 * k, w: cw - 52 * k, h: artH };
  return { k, win, lineTop: win.y + artH + 14 * k, nr: 46 * k };
}

/** the picture window's size in whole px on a W×H frame (what the hosted block is built and drawn at) */
const windowSize = (p: Pick<P, 'w' | 'h'>, W: number, H: number) => { const { win } = cardLayout(p.w * W, p.h * H); return { w: Math.round(win.w), h: Math.round(win.h) }; };
/** the hosted block's type: any registered block but another card */
const artType = (p: { art?: string }, types?: (type: string) => ItemType | undefined) => (p.art && p.art !== card.type ? types?.(p.art) : undefined);

export const card: ItemType<P, S> = {
  type: 'common.card', label: '索引卡', category: 'card', kind: 'overlay',
  doc: '一疊索引卡最上面那張：上半是圖窗（放任何積木，例如專案自己的插畫 fx，或一個大 emoji），下半橫線上是步驟編號、標題、份量（螢光筆）和小提示；換步驟翻頁，可發牌進場、最後滑出；食譜、教學步驟、清單',
  params: [
    { key: 'no', label: '步驟編號（空＝封面卡：標題置中）', type: 'string', default: '1' },
    { key: 'title', label: '標題', type: 'string', default: '加入麵粉' },
    { key: 'detail', label: '份量／重點（螢光筆；封面卡是副標）', type: 'string', default: '1 杯' },
    { key: 'tip', label: '小提示', type: 'string', default: '先過篩比較不會結塊' },
    { key: 'art', label: '圖窗裡畫的積木（類型 id，例 fx.recipeart；空＝畫 emoji）', type: 'string', default: '' },
    { key: 'artParams', label: '圖窗積木的參數', type: 'json', default: {} },
    { key: 'emoji', label: '圖窗的 emoji（沒有 art 時）', type: 'string', default: '🥞' },
    { key: 'x', label: '左緣（畫面寬比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.12 },
    { key: 'y', label: '上緣（畫面高比例）', type: 'number', min: 0, max: 1, step: 0.005, default: 0.12 },
    { key: 'w', label: '寬（畫面寬比例）', type: 'number', min: 0.1, max: 1, step: 0.005, default: 0.76 },
    { key: 'h', label: '高（畫面高比例）', type: 'number', min: 0.1, max: 1, step: 0.005, default: 0.52 },
    { key: 'tilt', label: '傾斜（度）', type: 'number', min: -10, max: 10, step: 0.5, default: -1 },
    { key: 'enter', label: '進場（flip 翻頁、deal 從下面發牌）', type: 'enum', options: ['flip', 'deal', 'none'], default: 'flip' },
    { key: 'exit', label: '最後往上滑出', type: 'bool', default: false },
    { key: 'lines', label: '索引卡橫線', type: 'bool', default: true },
    { key: 'accent', label: '編號圈顏色', type: 'color', default: '#2bb3a3', theme: 'palette.accent' },
    { key: 'hl', label: '螢光筆色', type: 'color', default: '#ffd23f', theme: 'palette.hl' },
    { key: 'ink', label: '字色', type: 'color', default: '#5a3d2b', theme: 'palette.ink' },
    { key: 'paper', label: '卡片紙色', type: 'color', default: '#fffaf1', theme: 'palette.paper' },
    { key: 'tape', label: '膠帶顏色', type: 'color', default: '#ff7aa8', theme: 'palette.accent2' },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
  ],
  build(ctx) {
    const group = abs(ctx.root), under = [abs(group), abs(group)], card = abs(group), rule = abs(card), win = abs(card), emoji = abs(win), flip = abs(card), tape = abs(group);
    const badge = abs(group), rings = [abs(badge), abs(badge)], num = abs(badge), title = abs(group), detail = abs(group), tip = abs(group);
    cssCamel(card, { overflow: 'hidden' });
    cssCamel(win, { overflow: 'hidden' });
    cssCamel(emoji, { left: '50%', top: '50%', lineHeight: '1', fontFamily: EMOJI, whiteSpace: 'pre' });
    for (const el of [num, title, detail, tip]) { cssCamel(el, { whiteSpace: 'pre', lineHeight: '1' }); }
    for (const r of rings) cssCamel(r, { boxSizing: 'border-box', borderRadius: '50%' });
    const s: S = { group, under, card, rule, win, emoji, flip, tape, badge, rings, num, title, detail, tip, art: { key: '' } };
    // the hosted block is built now (not on the first draw), so its own build starts loading its assets and ready() can wait for them
    const { w, h: hgt } = windowSize(ctx.params, ctx.W, ctx.H);
    syncArt(ctx, s, w, hgt);
    return s;
  },
  // the hosted block's stills and clips, so an export cuts them (a polaroid in the window)
  media(item, project, types) {
    const p = item.params as Partial<P>, type = artType(p, types);
    if (!type?.media) return { videos: [], stills: [] };
    const params = withDefaults(type.params, (p.artParams ?? {}) as Record<string, unknown>, project ? resolveTheme(project.meta.theme, project.meta) : undefined);
    return type.media({ ...item, params }, project, types);
  },
  async ready(s) {
    const a = s.art;
    if (a.type?.ready && a.state !== undefined) await a.type.ready(a.state);
  },
  draw(ctx, s) {
    const p = ctx.params, { W, H, local, dur } = ctx, cw = p.w * W, ch = p.h * H, { k, win, lineTop, nr } = cardLayout(cw, ch);
    const font = `'${p.font}', 'Noto Sans TC', sans-serif`, drawDur = Math.min(1.5, dur * 0.45), boil = Math.floor(local * 6);
    // coming and going: the whole stack moves together
    let dy = 0, rot = p.tilt, alpha = 1;
    if (p.enter === 'deal') { const e = eBack(clamp(local / 0.7), 1.9); dy = (1 - e) * H * 0.9; rot += (1 - e) * -14; }
    if (p.exit) { const e = eOut3(clamp((local - (dur - 0.5)) / 0.5)); rot += e * -11; dy -= e * H; alpha = 1 - e * 0.2; }
    cssCamel(s.group, { left: `${p.x * W}px`, top: `${p.y * H}px`, width: `${cw}px`, height: `${ch}px`, transform: `translateY(${dy}px) rotate(${rot}deg)`, opacity: String(alpha), fontFamily: font, color: p.ink });
    const sheet = (el: HTMLElement, ox: number, oy: number, r: number, bg: string) => cssCamel(el, { left: '0', top: '0', width: `${cw}px`, height: `${ch}px`, borderRadius: `${22 * k}px`,
      background: bg, boxShadow: `0 ${10 * k}px ${26 * k}px rgba(90,50,30,0.22)`, transform: `translate(${ox}px, ${oy}px) rotate(${r}deg)` });
    sheet(s.under[0], -14 * k, 12 * k, -2, `color-mix(in srgb, ${p.paper} 86%, #c8a27a)`);
    sheet(s.under[1], 10 * k, 6 * k, 1.4, `color-mix(in srgb, ${p.paper} 93%, #c8a27a)`);
    sheet(s.card, 0, 0, 0, p.paper);
    // the index-card lines: a red one under the picture, pale blue ones below
    cssCamel(s.rule, { display: p.lines ? 'block' : 'none', left: '0', top: '0', width: '100%', height: '100%', backgroundRepeat: 'no-repeat',
      backgroundImage: `linear-gradient(#e8737c, #e8737c), repeating-linear-gradient(180deg, rgba(80,140,200,0.28) 0 ${2 * k}px, transparent ${2 * k}px ${76 * k}px)`,
      backgroundSize: `100% ${3 * k}px, 100% ${Math.max(0, ch - lineTop - 110 * k - 10 * k)}px`, backgroundPosition: `0 ${lineTop}px, 0 ${lineTop + 110 * k}px` });
    cssCamel(s.tape, { left: `${cw / 2 - 90 * k}px`, top: `${-16 * k}px`, width: `${180 * k}px`, height: `${40 * k}px`, transform: 'rotate(-2.3deg)',
      background: `repeating-linear-gradient(90deg, rgba(255,255,255,0.35) 0 ${12 * k}px, transparent ${12 * k}px ${28 * k}px), ${withAlpha(p.tape, 0.72)}` });
    // the picture window
    cssCamel(s.win, { left: `${win.x}px`, top: `${win.y}px`, width: `${win.w}px`, height: `${win.h}px` });
    drawArt(ctx, s, windowSize(p, W, H));
    // the step number in a crayon circle, popping in once the picture is under way
    const cover = !p.no, pop = eBack(clamp((local - drawDur * 0.25) / 0.45), 1.9), R = rng(boil * 5 + 9);
    cssCamel(s.badge, { display: !cover && pop > 0 ? 'block' : 'none', left: `${40 * k}px`, top: `${lineTop + 60 * k - nr}px`, width: `${2 * nr}px`, height: `${2 * nr}px`,
      borderRadius: '50%', background: p.accent, transform: `scale(${pop}) rotate(-7deg)` });
    s.rings.forEach((r) => cssCamel(r, { left: `${(R() - 0.5) * 4 * k - 5 * k}px`, top: `${(R() - 0.5) * 4 * k - 4 * k}px`, width: `${2 * nr + 10 * k}px`, height: `${2 * nr + 8 * k}px`,
      border: `${5 * k}px solid ${p.accent}`, borderRightColor: 'transparent', transform: `rotate(${R() * 57}deg)` }));
    s.num.textContent = p.no;
    cssCamel(s.num, { left: '50%', top: '50%', transform: 'translate(-50%, -46%)', fontSize: `${56 * k}px`, fontWeight: '900', color: '#ffffff' });
    const txtIn = clamp((local - drawDur * 0.35) / 0.4), bIn = eOut3(clamp((local - 0.5) / 0.5));
    s.title.textContent = p.title; s.detail.textContent = p.detail; s.tip.textContent = p.tip;
    if (cover) {
      cssCamel(s.title, { left: `${cw / 2}px`, top: `${lineTop + 86 * k}px`, transform: `translate(-50%, ${-50 + (1 - bIn) * 40}%)`, fontSize: `${fitPx(p.title, 84 * k, cw - 60 * k)}px`,
        fontWeight: '900', letterSpacing: `${4 * k}px`, opacity: String(bIn) });
      cssCamel(s.detail, { display: p.detail ? 'block' : 'none', left: `${cw / 2}px`, top: `${lineTop + 178 * k}px`, transform: 'translate(-50%, -50%)', fontSize: `${38 * k}px`,
        fontWeight: '700', letterSpacing: `${4 * k}px`, color: p.accent, background: 'none', opacity: String(clamp((local - 0.9) / 0.4)) });
      cssCamel(s.tip, { display: 'none' });
    } else {
      const tx = 40 * k + 2 * nr + 26 * k, hlP = clamp((local - drawDur * 0.6) / 0.5);
      cssCamel(s.title, { left: `${tx - (1 - eOut3(txtIn)) * 20 * k}px`, top: `${lineTop + 62 * k}px`, transform: 'translateY(-50%)', fontSize: `${fitPx(p.title, 72 * k, cw - tx - 24 * k)}px`,
        fontWeight: '900', letterSpacing: '0', opacity: String(txtIn) });
      cssCamel(s.detail, { display: p.detail ? 'block' : 'none', left: `${34 * k}px`, top: `${lineTop + 151 * k}px`, transform: 'translateY(-50%)', fontSize: `${fitPx(p.detail, 50 * k, cw - 68 * k)}px`,
        fontWeight: '700', letterSpacing: '0', color: p.ink, padding: `0 ${10 * k}px`, opacity: String(clamp(txtIn * 1.5 - 0.3)),
        background: `linear-gradient(transparent 52%, ${withAlpha(p.hl, 0.82)} 52% 96%, transparent 96%) no-repeat 0 0 / ${hlP * 100}% 100%` });
      cssCamel(s.tip, { display: p.tip ? 'block' : 'none', left: `${50 * k}px`, top: `${lineTop + 224 * k}px`, transform: 'translateY(-50%)', fontSize: `${fitPx(p.tip, 38 * k, cw - 80 * k)}px`,
        fontWeight: '500', color: withAlpha(p.ink, 0.75), opacity: String(clamp((local - drawDur * 0.8) / 0.4)) });
    }
    // a new page: the old one peels away to the left and shows this one underneath
    const e = eOut3(clamp(local / 0.45)), wv = cw * (1 - e), on = p.enter === 'flip' && local < 0.45;
    cssCamel(s.flip, { display: on ? 'block' : 'none', left: '0', top: '0', height: '100%', width: `${wv}px`, boxShadow: `${40 * k * (1 - e)}px 0 ${30 * k}px rgba(80,50,30,0.25)`,
      background: `linear-gradient(90deg, ${p.paper} 0%, color-mix(in srgb, ${p.paper} 92%, #b48a5a) 75%, color-mix(in srgb, ${p.paper} 80%, #b48a5a) 100%)` });
  },
  hide(s) {
    const a = s.art;
    if (a.type?.hide && a.state !== undefined) a.type.hide(a.state);
  },
  // the hosted block's own late pass (a 3D fx uploading its video picture) and its GPU things, as the stage would give them
  late(ctx, s) {
    const a = s.art;
    if (a.type?.late && a.root) a.type.late({ ...ctx, root: a.root, W: a.w!, H: a.h!, params: a.params! }, a.state);
  },
  dispose(s) {
    const a = s.art;
    if (a.type?.dispose && a.state !== undefined) a.type.dispose(a.state);
  },
};

/** The `art` block built at the window's size (rebuilt when the block, its params or the size change). */
function syncArt(ctx: Parameters<typeof card.build>[0], s: S, w: number, hgt: number) {
  const p = ctx.params, type = artType(p, ctx.types), key = `${p.art}|${w}x${hgt}|${JSON.stringify(p.artParams ?? {})}`;
  if (s.art.key !== key) {
    if (s.art.type?.hide && s.art.state !== undefined) s.art.type.hide(s.art.state);
    card.dispose!(s);
    for (const c of [...s.win.children]) if (c !== s.emoji) c.remove();
    s.art = { key };
    if (type) {
      const params = withDefaults(type.params, (p.artParams ?? {}) as Record<string, unknown>, ctx.theme), root = h('div', null, null, s.win);
      cssCamel(root, { position: 'absolute', left: '0', top: '0', width: `${w}px`, height: `${hgt}px` });
      s.art = { key, type, params, root, w, h: hgt, state: type.build({ ...ctx, root, W: w, H: hgt, params }) };
    }
  }
}

/** The picture window: the `art` block, or an emoji. */
function drawArt(ctx: Parameters<typeof card.draw>[0], s: S, { w, h: hgt }: { w: number; h: number }) {
  const p = ctx.params;
  syncArt(ctx, s, w, hgt);
  const a = s.art;
  if (a.type && a.root) a.type.draw({ ...ctx, root: a.root, W: w, H: hgt, params: a.params! }, a.state);
  const pop = eBack(clamp(ctx.local / 0.5), 2), px = Math.min(w, hgt) * 0.62;
  s.emoji.textContent = a.type ? '' : p.emoji;
  cssCamel(s.emoji, { display: a.type ? 'none' : 'block', fontSize: `${px}px`, transform: `translate(-50%, -50%) translateY(${Math.sin(ctx.local * 2.2) * px * 0.03}px) rotate(${Math.sin(ctx.local * 1.7) * 4}deg) scale(${pop})` });
}
