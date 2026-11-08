// The samples' shared pieces (samples.ts is the list): the Sample shape, the palettes, the made-up texts and pictures several
// samples use, and the caption samples (every look, word effect, entrance, template and exit).
import { TEMPLATES } from '../caption/templates.ts';

export interface Sample { name: string; type: string; params?: Record<string, unknown>; len?: number; at: number[]; theme?: Record<string, unknown>; bg?: string; wide?: boolean;
  sources?: Record<string, { file: string; width: number; height: number; map?: { center: [number, number]; zoom: number; credit?: string } }> }

/** the palettes of the two podcast shorts */
export const QUOTE = { palette: { accent: '#ff4f2a', accent2: '#7fd4c8', paper: '#f4ecdc', ink: '#121015' } };
/** the amber-podcast short's palette */
export const AMBER = { palette: { accent: '#f4a62a', accent2: '#f4a62a', ink: '#0d1014', paper: '#f3ebdd', hl: '#f4a62a' } };
export const VS = { palette: { accent2: '#3d7bff', accent: '#ff5c7a', hl: '#ffd23f', ink: '#0d0f1a', paper: '#f7f4ee' } };
/** the hand-drawn kit's looks: the crayon picture book (fd-tangyuan), the squared notebook (fd-map), white marker on black (fd-quotes),
 *  pencil on cream (fishing1) */
export const BOOK = { palette: { ink: '#5b3a26', accent: '#d4573b', hl: '#f2c14e', paper: '#f4e8d4', accent2: '#7fa35b' } };
export const NOTE = { palette: { ink: '#1f3a8a', accent: '#d62f2f', hl: '#ffe24d', paper: '#fbf8f0', accent2: '#3b82c4' } };
export const MARK = { palette: { ink: '#f4f3ee', accent: '#e4ff1a', hl: '#e4ff1a', paper: '#0f0f0f', accent2: '#9a9a96' } };
export const SKETCH = { palette: { ink: '#33302c', accent: '#c97b5c', hl: '#e3c48a', paper: '#f3eee3', accent2: '#93ab86' } };
/** chili-history's woodcut cards: parchment, brown-black ink, chili red, ochre */
export const WOOD = { palette: { ink: '#3a2a1e', accent: '#b8322a', hl: '#c98f1a', paper: '#f4ead2', accent2: '#2b211b' } };
/** common.chart's data: parenting-brain's day ranking, fd-caibao's table, parenting-brain's two ledgers */
export const RANK = '親密關係|5.10\n社交|4.59\n放鬆|4.42\n⋯\n小睡|3.87|11\n照顧孩子|3.86\n上網|3.81\n家事|3.73\n上班|3.62\n通勤|3.45';
export const TABLE = '|A 店|B 店|C 店\n價格|35 元|45 元|40 元\n內餡|高麗菜|蘿蔔絲|韭菜\n口感|Q 彈|鬆軟|紮實';
/** common.mapcam's map pictures: one made-up street map (golden/fixtures/fake-map.png: a slanted street grid, a river, a park and a square drawn by a small script, no map data) placed twice, wide (z12) and close (z14) */
export const FAKE = (zoom: number) => ({ file: 'fixtures/fake-map.png', width: 360, height: 640, map: { center: [19.937, 50.061] as [number, number], zoom, credit: 'Golden test map (made up)' } });
export const MAPS = { wide: FAKE(12), city: FAKE(14) };
export const SQUARE = '廣場|Rynek|19.9385|50.0638, 公園|Park|19.9308|50.0681';
/** group D (seoul-bbq): a charcoal-fire palette and a bakery ranking with a tie for second */
export const EMBER = { palette: { ink: '#17120f', paper: '#fff4e2', accent: '#ff5a1f', accent2: '#f4c34f', hl: '#f4c34f' } };
export const BAKERY = 'Garlic cream||1\nMatcha roll||2\nCurry bun||2\nMelon pan||3\nBaguette||4';
export const LEDGER = '當下帳|0.5,0.75,0.3,0.62,0.4,0.7,0.35,0.6\n長期帳|0.2,0.3,0.42,0.5,0.6,0.68,0.75,0.8';

