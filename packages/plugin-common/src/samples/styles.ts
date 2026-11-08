// Golden samples, in order (samples.ts joins the parts):
// the eight style pilots' kits, the derived frames, the 3D desk, the captions and titles (2026-11-05 on).
import { TITLE_TEMPLATES } from '../heading/templates.ts';
import { type Sample, PIC, HEAD_ZH, CAPTION_SAMPLES } from './fixtures.ts';

export const STYLES: Sample[] = [
  // common.desktop, common.window, common.popup and touch's look cursor (2026-11-05, the retro desktop pilot film's fx.retro*): the
  // desktop changing chapter, a photo window popping in and settled, one flying into its taskbar button, the search / profile / progress
  // windows, a dialog and its press, the closing sheet and its confetti, the cursor gliding and clicking
  { name: 'desktop', type: 'common.desktop', params: { chapters: '0|準備|#ffd6b8|#cdb8f5\n1.5|派對|#ffc4dc|#d9c2f7\n2.5|生日|#fff0b8|#ffc4dc' }, len: 3, at: [0.5, 1.8] },
  { name: 'window', type: 'common.window', sources: PIC, params: { source: 'pic', title: 'party_01.jpg', exit: 'none' }, len: 3, at: [0.12, 1.5], bg: '#d9c2f7' },
  { name: 'window-min', type: 'common.window', params: { content: 'search', text: '今天的壽星', title: 'search', bar: 'mint', h: 0.1, slot: 2, slots: 5 }, len: 3, at: [1.5, 2.8], bg: '#d9c2f7' },
  { name: 'window-profile', type: 'common.window', params: { content: 'profile', text: '名字|Katie\n年齡|16 歲\n狀態|派對中 ♥', title: 'profile.txt', w: 0.56, h: 0.2, exit: 'none' }, len: 3, at: [1.5], bg: '#d9c2f7' },
  { name: 'window-progress', type: 'common.window', params: { content: 'progress', text: '佈置中…|佈置完成 ✓', title: 'setup.exe', bar: 'yellow', h: 0.13, progTo: 2, exit: 'none' }, len: 3, at: [1.2, 2.5], bg: '#d9c2f7' },
  { name: 'popup', type: 'common.popup', params: { press: 1.2 }, len: 3, at: [0.12, 1.25], bg: '#ffc4dc' },
  { name: 'popup-sheet', type: 'common.popup', params: { mode: 'sheet', text: 'Katie，十六歲生日快樂', buttons: '儲存回憶', y: 0.72, typeAt: 0.3, press: 1.8 }, len: 3, at: [1.5, 2.1], bg: '#ffc4dc' },
  { name: 'touch-cursor', type: 'common.touch', params: { look: 'cursor', color: '#ffffff', edge: '#4b3a8c', touches: '0.5|tap|0.5,0.38\n1.6-2.2|drag|0.3,0.6>0.7,0.6' }, len: 3, at: [0.55, 1.2, 2.0], bg: '#d9c2f7' },
  // common.prints, common.scraps and common.wipe's tiles (2026-11-05, the Collage pilot film's fx.prints / fx.scraps / fx.mosaic):
  // prints dropping and settled, the bits pasted round them and the seams, tiles closing over the cut and opening
  { name: 'prints', type: 'common.prints', sources: PIC, params: { source: 'pic', prints: '0|0|0.32,0.36,0.52|-3|4:3|tape\n0.4|0|0.68,0.5,0.46|3|3:4|clip\n0.8|0|0.38,0.7,0.5|2|1:1' }, len: 3, at: [0.95, 2.0], bg: '#f3ece0' },
  { name: 'scraps', type: 'common.scraps', params: { scraps: '0|dots|0.72,0.12,0.4,0.07|-3|#c3b1f5\n0.2|paper|0.3,0.4,0.36,0.14|5|#e8763a\n0.4|tape|0.6,0.6,0.3,0.06|-8|#ece2be\n0.6|pin|0.5,0.75,0.05,0.05|0|#e0552f\n0.8|clip|0.25,0.75,0.06,0.16|10|#9aa3ab\n1.0|grid|5,9|0|#ffffff' }, len: 3, at: [1.5], bg: '#1f9e93' },
  { name: 'wipe-tiles', type: 'common.wipe', params: { mode: 'tiles', color: '#efe6d4', edge: '#ffffff' }, len: 1, at: [0.25, 0.5, 0.8], bg: '#4a6b7c' },
  // common.monoframe, common.filmstrip and common.wipe's vortex (2026-11-05, the Mono Frame pilot film's fx.monoframe / fx.filmstrip /
  // fx.vortex): the frame round the window, the window shrunk to a strip, all words; the two strips; the vortex mid-spin
  { name: 'monoframe', type: 'common.monoframe', params: { text: 'MARRAKECH · 馬拉喀什 · ' }, len: 3, at: [1.5], bg: '#4a6b7c' },
  { name: 'monoframe-win', type: 'common.monoframe', params: { text: 'SOUK · 市集 · ', win: '0|0.12,0.36,0.76,0.24\n1|0.12,0.36,0.76,0.24\n2|0.045,0.0253,0.91,0.9494' }, len: 3, at: [0.5, 1.5], bg: '#4a6b7c' },
  { name: 'monoframe-full', type: 'common.monoframe', params: { full: true }, len: 3, at: [1.5], bg: '#4a6b7c' },
  { name: 'filmstrip', type: 'common.filmstrip', sources: PIC, params: { source: 'pic', stills: '0, 0, 0' }, len: 3, at: [1.5] },
  { name: 'wipe-vortex', type: 'common.wipe', params: { mode: 'vortex', words: 'MAJORELLE · 馬若雷勒 · ', color: '#0d0d0d', edge: '#f4f4f0' }, len: 1, at: [0.5], bg: '#4a6b7c' },
  // common.masthead, common.spread and common.wordbands (2026-11-06, the Fashion pilot film's fx.cover / fx.taste / fx.column /
  // fx.wordbands): the cover typing and settled, the back cover; a swatch page and a column page settled; the bands mid-run
  { name: 'masthead', type: 'common.masthead', len: 3, at: [0.25, 2.4], bg: '#4a6b7c' },
  { name: 'masthead-back', type: 'common.masthead', sources: PIC, params: { mode: 'back', source: 'pic', script: 'Taste · See · Walk' }, len: 3, at: [2.0] },
  { name: 'spread', type: 'common.spread', sources: PIC, params: { source: 'pic' }, len: 3, at: [1.5] },
  { name: 'spread-column', type: 'common.spread', sources: PIC, params: { layout: 'column', source: 'pic', header: 'MARKET — SEATTLE' }, len: 3, at: [0.3, 1.5] },
  { name: 'wordbands', type: 'common.wordbands', sources: PIC, params: { source: 'pic' }, len: 1.6, at: [0.5, 1.4] },
  // common.grade, common.wash, common.viewfinder, common.echo, common.poster, common.band and countdown's look slant (2026-11-06, the
  // Single Color pilot film's fx.grade / fx.deepen / fx.hud / fx.echo / fx.page / fx.tape / fx.count): a one-colour and a grey grade
  // over a blue ground, the wash, the viewfinder, the echo word opening and settled (and white on a one-colour step), a poster page
  // settling and settled, the band, the slanted 3 and 2
  { name: 'grade', type: 'common.grade', params: { steps: '0|mono' }, len: 2, at: [1.0], bg: '#3a7bd5' },
  { name: 'grade-bw', type: 'common.grade', params: { steps: '0|bw' }, len: 2, at: [1.0], bg: '#3a7bd5' },
  { name: 'wash', type: 'common.wash', len: 2, at: [1.0], bg: '#d9d9d9' },
  { name: 'viewfinder', type: 'common.viewfinder', len: 3, at: [1.5], bg: '#4a6b7c' },
  { name: 'echo', type: 'common.echo', params: { word: 'RIDE', label: '01' }, len: 2, at: [0.1, 1.0], bg: '#4a6b7c' },
  { name: 'echo-mono', type: 'common.echo', params: { word: 'WALK', steps: '0|mono' }, len: 2, at: [1.0], bg: '#ff5a1f' },
  { name: 'poster', type: 'common.poster', sources: PIC, params: { photos: 'pic|0|0.5,0.5', side: 'ROUND · TAIWAN', barcode: 'RIDE · EAT · REPEAT' }, len: 3, at: [0.1, 1.5] },
  { name: 'band', type: 'common.band', len: 2, at: [0.1, 1.0], bg: '#4a6b7c' },
  { name: 'countdown-slant', type: 'common.countdown', params: { look: 'slant', from: 3, to: 1, end: '', colors: '#ff5a1f,#ffffff' }, len: 3, at: [0.2, 1.5], bg: '#4a6b7c' },
  // common.binocular and common.photostack (2026-11-06, the Wes Anderson pilot film's fx.binocular / fx.cards): the windows opening
  // and open, a spyglass; the stack with its first card sliding in and all three settled
  { name: 'binocular', type: 'common.binocular', len: 2, at: [0.1, 1.0], bg: '#7a9a6a' },
  { name: 'binocular-spyglass', type: 'common.binocular', params: { shape: 'spyglass', r: 0.35 }, len: 2, at: [1.0], bg: '#7a9a6a' },
  { name: 'photostack', type: 'common.photostack', sources: PIC, params: { cards: 'pic|0|records, slowly\npic|0|by the window\npic|0|latte & a book' }, len: 3, at: [0.2, 2.5] },
  // common.popcard, common.sticker, backdrop words, wipe stripes, badge box (2026-11-06, the Dopamine Colors pilot film's fx.popcard / fx.sticker /
  // fx.wordwall / fx.stripes): the card popping in and its second shot, the stickers popping and settled, the word wall, the stripes
  { name: 'popcard', type: 'common.popcard', sources: PIC, params: { shots: '0|pic|0|0.5,0.5,1|WHITE TEE|still\n1.5|pic|0|0.5,0.4,1.4|TOTE BAG|still' }, len: 3, at: [0.12, 1.0, 2.5], bg: '#c6f03a' },
  { name: 'sticker', type: 'common.sticker', params: { shape: 'heart', x: 0.5, y: 0.45, size: 0.4, popAt: 0 }, len: 2, at: [0.1, 1.5], bg: '#ff3ea5' },
  { name: 'sticker-smile', type: 'common.sticker', params: { shape: 'smile', x: 0.5, y: 0.45, size: 0.4, popAt: 0 }, len: 2, at: [1.5], bg: '#c6f03a' },
  { name: 'sticker-bolt', type: 'common.sticker', params: { shape: 'bolt', x: 0.35, y: 0.45, size: 0.3, popAt: 0 }, len: 2, at: [1.5], bg: '#3b4cf0' },
  // the frames derived from the library (2026-11-07): common.grid (bento sliding in and settled, four scaling, two side by side on a wide
  // frame), common.slant, common.postage, common.letterbox
  { name: 'grid', type: 'common.grid', sources: PIC, params: { layout: 'bento', shots: 'pic|0||still\npic|0|0.5,0.3,1.6|still\npic|0|0.5,0.7,1.6|still\npic|0|0.5,0.5,1.2|still' }, len: 3, at: [0.3, 1.6] },
  { name: 'grid-four', type: 'common.grid', sources: PIC, params: { layout: 'four', reveal: 'scale', shots: 'pic|0||still\n-\npic|0|0.5,0.4,1.5|still\npic|0|0.5,0.6,1.5|still' }, len: 3, at: [1.5] },
  { name: 'wide-grid', type: 'common.grid', sources: PIC, params: { layout: 'two', shots: 'pic|0||still\npic|0|0.5,0.4,1.5|still' }, len: 3, at: [1.5], wide: true },
  { name: 'slant', type: 'common.slant', sources: PIC, params: { labels: 'BEFORE,,AFTER', shots: 'pic|0||still\npic|0|0.5,0.35,1.5|still\npic|0|0.5,0.65,1.5|still' }, len: 3, at: [0.2, 1.6] },
  { name: 'slant-two', type: 'common.slant', sources: PIC, params: { count: 2, seam: 0, angle: -10, shots: 'pic|0||still\npic|0|0.5,0.4,1.4|still' }, len: 3, at: [1.5] },
  { name: 'wide-slant', type: 'common.slant', sources: PIC, params: { shots: 'pic|0||still\npic|0|0.5,0.4,1.4|still\npic|0|0.5,0.6,1.4|still' }, len: 3, at: [1.5], wide: true },
  { name: 'postage', type: 'common.postage', sources: PIC, params: { source: 'pic', still: true }, len: 3, at: [0.2, 1.6] },
  { name: 'wide-postage', type: 'common.postage', sources: PIC, params: { source: 'pic', still: true, backdrop: 'color', y: 0.5 }, len: 3, at: [1.6], wide: true },
  { name: 'letterbox', type: 'common.letterbox', params: { sub: 'ROME, SPRING' }, len: 3, at: [0.4, 2], bg: '#4a6b7c' },
  { name: 'wide-letterbox', type: 'common.letterbox', params: { sub: 'ROME, SPRING' }, len: 3, at: [2], bg: '#4a6b7c', wide: true },
  // common.flatlay, the 3D desk: one sample per surface (the settled frame last: the thumbnails draw the last time), a flip, a wide desk
  { name: 'flatlay', type: 'common.flatlay', sources: PIC, len: 3.2, at: [0.5, 2.8], params: { surface: 'linen', objects: JSON.stringify([
    { kind: 'postcard', shot: 'pic|0||still', place: 'Fontana di Trevi', year: '2024', at: 0 }, { kind: 'polaroid', shot: 'pic|0||still', caption: '那年夏天', at: 0.6 }]) } },
  { name: 'flatlay-flip', type: 'common.flatlay', sources: PIC, len: 3.4, at: [1.2, 3.2], params: { surface: 'marble', objects: JSON.stringify([
    { kind: 'postcard', shot: 'pic|0||still', place: 'Roma', year: '2024', at: 0, enter: 'none', flipAt: 0.2, flipDur: 0.8, back: '1.0-2.2|謝謝你\n2.2-2.9|那時候願意出發', mark: 'ROMA|羅馬|2024.05.12', markAt: 2.9 }]) } },
  { name: 'flatlay-tv', type: 'common.flatlay', sources: PIC, len: 3, at: [2.6], params: { surface: 'concrete', warmth: 'morning', objects: JSON.stringify([
    { kind: 'tv', shot: 'pic|0||still', caption: 'Sunrise', at: 0, enter: 'none' }, { kind: 'photo', shot: 'pic|0||still', caption: '1998', at: 0.4 }]) } },
  { name: 'flatlay-velvet', type: 'common.flatlay', sources: PIC, len: 3, at: [2.6], params: { surface: 'velvet', warmth: 'golden', objects: JSON.stringify([
    { kind: 'card', shot: 'pic|0||still', caption: '生日快樂', at: 0, enter: 'none' }, { kind: 'polaroid', shot: 'pic|0||still', caption: '十八歲', at: 0.3 }]) } },
  { name: 'wide-flatlay-velvet', type: 'common.flatlay', sources: PIC, len: 3, at: [2.6], wide: true, params: { surface: 'velvet', warmth: 'golden', objects: JSON.stringify([
    { kind: 'card', shot: 'pic|0||still', caption: '生日快樂', at: 0, enter: 'none' }, { kind: 'polaroid', shot: 'pic|0||still', caption: '十八歲', at: 0, enter: 'none' },
    { kind: 'photo', shot: 'pic|0||still', caption: '2008', at: 0, enter: 'none' }]) } },
  { name: 'flatlay-none', type: 'common.flatlay', sources: PIC, len: 3, at: [2.6], bg: '#d9c2f7', params: { surface: 'none', objects: JSON.stringify([
    { kind: 'polaroid', shot: 'pic|0||still', caption: '那年夏天', at: 0, enter: 'none' }]) } },
  { name: 'wide-flatlay', type: 'common.flatlay', sources: PIC, len: 3.4, at: [3.2], wide: true, params: { surface: 'linen', side: 'right', objects: JSON.stringify([
    { kind: 'postcard', shot: 'pic|0||still', place: 'Trastevere', year: '2024', at: 0, enter: 'none' }, { kind: 'polaroid', shot: 'pic|0||still', caption: '那年夏天', at: 0.3 },
    { kind: 'card', shot: 'pic|0||still', caption: '再見', at: 0.8 }]) } },
  { name: 'backdrop-words', type: 'common.backdrop', params: { pattern: 'words', word: 'HELLO', color: '#c6f03a', color2: '#ff3ea5', tint: 1, scale: 175, drift: 54, bits: 12 }, at: [0.5] },
  { name: 'wipe-stripes', type: 'common.wipe', params: { mode: 'stripes', colors: '#ff3ea5,#c6f03a,#ff7a1a,#3b4cf0', slant: 1.11, dir: 'left' }, len: 1, at: [0.2, 0.5, 0.75], bg: '#4a6b7c' },
  { name: 'badge-box', type: 'common.badge', params: { shape: 'box', label: 'No.1', plate: '米白休閒', x: 0.08, y: 0.125, size: 26, color: '#111111', textColor: '#ffffff', font: 'Playfair Display' }, at: [1.5], bg: '#3b4cf0' },
  { name: 'burst-comic', type: 'common.burst', params: { text: '3歲\n生日！', fill: '#ffe14d', textColor: '#ff3f9a', shadow: '#ff3f9a', dots: '#ffb300', tilt: 8, points: 16 }, at: [1.5], bg: '#4a6b7c' },
  ...CAPTION_SAMPLES,
  // common.heading (spec 2026-11-05-title-templates): every layout, every backing, an English and a Japanese title
  ...['center', 'top', 'bottom', 'lower', 'left', 'corner', 'full'].map((layout): Sample => ({ name: `heading-${layout}`, type: 'common.heading', params: { ...HEAD_ZH, layout, ...(layout === 'full' ? { text: '七百年', kicker: '', sub: '' } : {}) }, at: [1.5], bg: '#4a5a52' })),
  ...['band', 'scrim', 'blur', 'card', 'rules', 'bar', 'black'].map((backing): Sample => ({ name: `heading-back-${backing}`, type: 'common.heading', params: { ...HEAD_ZH, backing, style: backing === 'card' ? 'plain' : 'heavy' }, at: [1.5], bg: '#4a5a52' })),
  { name: 'heading-en', type: 'common.heading', params: { text: 'Seven Hundred Years\nof a Square', kicker: 'CHAPTER ONE', sub: 'Siena, Italy', backing: 'rules', style: 'soft' }, at: [1.5], wide: true, bg: '#4a5a52' },
  { name: 'heading-ja', type: 'common.heading', params: { text: '広場の七百年', kicker: '第一章', sub: 'シエナ・イタリア', layout: 'lower', backing: 'bar', font: 'Noto Sans JP' }, at: [1.5], bg: '#4a5a52' },
  { name: 'heading-in-track', type: 'common.heading', params: { ...HEAD_ZH, animIn: 'track' }, at: [0.2], bg: '#4a5a52' },
  // mid-entrance and mid-exit, away from the frame's middle: the animation is sized by the title and clipped to its block
  { name: 'heading-in-mask', type: 'common.heading', params: { ...HEAD_ZH, animIn: 'mask', layout: 'top' }, at: [0.15], bg: '#4a5a52' },
  { name: 'heading-in-open', type: 'common.heading', params: { ...HEAD_ZH, animIn: 'open', layout: 'lower', size: 7 }, at: [0.15], bg: '#4a5a52' },
  { name: 'heading-in-focus', type: 'common.heading', params: { ...HEAD_ZH, animIn: 'focus' }, at: [0.15], bg: '#4a5a52' },
  { name: 'heading-out-sink', type: 'common.heading', params: { ...HEAD_ZH, animOut: 'sink', layout: 'bottom' }, at: [2.85], bg: '#4a5a52' },
  { name: 'heading-corner-type', type: 'common.heading', params: { ...HEAD_ZH, style: 'vhs', layout: 'corner', animIn: 'typewriter', backing: 'band' }, at: [0.3, 1.5], bg: '#4a5a52' },
  { name: 'heading-in-rule', type: 'common.heading', params: { ...HEAD_ZH, animIn: 'rule', backing: 'rules' }, at: [0.2, 0.45], bg: '#4a5a52' },
  ...['serif', 'spaced', 'stack', 'sign', 'vintage', 'seal', 'split', 'giant', 'script', 'ribbon'].map((style): Sample => ({ name: `heading-look-${style}`, type: 'common.heading', params: { ...HEAD_ZH, style }, at: [1.5], bg: '#4a5a52' })),
  ...TITLE_TEMPLATES.map((t): Sample => ({ name: `ttl-${t.id}`, type: 'common.heading', params: { ...HEAD_ZH, template: t.id }, at: [1.5], bg: '#4a5a52' })),
  { name: 'token', type: 'common.token', params: { x: 0.3, y: 0.42, size: 0.3 }, at: [1.2, 1.7, 2.9] },
];
