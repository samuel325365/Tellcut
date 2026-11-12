// common.caption — a caption in the project's look: outlined, plain or on a box; 【word】 highlighted, {word} bleeped. With `words` the
// word being said lights up (karaoke); `speaker` colours it by who speaks, `name` puts their name above it, `tag` a chip in the accent
// colour (a dish, a place). animIn 'pop' pops the characters in one by one (from a food-review hook short's quote captions).
// `quote` puts the line in curly quotes and italics and `gloss` adds a smaller translation under it (the baking-sin short's kept English line);
// `glossSize` and `glossColor` make that a bilingual subtitle (the showcase films' English narration over Chinese).
// `y` pins the caption's lower edge anywhere (the bottom of a video window); `tint: false` keeps the words in their own colour and
// lets only the name chip show who speaks (the food-deep short's fx.say).
// From the podcast shorts: `fill` (fx.line) shows the whole line dim at once and lights each character as it is said, for good; `role`
// adds a smaller title to the name chip; `align: left` sets the caption flush with the safe area's left edge; `point` (fx.vsCaption)
// puts the name in a chip in the speaker's colour at the left of the line, with an arrow toward them (a split-screen talk).
// What a style looks like (its font, colours, box and decorations) is its look, one of looks/; this file lays out what every look
// shares: the line, its name, tag, gloss, position and animation.
import { animState, cssCamel, eBack, h, prog, textEm, type ItemType } from '@tellcut/engine';
import { charKinds, layoutMarkup } from '../markup.ts';
import { runBox, setRuns } from '../runs.ts';
import { freeCanvas } from '../inkline.ts';
import { LOOKS, lookOf } from './looks/index.ts';
import { speakerTextColor } from './colors.ts';
import { karaokeRange, charPopAt, saidLevel } from './words.ts';
import { ANIM_IN, ANIM_OUT, ENGINE_IN, ENGINE_OUT, lineAnim, WORD_IN } from './anim.ts';
import { drawWords, evenWords, setWords, WORD_FX, wordBox, wordsOf } from './wordfx.ts';
import { withTemplate } from './templates.ts';
import type { CaptionP, CaptionS, LookEnv } from './types.ts';

export { speakerTextColor } from './colors.ts';
export { karaokeRange, charPopAt, saidLevel } from './words.ts';
export { bigColorOf } from './looks/bold.ts';
export { qaBadge, qaBadgeColors } from './looks/layout.ts';
export { stripTilt } from './looks/paper.ts';
export { LOOKS, lookOf } from './looks/index.ts';
export { TEMPLATES, templateOf, withTemplate, type CaptionTemplate } from './templates.ts';
export type { CaptionLook, CaptionP, LookEnv } from './types.ts';

/** which colour parameter a style draws the line in: the ink (`outline`) on paper, `hl` for big (unless `bigColor` is set), else `color` */
export const lineColorKey = (style: string): 'outline' | 'hl' | 'color' => (lookOf(style).paper ? 'outline' : style === 'big' ? 'hl' : 'color');
/** the gloss's colour: its own, else the highlight colour (big: its line colour), or the ink on paper (the highlight colour does not read on it) */
export const glossColorOf = (p: { style: string; glossColor: string; hl: string; outline: string; bigColor?: string }) =>
  p.glossColor || (lookOf(p.style).paper && !lookOf(p.style).bareGloss ? p.outline : (p.style === 'big' && p.bigColor) || p.hl);

/** styles auto and big: their scale at `local` as they pop in over 0.14 s (auto from 0.88×, big from 0.6× with an overshoot); null for the others */
export const stylePop = (style: string, local: number): number | null => lookOf(style).popScale?.(local) ?? null;
/** the font a style brings: `styleFont`, else (unless the item sets its own `font`: `fontSet`) the look's own (handwriting for big,
 *  a serif for qa), else '' (the caption's own font) */
export const styleFontOf = (style: string, styleFont: string, fontSet = false) => styleFont || (fontSet ? '' : lookOf(style).font ?? '');
/** a text shadow with its px lengths times `by` (em lengths already follow the element's own size) */
export const scaleShadow = (shadow: string, by: number) => shadow.replace(/(-?\d*\.?\d+)px/g, (_m, v: string) => `${(parseFloat(v) * by).toFixed(2)}px`);