/** common.notify's tones: a dark system note, a hidden preview, an accent card with a gloss; a chat that grows up */
export const NOTES = '0.2|moon|休息模式||已將 1 則通知靜音|dark\n0.6|play|影片|十件事之外…|預覽已隱藏・解鎖以查看|lock\n1.0|star|今日一句||人生來就是累的，/所以要【休息】。|accent|sub=Man is born tired and lives to rest.';
export const CHAT = '0.2|user|小美||到了嗎？|light|who=#d6336c\n0.8|user|阿凱||快到了，在排隊|light\n1.4|user|小美||幫我買一杯！|light|who=#d6336c\n2.0|user|阿凱||好啦好啦|light';

/** common.album's photos: the made-up map as a picture (twice, two focus points) among painted stand-ins */
export const PIC = { pic: { file: 'fixtures/fake-map.png', width: 360, height: 640 } };
/** common.chat's messages: every kind on one chat, and a group with names */
export const CHAT_MEDIA = `-1|sys|以下為情境重現
0|ch|🛵 出發
0.1|me||video|src=pic|t=0|dur=0:12|mute|play=0.4-0.75|crop=0.5,0.4,1
0.25|me|觀眾的男朋友約我來海邊
0.8|them|蛤？？
1.0|me|我就說 好啊/反正我也沒事|voice|dur=0:02|play=1.1-1.9
1.6|ch|👋 新朋友
1.7|me||album|pics=pic@0,-,-,pic@0|labels=Nebo,Pavle,Dimitri,Luka|w=0.6
2.1|them|😂|sticker
2.4|them||typing
2.6|me|答案在長片裡 👇
2.75|me|完整版在長片|link|src=pic|sub=號稱世上最懶的國家|button=▶ 看完整影片|badge=22:53|press=2.9`;
export const CHAT_GROUP = `-1|sys|10月24日
0.1|阿哲|明天幾點出發？
0.5|阿哲|我可以開車
0.9|Mia|七點？太早了吧 This is way too early for a Saturday morning honestly|avatar=🌸|color=#b388ff
1.4|me|那八點，車站見|when=21:04
1.9|me|記得帶泳衣|unread
2.2|阿哲||typing
2.6|阿哲|OK 👍`;
/** common.chat's open=: a video bubble growing to the whole frame (the block alone: its still in the growing window) */
export const CHAT_OPEN = `0|me|你看這個 👇
0.1|me||video|src=pic|t=0|dur=0:08|play=0.2-3|open=0.4-2.6|crop=0.5,0.4,1
2.8|them|哇`;
export const ALBUM = '# 港邊|7月12日|第 1 天\npic|0||0.5,0.4\n-\n-||0:12\n# 老街|7月13日|第 2 天\n-\npic|0|0:08|0.3,0.6\n-\n# |7月15日|第 4 天\n-\n-\n-\n-';

