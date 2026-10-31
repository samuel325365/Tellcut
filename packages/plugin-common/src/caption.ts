// common.caption — a caption in the project's look: outlined, plain or on a box; 【word】 highlighted, {word} bleeped. With `words` the
// word being said lights up (karaoke); `speaker` colours it by who speaks, `name` puts their name above it, `tag` a chip in the accent
// colour (a dish, a place). animIn 'pop' pops the characters in one by one (from a food-review hook short's quote captions).
// `quote` puts the line in curly quotes and italics and `gloss` adds a smaller translation under it (the baking-sin short's kept English line);
// `glossSize` and `glossColor` make that a bilingual subtitle (the showcase films' English narration over Chinese).
// style 'ticket' prints the line on a strip of receipt paper with torn edges that pops up from below (the food-receipt short's
// fx.ticketCap); `y` pins the caption's lower edge anywhere (the bottom of a video window); `tint: false` keeps the words in their
// own colour and lets only the name chip show who speaks (the food-deep short's fx.say).
// From the podcast shorts: `fill` (fx.line) shows the whole line dim at once and lights each character as it is said, for good; `role`
// adds a smaller title to the name chip; `align: left` sets the caption flush with the safe area's left edge; `point` (fx.vsCaption)
// puts the name in a chip in the speaker's colour at the left of the line, with an arrow toward them (a split-screen talk).
// style 'crayon' (fd-tangyuan's fx.tyCap) sets the words in ink on a band of the highlight colour scribbled in crayon behind them.
// style 'bar' (t2-search's fx.sCap): white words on a dark rounded bar with a thin accent2 strip down its left side (a search snippet).
// style 'qa' (t2-magazine's fx.magSubs): an interview subtitle set flush left in a serif over a dark wash rising from below the
// lines, with `name` (Q, A) in a square badge at the left of the first line; a speaker above 0 fills the badge in the accent colour.
// styles 'auto' and 'big' (t2-reels's fx.reelsCap): a social app's automatic caption (white on a dark rounded box, popping in
// from 0.88×) and its big sticker words (handwriting in the highlight colour with a thick ink outline, popping in from 0.6×).
// style 'strip' (the todo-vlog short's fx.saycap): ink words printed on strips of paper, one strip a line, each tilted a little the
// other way; with `words` the word being said gets a highlighter stroke behind it instead of changing colour.
import { animState, clamp, cssCamel, eBack, eOut3, h, lerp, prog, type ItemType, type Theme } from '@tellcut/engine';
import { layoutMarkup } from './markup.ts';
import { runBox, setRuns, type RunBox } from './runs.ts';
import { canvasAt, freeCanvas } from './inkline.ts';
import { grainBegin, grainEnd, scribbleFill, type GrainLayer, type Pt } from './sketch.ts';

interface P {
  text: string; style: 'outline' | 'plain' | 'box' | 'bubble' | 'ticket' | 'crayon' | 'bar' | 'qa' | 'auto' | 'big' | 'strip'; styleFont: string; y: number; tint: boolean; size: number; font: string; color: string; hl: string; outline: string; boxBg: string; bubbleBg: string;
  position: 'bottom' | 'center' | 'top'; animIn: string; animOut: string; animDur: number; words: Array<[number, number]>; speaker: number; name: string;
  hlScale: number; tag: string; gloss: string; glossSize: number; glossColor: string; quote: boolean; fill: boolean; role: string; align: 'center' | 'left'; point: 'none' | 'up' | 'down' | 'left' | 'right';
}
interface S { box: HTMLElement; text: RunBox; name: HTMLElement; tag: HTMLElement; gloss: HTMLElement; nameText: HTMLElement; role: HTMLElement; chip: HTMLElement; arrow: HTMLElement; chipName: HTMLElement; band: HTMLCanvasElement; layer: GrainLayer; wash: HTMLElement }

/** character i of n popping in at `local`: the start is 0.08 s, then one every 0.04 s (closer when there are more than 15) */
export function popAt(i: number, n: number, local: number) {
  const step = Math.min(0.04, 0.6 / Math.max(1, n)), q = prog(local, 0.08 + i * step, 0.26 + i * step);
  return { opacity: clamp(q * 3), rise: 1 - eOut3(q), scale: 0.7 + 0.3 * eBack(q, 1.9) };
}

