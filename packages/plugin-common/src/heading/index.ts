// common.heading — a title (a film's name, a chapter, a place, an ending) in any of the caption looks or a title's own, laid out in
// one of a few places, with a small line above it (kicker), a smaller one under it (sub), something behind it (backing) and an
// entrance and exit of its own or the caption's. It does not lay out words itself: the line is drawn by common.caption inside an
// inner layer (the sub is the caption's gloss), and the heading adds the layout, kicker, backing and its own animation around it.
// Spec 2026-11-05-title-templates.
import { cssCamel, eOut3, h, prog, type ItemType } from '@tellcut/engine';
import { caption, LOOKS } from '../caption.ts';
import { ANIM_IN, ANIM_OUT } from '../caption/anim.ts';
import { WORD_FX } from '../caption/wordfx.ts';
import type { CaptionP, CaptionS } from '../caption/types.ts';
import { BACKINGS, buildBacking, drawBacking, type BackingEls } from './backing.ts';
import { isTitleIn, isTitleOut, TITLE_IN, TITLE_OUT, titleAnim } from './anim.ts';
import { fitTitleSize, TITLE_LAYOUTS, titlePlace } from './place.ts';

export { BACKINGS } from './backing.ts';
export { TITLE_IN, TITLE_OUT, titleAnim } from './anim.ts';
export { fitTitleSize, TITLE_LAYOUTS, titlePlace } from './place.ts';

/** the looks a title may take: every caption look but the layouts made for talk */
export const HEADING_LOOKS = LOOKS.filter((l) => l.title !== false).map((l) => l.id);

export interface HeadingP {
  text: string; template: string; kicker: string; sub: string; style: string; layout: string; backing: string; size: number; font: string;
  color: string; hl: string; outline: string; accent: string; boxBg: string; bubbleBg: string; backColor: string; subSize: number; subColor: string;
  kickerColor: string; animIn: string; animOut: string; animDur: number; wordFx: string;
}
export interface HeadingS { inner: HTMLElement; cap: CaptionS; kicker: HTMLElement; back: BackingEls }

/** the caption's own defaults for what a title never sets (speaker, name, tag…) */
const CAPTION_DEFAULTS = Object.fromEntries(caption.params.map((d) => [d.key, d.default])) as unknown as CaptionP;