/** common.heading's sample title: a kicker, two lines, a sub (English and Japanese for the gallery's thumbnails) */
export const HEAD_ZH = { text: '一座廣場的\n七百年', kicker: '第一章', sub: '義大利・西恩納' };
export const HEAD_EN = { text: 'Seven Hundred Years\nof a Square', kicker: 'CHAPTER ONE', sub: 'Siena, Italy' };
export const HEAD_JA = { text: '広場の\n七百年', kicker: '第一章', sub: 'シエナ・イタリア' };
/** caption looks, word effects and animations (spec 2026-11-04-caption-styles): a Chinese, an English and a Japanese line with word times */
export const CAP_ZH = { text: '今天帶你去吃【台南】最強的牛肉湯', words: [[0.25, 2], [0.55, 4], [0.85, 6], [1.2, 8], [1.6, 11], [2.05, 14]] };
export const CAP_EN = { text: 'We walked all the way to the 【Colosseum】', words: [[0.25, 2], [0.5, 9], [0.8, 13], [1.0, 17], [1.25, 21], [1.45, 24], [1.7, 28], [2.0, 38]] };
export const CAP_JA = { text: '京都の【朝ごはん】は本当においしい', words: [[0.2, 3], [0.6, 7], [0.9, 8], [1.3, 11], [1.7, 15]] };
export const CAP_LOOKS: Array<[string, Record<string, unknown>]> = [['punch', {}], ['double', {}], ['soft', {}], ['frost', { hl: '#9fe3ff' }], ['cinema', { size: 3.6 }], ['slab', {}], ['hollow', {}],
  ['marker', {}], ['neon', { hl: '#ff3db8', accent: '#29e7ff' }], ['gradient', { hl: '#ffe2a8', accent: '#ff8a4c' }], ['extrude', { hl: '#ffd23f', accent: '#e8742c' }], ['sticker', { accent: '#ff4f6a', bubbleBg: '#ffffff' }],
  ['heavy', {}], ['offset', {}], ['gold', {}], ['chrome', {}], ['flow', { hl: '#7cf8ff', accent: '#ff5fa2' }], ['halo', { hl: '#ffb3e6' }], ['duotone', { hl: '#ffe14d', accent: '#ff5c7a' }], ['longshadow', {}], ['emboss', {}], ['block', {}], ['puffy', { hl: '#ffd1e8', accent: '#ff5fa2' }], ['tape', { hl: '#9fe3c8' }], ['postit', {}], ['label', {}], ['ransom', {}], ['rgb', {}], ['pixel', {}], ['vhs', {}], ['terminal', {}], ['segment', {}], ['scanline', { hl: '#7cf8ff' }], ['news', {}], ['chat', {}], ['lyric', { hl: '#ffd27a' }], ['dialog', {}], ['comic', {}], ['chalk', {}], ['narration', {}], ['desk', { hl: '#f7b2cf', outline: '#4b3a8c' }], ['scrap', { hl: '#d9533a' }], ['mono', { color: '#ffffff', outline: '#0d0d0d' }]];
export const CAPTION_SAMPLES: Sample[] = [
  ...CAP_LOOKS.flatMap(([style, own]): Sample[] => [
    { name: `cap-${style}-zh`, type: 'common.caption', params: { ...CAP_ZH, style, ...own }, at: [1.0, 2.4], bg: '#4a5a52' },
    { name: `cap-${style}-en`, type: 'common.caption', params: { ...CAP_EN, style, ...own }, at: [1.5], wide: true, bg: '#4a5a52' },
    { name: `cap-${style}-ja`, type: 'common.caption', params: { ...CAP_JA, style, ...own }, at: [1.5], bg: '#4a5a52' },
  ]),
  ...['color', 'box', 'one', 'pop', 'fill', 'underline', 'type', 'wave', 'none'].flatMap((wordFx): Sample[] => [
    { name: `cap-fx-${wordFx}-punch`, type: 'common.caption', params: { ...CAP_ZH, style: 'punch', wordFx, size: wordFx === 'one' ? 9 : 4.6 }, at: [0.7, 1.4], bg: '#4a5a52' },
    { name: `cap-fx-${wordFx}-en`, type: 'common.caption', params: { ...CAP_EN, style: 'outline', wordFx }, at: [1.3], wide: true, bg: '#4a5a52' },
  ]),
  { name: 'cap-fx-pop-even', type: 'common.caption', params: { text: '沒有逐字時間的字幕 也照字數分配', style: 'punch', wordFx: 'pop' }, at: [0.9], bg: '#4a5a52' },
  ...['bounce', 'blur', 'drop', 'zoom', 'wipe', 'scatter', 'flip', 'stretch', 'glitch', 'roll'].map((animIn): Sample => ({ name: `cap-in-${animIn}`, type: 'common.caption', params: { ...CAP_ZH, style: 'punch', animIn }, at: [0.12], bg: '#4a5a52' })),
  // every template's own picture (the gallery's caption cards), the line half said
  ...TEMPLATES.map((t): Sample => ({ name: `tpl-${t.id}`, type: 'common.caption', params: { ...CAP_ZH, template: t.id }, at: [1.5], bg: '#4a5a52' })),
  ...['blur', 'shrink', 'drop', 'wipe'].map((animOut): Sample => ({ name: `cap-out-${animOut}`, type: 'common.caption', params: { ...CAP_ZH, style: 'punch', animOut }, at: [2.88], bg: '#4a5a52' })),
];