/** `words` steps [seconds, visible characters said by then]: the characters of the word being said at `local`, or null before the first */
export function karaokeRange(words: Array<[number, number]>, local: number): [number, number] | null {
  let i = -1;
  for (let k = 0; k < words.length; k++) if (words[k][0] <= local + 1e-6) i = k;
  return i < 0 ? null : [i ? words[i - 1][1] : 0, words[i][1]];
}

/** `fill`: how lit visible character i is at `local` (0 dim, 1 said): it lights over 0.14 s from the step in `words` that says it */
export function saidLevel(words: Array<[number, number]>, i: number, local: number) {
  const step = words.find((w) => w[1] > i);
  return step ? prog(local, step[0] - 0.04, step[0] + 0.1) : 0;
}

/** the styles that print the line in ink on paper (a bubble, a ticket, the crayon band, strips): a gloss there is ink too */
const PAPER = new Set(['bubble', 'ticket', 'crayon', 'strip']);
/** which colour parameter a style draws the line in: the ink (`outline`) on paper, `hl` for big, else `color` */
export const lineColorKey = (style: string): 'outline' | 'hl' | 'color' => (PAPER.has(style) ? 'outline' : style === 'big' ? 'hl' : 'color');
/** the gloss's colour: its own, else the highlight colour, or the ink on paper (the highlight colour does not read on it) */
export const glossColorOf = (p: { style: string; glossColor: string; hl: string; outline: string }) => p.glossColor || (PAPER.has(p.style) ? p.outline : p.hl);

/** the text colour of speaker 0–3: 0 the caption's own, then the theme's accent2, hl and accent */
export const speakerColor = (speaker: number, color: string, theme: Theme) => [color, theme.palette.accent2, theme.palette.hl, theme.palette.accent][Math.max(0, Math.min(3, Math.round(speaker)))];

/** styles auto and big: their scale at `local` as they pop in over 0.14 s (auto from 0.88×, big from 0.6× with an overshoot); null for the others */
export function stylePop(style: string, local: number): number | null {
  const q = prog(local, 0, 0.14);
  return style === 'auto' ? lerp(0.88, 1, eOut3(q)) : style === 'big' ? lerp(0.6, 1, eBack(q, 1.7)) : null;
}
/** the font a style brings: `styleFont`, else handwriting for big and a serif for qa, else '' (the caption's own font) */
export const styleFontOf = (style: string, styleFont: string) => styleFont || (style === 'big' ? 'LXGW WenKai TC' : style === 'qa' ? 'Noto Serif TC' : '');