export const heading: ItemType<HeadingP, HeadingS> = {
  type: 'common.heading', label: '標題', category: 'title', kind: 'overlay',
  doc: '一個標題（片名、章節、地名、片尾）：外觀（style，字幕的外觀加標題專用的）、版面（layout）、底（backing）、進場、出場、顏色和字型自由搭配；常用的組合是具名的標題範本（npm run tellcut -- catalog TTL 列出全部，template 填它的 id，整支片用 c.titleTemplate）。kicker 是主標上面的一行小字、sub 是下面小一號的一行；【詞】變高亮色；layout：center 正中、top 上方、bottom 下方、lower 左下（大一點的人名條位置）、left 靠左置中、corner 右上角、full 放大到撐滿安全區寬；backing：band 暗色橫帶、scrim 整個畫面壓暗、blur 整個畫面模糊、card 實色卡片、rules 上下兩條細線、bar 左邊色條、black 全黑；進場另有 track 字距收緊、mask 由下往上露出、open 從中間打開、focus 由模糊放大到清楚、rule 先畫線再出字，出場另有 spread 字距散開、sink 往下收掉',
  params: [
    { key: 'text', label: '主標（可換行；【高亮】）', type: 'text', default: '一座廣場的七百年' },
    { key: 'template', label: '標題範本（catalog TTL 列出全部；空＝專案的預設範本，沒有就照下面的參數）', type: 'string', default: '' },
    { key: 'kicker', label: '主標上面的小字（空＝不顯示）', type: 'string', default: '' },
    { key: 'sub', label: '主標下面的一行（空＝不顯示）', type: 'string', default: '' },
    { key: 'style', label: '外觀（字幕的外觀加標題專用的）', type: 'enum', options: HEADING_LOOKS, default: 'heavy' },
    { key: 'layout', label: '版面（center 正中、top 上方、bottom 下方、lower 左下、left 靠左、corner 右上角、full 撐滿寬）', type: 'enum', options: [...TITLE_LAYOUTS], default: 'center' },
    { key: 'backing', label: '底（band 暗帶、scrim 壓暗、blur 模糊、card 卡片、rules 上下細線、bar 左邊色條、black 全黑）', type: 'enum', options: [...BACKINGS], default: 'none' },
    { key: 'size', label: '字級（畫面高 %；full 版面會再放大）', type: 'number', min: 2, max: 30, step: 0.1, default: 9 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.display' },
    { key: 'color', label: '文字顏色', type: 'color', default: '#ffffff' },
    { key: 'hl', label: '高亮顏色', type: 'color', default: '#ffe14d', theme: 'palette.hl' },
    { key: 'outline', label: '描邊顏色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'accent', label: '外觀的第二色、細線和色條的顏色（空＝外觀的預設；細線、色條用主色）', type: 'color', default: '' },
    { key: 'boxBg', label: '底框顏色（box 外觀）', type: 'color', default: '#000000b3' },
    { key: 'bubbleBg', label: '紙色（bubble、sticker 這類外觀）', type: 'color', default: '#fff8ec', theme: 'palette.paper' },
    { key: 'backColor', label: '底的顏色（band、scrim、card）', type: 'color', default: '#000000a0' },
    { key: 'subSize', label: '下面一行的字級（主標的倍數）', type: 'number', min: 0.2, max: 1, step: 0.01, default: 0.36 },
    { key: 'subColor', label: '下面一行的顏色（空＝高亮顏色）', type: 'color', default: '' },
    { key: 'kickerColor', label: '上面小字的顏色（空＝高亮顏色）', type: 'color', default: '' },
    { key: 'animIn', label: '進場（字幕的進場，加 track 字距收緊、mask 由下露出、open 從中間打開、focus 模糊到清楚、rule 先畫線）', type: 'enum', options: [...ANIM_IN, ...TITLE_IN], default: 'rise' },
    { key: 'animOut', label: '出場（字幕的出場，加 spread 字距散開、sink 往下收掉）', type: 'enum', options: [...ANIM_OUT, ...TITLE_OUT], default: 'fade' },
    { key: 'animDur', label: '動畫長度 (s)', type: 'number', min: 0, max: 3, step: 0.05, default: 0.6 },
    { key: 'wordFx', label: '逐字效果（字幕的逐字效果，照字數平均分配到整個標題）', type: 'enum', options: [...WORD_FX], default: 'auto' },
  ],
  build(ctx) {
    const back = buildBacking(ctx.root);
    const kicker = h('div', null, null, ctx.root);
    cssCamel(kicker, { position: 'absolute', whiteSpace: 'pre', lineHeight: '1.2', fontWeight: '700', letterSpacing: '0.2em', display: 'none' });
    const inner = h('div', null, null, ctx.root);
    cssCamel(inner, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%' });
    const cap = caption.build({ ...ctx, root: inner, params: { ...CAPTION_DEFAULTS } } as never) as CaptionS;
    return { inner, cap, kicker, back };
  },
  hide(s) { caption.hide?.(s.cap); },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme, local, dur } = ctx, k = Math.min(W, H) / 1080;
    const text = String(p.text ?? '');
    if (!text.trim()) {   // no title: nothing at all, its kicker, sub and backing included
      for (const e of [s.inner, s.kicker, ...Object.values(s.back)]) cssCamel(e, { display: 'none' });
      return;
    }
    cssCamel(s.inner, { display: 'block' });
    const place = titlePlace(p.layout, theme.safe), own = isTitleIn(p.animIn), ownOut = isTitleOut(p.animOut);
    const size = fitTitleSize(text, p.size * place.scale, W, H, theme.safe.side, p.layout === 'full');
    const capParams: CaptionP = { ...CAPTION_DEFAULTS, text, style: p.style, size, font: p.font, color: p.color, hl: p.hl, outline: p.outline, accent: p.accent, boxBg: p.boxBg, bubbleBg: p.bubbleBg,
      wordFx: p.wordFx, animIn: own ? 'none' : p.animIn, animOut: ownOut ? 'none' : p.animOut, animDur: p.animDur, gloss: p.sub, glossSize: p.subSize, glossColor: p.subColor,
      position: place.position, align: place.align, y: place.y, words: [] };
    // the caption's own templates never reach a title; a font the item sets itself replaces a look's own, as on a caption
    const fontSet = !!ctx.item?.params && 'font' in ctx.item.params;
    caption.draw({ ...ctx, params: capParams, item: { ...ctx.item, params: fontSet ? { font: p.font } : {} }, project: { ...ctx.project, meta: { ...ctx.project?.meta, captionTemplate: undefined, captionTemplates: undefined } } } as never, s.cap);
    // the block's box from layout values (a centred box stands on its middle; a centre-placed one is lifted by half its height)
    const box = s.cap.box, fs = parseFloat(box.style.fontSize) || (size / 100) * H, bw = box.offsetWidth, bh = box.offsetHeight;
    let x = place.align === 'left' ? box.offsetLeft : box.offsetLeft - bw / 2;
    const y = place.position === 'center' && place.y < 0 ? box.offsetTop - bh / 2 : box.offsetTop;
    // corner: the left-set block moved to the safe area's right edge
    const dx = place.right ? Math.max(0, W * (1 - theme.safe.side) - (x + bw)) : 0;
    x += dx;
    const a = titleAnim(p.animIn, p.animOut, local, dur, p.animDur);
    cssCamel(s.inner, { transform: [dx ? `translateX(${dx.toFixed(2)}px)` : '', a.transform].filter(Boolean).join(' '), clipPath: a.clip || 'none', filter: a.filter || 'none',
      letterSpacing: a.letterSpacing, opacity: String(a.opacity * a.textOpacity) });
    // the kicker: a small spaced line just above the block, aligned with it
    const kick = String(p.kicker ?? ''), kfs = fs * 0.3;
    s.kicker.textContent = kick;
    cssCamel(s.kicker, { display: kick ? 'block' : 'none', fontSize: `${kfs.toFixed(2)}px`, fontFamily: `'${p.font}', 'Noto Sans TC', sans-serif`, color: p.kickerColor || p.hl,
      textShadow: `0 ${(2 * k).toFixed(2)}px ${(6 * k).toFixed(2)}px rgba(0,0,0,0.45)`, bottom: `${(H - y + 0.12 * fs).toFixed(2)}px`, top: '',
      left: `${(place.align === 'left' ? x : x + bw / 2).toFixed(2)}px`, transform: `${place.align === 'left' ? '' : 'translateX(-50%) '}${a.transform}`.trim() || 'none',
      clipPath: a.clip || 'none', filter: a.filter || 'none', opacity: String(a.opacity * a.textOpacity) });
    // the backing fades in and out with the title over the same time
    const d = Math.max(0.05, Math.min(p.animDur, dur / 2)), fade = eOut3(Math.min(prog(local, 0, d), prog(dur - local, 0, d)));
    // the kicker is part of the block the backing goes round
    const kh = kick ? kfs * 1.2 + 0.12 * fs : 0;
    drawBacking(s.back, { backing: p.backing, block: { x, y: y - kh, w: bw, h: bh + kh }, fs, W, H, k, centered: place.align !== 'left', color: p.backColor,
      accent: p.accent || (p.backing === 'rules' ? p.color : theme.palette.accent), radius: theme.radius * k, opacity: p.animIn === 'rule' ? Math.max(fade, a.ruleP) : fade, ruleP: a.ruleP });
  },
};