const STYLE_IDS = LOOKS.filter((l) => l.only !== 'title').map((l) => l.id);
/** an element's inline style gone, and cssCamel's memory of it (else it would skip setting the same values again) */
const clearStyle = (el: HTMLElement) => { el.removeAttribute('style'); delete (el as unknown as { _c?: unknown })._c; };
/** what of a look's box() decides the words' size (set before word effects measure them) */
const FONT_KEYS = new Set(['letterSpacing', 'wordSpacing', 'textTransform', 'lineHeight', 'fontStyle']);
/** what a look's box() may set beyond the basics, cleared first: switching looks on a caption leaves nothing of the last one;
 *  cleared in a call of its own before the box is styled: in one object a reset key would land after the look's background shorthand and wipe it */
const LOOK_RESET = { boxShadow: '', backdropFilter: '', letterSpacing: '', wordSpacing: '', textTransform: '', minWidth: '', borderLeft: '', backgroundColor: '', backgroundImage: '', backgroundSize: '', lineHeight: '1.25' };

export const caption: ItemType<CaptionP, CaptionS> = {
  type: 'common.caption', label: '字幕（共用）', category: 'caption', kind: 'overlay',
  doc: '一句字幕，外觀（style）、逐字效果（wordFx）、進場、出場、顏色和字型自由搭配；常用的組合是具名的字幕範本（npm run tellcut -- catalog CAP 列出全部，template 填它的 id，整支片用 c.captionTemplate）。words 是講話的逐字時間（speechCaptions 的 karaoke 會給），沒有時逐字效果照字數平均分配；【詞】變高亮色、{詞} 打碼成符號；name＋speaker 標出誰在說（speaker 1＝主題 accent2、2＝高亮色 hl、3＝主色 accent，tint 關掉時只有名字小牌換色，role 是名字旁的小字身分），point 把名字放進左邊的說話人小牌、箭頭指向說話的人；gloss 是下面小一號的翻譯；tag 是上方主色小牌；y 把下緣釘在任何高度；big 預設手寫、qa 預設襯線、neon 預設粉圓，styleFont 或項目自己的 font 會換掉；避開短影音的下緣與側邊安全區',
  params: [
    { key: 'text', label: '文字（【高亮】、{打碼}）', type: 'text', default: '字幕' },
    { key: 'template', label: '字幕範本（catalog CAP 列出全部；空＝專案的預設範本，沒有就照下面的參數）', type: 'string', default: '' },
    { key: 'style', label: '外觀（catalog CAP 列出用到它的範本）', type: 'enum', options: STYLE_IDS, default: 'outline' },
    { key: 'size', label: '字級（畫面高 %）', type: 'number', min: 1, max: 20, step: 0.1, default: 4.6 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.body' },
    { key: 'color', label: '文字顏色', type: 'color', default: '#ffffff' },
    { key: 'hl', label: '高亮顏色', type: 'color', default: '#ffe14d', theme: 'palette.hl' },
    { key: 'outline', label: '描邊顏色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'boxBg', label: '底框顏色（box 樣式）', type: 'color', default: '#000000b3' },
    { key: 'bubbleBg', label: '氣泡底色（bubble 樣式）', type: 'color', default: '#fff8ec', theme: 'palette.paper' },
    { key: 'accent', label: '外觀的第二色（霓虹講到的詞、漸層的下半、立體字的側面…；空＝外觀的預設）', type: 'color', default: '' },
    { key: 'position', label: '位置', type: 'enum', options: ['bottom', 'center', 'top'], default: 'bottom' },
    { key: 'animIn', label: '進場（pop 逐字彈出、bounce 整句彈出、blur 模糊淡入、drop 逐詞掉落、zoom 由大縮小、wipe 擦出、scatter 散開聚合、flip 翻轉、stretch 彈性拉伸、glitch 故障閃入、roll 滾上來）', type: 'enum', options: [...ANIM_IN], default: 'rise' },
    { key: 'animOut', label: '出場（blur 模糊、shrink 縮小、drop 掉落、wipe 擦掉）', type: 'enum', options: [...ANIM_OUT], default: 'fade' },
    { key: 'animDur', label: '動畫長度 (s)', type: 'number', min: 0, max: 3, step: 0.05, default: 0.3 },
    { key: 'wordFx', label: '逐字效果（auto＝有 words 時講到的詞變色；color 變色放大、box 底塊跟著詞滑、one 一次一個詞、pop 逐詞彈出、fill 逐字點亮、underline 底線畫過、type 打字機、wave 波浪；沒有 words 時照字數平均分配到整句）', type: 'enum', options: [...WORD_FX], default: 'auto' },
    { key: 'words', label: '逐字跳亮（[[秒, 已說出的字數], …]；空＝整句一起）', type: 'json', default: [] },
    { key: 'speaker', label: '說話者（0＝一般字色，1＝主題 accent2、2＝高亮色 hl、3＝主色 accent）', type: 'number', min: 0, max: 3, step: 1, default: 0 },
    { key: 'name', label: '說話者名字（顯示在字幕上方；空＝不顯示）', type: 'string', default: '' },
    { key: 'hlScale', label: '高亮字放大（倍）', type: 'number', min: 1, max: 1.6, step: 0.02, default: 1 },
    { key: 'tag', label: '上方主色小牌（菜名、地點；空＝不顯示）', type: 'string', default: '' },
    { key: 'gloss', label: '下方小一號的翻譯（原音外文字幕的中文；空＝不顯示）', type: 'string', default: '' },
    { key: 'glossSize', label: '翻譯的字級（字幕字級的倍數；雙語字幕用 0.75 左右）', type: 'number', min: 0.3, max: 1, step: 0.01, default: 0.52 },
    { key: 'glossColor', label: '翻譯的顏色（空＝高亮顏色；bubble、ticket、crayon、strip 是字的墨色）', type: 'color', default: '' },
    { key: 'quote', label: '加引號、斜體（引用原音）', type: 'bool', default: false },
    { key: 'y', label: '下緣位置（畫面高比例；-1＝照 position）', type: 'number', min: -1, max: 1, step: 0.005, default: -1 },
    { key: 'tint', label: '字跟著說話者換色（關掉＝只有名字小牌換色）', type: 'bool', default: true },
    { key: 'fill', label: '逐字變亮（配 words：整句先淡淡出現，講到的字亮起來就不再暗回去）', type: 'bool', default: false },
    { key: 'role', label: '名字旁的小字身分（主持人、老師；空＝不顯示）', type: 'string', default: '' },
    { key: 'align', label: '對齊（center 置中、left 靠左）', type: 'enum', options: ['center', 'left'], default: 'center' },
    { key: 'point', label: '左邊的說話人小牌與箭頭方向（none 不要；名字放進小牌）', type: 'enum', options: ['none', 'up', 'down', 'left', 'right'], default: 'none' },
    { key: 'styleFont', label: '樣式字型（big、qa；空＝項目有自己給 font 就用它，否則 big 用 LXGW WenKai TC 手寫、qa 用 Noto Serif TC）', type: 'string', default: '' },
    { key: 'bigColor', label: 'big 的字色（空＝說話者的顏色，沒有 speaker 時是高亮顏色 hl）', type: 'color', default: '' },
    { key: 'badgeTint', label: 'qa 的名字徽章用說話者的顏色（關掉＝speaker 大於 0 一律主色）', type: 'bool', default: false },
  ],
  build(ctx) {
    // style qa's wash: under the box, across the whole frame
    const wash = h('div', null, null, ctx.root);
    cssCamel(wash, { position: 'absolute', left: '0', width: '100%', display: 'none', pointerEvents: 'none' });
    const box = h('div', null, null, ctx.root);
    cssCamel(box, { position: 'absolute', left: '50%', textAlign: 'center', whiteSpace: 'pre', lineHeight: '1.25' });
    // the crayon band: behind the words inside the box (the box's transform makes it a stacking context, so z-index −1 stays in it)
    const band = h('canvas', null, null, box) as HTMLCanvasElement;
    cssCamel(band, { position: 'absolute', display: 'none', zIndex: '-1', pointerEvents: 'none' });
    const name = h('div', null, null, box), nameText = h('span', null, null, name), role = h('span', null, null, name);
    cssCamel(name, { position: 'absolute', left: '50%', bottom: '100%', fontWeight: '900', whiteSpace: 'pre', webkitTextStroke: '0' });
    cssCamel(role, { display: 'none', fontWeight: '700', opacity: '0.85', marginLeft: '0.4em', fontSize: '0.72em', letterSpacing: '0.08em' });
    const chip = h('div', null, null, box), arrow = h('div', null, null, chip), chipName = h('div', null, null, chip);
    cssCamel(chip, { position: 'absolute', left: '0', top: '50%', display: 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box', webkitTextStroke: '0', textShadow: 'none', fontStyle: 'normal' });
    cssCamel(arrow, { width: '0', height: '0' });
    cssCamel(chipName, { fontWeight: '900', lineHeight: '1', whiteSpace: 'pre' });
    const tag = h('div', null, null, box);
    cssCamel(tag, { position: 'absolute', left: '50%', fontWeight: '900', whiteSpace: 'pre', webkitTextStroke: '0', lineHeight: '1.25', transformOrigin: '50% 100%' });
    // the gloss: in the box's flow under the line, so it is on the box's paper or bar, inside the ticket's torn edges, under the
    // outline's stroke, and wraps at the box's width
    // the words one span each (wordfx.ts), shown instead of the runs when a word effect or the look needs them
    const words = wordBox(box), text = runBox(box), gloss = h('div', null, null, box);
    cssCamel(words.el, { display: 'none' });
    cssCamel(gloss, { fontWeight: '700', whiteSpace: 'pre-wrap', fontStyle: 'normal' });
    return { box, text, words, name, tag, gloss, nameText, role, chip, arrow, chipName, band, layer: {}, wash };
  },
  hide(s) { freeCanvas(s.band); s.layer.cv = undefined; },
  draw(ctx, s) {
    // its own parameters, then its template's (or the project's default template), then the defaults and the theme
    const p = withTemplate(ctx.params, ctx.item?.params, ctx.project?.meta?.captionTemplate, ctx.project?.meta?.captionTemplates as Record<string, Record<string, unknown>> | undefined), { W, H, theme } = ctx, k = Math.min(W, H) / 1080, look = lookOf(p.style);
    // the engine draws the first entrances and exits (animState); the others are lineAnim's and the word effects'
    const pop = p.animIn === 'pop', st = animState({ ...p, animIn: pop || !ENGINE_IN.has(p.animIn) ? 'none' : p.animIn, animOut: ENGINE_OUT.has(p.animOut) ? p.animOut : 'none' }, ctx.local, ctx.dur, W, H), px = (p.size / 100) * H * (look.sizeScale ?? 1), hs = Math.max(1, p.hlScale ?? 1);
    const width = W * (1 - 2 * theme.safe.side);
    const hasWords = Array.isArray(p.words) && p.words.length > 0, fill = !!p.fill && hasWords, point = p.point && p.point !== 'none', left = p.align === 'left' || !!look.left;
    // `words` counts the characters of the text as written; quoted, every count is one on for the opening mark, and a step that has
    // said the whole line says the closing one too (else karaoke and the word effects ran a character behind the voice)
    const said = charKinds(String(p.text ?? '')).length, steps: Array<[number, number]> = !hasWords ? [] : p.quote ? p.words.map(([t, n]) => [t, n + 1 + (n >= said ? 1 : 0)]) : p.words;
    // a word effect, a look styling its words one by one, or an entrance moving them draws a span a word; else the runs
    const fx = p.wordFx && p.wordFx !== 'auto' ? p.wordFx : 'auto', wordMode = (fx !== 'auto' && fx !== 'none') || !!look.word || WORD_IN.has(p.animIn);
    const lit = !wordMode && hasWords && !fill ? karaokeRange(steps, ctx.local) : null;
    // the speaker's colour; with tint off the words keep their own colour and only the name chip (or the point chip) shows it
    const who = speakerTextColor(p.speaker ?? 0, p.color, theme), ink = p.tint === false ? p.color : who;
    const pre = { p, theme, W, H, local: ctx.local, k, px, who, ink, left, opacity: st.opacity };
    // the room the words have: the look's box takes its padding out, the speaker chip of `point` 2.05 em at the left
    // as a function of the font size: the padding and borders it takes out shrink with the words when they shrink to fit, so the line
    // breaking gets the room at size 0 (a share of the width) and the rest as em of the drawn font (ribbon's real 1.8 em, taken at
    // full size, broke a title shrunk to 0.7 into three lines)
    const roomAt = (x: number) => (look.room ? look.room({ ...pre, px: x }, width) : width) - (point ? 2.05 * x : 0), room = roomAt(px), text = p.quote ? `“${p.text}”` : p.text;
    // one word at a time: the line is never shrunk to fit whole, only so that its longest word fits on a line of its own
    // the words are only drawn one by one in word mode (a word effect, `one` among them): a plain line skips the segmenter every frame
    const plain = charKinds(text).map((c) => c.c).join(''), list = !wordMode ? [] : hasWords ? wordsOf(steps, [...plain].length, plain) : evenWords(plain, ctx.dur);
    const oneFit = fx === 'one' ? Math.min(1, room / px / Math.max(1e-6, ...list.map((w) => textEm([...plain].slice(w.a, w.b).join('').trim()) * 1.08))) : 1;
    // one word at a time: one line (the words not being said are hidden), never broken inside a word (extrude-one split missed.)
    const fit = fx === 'one' ? layoutMarkup(text, 1e6, 1, st.typed, lit) : layoutMarkup(text, roomAt(0) / px / hs, p.maxLines ?? 2, st.typed, lit, Math.max(0, roomAt(0) - room) / px / hs);
    if (fx === 'one') fit.scale = oneFit;
    const fs = px * fit.scale, la = lineAnim(p.animIn, p.animOut, ctx.local, ctx.dur, p.animDur, fs), e: LookEnv = { ...pre, fs, opacity: st.opacity * la.opacity };
    // the font first: word effects measure the words (a growing word's room, the sliding box), which must already be in it
    const sfont = styleFontOf(p.style, p.styleFont, !!ctx.item?.params?.font || p.font !== ctx.params.font), boxCss = look.box?.(e) ?? {};
    cssCamel(s.box, LOOK_RESET);
    cssCamel(s.box, { fontFamily: `'${sfont || p.font}', 'Noto Sans TC', sans-serif`, fontSize: `${e.fs.toFixed(2)}px`, fontWeight: look.weight ?? '900', fontStyle: p.quote ? 'italic' : 'normal',
      ...Object.fromEntries(Object.entries(boxCss).filter(([k]) => FONT_KEYS.has(k))) });
    cssCamel(s.text.el, { display: wordMode ? 'none' : '' });
    cssCamel(s.words.el, { display: wordMode ? '' : 'none' });
    if (wordMode) {
      const ws0 = look.word?.(e) ?? {}, hot = look.hl ? look.hl(pre) : p.hl;
      const ws = { ...ws0, hot: { color: hot, ...look.wordHot?.(e), ...ws0.hot }, onbox: { color: theme.palette.ink, webkitTextStroke: '0', textShadow: 'none', filter: 'none', ...ws0.onbox } };
      setWords(s.words, fit.lines, fit.starts, list);
      for (const l of s.words.lines) { clearStyle(l); cssCamel(l, { position: 'relative' }); }
      look.lines?.(s.words.lines, pre, true);
      // auto: what words did before there were word effects (lighting up the word being said, or dim until said with fill)
      drawWords(s.words, { fx: fx === 'auto' ? (hasWords ? (fill ? 'fill' : 'color') : 'none') : fx, words: list, local: ctx.local, dur: ctx.dur, fs, ws, animIn: p.animIn, boxColor: ws.box ?? hot, hlScale: hs });
    } else {
      setRuns(s.text, fit.lines, look.hl ? look.hl(pre) : p.hl, { perChar: pop || fill, hlScale: hs });
      // a line keeps no look of the last style (strips, slabs): only what this look sets
      const lines = [...s.text.el.children] as HTMLElement[];
      for (const l of lines) clearStyle(l);
      look.lines?.(lines, pre);
    }
    if (pop && !wordMode) {
      const chars = [...s.text.el.querySelectorAll('span')] as HTMLElement[];
      chars.forEach((el, i) => { const c = charPopAt(i, chars.length, ctx.local); cssCamel(el, { opacity: String(c.opacity), transform: `translateY(${(c.rise * 34 * k).toFixed(2)}px) scale(${c.scale.toFixed(4)})` }); });
    }
    if (fill && !wordMode) {   // every character dim until it is said, then lit for good (times on pop's own opacity when both are on)
      const chars = [...s.text.el.querySelectorAll('span')] as HTMLElement[];
      chars.forEach((el, i) => { const o = 0.32 + 0.68 * saidLevel(steps, i, ctx.local); cssCamel(el, { opacity: String(pop ? o * charPopAt(i, chars.length, ctx.local).opacity : o) }); });
    }
    // the speaker's name: a small chip in their colour above the caption (unless the look draws it its own way)
    s.nameText.textContent = p.name ?? ''; s.role.textContent = p.role ?? '';
    cssCamel(s.role, { display: p.role ? 'inline' : 'none' });
    if (!look.name?.(s, e)) {
      cssCamel(s.name, { display: p.name && !point ? 'block' : 'none', alignItems: '', justifyContent: '', top: '', bottom: '100%', width: '', minWidth: '', boxSizing: '', height: '', fontStyle: '', lineHeight: '', textShadow: '', left: left ? '0' : '50%', transform: left ? 'translate(0, -0.25em)' : 'translate(-50%, -0.25em)', fontSize: '0.55em', padding: '0.1em 0.55em', borderRadius: `${theme.radius * 0.5 * k}px`,
        background: p.speaker ? who : theme.palette.ink, color: p.speaker ? theme.palette.ink : '#ffffff' });
      cssCamel(s.nameText, { fontSize: '' });
    }
    // the tag: a chip in the accent colour, above the name when there is one; it pops in with the caption
    const tq = prog(ctx.local, 0, 0.25);
    s.tag.textContent = p.tag ?? '';
    cssCamel(s.tag, { display: p.tag ? 'block' : 'none', bottom: p.name ? 'calc(100% + 1.6em)' : '100%', fontSize: '0.55em', padding: '0.1em 0.55em', borderRadius: `${theme.radius * 0.4 * k}px`,
      left: left ? '0' : '50%', background: theme.palette.accent, color: '#ffffff', letterSpacing: '0.06em', transform: `translate(${left ? '0' : '-50%'}, -0.35em) scale(${(0.6 + 0.4 * eBack(tq, 1.9)).toFixed(4)}) rotate(-2deg)` });
    const place = (p.y ?? -1) >= 0 ? { bottom: `${(1 - p.y) * H}px`, top: '', yAnchor: '0px' } : p.position === 'bottom' ? { bottom: `${theme.safe.bottom * H}px`, top: '', yAnchor: '0px' } : p.position === 'top' ? { top: `${theme.safe.top * H}px`, bottom: '', yAnchor: '0px' } : { top: '50%', bottom: '', yAnchor: '-50%' };
    const stroke = look.stroke?.(e) ?? 0;
    // the gloss: a smaller line under the caption, inside its box (see build), 0.1 em of the caption below it
    const gs = p.glossSize ?? 0.52, gl = look.gloss?.(s, e) ?? {};
    s.gloss.textContent = p.gloss ?? '';
    // the gloss would inherit the look's text shadow at the line's size (giant's, under a gloss a tenth its size, was a ghost copy of
    // it): its own copy, scaled to it, unless the look gives the gloss a shadow of its own
    cssCamel(s.gloss, { fontSize: `${gs}em`, color: glossColorOf(p), fontFamily: `'${theme.fonts.display}', 'Noto Sans TC', sans-serif`,
      margin: `${(0.1 / gs).toFixed(4)}em 0 0`, webkitTextStroke: '', textShadow: boxCss.textShadow ? scaleShadow(boxCss.textShadow, gs) : '', padding: '', background: '', borderRadius: '', boxShadow: '', transform: '', ...gl, display: p.gloss ? gl.display ?? 'block' : 'none' });
    // a look that pops in by itself (auto, big) fades in with it
    const pq = prog(ctx.local, 0, 0.14), sc = look.popScale?.(ctx.local), pin = sc !== undefined ? ` scale(${sc.toFixed(4)})` : look.pin?.(e) ?? '';
    // point: a chip in the speaker's colour at the left, an arrow toward them over their name
    cssCamel(s.chip, { display: point ? 'flex' : 'none', width: '1.5em', height: '2.05em', gap: '0.13em', borderRadius: '0.3em', background: p.speaker ? who : theme.palette.accent, transform: 'translateY(-50%)' });
    if (point) {
      const a = '0.34em solid transparent', solid = `0.55em solid ${p.bubbleBg}`;
      cssCamel(s.arrow, p.point === 'up' || p.point === 'down'
        ? { borderLeft: a, borderRight: a, borderTop: p.point === 'down' ? solid : '0', borderBottom: p.point === 'up' ? solid : '0' }
        : { borderTop: a, borderBottom: a, borderLeft: p.point === 'right' ? solid : '0', borderRight: p.point === 'left' ? solid : '0' });
      s.chipName.textContent = p.name ?? '';
      cssCamel(s.chipName, { display: p.name ? 'block' : 'none', fontSize: `${Math.min(0.47, 1.25 / Math.max(1, [...(p.name ?? '')].length)).toFixed(3)}em`, color: p.bubbleBg });
    }
    if (la.filter) boxCss.filter = [boxCss.filter, la.filter].filter(Boolean).join(' ');
    // a look's own clip (ticket's teeth, scrap's deckle, from clip() or its box) keeps the box's clip-path, and a wipe goes to a mask:
    // one clip-path holds one shape, and the look's replaced the wipe
    const lookClip = look.clip?.(e) ?? boxCss.clipPath ?? '', clip = lookClip || la.clip || 'none', mask = lookClip && la.clip ? la.mask : '';
    cssCamel(s.box, {
      // max-content: a box set at left 50% would otherwise be given only the right half of the frame, and its gloss broke there
      top: place.top, bottom: place.bottom, width: 'max-content', maxWidth: `${width}px`, opacity: String(st.opacity * la.opacity * (look.popScale ? pq : 1)), left: left ? `${theme.safe.side * W}px` : '50%', textAlign: left ? 'left' : 'center',
      transform: `translate(${left ? `${st.x}px` : `calc(-50% + ${st.x}px)`}, calc(${place.yAnchor} + ${st.y}px))${pin}${la.transform}`, transformOrigin: look.origin ?? (left ? '0 100%' : '50% 100%'),
      fontFamily: `'${sfont || p.font}', 'Noto Sans TC', sans-serif`, fontSize: `${e.fs.toFixed(2)}px`, fontWeight: look.weight ?? '900', fontStyle: p.quote ? 'italic' : 'normal',
      color: look.color ? look.color(e) : ink, webkitTextStroke: stroke ? `${stroke}px ${look.strokeColor ? look.strokeColor(e) : p.outline}` : '0', paintOrder: 'stroke fill',
      textShadow: '', background: 'transparent', padding: '0', borderRadius: '0', border: '0 solid transparent', filter: '', ...boxCss, clipPath: clip, maskImage: mask, boxSizing: 'border-box',
      ...(point ? { paddingLeft: '2.05em', minHeight: '2.05em', display: 'flex', flexDirection: 'column', justifyContent: 'center' } : { display: '', flexDirection: '', justifyContent: '' }),
    });
    // decorations that measure the styled box (crayon's band, qa's wash): hidden unless the look draws them
    cssCamel(s.band, { display: 'none' });
    cssCamel(s.wash, { display: 'none' });
    look.after?.(s, e);
  },
};