export const caption: ItemType<P, S> = {
  type: 'common.caption', label: '字幕（共用）', category: 'text', kind: 'overlay',
  doc: '一句字幕：描邊／純字／底框／氣泡（米白底粗黑框、強調字用主色）／ticket（印在一小條鋸齒撕邊的收據紙上、從下面彈出來）、crayon（墨色字壓在一條用蠟筆塗出來的高亮色底帶上，繪本、手作風）、bar（深色圓角橫條、左側一條 accent2 色條，像搜尋摘要）、qa（雜誌訪談字幕：靠左的襯線字壓在從下往上的深色漸層上，name 放進第一行左邊的方形徽章，例如 Q、A；speaker 大於 0 時徽章是主色）、auto（社群平台的自動字幕：深色圓角底白字，從 0.88 倍彈出）、big（社群平台的大字貼圖：手寫字、高亮色、粗黑描邊，放大 1.25 倍，從 0.6 倍彈出）、strip（手帳風：一行一條微歪的米色紙條、墨色字，配 words 時講到的詞後面刷一道高亮色螢光筆）十一種樣式；y 可以把字幕下緣釘在任何高度（例如影片窗下緣）；name＋speaker 標出誰在說（tint 關掉時字不變色、只有名字小牌換色；role 在名字旁加小字身分）；fill 配 words 是整句先淡淡出現、講到的字一個個亮起來不再暗回去；align left 靠左對齊；point 把名字放進字幕左邊一塊說話人顏色的小牌，箭頭指向說話的人（上下分割的對談）；【詞】會變高亮色、{詞} 會被打碼成符號；避開短影音的下緣與側邊安全區',
  params: [
    { key: 'text', label: '文字（【高亮】、{打碼}）', type: 'text', default: '字幕' },
    { key: 'style', label: '樣式（crayon：蠟筆塗的高亮色底帶；bar 搜尋摘要條、qa 訪談字幕、auto 自動字幕、big 大字貼圖、strip 一行一條微歪的紙條、講到的詞後面刷螢光筆）', type: 'enum', options: ['outline', 'plain', 'box', 'bubble', 'ticket', 'crayon', 'bar', 'qa', 'auto', 'big', 'strip'], default: 'outline' },
    { key: 'size', label: '字級（畫面高 %）', type: 'number', min: 1, max: 20, step: 0.1, default: 4.6 },
    { key: 'font', label: '字型', type: 'string', default: 'Noto Sans TC', theme: 'fonts.body' },
    { key: 'color', label: '文字顏色', type: 'color', default: '#ffffff' },
    { key: 'hl', label: '高亮顏色', type: 'color', default: '#ffe14d', theme: 'palette.hl' },
    { key: 'outline', label: '描邊顏色', type: 'color', default: '#1a1a1a', theme: 'palette.ink' },
    { key: 'boxBg', label: '底框顏色（box 樣式）', type: 'color', default: '#000000b3' },
    { key: 'bubbleBg', label: '氣泡底色（bubble 樣式）', type: 'color', default: '#fff8ec', theme: 'palette.paper' },
    { key: 'position', label: '位置', type: 'enum', options: ['bottom', 'center', 'top'], default: 'bottom' },
    { key: 'animIn', label: '進場', type: 'enum', options: ['none', 'fade', 'rise', 'slide', 'typewriter', 'pop'], default: 'rise' },
    { key: 'animOut', label: '出場', type: 'enum', options: ['none', 'fade', 'rise', 'slide'], default: 'fade' },
    { key: 'animDur', label: '動畫長度 (s)', type: 'number', min: 0, max: 3, step: 0.05, default: 0.3 },
    { key: 'words', label: '逐字跳亮（[[秒, 已說出的字數], …]；空＝整句一起）', type: 'json', default: [] },
    { key: 'speaker', label: '說話者（0＝一般字色，1–3＝不同顏色）', type: 'number', min: 0, max: 3, step: 1, default: 0 },
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
    { key: 'styleFont', label: '樣式字型（big、qa；空＝big 用 LXGW WenKai TC 手寫、qa 用 Noto Serif TC）', type: 'string', default: '' },
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
    const text = runBox(box), gloss = h('div', null, null, box);
    cssCamel(gloss, { fontWeight: '700', whiteSpace: 'pre-wrap', fontStyle: 'normal' });
    return { box, text, name, tag, gloss, nameText, role, chip, arrow, chipName, band, layer: {}, wash };
  },
  hide(s) { freeCanvas(s.band); s.layer.cv = undefined; },
  draw(ctx, s) {
    const p = ctx.params, { W, H, theme } = ctx, k = Math.min(W, H) / 1080;
    const bar = p.style === 'bar', qa = p.style === 'qa', auto = p.style === 'auto', big = p.style === 'big';
    const pop = p.animIn === 'pop', st = animState(pop ? { ...p, animIn: 'none' } : p, ctx.local, ctx.dur, W, H), px = (p.size / 100) * H * (big ? 1.25 : 1), hs = Math.max(1, p.hlScale ?? 1);
    // a box or bubble takes 0.6 em of padding each side and its border out of the room the words have
    const ticket = p.style === 'ticket', crayon = p.style === 'crayon', strip = p.style === 'strip', framed = p.style === 'box' || p.style === 'bubble' || ticket || crayon || strip, width = W * (1 - 2 * theme.safe.side);
    const hasWords = Array.isArray(p.words) && p.words.length > 0, fill = !!p.fill && hasWords, point = p.point && p.point !== 'none', left = p.align === 'left' || qa;
    const lit = hasWords && !fill ? karaokeRange(p.words, ctx.local) : null;
    // the speaker chip of `point` takes 2.05 em at the left
    const extra = bar ? 1.65 : auto ? 0.96 : qa ? 1.45 : 0;
    const room = (extra ? width - extra * px : framed ? width - 1.2 * px - (p.style === 'bubble' ? 2 * theme.stroke * k : 0) : width) - (point ? 2.05 * px : 0), fit = layoutMarkup(p.quote ? `“${p.text}”` : p.text, room / px / hs, 2, st.typed, lit);
    setRuns(s.text, fit.lines, p.style === 'bubble' || crayon ? theme.palette.accent : big ? p.color : strip ? p.outline : p.hl, { perChar: pop || fill, hlScale: hs });
    if (strip) paperStrips(s.text.el, p, left, k);
    if (pop) {
      const chars = [...s.text.el.querySelectorAll('span')] as HTMLElement[];
      chars.forEach((el, i) => { const c = popAt(i, chars.length, ctx.local); cssCamel(el, { opacity: String(c.opacity), transform: `translateY(${(c.rise * 34 * k).toFixed(2)}px) scale(${c.scale.toFixed(4)})` }); });
    }
    if (fill) {   // every character dim until it is said, then lit for good (times on pop's own opacity when both are on)
      const chars = [...s.text.el.querySelectorAll('span')] as HTMLElement[];
      chars.forEach((el, i) => { const o = 0.32 + 0.68 * saidLevel(p.words, i, ctx.local); cssCamel(el, { opacity: String(pop ? o * popAt(i, chars.length, ctx.local).opacity : o) }); });
    }
    // the speaker's colour; with tint off the words keep their own colour and only the name chip (or the point chip) shows it
    const who = speakerColor(p.speaker ?? 0, p.color, theme), ink = p.tint === false ? p.color : who;
    // the speaker's name: a small chip in their colour above the caption
    s.nameText.textContent = p.name ?? ''; s.role.textContent = p.role ?? '';
    cssCamel(s.role, { display: p.role ? 'inline' : 'none' });
    if (qa) {   // a square badge at the left of the first line: the accent colour for a speaker above 0, else the caption colour
      cssCamel(s.name, { display: p.name ? 'flex' : 'none', alignItems: 'center', justifyContent: 'center', left: '0', top: '0.11em', bottom: '', width: '1.03em', height: '1.03em', transform: 'none', fontSize: '1em', padding: '0', borderRadius: '0',
        background: p.speaker ? theme.palette.accent : p.color, color: p.speaker ? '#ffffff' : theme.palette.ink, fontStyle: 'italic', lineHeight: '1', textShadow: 'none' });
      cssCamel(s.nameText, { fontSize: '0.83em' });
    } else {
      cssCamel(s.name, { display: p.name && !point ? 'block' : 'none', alignItems: '', justifyContent: '', top: '', bottom: '100%', width: '', height: '', fontStyle: '', lineHeight: '', textShadow: '', left: left ? '0' : '50%', transform: left ? 'translate(0, -0.25em)' : 'translate(-50%, -0.25em)', fontSize: '0.55em', padding: '0.1em 0.55em', borderRadius: `${theme.radius * 0.5 * k}px`,
        background: p.speaker ? who : theme.palette.ink, color: p.speaker ? theme.palette.ink : '#ffffff' });
      cssCamel(s.nameText, { fontSize: '' });
    }
    // the tag: a chip in the accent colour, above the name when there is one; it pops in with the caption
    const tq = prog(ctx.local, 0, 0.25);
    s.tag.textContent = p.tag ?? '';
    cssCamel(s.tag, { display: p.tag ? 'block' : 'none', bottom: p.name ? 'calc(100% + 1.6em)' : '100%', fontSize: '0.55em', padding: '0.1em 0.55em', borderRadius: `${theme.radius * 0.4 * k}px`,
      left: left ? '0' : '50%', background: theme.palette.accent, color: '#ffffff', letterSpacing: '0.06em', transform: `translate(${left ? '0' : '-50%'}, -0.35em) scale(${(0.6 + 0.4 * eBack(tq, 1.9)).toFixed(4)}) rotate(-2deg)` });
    const place = (p.y ?? -1) >= 0 ? { bottom: `${(1 - p.y) * H}px`, top: '', yAnchor: '0px' } : p.position === 'bottom' ? { bottom: `${theme.safe.bottom * H}px`, top: '', yAnchor: '0px' } : p.position === 'top' ? { top: `${theme.safe.top * H}px`, bottom: '', yAnchor: '0px' } : { top: '50%', bottom: '', yAnchor: '-50%' };
    const stroke = p.style === 'outline' ? theme.stroke * k : big ? 0.14 * px : 0;
    // the gloss: a smaller line under the caption, inside its box (see build), 0.1 em of the caption below it; on strips a strip of
    // its own; big's thick outline thinned with its size
    const gs = p.glossSize ?? 0.52;
    s.gloss.textContent = p.gloss ?? '';
    cssCamel(s.gloss, { display: p.gloss ? (strip ? 'table' : 'block') : 'none', fontSize: `${gs}em`, color: glossColorOf(p), fontFamily: `'${theme.fonts.display}', 'Noto Sans TC', sans-serif`,
      margin: strip ? `0.3em ${left ? '0' : 'auto'} 0` : `${(0.1 / gs).toFixed(4)}em 0 0`, webkitTextStroke: big ? `${(stroke * gs).toFixed(2)}px ${p.outline}` : '',
      ...(strip ? { padding: '0.06em 0.42em 0.1em', background: p.bubbleBg, borderRadius: `${8 * k}px`, boxShadow: `0 ${5 * k}px ${16 * k}px rgba(20,12,6,0.3)`, transform: `rotate(${stripTilt(s.text.el.children.length)}deg)` }
        : { padding: '', background: '', borderRadius: '', boxShadow: '', transform: '' }) });
    // the ticket: torn top and bottom edges (30 teeth), a slight tilt of its own, popped up from its lower edge
    let teeth = 'none', pin = '';
    if (ticket) {
      const pts: string[] = [], n = 30;
      for (let i = 0; i <= n; i++) pts.push(`${((i / n) * 100).toFixed(2)}% ${i % 2 ? '0px' : '0.15em'}`);
      for (let i = n; i >= 0; i--) pts.push(`${((i / n) * 100).toFixed(2)}% calc(100% - ${i % 2 ? '0px' : '0.15em'})`);
      teeth = `polygon(${pts.join(', ')})`;
      const q = eBack(prog(ctx.local, 0, 0.22), 1.9), tilt = (([...String(p.text)].reduce((a, c) => a + c.charCodeAt(0), 0) % 5) - 2) * 0.35;
      pin = ` translateY(${((1 - q) * 26 * k).toFixed(2)}px) scaleY(${(0.7 + 0.3 * Math.min(1, q)).toFixed(4)}) rotate(${tilt}deg)`;
    }
    // auto and big pop in over 0.14 s from their middle
    const pq = prog(ctx.local, 0, 0.14), sc = stylePop(p.style, ctx.local);
    if (sc !== null) pin = ` scale(${sc.toFixed(4)})`;
    const sfont = styleFontOf(p.style, p.styleFont);
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
    cssCamel(s.box, {
      top: place.top, bottom: place.bottom, maxWidth: `${width}px`, opacity: String(st.opacity * (auto || big ? pq : 1)), left: left ? `${theme.safe.side * W}px` : '50%', textAlign: left ? 'left' : 'center',
      transform: `translate(${left ? `${st.x}px` : `calc(-50% + ${st.x}px)`}, calc(${place.yAnchor} + ${st.y}px))${pin}`, transformOrigin: auto || big ? '50% 50%' : left ? '0 100%' : '50% 100%', clipPath: teeth,
      fontFamily: `'${sfont || p.font}', 'Noto Sans TC', sans-serif`, fontSize: `${(px * fit.scale).toFixed(2)}px`, fontWeight: bar || auto || qa || big || strip ? '700' : '900', fontStyle: p.quote ? 'italic' : 'normal',
      color: p.style === 'bubble' || ticket || crayon || strip ? p.outline : big ? p.hl : ink,
      textShadow: big ? `0 ${6 * k}px ${18 * k}px rgba(0,0,0,0.45)` : qa ? `0 ${4 * k}px ${12 * k}px rgba(0,0,0,0.8)` : '',
      webkitTextStroke: stroke ? `${stroke}px ${p.outline}` : '0', paintOrder: 'stroke fill',
      background: p.style === 'box' || auto ? p.boxBg : p.style === 'bubble' || ticket ? p.bubbleBg
        : bar ? `linear-gradient(${theme.palette.accent2}, ${theme.palette.accent2}) 0.3em 0.28em / 0.14em calc(100% - 0.56em) no-repeat, ${p.boxBg}` : 'transparent',
      padding: ticket ? '0.35em 0.65em 0.3em' : crayon ? '0.22em 0.7em' : p.style === 'box' || p.style === 'bubble' ? '0.18em 0.6em'
        : bar ? '0.28em 0.7em 0.3em 0.95em' : auto ? '0.17em 0.48em 0.21em' : qa ? '0 0 0 1.45em' : '0',
      borderRadius: ticket ? '0' : p.style === 'box' || p.style === 'bubble' ? `${theme.radius * k}px` : bar ? `${24 * k}px` : auto ? `${20 * k}px` : '0',
      border: p.style === 'bubble' ? `${theme.stroke * k}px solid ${p.outline}` : '0 solid transparent', boxSizing: 'border-box',
      ...(point ? { paddingLeft: '2.05em', minHeight: '2.05em', display: 'flex', flexDirection: 'column', justifyContent: 'center' } : { display: '', flexDirection: '', justifyContent: '' }),
    });
    cssCamel(s.band, { display: crayon ? 'block' : 'none' });
    if (crayon) drawBand(s, p, ctx.local, k);
    // qa: a dark wash across the frame from 1.6 em above the box (clear), darkest 0.4 em below it, clear again 2.6 em further down
    cssCamel(s.wash, { display: qa ? 'block' : 'none' });
    if (qa) {
      const fs = px * fit.scale, top = s.box.offsetTop - 1.6 * fs, dark = s.box.offsetTop + s.box.offsetHeight + 0.4 * fs, hh = dark + 2.6 * fs - top, f = ((dark - top) / hh) * 100;
      cssCamel(s.wash, { top: `${top.toFixed(1)}px`, height: `${hh.toFixed(1)}px`, opacity: String(st.opacity),
        background: `linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) ${(f * 0.55).toFixed(1)}%, rgba(0,0,0,0.72) ${f.toFixed(1)}%, rgba(0,0,0,0.55) ${(f + (100 - f) * 0.4).toFixed(1)}%, rgba(0,0,0,0) 100%)` });
    }
  },
};

/** style 'strip': each line its own strip of paper (bubbleBg) with a soft shadow, tilted −0.8° and 0.7° in turn; the highlighted words
 *  (【word】 and, with `words`, the one being said) on a highlighter stroke in the highlight colour, in ink like the rest */
export const stripTilt = (line: number) => (line % 2 ? 0.7 : -0.8);
function paperStrips(el: HTMLElement, p: P, left: boolean, k: number) {
  ([...el.children] as HTMLElement[]).forEach((line, i) => {
    cssCamel(line, { display: 'table', margin: `${i ? '0.2em' : '0'} ${left ? '0' : 'auto'} 0`, padding: '0.06em 0.42em 0.1em', background: p.bubbleBg, borderRadius: `${8 * k}px`,
      boxShadow: `0 ${5 * k}px ${16 * k}px rgba(20,12,6,0.3)`, transform: `rotate(${stripTilt(i)}deg)` });
    for (const sp of line.children as HTMLCollectionOf<HTMLElement>) if (sp.style.color) cssCamel(sp, { background: p.hl, boxShadow: `0 0 0 0.08em ${p.hl}`, borderRadius: '0.12em' });
  });
}

/** style 'crayon': the band scribbled in the highlight colour over 0.15 s, a slightly crooked quad a little bigger than the box */
function drawBand(s: S, p: P, local: number, k: number) {
  const bw = s.box.offsetWidth, bh = s.box.offsetHeight, m = 8 * k, W = bw + 2 * m, H = bh + 2 * m;
  cssCamel(s.band, { left: `${-m}px`, top: `${-m}px`, width: `${W}px`, height: `${H}px` });
  const main = canvasAt(s.band, W, H), g = grainBegin(s.layer, W, H);
  const band: Pt[] = [[m, m + 6 * k], [m + bw, m], [m + bw - 4 * k, m + bh], [m + 4 * k, m + bh - 4 * k]];
  const seed = [...String(p.text)].reduce((a, c) => a + c.charCodeAt(0), 0) % 997;
  scribbleFill(g, band, p.hl, { u: k, w: 20, gap: 11, seed, alpha: 0.62, angle: -1.2, prog: clamp(local / 0.15) });
  grainEnd(s.layer, main, 0.45, k);
}
