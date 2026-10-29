// The moments of every common block that are kept as golden pictures (toolkit phase 2b). A new block adds its cases here:
// the test refuses a block without one. Regenerate with `npm run golden -- --update <name>` after a change you meant.
export interface Case { name: string; type: string; params?: Record<string, unknown>; len?: number; at: number[]; theme?: Record<string, unknown>; bg?: string; wide?: boolean;
  sources?: Record<string, { file: string; width: number; height: number; map?: { center: [number, number]; zoom: number; credit?: string } }> }

/** the palettes of the two podcast shorts */
const QUOTE = { palette: { accent: '#ff4f2a', accent2: '#7fd4c8', paper: '#f4ecdc', ink: '#121015' } };
/** the amber-podcast short's palette */
const AMBER = { palette: { accent: '#f4a62a', accent2: '#f4a62a', ink: '#0d1014', paper: '#f3ebdd', hl: '#f4a62a' } };
const VS = { palette: { accent2: '#3d7bff', accent: '#ff5c7a', hl: '#ffd23f', ink: '#0d0f1a', paper: '#f7f4ee' } };
/** the hand-drawn kit's looks: the crayon picture book (fd-tangyuan), the squared notebook (fd-map), white marker on black (fd-quotes),
 *  pencil on cream (fishing1) */
const BOOK = { palette: { ink: '#5b3a26', accent: '#d4573b', hl: '#f2c14e', paper: '#f4e8d4', accent2: '#7fa35b' } };
const NOTE = { palette: { ink: '#1f3a8a', accent: '#d62f2f', hl: '#ffe24d', paper: '#fbf8f0', accent2: '#3b82c4' } };
const MARK = { palette: { ink: '#f4f3ee', accent: '#e4ff1a', hl: '#e4ff1a', paper: '#0f0f0f', accent2: '#9a9a96' } };
const SKETCH = { palette: { ink: '#33302c', accent: '#c97b5c', hl: '#e3c48a', paper: '#f3eee3', accent2: '#93ab86' } };
/** chili-history's woodcut cards: parchment, brown-black ink, chili red, ochre */
const WOOD = { palette: { ink: '#3a2a1e', accent: '#b8322a', hl: '#c98f1a', paper: '#f4ead2', accent2: '#2b211b' } };
/** common.chart's data: parenting-brain's day ranking, fd-caibao's table, parenting-brain's two ledgers */
const RANK = '親密關係|5.10\n社交|4.59\n放鬆|4.42\n⋯\n小睡|3.87|11\n照顧孩子|3.86\n上網|3.81\n家事|3.73\n上班|3.62\n通勤|3.45';
const TABLE = '|A 店|B 店|C 店\n價格|35 元|45 元|40 元\n內餡|高麗菜|蘿蔔絲|韭菜\n口感|Q 彈|鬆軟|紮實';
/** common.mapcam's map pictures: one made-up street map (golden/fixtures/fake-map.png: a slanted street grid, a river, a park and a square drawn by a small script, no map data) placed twice, wide (z12) and close (z14) */
const FAKE = (zoom: number) => ({ file: 'fixtures/fake-map.png', width: 360, height: 640, map: { center: [19.937, 50.061] as [number, number], zoom, credit: 'Golden test map (made up)' } });
const MAPS = { wide: FAKE(12), city: FAKE(14) };
const SQUARE = '廣場|Rynek|19.9385|50.0638, 公園|Park|19.9308|50.0681';
/** group D (seoul-bbq): a charcoal-fire palette and a bakery ranking with a tie for second */
const EMBER = { palette: { ink: '#17120f', paper: '#fff4e2', accent: '#ff5a1f', accent2: '#f4c34f', hl: '#f4c34f' } };
const BAKERY = 'Garlic cream||1\nMatcha roll||2\nCurry bun||2\nMelon pan||3\nBaguette||4';
const LEDGER = '當下帳|0.5,0.75,0.3,0.62,0.4,0.7,0.35,0.6\n長期帳|0.2,0.3,0.42,0.5,0.6,0.68,0.75,0.8';

/** common.notify's tones: a dark system note, a hidden preview, an accent card with a gloss; a chat that grows up */
const NOTES = '0.2|moon|休息模式||已將 1 則通知靜音|dark\n0.6|play|影片|十件事之外…|預覽已隱藏・解鎖以查看|lock\n1.0|star|今日一句||人生來就是累的，/所以要【休息】。|accent|sub=Man is born tired and lives to rest.';
const CHAT = '0.2|user|小美||到了嗎？|light|who=#d6336c\n0.8|user|阿凱||快到了，在排隊|light\n1.4|user|小美||幫我買一杯！|light|who=#d6336c\n2.0|user|阿凱||好啦好啦|light';

/** common.album's photos: the made-up map as a picture (twice, two focus points) among painted stand-ins */
const PIC = { pic: { file: 'fixtures/fake-map.png', width: 360, height: 640 } };
/** common.chat's messages: every kind on one chat, and a group with names */
const CHAT_MEDIA = `-1|sys|以下為情境重現
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
const CHAT_GROUP = `-1|sys|10月24日
0.1|阿哲|明天幾點出發？
0.5|阿哲|我可以開車
0.9|Mia|七點？太早了吧 This is way too early for a Saturday morning honestly|avatar=🌸|color=#b388ff
1.4|me|那八點，車站見|when=21:04
1.9|me|記得帶泳衣|unread
2.2|阿哲||typing
2.6|阿哲|OK 👍`;
const ALBUM = '# 港邊|7月12日|第 1 天\npic|0||0.5,0.4\n-\n-||0:12\n# 老街|7月13日|第 2 天\n-\npic|0|0:08|0.3,0.6\n-\n# |7月15日|第 4 天\n-\n-\n-\n-';

export const cases: Case[] = [
  // the five core blocks: the block gallery's thumbnails come from these pictures (and they keep the core look from drifting)
  { name: 'core-flash', type: 'core.flash', at: [0.05] },
  { name: 'core-title', type: 'core.title', params: { text: '京都三日', sub: '秋天的第一場旅行' }, at: [1.5] },
  { name: 'core-caption', type: 'core.caption', params: { text: '這家店開了四十年' }, at: [1.5] },
  { name: 'core-lower-third', type: 'core.lowerThird', params: { text: '伏見稻荷大社', sub: '京都・伏見區' }, at: [1.5] },
  { name: 'core-end-card', type: 'core.endCard', params: { text: '感謝觀看\n剪輯　Tellcut\n2026 秋' }, at: [2.5] },
  { name: 'progress-bar', type: 'common.progress', params: { thickness: 24 }, at: [0.5, 2.5] },
  { name: 'progress-dots', type: 'common.progress', params: { mode: 'dots', position: 'bottom', thickness: 36 }, theme: { palette: { accent: '#2ec4b6' } }, at: [0.5, 2.5] },
  // chapter tabs: the second chapter lit (popping at 0.1 s, settled at 1.5 s), the first one ticked
  { name: 'progress-tabs', type: 'common.progress', params: { mode: 'tabs', labels: '乾料,濕料,麵糊,下鍋,開動', icons: '🧂,🥛,🥣,🍳,🥞', step: 1 }, at: [0.1, 1.5] },
  { name: 'film', type: 'common.film', params: { grain: 0.7, vignette: 0.6 }, at: [0.5] },
  { name: 'caption-outline', type: 'common.caption', params: { text: '這家店【超好吃】，老闆說的{秘密}配方' }, at: [1.5] },
  { name: 'caption-box-center', type: 'common.caption', params: { text: '重點在這裡', style: 'box', position: 'center' }, at: [1.5] },
  { name: 'caption-bubble', type: 'common.caption', params: { text: '哇！它裡面就是【滿滿】的肉餡', style: 'bubble' }, at: [1.5] },
  { name: 'backdrop-gingham', type: 'common.backdrop', at: [0.5] },
  { name: 'backdrop-dots', type: 'common.backdrop', params: { pattern: 'dots', tint: 0.3 }, at: [0.5] },
  { name: 'backdrop-stripes', type: 'common.backdrop', params: { pattern: 'stripes', tint: 0.2 }, at: [0.5] },
  { name: 'backdrop-grid', type: 'common.backdrop', params: { pattern: 'grid', tint: 0.3 }, at: [0.5] },
  { name: 'backdrop-gradient', type: 'common.backdrop', params: { pattern: 'gradient', color2: '#2ec4b6' }, at: [0.5] },
  { name: 'panel', type: 'common.panel', at: [0.5] },
  // levels: shallow at once, then 332 m (eased), then deep (jump) — the same stops drive both blocks
  // GPU shader backgrounds: the picture comes from the graphics chip, so another machine may need npm run golden -- --update shader
  { name: 'shader-mesh', type: 'common.shader', params: { look: 'mesh' }, theme: { palette: { accent: '#ff6b2c', accent2: '#1f9e8a', hl: '#ffd23f', ink: '#0b1a2c', paper: '#f6efe2' } }, at: [0.5, 2.5] },
  { name: 'shader-grain', type: 'common.shader', params: { look: 'grain', grain: 0.4 }, at: [1.5] },
  { name: 'ambient', type: 'common.ambient', params: { stops: '0:0, 1:332, 2:10928:s', max: 11034, scale: 'log' }, at: [0.5, 2.5] },
  { name: 'meter', type: 'common.meter', params: { stops: '0:0, 1:332, 2:10928:s', prefix: '−', suffix: ' m', max: 11034, scale: 'log', stages: '0:透光帶,200:暮光帶,1000:半深海帶,3000:深海帶,6000:超深海帶', stagePrefix: '水深・' }, at: [0.5, 1.3, 2.5], bg: '#0c4e80' },
  { name: 'badge-star', type: 'common.badge', params: { label: 'No.1', plate: '阿桃的店' }, at: [1.5] },
  { name: 'badge-burst', type: 'common.badge', params: { label: '02', shape: 'burst', x: 0.2, y: 0.2, size: 22 }, at: [1.5] },
  { name: 'tag', type: 'common.tag', params: { tags: '500碗認證,傳奇小吃,步行3分鐘' }, at: [1.5] },
  { name: 'burst', type: 'common.burst', params: { text: '出發！' }, at: [1.5] },
  { name: 'speedlines', type: 'common.speedlines', at: [1.5], bg: '#ffd9a0' },
  { name: 'progress-icons', type: 'common.progress', params: { mode: 'dots', icons: '🍗,🥟,🍬,🍜', dots: 4, position: 'bottom', thickness: 30 }, at: [1.5] },
  { name: 'progress-step', type: 'common.progress', params: { mode: 'dots', icons: '🍗,🥟,🍬', dots: 3, step: 0, iconSize: 1.4, position: 'bottom', thickness: 30 }, at: [2.5] },
  // the hook recipe's chapter row under its panel (9:16): five icons at its size, the last one current, inside the side safe margins
  { name: 'progress-hook', type: 'common.progress', params: { mode: 'dots', icons: '🍗,🥟,🍬,🍜,🍰', dots: 5, step: 4, iconSize: 2.2, position: 'bottom', y: 0.6617 }, at: [1.5] },
  { name: 'slam', type: 'common.slam', params: { text: '你絕對想不到\n【這個】價格' }, at: [0.1, 1.5] },
  { name: 'censor', type: 'common.censor', at: [0.1, 1.5] },
  { name: 'stamp', type: 'common.stamp', params: { text: '已驗證' }, at: [0.05, 1.5] },
  { name: 'pen-circle', type: 'common.pen', params: { kind: 'circle' }, at: [0.15, 1.5] },
  { name: 'pen-arrow', type: 'common.pen', params: { kind: 'arrow', x: 0.6, y: 0.4, w: 0.35, h: 0.15 }, at: [1.5] },
  { name: 'pen-underline', type: 'common.pen', params: { kind: 'underline', w: 0.5, h: 0.04 }, at: [1.5] },
  { name: 'sparkle-burst', type: 'common.sparkle', at: [0.4, 1.0] },
  { name: 'sparkle-twinkle', type: 'common.sparkle', params: { mode: 'twinkle', spread: 0.6 }, at: [1.5] },
  { name: 'emoji-sticker', type: 'common.emoji', at: [0.5, 1.5] },
  { name: 'emoji-rain', type: 'common.emoji', params: { mode: 'rain', char: '🍜🔥😋' }, at: [1.2] },
  { name: 'header', type: 'common.header', params: { no: '02', text: '醬香雞腿' }, at: [1.5] },
  // white text outlined in the theme ink: still readable on the panel layout's paper (review 2, C2)
  { name: 'paper-header', type: 'common.header', params: { no: '02', text: '醬香雞腿' }, at: [1.5], bg: '#fff8ec' },
  { name: 'paper-meter', type: 'common.meter', at: [2.5], bg: '#fff8ec' },
  { name: 'glitch', type: 'common.glitch', params: { density: 1 }, at: [0.2], bg: '#d9c9a8' },
  // the changed cell pops with a ring (0.4 s), then settles with its note (1.5 s)
  // a receipt: three lines printed (the third still flashing), then the total in
  { name: 'receipt', type: 'common.receipt', at: [1.0, 2.6] },
  { name: 'wide-receipt', type: 'common.receipt', at: [2.6], wide: true },
  { name: 'scoreboard', type: 'common.scoreboard', params: { title: '🧾 今日釣果', sub: '目標：東洋鱸', icons: '🎯|🐡|🐟|🎣', names: '東洋鱸|河豚|小魚|釣竿', values: '0|3|12|斷了', tones: 'n|n|good|bad', pop: 3, note: '第二支' }, at: [0.4, 1.5] },
  { name: 'tripclock', type: 'common.tripclock', at: [0.2, 1.9], bg: '#5d8fb8' },
  // a step card flipping in (0.2 s) and drawn (2.5 s); a cover card dealt in
  { name: 'card-step', type: 'common.card', at: [0.2, 2.5] },
  { name: 'card-cover', type: 'common.card', params: { no: '', title: '小廚師鬆餅課', detail: 'PANCAKE CLASS', enter: 'deal', emoji: '👩‍🍳' }, at: [2.5] },
  { name: 'card-art', type: 'common.card', params: { art: 'common.sparkle', artParams: { mode: 'burst' } }, at: [1.0] },
  // a block that needs a still in the window: the card hands on its media() (the export cuts the still) and its ready()
  { name: 'card-polaroid', type: 'common.card', sources: PIC, params: { title: '第一口', art: 'common.polaroid', artParams: { source: 'pic', t: 0, caption: '剛出爐', flash: false } }, at: [1.5] },
  // 16:9 (review 4, C1): the rows shrink to fit the short, wide card instead of running out under it
  { name: 'wide-card', type: 'common.card', at: [2.5], wide: true },
  // the library expansion (2026-10-18): karaoke and speaker captions, countdown, list, rating, info card, polaroid
  { name: 'caption-karaoke', type: 'common.caption', params: { text: '今天天氣很好我們出門', words: [[0, 2], [0.6, 4], [1.2, 6], [1.8, 8], [2.3, 10]] }, at: [0.7, 2.4] },
  { name: 'caption-speaker', type: 'common.caption', params: { text: '這家真的超好吃', speaker: 1, name: '阿明' }, at: [1.5] },
  { name: 'countdown', type: 'common.countdown', params: { label: '倒數' }, at: [0.4, 2.6] },
  { name: 'list', type: 'common.list', at: [0.5, 2.2] },
  { name: 'list-pros', type: 'common.list', params: { title: '優缺點', items: '份量大|- 要排隊|便宜', style: 'pros' }, at: [2.5] },
  { name: 'rating', type: 'common.rating', at: [0.8, 2.5] },
  { name: 'rating-bar', type: 'common.rating', params: { style: 'bar', max: 10, rows: '口味:9, 環境:7.5', total: '8.3/10' }, at: [2.5] },
  { name: 'info', type: 'common.info', at: [2.0] },
  { name: 'polaroid', type: 'common.polaroid', at: [0.1, 2.0] },
  { name: 'wide-info', type: 'common.info', at: [2.0], wide: true },
  // 16:9 (review 2, C4–C6): outlines, corners and sizes go by the short side, margins by the wide frame's safe area
  { name: 'wide-caption', type: 'common.caption', params: { text: '這家店【超好吃】，老闆說的{秘密}配方' }, at: [1.5], wide: true },
  { name: 'wide-badge', type: 'common.badge', params: { plate: '阿桃的店' }, at: [1.5], wide: true },
  { name: 'wide-tag', type: 'common.tag', params: { tags: '500碗認證,傳奇小吃' }, at: [1.5], wide: true },
  { name: 'wide-header', type: 'common.header', params: { no: '02', text: '醬香雞腿' }, at: [1.5], wide: true },
  { name: 'wide-progress', type: 'common.progress', params: { mode: 'dots' }, at: [1.5], wide: true },
  // promoted from a food-review hook short (2026-10-19): route map, cliffhanger seal, end card, colour grade, quote captions
  { name: 'route', type: 'common.route', at: [0.5, 2.6], bg: '#6b5444' },
  { name: 'route-names', type: 'common.route', params: { heads: '', stops: 4, hidden: 1, names: '豆花|蔥油餅|米干', start: '車站', startIcon: '🚉' }, at: [2.6], bg: '#6b5444' },
  { name: 'wide-route', type: 'common.route', at: [2.6], wide: true, bg: '#6b5444' },
  { name: 'mystery', type: 'common.mystery', params: { hint: '老闆只開到下午兩點' }, at: [0.2, 1.5], bg: '#8a6a4a' },
  { name: 'wide-mystery', type: 'common.mystery', at: [1.5], wide: true, bg: '#8a6a4a' },
  { name: 'outro', type: 'common.outro', at: [0.8, 2.95] },
  { name: 'wide-outro', type: 'common.outro', at: [2.95], wide: true },
  { name: 'tone', type: 'common.tone', at: [1.0], bg: '#7f7f7f' },
  { name: 'caption-pop', type: 'common.caption', params: { text: '真的【超級超級】好吃', animIn: 'pop', hlScale: 1.12, tag: '蔥油餅', position: 'center' }, at: [0.25, 1.5] },
  // promoted from the baking-steps and baking-sin shorts (2026-10-19): the handwritten recipe card kit and the sin meter kit
  { name: 'paper', type: 'common.paper', at: [0.5], theme: { palette: { ink: '#4a3a2e', accent: '#c2533b', paper: '#fbf7ee' } } },
  { name: 'wide-paper', type: 'common.paper', at: [0.5], wide: true },
  { name: 'notecard-step', type: 'common.notecard', at: [0.6, 2.5], bg: '#e7d8bd', theme: { palette: { ink: '#4a3a2e', accent: '#c2533b', paper: '#fbf7ee' } } },
  { name: 'notecard-list', type: 'common.notecard', params: { mode: 'list', title: '材料', note: '＊原片沒有標份量，依口味調整' }, at: [1.2, 2.6], bg: '#e7d8bd', theme: { palette: { ink: '#4a3a2e', accent: '#c2533b', paper: '#fbf7ee' } } },
  { name: 'notecard-title', type: 'common.notecard', params: { mode: 'title', title: '提拉米蘇', latin: 'Tiramisù' }, at: [0.2, 2.0], bg: '#e7d8bd' },
  { name: 'notecard-done', type: 'common.notecard', params: { mode: 'done', title: '完成！', sub: '提拉米蘇', latin: 'Tiramisù', note: '慢慢做，慢慢吃' }, at: [2.5], bg: '#e7d8bd' },
  { name: 'wide-notecard', type: 'common.notecard', at: [2.5], wide: true, bg: '#e7d8bd' },
  { name: 'handwrite', type: 'common.handwrite', at: [0.8, 2.4], bg: '#7a8c6a' },
  { name: 'handwrite-note', type: 'common.handwrite', params: { paper: 'note', small: '等待的時候……', lines: '0.3|朱槿從四月開到現在', align: 'left', x: 0.42, y: 0.4, tilt: -1.4, halo: 0 }, at: [2.0], bg: '#7a8c6a' },
  { name: 'handwrite-stack', type: 'common.handwrite', params: { mode: 'stack', align: 'left', y: 0.3, lines: '0.1|親愛的你：\n0.9|倫敦今天又下雨了\n1.8|但咖啡很好喝' }, at: [2.8], bg: '#f3e9d6' },
  { name: 'gauge', type: 'common.gauge', at: [0.2, 1.6, 2.6], bg: '#170d0a' },
  { name: 'gauge-boot', type: 'common.gauge', params: { scramble: 0.8, boot: 1.2, danger: -1, boom: -1, hits: '2.1:12', countLabel: '罪狀 #{n}' }, at: [0.4, 1.6, 2.8], bg: '#170d0a' },
  { name: 'wide-gauge', type: 'common.gauge', at: [1.6], wide: true, bg: '#170d0a' },
  { name: 'hangtag', type: 'common.hangtag', at: [0.3, 1.5], bg: '#6b4a3a' },
  { name: 'strike', type: 'common.strike', at: [0.5, 2.0], bg: '#4a5a3a' },
  { name: 'timelapse', type: 'common.timelapse', at: [1.5], bg: '#5a6a5a' },
  { name: 'progress-pencil', type: 'common.progress', params: { mode: 'pencil', dots: 8, title: '提拉米蘇・一分鐘食譜', at: '0.2,0.5,0.8,1.1,1.4,1.7,2.0,2.3,2.6' }, at: [1.0, 2.75], bg: '#e7d8bd', theme: { palette: { ink: '#4a3a2e', accent: '#c2533b' } } },
  { name: 'panel-print', type: 'common.panel', params: { look: 'print', x: 0.06, y: 0.17, w: 0.88, h: 0.37 }, at: [0.5], bg: '#e7d8bd' },
  { name: 'stamp-circle', type: 'common.stamp', params: { shape: 'circle', text: '成品', x: 0.72, y: 0.25, angle: 12 }, at: [0.05, 1.5] },
  { name: 'burst-blast', type: 'common.burst', params: { mode: 'blast', text: '爆表！' }, at: [0.05, 0.6], bg: '#3a2a20' },
  { name: 'slam-stagger', type: 'common.slam', params: { text: '這一塊\n【有多罪惡？】', stagger: 0.42, hlScale: 1.25, size: 6.5 }, at: [0.2, 1.5] },
  { name: 'slam-verdict', type: 'common.slam', params: { text: '值得。', kicker: '結論：', after: '（明天再減肥）', enter: 'press', font: 'Noto Serif TC', size: 13, shadow: '#e63a2e', tilt: 0, shake: 0 }, at: [2.0] },
  { name: 'caption-gloss', type: 'common.caption', params: { text: 'Oh boy.', quote: true, gloss: '（天啊。）', font: 'Noto Serif TC' }, at: [1.5] },
  { name: 'backdrop-glow', type: 'common.backdrop', params: { pattern: 'stripes', color: '#1d110d', color2: '#f6ead8', tint: 0.05, scale: 100, glow: '0:0, 1:0.7', glowPulse: 0.3 }, at: [2.0] },
  // promoted from the uk-beat and uk-postcard shorts (2026-10-19): the rail-ticket beat edit kit and the postcard kit
  { name: 'routeboard', type: 'common.routeboard', at: [0.15, 2.8], bg: '#3d4a57' },
  { name: 'wide-routeboard', type: 'common.routeboard', at: [1.2], wide: true, bg: '#3d4a57' },
  { name: 'mapjump', type: 'common.mapjump', at: [0.25, 1.0] },
  { name: 'mapjump-all', type: 'common.mapjump', params: { mode: 'all', kicker: '全程', title: '三站到齊', latin: 'PARIS · KRAKÓW · TALLINN', dates: '2022.05.26 → 08.21' }, at: [0.6] },
  { name: 'wide-mapjump', type: 'common.mapjump', at: [1.0], wide: true },
  { name: 'ticket', type: 'common.ticket', at: [0.08, 1.5], bg: '#5a6b78' },
  { name: 'wide-ticket', type: 'common.ticket', params: { title: '克拉科夫', latin: 'KRAKÓW · POLSKA', no: '02', date: '06.06', date2: '2022' }, at: [1.5], wide: true, bg: '#5a6b78' },
  { name: 'snap', type: 'common.snap', at: [0.04, 1.0], bg: '#7b8f6a' },
  { name: 'stations', type: 'common.stations', at: [0.05, 1.5], bg: '#6d7f92' },
  { name: 'tag-label', type: 'common.tag', params: { look: 'label', tags: '羅浮宮,05.28', size: 2.7, x: 0.12, y: 0.24 }, at: [0.05, 1.5], bg: '#6d7f92' },
  { name: 'slam-bar', type: 'common.slam', params: { text: '三座城', enter: 'press', popDur: 0.1, shake: 0, tilt: 0, bar: '#ff3b1f', drift: 0.05, size: 8.75, y: 0.55 }, at: [0.1, 1.5], bg: '#6d7f92' },
  { name: 'list-stack', type: 'common.list', params: { look: 'stack', title: '', items: '甜點\n鬆餅\n蒙布朗\n可頌\n可麗餅', stagger: 0.5 }, at: [1.2, 2.6], bg: '#6d7f92' },
  { name: 'postcard', type: 'common.postcard', at: [0.4, 2.6] },
  { name: 'postcard-flip', type: 'common.postcard', params: { card: {"index":3,"orient":"portrait","show":"front","flip":{"at":0,"dur":0.9},"front":{"stamp":{"label":"EESTI","year":"2022"},"mark":{"top":"ESTONIA","bottom":"愛沙尼亞","date":"2022.08.21"},"lines":[{"text":"夏天快結束時"},{"text":"走進一條綠色的長廊"}]},"back":{"lines":[{"text":"謝謝你","t0":1,"t1":1.6},{"text":"那時候願意出發","t0":1.7,"t1":2.6}],"sig":{"text":"—— 2022 · 夏末"},"address":[{"text":"寄給：自己"},{"text":"一路上的每一天"}],"mark":{"top":"SUMMER","bottom":"那年夏天","date":"2022","at":1.2}}}, pile: [{"index":0,"orient":"portrait","show":"front","front":{"open":1000000000,"stamp":{"label":"MORNING","year":"2022"},"mark":{"top":"BEFORE","bottom":"出發以前","date":"2021.06.04"},"lines":[{"text":"出發以前"},{"text":"是一盤一盤安靜的早餐"}]}},{"index":1,"orient":"portrait","show":"front","front":{"open":1000000000,"stamp":{"label":"FRANCE","year":"2022"},"mark":{"top":"PARIS","bottom":"巴黎","date":"2022.05.26"},"lines":[{"text":"到了巴黎"},{"text":"先好好吃一頓"}]}},{"index":2,"orient":"landscape","show":"front","front":{"open":1000000000,"stamp":{"label":"FRANCE","year":"2022"},"mark":{"top":"PARIS","bottom":"巴黎","date":"2022.05.27"},"lines":[{"text":"抬起頭"},{"text":"風把旗子吹得好慢"}]}}] }, at: [0.45, 2.8] },
  { name: 'postcard-spread', type: 'common.postcard', params: { card: {"index":3,"orient":"portrait","show":"back","front":{"stamp":{"label":"EESTI","year":"2022"},"mark":{"top":"ESTONIA","bottom":"愛沙尼亞","date":"2022.08.21"},"lines":[{"text":"夏天快結束時"},{"text":"走進一條綠色的長廊"}]},"back":{"lines":[{"text":"謝謝你","t0":1,"t1":1.6},{"text":"那時候願意出發","t0":1.7,"t1":2.6}],"sig":{"text":"—— 2022 · 夏末"},"address":[{"text":"寄給：自己"},{"text":"一路上的每一天"}],"mark":{"top":"SUMMER","bottom":"那年夏天","date":"2022","at":1.2}}}, pile: [{"index":0,"orient":"portrait","show":"front","front":{"open":1000000000,"stamp":{"label":"MORNING","year":"2022"},"mark":{"top":"BEFORE","bottom":"出發以前","date":"2021.06.04"},"lines":[{"text":"出發以前"},{"text":"是一盤一盤安靜的早餐"}]}},{"index":1,"orient":"portrait","show":"front","front":{"open":1000000000,"stamp":{"label":"FRANCE","year":"2022"},"mark":{"top":"PARIS","bottom":"巴黎","date":"2022.05.26"},"lines":[{"text":"到了巴黎"},{"text":"先好好吃一頓"}]}},{"index":2,"orient":"landscape","show":"front","front":{"open":1000000000,"stamp":{"label":"FRANCE","year":"2022"},"mark":{"top":"PARIS","bottom":"巴黎","date":"2022.05.27"},"lines":[{"text":"抬起頭"},{"text":"風把旗子吹得好慢"}]}}], spread: { at: 0.3, dur: 1.2, center: [540, 900, 0, 0.5], slots: [[200, 330, -6, 0.3], [880, 340, 7, 0.3], [880, 1450, -7, 0.3]] } }, at: [2.0] },
  { name: 'wide-postcard', type: 'common.postcard', params: { orient: 'landscape', lines: '0.2-1.0|抬起頭\n1.1-2.0|風把旗子吹得好慢' }, at: [2.6], wide: true },
  { name: 'postmark', type: 'common.postmark', at: [0.45, 1.5], bg: '#c9b48f' },
  { name: 'frame', type: 'common.frame', at: [0.2, 2.0] },
  { name: 'frame-tv', type: 'common.frame', params: { look: 'tv', aspect: 1.33, caption: 'STUDIO 1983', backdrop: 'color' }, at: [2.0] },
  { name: 'frame-photo-flip', type: 'common.frame', params: { look: 'photo', flipAt: 1.0, enter: 'left' }, at: [1.35, 2.8] },
  { name: 'wide-frame', type: 'common.frame', params: { look: 'card', aspect: 1.5 }, at: [2.0], wide: true },
  // promoted from the food-receipt and food-deep shorts (2026-10-19): the receipt printer kit and the queue-number board kit
  { name: 'dotmatrix', type: 'common.dotmatrix', at: [0.5, 2.0], bg: '#2a2f36' },
  { name: 'dotmatrix-print', type: 'common.dotmatrix', params: { mode: 'type', look: 'print', text: '謝謝光臨・中壢人萬歲', color: '#262422', pitch: 3.2 }, at: [0.6, 2.0], bg: '#f5f2ea' },
  { name: 'digits', type: 'common.digits', at: [0.5, 2.0, 2.7], bg: '#123033' },
  { name: 'digits-led', type: 'common.digits', params: { style: 'led', steps: '0|--|叫號, 0.6|01, 1.4|02, 2.2|04|下一位', label: '叫號', totalAt: -1, title: '驚嘆號臭豆腐', sub: '中壢・街邊排隊名店', w: 0.944 }, at: [0.65, 2.5], bg: '#17110d' },
  { name: 'printer', type: 'common.printer', params: { clip: 0.37 }, at: [0.7, 2.8], bg: '#123033' },
  { name: 'printer-tear', type: 'common.printer', params: { lines: '0|title|這一圈花多少？\n0.1|small|顧客：路過的吃貨\n0.2|shop|01 阿桃的店\n0.3|item|招牌大湯圓|95\n0.4|item|鮮切土雞|秤重計價\n0.5|dbl\n0.6|total|合計|NT$355起\n0.7|note|＊價格取自片中店家價目表\n0.75|sign|顧客簽章：\n0.8|thanks|謝謝光臨', tearAt: 0.9, strikeLine: 1, strikeAt: 1.6, stampAt: 0.85, stamp: '大胃王認證' }, at: [1.1, 2.7], bg: '#123033' },
  { name: 'rolldoor', type: 'common.rolldoor', at: [0.6, 1.5], bg: '#3d4a57' },
  { name: 'callout', type: 'common.callout', at: [0.3, 1.5], bg: '#5a4a3a' },
  { name: 'callout-ban', type: 'common.callout', params: { kind: 'ban', x: 0.8, y: 0.3, text: '電話訂餐 ✕', tone: 'accent' }, at: [1.5], bg: '#5a4a3a' },
  { name: 'slip', type: 'common.slip', at: [0.15, 1.5], bg: '#17110d' },
  { name: 'slip-board', type: 'common.slip', params: { mode: 'board', title: '下一位，換你排', sub: '中壢車站 步行 10 分鐘' }, at: [2.0], bg: '#6b5444' },
  { name: 'backdrop-diamond', type: 'common.backdrop', params: { pattern: 'diamond', color: '#123033', color2: '#ffffff', tint: 0.035, scale: 32, pool: 0.16, vignette: 0.45 }, at: [0.5] },
  { name: 'panel-bezel', type: 'common.panel', params: { look: 'bezel', border: '#0a1214', x: 0.033, y: 0.078, w: 0.933, h: 0.292, radius: 22 }, at: [0.5], bg: '#123033' },
  { name: 'panel-hole', type: 'common.panel', params: { look: 'hole', x: 0.028, y: 0.156, w: 0.944, h: 0.448, radius: 20 }, at: [0.5] },
  { name: 'caption-ticket', type: 'common.caption', params: { text: '欸 湯圓很大顆耶', style: 'ticket', y: 0.37, size: 2.4 }, at: [0.1, 1.5], bg: '#123033' },
  { name: 'caption-tint', type: 'common.caption', params: { text: '我們沒有加傳統的蒜蓉醬', style: 'plain', speaker: 2, name: '老闆', tint: false, size: 2.7 }, at: [1.5], bg: '#17110d' },
  { name: 'slam-led', type: 'common.slam', params: { text: '蒜頭超級貴', look: 'led', kicker: '為什麼不加蒜？', kickerBg: '#f0b23e', tilt: 0, size: 6, y: 0.5 }, at: [0.07, 1.5], bg: '#5a4a3a' },
  { name: 'slam-chars', type: 'common.slam', params: { text: '一家值得排隊', enter: 'chars', kicker: '今天只講一家', kickerBg: '#d8352a', shade: 0.6, shadow: '#d8352a', color: '#f3e6c8', tilt: 0, shake: 0, size: 6.9, y: 0.52 }, at: [0.3, 1.5], bg: '#7a6a5a' },
  { name: 'burst-rays', type: 'common.burst', params: { mode: 'rays', text: '咔滋！', x: 0.37, y: 0.31, fill: '#f0b23e', tilt: -8 }, at: [0.1, 1.0], bg: '#5a4a3a' },
  { name: 'receipt-bar', type: 'common.receipt', params: { title: '中壢吃一圈', items: '0.2||01 阿桃的店||bar\n0.55|🍡|招牌大湯圓|95|n\n0.9|🍜|湯粄條|60|n', totalAt: 1.4, total: 'NT$155' }, at: [2.0] },
  { name: 'wide-printer', type: 'common.printer', at: [2.8], wide: true, bg: '#123033' },
  { name: 'wide-digits-led', type: 'common.digits', params: { style: 'led', steps: '0|--|叫號, 0.6|01', label: '叫號', totalAt: -1, title: '驚嘆號臭豆腐', sub: '中壢・街邊排隊名店', w: 0.944 }, at: [2.5], wide: true, bg: '#17110d' },
  // promoted from the podcast shorts (2026-10-19): the pull-quote kit (podcast-quote) and the he-says / she-says kit (podcast-versus)
  { name: 'quote', type: 'common.quote', at: [1.0, 2.1, 2.8], theme: QUOTE, bg: '#121015' },
  { name: 'quote-ghost', type: 'common.quote', params: { text: '\n\n\n那 就 別起。\n去睡吧', pre: '\n討厭早起，\n又沒有理由？', ghost: true, kicker: '睡眠教練給討厭早起的人' }, at: [0.5], theme: QUOTE, bg: '#121015' },
  { name: 'quote-card', type: 'common.quote', params: { mode: 'card', text: '討厭早起、又沒有理由？\n那就算了，去睡吧。\n長大的好處就是：作息可以自己決定。', hit: 1, sizes: '64,92,48', serif: '2', who: 'Mia 教練', kicker: 'PODCAST｜午後聊聊' }, at: [0.3, 2.0], theme: QUOTE },
  { name: 'wide-quote', type: 'common.quote', at: [2.8], wide: true, theme: QUOTE, bg: '#121015' },
  { name: 'wipe', type: 'common.wipe', at: [0.6, 1.5, 2.4], theme: QUOTE, bg: '#2a6b8f' },
  { name: 'duo', type: 'common.duo', at: [0.6, 2.2], theme: VS, bg: '#3f9a5c' },
  { name: 'wide-duo', type: 'common.duo', params: { dir: 'h', top: 0.12, band: 0.16, foot: 0.03 }, at: [0.6], wide: true, theme: VS, bg: '#3f9a5c' },
  { name: 'versus', type: 'common.versus', at: [0.15, 1.5], theme: VS },
  { name: 'versus-title', type: 'common.versus', params: { mode: 'title' }, at: [0.2, 1.2], theme: VS, bg: '#3f9a5c' },
  { name: 'versus-table', type: 'common.versus', params: { mode: 'table' }, at: [0.5, 2.0], theme: VS },
  { name: 'wide-versus', type: 'common.versus', params: { mode: 'table' }, at: [2.0], wide: true, theme: VS },
  { name: 'backdrop-spot', type: 'common.backdrop', params: { pattern: 'spot', color: '#121015', color2: '#ff7a4a', tint: 0.12 }, at: [0.5] },
  { name: 'panel-offset', type: 'common.panel', params: { look: 'offset', x: 0.083, y: 0.189, w: 0.833, h: 0.481, radius: 20, shadow: 18 }, at: [0.1, 0.5], theme: QUOTE, bg: '#121015' },
  { name: 'header-kicker', type: 'common.header', params: { look: 'kicker', text: '很【討厭早起】，還要撐嗎？' }, at: [0.2, 1.5], theme: QUOTE, bg: '#121015' },
  { name: 'caption-fill', type: 'common.caption', params: { text: '如果他很討厭早起，\n但他有【很強烈的理由】，', style: 'plain', align: 'left', size: 2.8, y: 0.78, name: 'Mia', role: '睡眠教練', speaker: 3, tint: false, fill: true, words: [[0.3, 3], [0.6, 6], [0.9, 9], [1.3, 12], [1.6, 15], [2.0, 19]] }, at: [1.0, 2.6], theme: QUOTE, bg: '#121015' },
  { name: 'caption-point', type: 'common.caption', params: { text: '大部分的人週末都在補眠\n可是【補眠根本補不回來】', style: 'plain', align: 'left', point: 'down', name: '她', speaker: 3, tint: false, size: 2.45, y: 0.575, animIn: 'none' }, at: [1.5], theme: VS, bg: '#0d0f1a' },
  { name: 'stamp-card', type: 'common.stamp', params: { shape: 'card', text: '你只是沒睡飽，\n要先【早點上床】', tag: 'Mia 說', size: 2.7, angle: 1.6, x: 0.45, y: 0.6, anchor: 'top' }, at: [0.1, 1.5], theme: VS, bg: '#4a5a6a' },
  // the hand-drawn kit (sketch.ts): pens, crayon fills and grain, the drawn panel frame, the crayon caption band, book and notebook paper,
  // the red pen under handwriting
  { name: 'paper-book', type: 'common.paper', params: { look: 'book' }, at: [0.5], theme: BOOK },
  { name: 'wide-paper-book', type: 'common.paper', params: { look: 'book' }, at: [0.5], wide: true, theme: BOOK },
  { name: 'paper-grid', type: 'common.paper', params: { look: 'grid' }, at: [0.5], theme: NOTE },
  { name: 'panel-drawn', type: 'common.panel', params: { look: 'drawn' }, at: [0.25, 1.5], theme: BOOK, bg: '#f4e8d4' },
  { name: 'panel-drawn-marker', type: 'common.panel', params: { look: 'drawn', pen: 'marker', radius: 0, tape: false, x: 0.12, y: 0.13, w: 0.76, h: 0.43 }, at: [1.0], theme: MARK, bg: '#0f0f0f' },
  { name: 'panel-drawn-pencil', type: 'common.panel', params: { look: 'drawn', pen: 'pencil', radius: 20, corners: 'tl,br' }, at: [1.5], theme: SKETCH, bg: '#f3eee3' },
  { name: 'caption-crayon', type: 'common.caption', params: { text: '湯圓【超大顆】，一口咬下去', style: 'crayon', font: 'LXGW WenKai TC' }, at: [0.08, 1.5], theme: BOOK, bg: '#f4e8d4' },
  { name: 'handwrite-red', type: 'common.handwrite', params: { lines: '0.1-1.6|從中壢車站走路三分鐘', red: '三分鐘', halo: 0, y: 0.45 }, at: [1.2, 2.4], theme: NOTE, bg: '#fbf8f0' },
  { name: 'pen-crayon-heart', type: 'common.pen', params: { kind: 'heart', style: 'crayon' }, at: [0.25, 1.5], theme: BOOK, bg: '#f4e8d4' },
  { name: 'pen-crayon-stars', type: 'common.pen', params: { kind: 'stars', style: 'crayon' }, at: [0.35], theme: BOOK, bg: '#f4e8d4' },
  { name: 'pen-crayon-house', type: 'common.pen', params: { kind: 'house', style: 'crayon' }, at: [1.5], theme: BOOK, bg: '#f4e8d4' },
  { name: 'pen-crayon-clock', type: 'common.pen', params: { kind: 'clock', style: 'crayon' }, at: [1.5], theme: BOOK, bg: '#f4e8d4' },
  { name: 'pen-crayon-steam', type: 'common.pen', params: { kind: 'steam', style: 'crayon', color: '#ffffff' }, at: [1.5], theme: BOOK, bg: '#8a6a4a' },
  { name: 'pen-marker-burst', type: 'common.pen', params: { kind: 'burst', style: 'marker' }, at: [1.5], theme: MARK, bg: '#0f0f0f' },
  { name: 'pen-marker-thumb', type: 'common.pen', params: { kind: 'thumb', style: 'marker', color: '#f4f3ee', fill: '#1a1a1a' }, at: [1.5], theme: MARK, bg: '#0f0f0f' },
  { name: 'pen-marker-rays', type: 'common.pen', params: { kind: 'rays', style: 'marker' }, at: [1.5], theme: MARK, bg: '#0f0f0f' },
  { name: 'pen-marker-arrow', type: 'common.pen', params: { kind: 'arrow', style: 'marker' }, at: [0.2, 1.5], theme: MARK, bg: '#0f0f0f' },
  { name: 'pen-ballpoint-circle', type: 'common.pen', params: { kind: 'circle', style: 'ballpoint' }, at: [0.2, 1.5], theme: NOTE, bg: '#fbf8f0' },
  { name: 'pen-ballpoint-check', type: 'common.pen', params: { kind: 'check', style: 'ballpoint' }, at: [1.5], theme: NOTE, bg: '#fbf8f0' },
  { name: 'pen-ballpoint-cross', type: 'common.pen', params: { kind: 'cross', style: 'ballpoint' }, at: [1.5], theme: NOTE, bg: '#fbf8f0' },
  { name: 'pen-ballpoint-qmark', type: 'common.pen', params: { kind: 'qmark', style: 'ballpoint' }, at: [1.5], theme: NOTE, bg: '#fbf8f0' },
  { name: 'pen-pencil-star', type: 'common.pen', params: { kind: 'star', style: 'pencil' }, at: [1.5], theme: SKETCH, bg: '#f3eee3' },
  { name: 'pen-pencil-diamond', type: 'common.pen', params: { kind: 'diamond', style: 'pencil', fill: '#bcd3ea' }, at: [1.5], theme: SKETCH, bg: '#f3eee3' },
  { name: 'pen-pencil-snow', type: 'common.pen', params: { kind: 'snow', style: 'pencil', color: '#4f87b0' }, at: [1.5], theme: SKETCH, bg: '#f3eee3' },
  { name: 'pen-pencil-underline', type: 'common.pen', params: { kind: 'underline', style: 'pencil', w: 0.5, h: 0.04 }, at: [1.5], theme: SKETCH, bg: '#f3eee3' },
  // common.chart: every kind in clean and hand (and woodcut for chili's bars and balance), both frame shapes
  { name: 'chart-bars', type: 'common.chart', at: [0.8, 2.5] },
  { name: 'chart-bars-hand', type: 'common.chart', params: { look: 'hand', pen: 'ballpoint', title: '桃園市客家人口', stat: '約 90.5 萬人', data: '桃園市|90.5\n新北市|67.2\n臺中市|49.3', unit: '', hl: '1', mark: 'circle', compare: 'none', note: '全台最多', source: '單位：萬人・客委會 110 年調查' }, at: [0.6, 2.5], theme: NOTE },
  { name: 'chart-bars-woodcut', type: 'common.chart', params: { look: 'woodcut', title: '產量', hl: '2' }, at: [2.5], theme: WOOD },
  { name: 'chart-bars-v', type: 'common.chart', params: { dir: 'v', title: '有孩子的快樂落差', data: '沒孩子|7.4\n有孩子|6.2', unit: '', hl: '2', compare: 'gap', note: '快樂落差', source: '示意' }, at: [2.5] },
  { name: 'chart-bars-v-hand', type: 'common.chart', params: { dir: 'v', look: 'hand', pen: 'pencil', title: '父母的睡眠', data: '媽媽|6.1\n爸爸|6.9', unit: ' 小時', base: '7|懷孕前', hl: '1', compare: 'none', source: '德國・追蹤父母' }, at: [2.5], theme: SKETCH },
  { name: 'chart-pie', type: 'common.chart', params: { kind: 'pie', title: '一週時間分配', data: '工作|40\n睡覺|35\n吃飯|25', note: '純屬估算', source: '' }, at: [1.0, 2.5] },
  { name: 'chart-pie-hand', type: 'common.chart', params: { kind: 'pie', look: 'hand', pen: 'marker', title: '時間分配', data: '工作|40\n睡覺|35\n吃飯|22\n其他|3', note: '純屬估算', source: '', colors: '#e4ff1a,#ff5ca8,#5ce1ff,#f4f3ee' }, at: [1.0, 2.5], theme: MARK, bg: '#0f0f0f' },
  { name: 'chart-people', type: 'common.chart', params: { kind: 'people', title: '桃園市的客家人', mark: 'circle', source: '客委會 110 年調查' }, at: [1.0, 2.5] },
  { name: 'chart-people-hand', type: 'common.chart', params: { kind: 'people', look: 'hand', title: '英國 1.2 萬位女性', n: 60, k: 48, stat: '【8】成生過孩子', source: 'UK Biobank' }, at: [2.5], theme: BOOK, bg: '#f4e8d4' },
  { name: 'chart-rank', type: 'common.chart', params: { kind: 'rank', title: '一天裡的心情排行', data: RANK, unit: '', hl: '6', source: 'Kahneman 等，2004' }, at: [1.0, 2.5] },
  { name: 'chart-rank-hand', type: 'common.chart', params: { kind: 'rank', look: 'hand', pen: 'pencil', title: '一天裡的心情排行', data: RANK, unit: '', hl: '6', mark: 'circle', source: '' }, at: [2.5], theme: SKETCH },
  { name: 'chart-balance', type: 'common.chart', params: { kind: 'balance', title: '回頭看的天平', data: '開心|3\n壓力|3', note: '人生評分 ≈', source: '美國 180 萬人' }, at: [0.9, 2.5] },
  { name: 'chart-balance-hand', type: 'common.chart', params: { kind: 'balance', look: 'hand', pen: 'crayon', title: '印度的辣', data: '黑胡椒|2\n辣椒|5', source: '' }, at: [2.5], theme: BOOK },
  { name: 'chart-balance-woodcut', type: 'common.chart', params: { kind: 'balance', look: 'woodcut', title: '印度的辣', data: '黑胡椒|2\n辣椒|5', source: '' }, at: [2.5], theme: WOOD },
  { name: 'chart-table', type: 'common.chart', params: { kind: 'table', title: '三家菜包比一比', data: TABLE, hl: '2,3', source: '' }, at: [1.0, 2.5] },
  { name: 'chart-table-hand', type: 'common.chart', params: { kind: 'table', look: 'hand', pen: 'ballpoint', title: '三家菜包比一比', data: TABLE, hl: '1,2', mark: 'circle', source: '' }, at: [2.5], theme: NOTE },
  { name: 'chart-line', type: 'common.chart', params: { kind: 'line', title: '兩本帳', data: LEDGER, hl: '', axis: '出生|很多年後', marks: '0.3|1|★\n0.75|2|♥', source: '示意' }, at: [1.0, 2.5] },
  { name: 'chart-line-hand', type: 'common.chart', params: { kind: 'line', look: 'hand', pen: 'crayon', hl: '', title: '出生後的睡眠', data: '媽媽|7.5,6.0,6.3,6.6,6.8,6.9,7.0', base: '7.5|懷孕前', axis: '出生|6 年', note: '還沒回到原點', source: '' }, at: [2.5], theme: BOOK },
  { name: 'wide-chart-bars', type: 'common.chart', params: { dir: 'v', title: '各縣市客家人口（萬人）', data: '桃園市|90.5\n新北市|67.2\n臺中市|49.3\n新竹縣|39.8\n苗栗縣|35.6', unit: '', hl: '1', mark: 'circle', compare: 'none', source: '客委會 110 年調查' }, at: [2.5], wide: true },
  { name: 'wide-chart-bars-woodcut', type: 'common.chart', params: { look: 'woodcut', title: '產量', x: 0.72, w: 0.46, h: 0.62 }, at: [2.5], wide: true, theme: WOOD, bg: '#6b5444' },
  { name: 'wide-chart-pie-hand', type: 'common.chart', params: { kind: 'pie', look: 'hand', pen: 'crayon', title: '時間分配', data: '工作|40\n睡覺|35\n吃飯|25', note: '純屬估算', source: '' }, at: [2.5], wide: true, theme: BOOK },
  { name: 'wide-chart-people', type: 'common.chart', params: { kind: 'people', title: '桃園市的客家人', mark: 'circle', source: '客委會 110 年調查' }, at: [2.5], wide: true },
  { name: 'wide-chart-rank-hand', type: 'common.chart', params: { kind: 'rank', look: 'hand', pen: 'marker', title: '一天裡的心情排行', data: RANK, unit: '', hl: '6', source: '' }, at: [2.5], wide: true, theme: MARK, bg: '#0f0f0f' },
  { name: 'wide-chart-balance', type: 'common.chart', params: { kind: 'balance', title: '回頭看的天平', data: '開心|3\n壓力|3', note: '人生評分 ≈', source: '' }, at: [2.5], wide: true },
  { name: 'wide-chart-table-hand', type: 'common.chart', params: { kind: 'table', look: 'hand', pen: 'pencil', title: '三家菜包比一比', data: TABLE, hl: '2,3', mark: 'circle', source: '' }, at: [2.5], wide: true, theme: SKETCH },
  { name: 'wide-chart-line', type: 'common.chart', params: { kind: 'line', title: '', data: LEDGER, hl: '1', marks: '0.3|1|★\n0.75|2|♥', source: '', y: 0.87, w: 0.92, h: 0.2, grow: 2 }, at: [1.2, 2.5], wide: true, bg: '#2a2545', theme: { palette: { ink: '#f3e6d3', paper: '#151829', accent: '#ff7f66', accent2: '#5fd3bf', hl: '#ffcf7a' } } },
  // group A1 (2026-10-23): touch dots, the serif title card, the VHS look, the flash's bloom
  { name: 'touch', type: 'common.touch', at: [0.5, 0.7, 1.5, 2.5] },
  { name: 'touch-glow', type: 'common.touch', params: { look: 'glow', touches: '0.4|tap|0.5,0.4\n1-2.4|press|0.5,0.65' }, at: [0.6, 1.8], bg: '#1b2733' },
  { name: 'wide-touch', type: 'common.touch', at: [1.5, 2.5], wide: true },
  { name: 'headline', type: 'common.headline', at: [0.2, 1.5], bg: '#6b5a48' },
  { name: 'headline-black', type: 'common.headline', params: { bg: 'black', text: '1257', sub: '城市被畫成一張棋盤' }, at: [1.5] },
  { name: 'headline-type', type: 'common.headline', params: { bg: 'none', type: 6, text: '那年夏天\n我們去了海邊', sub: 'SUMMER 2003' }, at: [1.2, 2.6], bg: '#6b5a48' },
  { name: 'wide-headline', type: 'common.headline', at: [1.5], wide: true, bg: '#6b5a48' },
  { name: 'film-vhs', type: 'common.film', params: { look: 'vhs', grain: 0.3, tracking: '0.2:1.6:0.85' }, at: [0.5, 1.2], bg: '#7a8a6a' },
  { name: 'core-flash-bloom', type: 'core.flash', params: { mode: 'bloom', rise: 1.3, hold: 1, fall: 0.5, peak: 0.9, y: 0.55 }, at: [0.4, 0.9, 1.5], bg: '#2a2f3a' },
  // group A2 (2026-10-23): new styles, shapes, looks and modes of existing blocks
  { name: 'caption-bar', type: 'common.caption', params: { text: '海邊的修道院\n一晚只要【35 歐】', style: 'bar', size: 3.2 }, at: [1.5], bg: '#5b7186' },
  { name: 'caption-qa', type: 'common.caption', params: { text: '你為什麼會留在這個小鎮？', style: 'qa', name: 'Q', speaker: 1, size: 3.2 }, at: [1.5], bg: '#6d8a7a' },
  { name: 'caption-qa-a', type: 'common.caption', params: { text: '因為這裡的海\n每天都不一樣', style: 'qa', name: 'A', size: 3.2, y: 0.62 }, at: [1.5], bg: '#6d8a7a' },
  { name: 'caption-auto', type: 'common.caption', params: { text: '這家真的【超好吃】', style: 'auto', size: 3.1, animIn: 'none' }, at: [0.07, 1.5], bg: '#7a6650' },
  { name: 'caption-big', type: 'common.caption', params: { text: '也太扯了吧', style: 'big', position: 'center', animIn: 'none' }, at: [0.07, 1.5], bg: '#7a6650' },
  { name: 'wide-caption-qa', type: 'common.caption', params: { text: '你為什麼會留在這個小鎮？', style: 'qa', name: 'Q', speaker: 1, size: 4 }, at: [1.5], wide: true, bg: '#6d8a7a' },
  { name: 'stamp-double', type: 'common.stamp', params: { shape: 'double', head: '判決', text: '一點都不猶豫', angle: -8, size: 5.2, font: 'Noto Serif TC' }, at: [0.05, 1.5], bg: '#6b5a48' },
  { name: 'stamp-veto', type: 'common.stamp', params: { shape: 'double', text: '駁回', size: 3, x: 0.72, y: 0.2, angle: -9 }, at: [1.5], bg: '#efe3cc' },
  { name: 'stamp-head', type: 'common.stamp', params: { head: 'CHECKED', text: '已驗證' }, at: [1.5] },
  { name: 'wide-stamp-double', type: 'common.stamp', params: { shape: 'double', head: '判決', text: '一點都不猶豫', angle: -8, size: 7, font: 'Noto Serif TC' }, at: [1.5], wide: true, bg: '#6b5a48' },
  { name: 'tag-tape', type: 'common.tag', params: { look: 'tape', tags: '巷口排骨飯,步行 5 分鐘', no: '3', size: 3.4, y: 0.2 }, at: [0.3, 1.5], theme: NOTE, bg: '#fbf8f0' },
  { name: 'tag-pin', type: 'common.tag', params: { look: 'pin', tags: '海邊小島,ISLAND', x: 0.5, y: 0.55, size: 3, check: 1 }, at: [0.25, 0.7, 1.6], bg: '#2b86a3' },
  { name: 'wide-tag-tape', type: 'common.tag', params: { look: 'tape', tags: '巷口排骨飯,步行 5 分鐘', no: '3', size: 4.5, y: 0.2 }, at: [1.5], wide: true, theme: NOTE, bg: '#fbf8f0' },
  { name: 'wide-tag-pin', type: 'common.tag', params: { look: 'pin', tags: '海邊小島,ISLAND', x: 0.5, y: 0.6, size: 4.5, check: 1 }, at: [1.6], wide: true, bg: '#2b86a3' },
  { name: 'emoji-float', type: 'common.emoji', params: { mode: 'float', char: '♥♥😂', x: 0.86, y: 0.62 }, at: [1.2, 2.5], bg: '#3a3f4a' },
  { name: 'emoji-tap', type: 'common.emoji', params: { mode: 'tap', char: '♥', x: 0.5, y: 0.45 }, at: [0.15, 0.5, 0.85], bg: '#3a3f4a' },
  { name: 'wide-emoji-float', type: 'common.emoji', params: { mode: 'float', char: '♥👍', x: 0.9, y: 0.75 }, at: [2], wide: true, bg: '#3a3f4a' },
  { name: 'meter-band', type: 'common.meter', params: { look: 'band', stops: '0:2026, 0.4:1241:1.2, 2.1:1257:0.6', min: 1200, max: 2030, sep: false, suffix: '年', size: 5.2, pins: '1241|accent|城市被燒毀|0.5; 1257|hl|重新規劃|2.1; 1300|dashed|傳說|0' }, at: [0.3, 1.9, 2.9], bg: '#6b5a48' },
  { name: 'meter-ruler', type: 'common.meter', params: { look: 'ruler', stops: '0:175, 1:193, 2:188', min: 170, max: 200, pins: '175|accent|她' }, at: [0.5, 1.5, 2.6], bg: '#3a6a5a' },
  { name: 'wide-meter-band', type: 'common.meter', params: { look: 'band', stops: '0:2026, 0.4:1241:1.2, 2.1:1257:0.6', min: 1200, max: 2030, sep: false, suffix: '年', size: 7, pins: '1241|accent|城市被燒毀|0.5; 1257|hl|重新規劃|2.1; 1300|dashed|傳說|0' }, at: [2.5], wide: true, bg: '#6b5a48' },
  { name: 'wide-meter-ruler', type: 'common.meter', params: { look: 'ruler', stops: '0:175, 1:193, 2:188', min: 170, max: 200, pins: '175|accent|她', size: 9 }, at: [2.6], wide: true, bg: '#3a6a5a' },
  { name: 'progress-timeline', type: 'common.progress', params: { mode: 'timeline', labels: '05.26,05.27,05.28,05.29,06.06,06.10,08.21', step: 0, place: '海邊', size: 4, font: 'Noto Serif TC' }, at: [0.3, 1.5], bg: '#4d6273' },
  { name: 'progress-timeline-slide', type: 'common.progress', params: { mode: 'timeline', labels: '05.26,05.27,05.28,05.29,06.06,06.10,08.21', step: 4, from: 3, place: '山上的小鎮', size: 4, font: 'Noto Serif TC' }, at: [0.4, 1.5], bg: '#4d6273' },
  { name: 'progress-timeline-full', type: 'common.progress', params: { mode: 'timeline', labels: '05.26,05.27,05.28,05.29,06.06,06.10,08.21', step: -1, size: 4, font: 'Noto Serif TC' }, at: [0.5, 1.5], bg: '#4d6273' },
  { name: 'wide-progress-timeline', type: 'common.progress', params: { mode: 'timeline', labels: '05.26,05.27,05.28,05.29,06.06,06.10,08.21', step: 4, from: 3, place: '山上的小鎮', size: 5, font: 'Noto Serif TC' }, at: [1.5], wide: true, bg: '#4d6273' },
  { name: 'pen-trace', type: 'common.pen', params: { kind: 'trace', color: '#ffd23f', from: '0.22,0.72 0.5,0.3 0.78,0.72 0.22,0.72', to: '0.5,0.32 0.72,0.5 0.5,0.68 0.28,0.5 0.5,0.32', cut: 1.2, drawDur: 0.6, morph: 0.3 }, at: [0.7, 1.0, 1.35, 1.6], bg: '#334455' },
  { name: 'wide-pen-trace', type: 'common.pen', params: { kind: 'trace', color: '#ffd23f', from: '0.22,0.72 0.5,0.3 0.78,0.72 0.22,0.72', to: '0.5,0.32 0.72,0.5 0.5,0.68 0.28,0.5 0.5,0.32', cut: 1.2, drawDur: 0.6, morph: 0.3 }, at: [1.6], wide: true, bg: '#334455' },
  { name: 'wipe-hand', type: 'common.wipe', params: { mode: 'hand' }, len: 0.8, at: [0.2, 0.32, 0.4, 0.6], bg: '#8aa0b0' },
  { name: 'wide-wipe-hand', type: 'common.wipe', params: { mode: 'hand' }, len: 0.8, at: [0.2, 0.6], wide: true, bg: '#8aa0b0' },
  // group D (maps): no picture → the world's coast stands in; a picture pair pushed from the wide one into the close one
  { name: 'mapcam', type: 'common.mapcam', at: [0.5, 1.5, 2.6] },
  { name: 'mapcam-photo', type: 'common.mapcam', sources: MAPS, params: { source: 'wide', layers: 'city', places: SQUARE, cam: '0|19.937,50.061|13.7\n2.6|廣場|16.1',
    pins: '0.3|廣場|1.6|r', rings: '1.2|公園|70', routes: '0.4-2.2|公園>19.935,50.066>廣場|🚶', areas: '0.6|19.9365,50.0628>19.9405,50.0648',
    labels: '0.5-3|@0.5,0.74|路線示意', titles: '0.2-3|老城廣場|Rynek Główny', grade: 'saturate(1.1)' }, at: [0.3, 1.4, 2.8] },
  { name: 'mapcam-open', type: 'common.mapcam', sources: MAPS, params: { source: 'city', places: SQUARE, cam: '0|廣場|15.7\n2.2|廣場|16.1', open: '0-0.6', close: '2.2-2.8',
    pins: '-|廣場||r\n-|公園|0.8|l', routes: '-|公園>廣場|' }, at: [0.3, 1.2, 2.5] },
  { name: 'mapcam-mini', type: 'common.mapcam', sources: MAPS, params: { mode: 'mini', source: 'city', places: SQUARE, cam: '0|廣場|15.7', routes: '-|公園>廣場|', no: '02 / 03', name: '老城廣場', latin: 'Rynek Główny' }, at: [1.0] },
  { name: 'mapcam-cta', type: 'common.mapcam', params: { cta: '0.3|完整版在長片|連結在留言', pins: '', routes: '-|巴黎>克拉科夫>塔林|' }, at: [1.5] },
  { name: 'wide-mapcam', type: 'common.mapcam', at: [1.5], wide: true },
  { name: 'wide-mapcam-photo', type: 'common.mapcam', sources: MAPS, wide: true, params: { source: 'wide', layers: 'city', places: SQUARE, cam: '0|19.937,50.061|13.2\n2.6|廣場|15.6',
    pins: '0.3|廣場|1.6|r', routes: '0.4-2.2|公園>19.935,50.066>廣場|🚶', titles: '0.2-3|老城廣場|Rynek Główny' }, at: [1.4] },
  { name: 'wide-mapcam-mini', type: 'common.mapcam', sources: MAPS, wide: true, params: { mode: 'mini', source: 'city', places: SQUARE, cam: '0|廣場|15.7', corner: 'tr', no: '02 / 03', name: '老城廣場', latin: 'Rynek Główny' }, at: [1.0] },
  // group B1 (2026-10-23): the phone's notification stack and lock screen (a phone in the middle on wide frames)
  { name: 'notify', type: 'common.notify', at: [1.0, 2.0, 2.7] },
  { name: 'notify-tones', type: 'common.notify', params: { items: NOTES }, at: [2.0] },
  { name: 'notify-up', type: 'common.notify', params: { grow: 'up', items: CHAT }, at: [2.4] },
  { name: 'wide-notify', type: 'common.notify', at: [2.7], wide: true },
  { name: 'lockscreen', type: 'common.lockscreen', at: [0.5, 1.35, 2.6] },
  { name: 'lockscreen-live', type: 'common.lockscreen', params: { live: '0.2-3', liveLabel: '第', title: '0|街訪・真的很懶嗎？', of: 10, count: '0|4', dock: 'band', hint: '0|向上滑，看完整版|up', time: '9:41', carrier: '' }, at: [1.2] },
  { name: 'wide-lockscreen', type: 'common.lockscreen', params: { wall: 'gradient' }, at: [2.6], wide: true },
  // group B2: the short-video frame (feed, a cold open that rewinds, the end), the comment stream, the story stickers
  { name: 'reels', type: 'common.reels', at: [0.4, 1.4, 2.6], bg: '#4f7a8c' },
  { name: 'reels-hook', type: 'common.reels', params: { segs: '2.2-3, 3-4, 4-5, 5-6', hook: '0-2.2|2', slow: 1, title: '', counts: 'en', likes: '0|1530', taps: '', saveAt: -1, nav: false, caption: 'A long, slow lunch by the sea', more: 'more', follow: 'Follow', music: '' }, at: [1.0, 1.9], bg: '#4f7a8c' },
  { name: 'reels-end', type: 'common.reels', params: { mode: 'end' }, at: [0.9, 2.6], bg: '#4f7a8c' },
  { name: 'wide-reels', type: 'common.reels', at: [2.6], wide: true, bg: '#4f7a8c' },
  { name: 'wide-reels-end', type: 'common.reels', params: { mode: 'end' }, at: [2.6], wide: true, bg: '#4f7a8c' },
  { name: 'comments', type: 'common.comments', at: [1.0, 2.6], bg: '#4f7a8c' },
  { name: 'wide-comments', type: 'common.comments', at: [2.6], wide: true, bg: '#4f7a8c' },
  { name: 'wide-comments-none', type: 'common.comments', params: { device: 'none', w: 0.4 }, at: [2.6], wide: true, bg: '#4f7a8c' },
  { name: 'story', type: 'common.story', at: [0.6, 2.6], bg: '#4f7a8c' },
  { name: 'story-slider', type: 'common.story', params: { kind: 'slider', text: '這片海有多藍？', at: 0.5, end: 2 }, at: [1.3, 2.6], bg: '#4f7a8c' },
  { name: 'story-timer', type: 'common.story', params: { kind: 'timer', text: '等上菜中…', icon: '⏳', rot: 3 }, at: [1.5], bg: '#4f7a8c' },
  { name: 'wide-story', type: 'common.story', params: { options: 'A|B|C', votes: '5,3,2', pick: 2 }, at: [2.6], wide: true, bg: '#4f7a8c' },
  // group B3: the photo album (the grid with its fling and date bubble, made-up pictures and stand-ins, the memories page, a tile and a
  // card opening, a swipe, the viewer's bars); the picture is golden/fixtures/fake-map.png
  { name: 'album', type: 'common.album', at: [0.3, 1.4, 2.6] },
  { name: 'album-photos', type: 'common.album', sources: PIC, params: { photos: ALBUM, chips: '年, 月, 日, 全部', chip: 2, hide: '0-3|5', scroll: '0|0.75', tabs: 'image|Photos, heart|Memories, search|Search', time: '9:05' }, at: [1.0] },
  { name: 'album-foryou', type: 'common.album', params: { mode: 'foryou', fadeIn: 0.4 }, at: [0.2, 1.75] },
  { name: 'album-zoom', type: 'common.album', sources: PIC, params: { mode: 'zoom', photos: ALBUM, crop: { x: 0.5, y: 0.5, zoom: 1.1 } }, at: [0.2, 1.0] },
  { name: 'album-zoom-card', type: 'common.album', params: { mode: 'zoom', zoomFrom: 'card', ease: 'inOut', move: 1 }, at: [0.5] },
  { name: 'album-swipe', type: 'common.album', sources: PIC, params: { mode: 'swipe', photos: ALBUM }, at: [0.25] },
  { name: 'album-viewer', type: 'common.album', params: { mode: 'viewer', heartAt: 0.8, show: '0|0\n0.4|1' }, at: [0.2, 1.0], bg: '#6b8fa3' },
  { name: 'wide-album', type: 'common.album', at: [2.6], wide: true },
  { name: 'wide-album-zoom', type: 'common.album', sources: PIC, params: { mode: 'zoom', photos: ALBUM }, at: [0.3], wide: true },
  { name: 'wide-album-viewer', type: 'common.album', params: { mode: 'viewer' }, at: [1.0], wide: true, bg: '#6b8fa3' },
  // group C1: the chat (the default with a photo and the dots; the media kinds with the pinned chapter dots, a video playing through its
  // hole, a voice message, an album, a sticker, a link card and the input typing; a group with names, read marks and a wallpaper change)
  { name: 'chat', type: 'common.chat', at: [0.4, 1.8, 2.9] },
  { name: 'chat-media', type: 'common.chat', sources: PIC, params: { items: CHAT_MEDIA, pin: '情境重現｜海邊的一天', name: '姊妹', avatar: '🧋', panel: '', time: '20:16',
    inputs: '2.0-2.3|呃…其實|type\n2.35-2.6|呃…其實|delete' }, at: [0.5, 1.3, 2.2, 2.95], bg: '#2b4a5c' },
  { name: 'chat-group', type: 'common.chat', params: { items: CHAT_GROUP, name: '週末小隊', status: '3 位成員', wall: '0|#e6ebf1|#d2dbe6\n1|#f6ead2|#ecd3b0\n2.5|#f3cdb6|#c9b3d4', me: '#2f9e8f', accent: '#2f9e8f', read: 'Read 2' }, at: [1.2, 2.9] },
  { name: 'wide-chat', type: 'common.chat', at: [2.9], wide: true },
  { name: 'wide-chat-media', type: 'common.chat', sources: PIC, params: { items: CHAT_MEDIA, pin: '情境重現｜海邊的一天', panel: '' }, at: [0.5, 2.95], wide: true, bg: '#2b4a5c' },
  // group C2: the search pages (home: typing, the list, a row picked, the page leaving; results: deleting and typing, the tab sliding,
  // the loading card, fact cards, then a "did you mean" with a marked letter and a big word; the full view's chips; the questions opening
  // and closing round the window with a redacted answer; the end's featured snippet and result card)
  { name: 'search', type: 'common.search', params: { out: 0.3 }, at: [0.6, 1.6, 2.4, 2.85], bg: '#4a7a8c' },
  { name: 'search-results', type: 'common.search', params: { mode: 'results', query: '海邊小鎮', erase: '週末去哪玩', typeAt: 0.05, tab: 1, tabFrom: 0, enter: 0.35, load: 0.8, title: '海邊小鎮', titleSub: 'Seaside',
    snip: '老街・漁港・夕陽步道', facts: '1.4|人口|3.2|萬人\n2.2|很容易錯過的小站' }, len: 3, at: [0.2, 0.7, 1.7, 2.6], bg: '#3d6e80' },
  { name: 'search-dym', type: 'common.search', params: { mode: 'results', query: '海邊小鎭', typeAt: -1, title: '', snip: '', dym: '海邊小鎮', dymAt: 0.3, dymHi: 3, big: '值得去嗎？', bigAt: 1.2, press: 2.4, tab: 4, tabFrom: 2, related: '' }, at: [1.0, 2.5], bg: '#3d6e80' },
  { name: 'search-full', type: 'common.search', params: { mode: 'results', view: 'full', query: '海邊小鎮 風景', typeAt: -1, tab: 2, tabFrom: 0, chips: '0.5|海灘\n1.2|老街\n1.9|山\n2.4|夕陽' }, at: [1.3, 2.6], bg: '#5c8a6e' },
  { name: 'search-ask', type: 'common.search', params: { mode: 'ask', query: '海邊小鎮 值得去嗎？', typeAt: -1, tab: 4, tabFrom: 0 }, at: [0.2, 1.3, 2.2, 2.9], bg: '#3d6e80' },
  { name: 'search-end', type: 'common.search', params: { mode: 'end', query: '海邊小鎮', erase: '海邊小鎮 值得去嗎？', typeAt: 0.1, sugg: '海邊小鎮| 在哪\n海邊小鎮| 美食\n海邊小鎮| 值得去嗎', suggAt: 0.8, pick: 2, pickAt: 1.6,
    tab: 0, tabFrom: 4, tabAt: 1.6, snipAt: 1.65, cardAt: 1.8, press: 3.3, title: '海邊小鎮完整走一圈' }, len: 4, at: [1.2, 1.9, 3.4], bg: '#3d6e80' },
  { name: 'wide-search-results', type: 'common.search', params: { mode: 'results', title: '海邊小鎮', facts: '0.5|人口|3.2|萬人' }, at: [2.6], wide: true, bg: '#3d6e80' },
  { name: 'wide-search-end', type: 'common.search', params: { mode: 'end', pickAt: 1.6, snipAt: 1.65, cardAt: 1.8 }, len: 3, at: [2.8], wide: true, bg: '#3d6e80' },
  // group E: the camcorder viewfinder (wedding-short's finder: a square box, the counter at the top, a tape change; uk-dv's OSD: the
  // place typed in, the zoom bar, an empty battery and tape, TAPE END; the blue fast-forward screen and the torn rewind) and the
  // fact-check case file (from a fact-check short: typed claim, evidence stamps, the strike and the rejected stamp, the flap closing)
  { name: 'camcorder', type: 'common.camcorder', at: [0.1, 1.5] },
  { name: 'camcorder-tape', type: 'common.camcorder', params: { box: '0.022,0.177,0.956,0.5375', counterAt: 'top', counter: '0|0:05:13\n1.0|0:23:10', tape: '0|1\n1.0|2', status: '0|rec\n2.0|stop', date: '', remain: '', popAt: 0.2 }, at: [1.1, 2.4], bg: '#6b8fa3' },
  { name: 'camcorder-dv', type: 'common.camcorder', params: { place: '0.2-3|港邊 HARBOUR', zoom: '0.4-1.2|0.1|0.7', battery: '0|0', remain: '0|8\n1|0.9', end: '1.5-3', date: '0|2004-08-14 10:30|2004-08-21 09:00', words: { months: '1月 2月 3月 4月 5月 6月 7月 8月 9月 10月 11月 12月' }, dateFormat: 'YYYY MMM D日|HH:mm' }, at: [0.9, 1.6] },
  { name: 'camcorder-ff', type: 'common.camcorder', params: { mode: 'ff' }, at: [0.1, 1.5] },
  { name: 'camcorder-rew', type: 'common.camcorder', sources: PIC, params: { mode: 'rew', stills: 'pic|0\n-\npic|0|0.3,0.6,1.6\n-' }, at: [0.3, 2.9] },
  { name: 'wide-camcorder', type: 'common.camcorder', params: { place: '0-3|港邊', status: '0|stby' }, at: [1.5], wide: true },
  { name: 'wide-camcorder-ff', type: 'common.camcorder', params: { mode: 'ff' }, at: [1.5], wide: true },
  { name: 'casefile', type: 'common.casefile', at: [0.5, 1.5, 2.8] },
  { name: 'casefile-close', type: 'common.casefile', params: { strikeAt: 0.2, closeAt: 0.6, slots: '0|照片\n0|收據\n0|證人\n0|影片', typeEnd: 0 }, at: [0.75, 1.5] },
  { name: 'wide-casefile', type: 'common.casefile', at: [2.8], wide: true },
  { name: 'worldmap', type: 'common.worldmap', at: [0.3, 1.5, 2.6] },
  { name: 'worldmap-flat', type: 'common.worldmap', params: { cam: '0|8,46|2.6|0\n2.4|14,49|3.45|-8', regions: '0.8|6,47.3>15,54.8', routes: '0.4-2.2|巴黎>克拉科夫|🚆|line',
    pins: '1.2|克拉科夫|2.2|u', labels: '1.4|10.3,51.2|這一帶|this area|land\n1.0|4,55.5|北海||sea', titles: '0.2-3|往東走|Eastward' }, at: [0.6, 1.6, 2.8] },
  { name: 'worldmap-card', type: 'common.worldmap', params: { card: '0.12,0.2,0.76,0.34', cam: '0|克拉科夫|3.3|0', pins: '0.2|克拉科夫', routes: '', labels: '', titles: '' }, at: [0.25, 1.5], bg: '#6b7f8c' },
  { name: 'worldmap-iris', type: 'common.worldmap', params: { iris: '0-0.5|0.5,0.6' }, at: [0.25] },
  { name: 'mapjump-land', type: 'common.mapjump', params: { land: true }, at: [1.0] },
  { name: 'wide-worldmap', type: 'common.worldmap', at: [1.5], wide: true },
  { name: 'wide-worldmap-flat', type: 'common.worldmap', params: { cam: '0|8,46|2.6|0\n2.4|14,49|3.45|-8', regions: '0.8|6,47.3>15,54.8', routes: '0.4-2.2|巴黎>克拉科夫|🚆|line',
    labels: '1.4|10.3,51.2|這一帶|this area|land', titles: '0.2-3|往東走|Eastward' }, at: [1.6], wide: true },
  // group F: the magazine (t2-magazine's pages: a feature page with stills, a tag and a pull quote that slams; the cover, a list page,
  // the back cover), the page curl (common.wipe mode curl: a still, a magazine page over a still, a plain sheet from the corner) and
  // the notebook route page (fd-map's nbPage: legs with walking times, ticks; the camera from walk to the corner scrap and close in)
  { name: 'magazine', type: 'common.magazine', sources: PIC, params: { cells: 'pic|0|0.5,0.3,1.5\n-\npic|0|0.3,0.7,2', tags: '0.8-1.5|0|HIDDEN GEM|隱藏版的寶石', quote: '錢不多，\n但很快樂。', quoteAt: 1.6, quoteBy: '— 受訪者' }, at: [0.3, 1.0, 2.9] },
  { name: 'magazine-slam', type: 'common.magazine', params: { slam: true, quote: '以懶為榮', quoteEn: 'We are proud to be lazy.', quoteAt: 1.6, quoteBy: '— 受訪者', kicker: 'RUMOUR', page: 3 }, at: [1.7, 2.6] },
  { name: 'magazine-cover', type: 'common.magazine', params: { layout: 'cover', cells: '-\n-' }, at: [0.4, 2.5] },
  { name: 'magazine-list', type: 'common.magazine', params: { layout: 'list', kicker: 'GUIDE', headline: '三個地方，\n一天走完', deck: '從市場到老城' }, at: [1.2, 2.5] },
  { name: 'magazine-back', type: 'common.magazine', params: { layout: 'back', headline: '本期未完', deck: '完整專訪' }, at: [2.5] },
  { name: 'paper-print', type: 'common.paper', params: { look: 'print' }, at: [0.5] },
  { name: 'wide-magazine', type: 'common.magazine', params: { quote: '慢一點，\n也很好。', quoteAt: 1.6, quoteBy: '— 受訪者' }, at: [2.5], wide: true },
  { name: 'wide-magazine-cover', type: 'common.magazine', params: { layout: 'cover', cells: '-\n-' }, at: [2.5], wide: true },
  { name: 'wide-magazine-list', type: 'common.magazine', params: { layout: 'list' }, at: [2.5], wide: true },
  { name: 'wipe-curl', type: 'common.wipe', sources: PIC, params: { mode: 'curl', source: 'pic' }, len: 1, at: [0.15, 0.4, 0.7], bg: '#2a6b8f' },
  { name: 'wipe-curl-magazine', type: 'common.wipe', sources: PIC, params: { mode: 'curl', source: 'pic', art: 'common.magazine', artParams: { cells: 'pic|0|0.5,0.3,1.5\n-\n-' }, angle: -60 }, len: 1, at: [0.3] },
  { name: 'wipe-curl-rev', type: 'common.wipe', params: { mode: 'curl', rev: true, angle: 0, color: '#fbf8f0' }, len: 1, at: [0.4], bg: '#2a6b8f' },
  { name: 'wide-wipe-curl', type: 'common.wipe', params: { mode: 'curl', angle: 45, color: '#fbf8f0' }, len: 1, at: [0.45], wide: true, bg: '#2a6b8f' },
  { name: 'route-page', type: 'common.route', params: { look: 'page', stops: 4, start: '車站', names: '湯圓|菜包|酥糖|冰店', legs: '約 10 分鐘|3 分鐘|走兩步|1–2 分鐘', from: 0.5, to: 2.4, note: '示意圖・時間是影片裡說的', flash: 2.5 },
    at: [0.6, 1.5, 2.9], bg: '#fbf8f0', theme: NOTE },
  { name: 'route-page-cam', type: 'common.route', params: { look: 'page', stops: 6, start: '車站', names: '阿桃|仁利|新珍香|湯記|驚嘆號|奇冰', legs: '10 分鐘|3 分鐘|3 分鐘|走兩步|30 秒|2 分鐘', from: 0.4, to: 2.0,
    cams: '0|walk, 1.0|stop, 2.2|near', icons: 'bowl|bun|box|jar|tofu|cup', loop: '2.0-2.8' }, at: [0.5, 1.4, 2.6], bg: '#fbf8f0', theme: NOTE },
  { name: 'wide-route-page', type: 'common.route', params: { look: 'page', stops: 5, start: '車站', names: '湯圓|菜包|酥糖|肉鬆|冰店', legs: '10 分鐘|3 分鐘|3 分鐘|走兩步|30 秒', from: 0.4, to: 2.4, cams: '0|walk' },
    at: [2.9], wide: true, bg: '#fbf8f0', theme: NOTE },
  // the brand film's looks: lines from a blur bottom-left, frosted tags, a 2.39 letterbox
  { name: 'headline-brand', type: 'common.headline', params: { look: 'brand', text: 'We film everything.\nEvery trip.', sub: 'WHAT WE DO' }, len: 3, at: [0.3, 1.4], wide: true },
  { name: 'tag-glass-check', type: 'common.tag', params: { look: 'glass', tags: 'No black frames, Captions match the speech, No clipped audio', x: 0.6, y: 0.3, size: 3.6, step: 0.5, check: 0.4, stack: true }, len: 3, at: [0.7, 2], wide: true },
  { name: 'tag-glass', type: 'common.tag', params: { look: 'glass', tags: 'Street, Tram, Morning light', x: 0.08, y: 0.3, size: 4.5 }, len: 3, at: [1.2], wide: true },
  { name: 'film-letterbox', type: 'common.film', params: { letterbox: 2.39, grain: 0.15 }, len: 3, at: [1.0], wide: true },
  // the spike's grain: grey noise by overlay (strong here, to be seen on a flat ground), the vignette and bars drawn normally
  { name: 'film-overlay', type: 'common.film', params: { blend: 'overlay', grain: 0.6, letterbox: 2.39 }, len: 3, at: [1.0], wide: true, bg: '#7a8a6a' },
  // a brand line too long for 9:16 shrinks to the safe width
  { name: 'headline-brand-long', type: 'common.headline', params: { look: 'brand', text: 'We film every trip, every first, every day.\nAll of it.', sub: 'WHAT WE DO' }, len: 3, at: [1.4] },
  // the brand film's proof: a big number counting up with its label
  { name: 'headline-proof', type: 'common.headline', params: { look: 'proof', text: '90+', sub: 'BUILT-IN EFFECTS AND SOUNDS' }, len: 3, at: [0.3, 1.6], wide: true },
  // group C (katie-sweet16, todo-vlog): the sky, the name title and credits, gold words, the ticked to-do list, paper strips, the day label
  { name: 'ambient-sky', type: 'common.ambient', params: { look: 'sky', stops: '0:1, 1.2:3:1, 2.2:5:0.6', flash: '0.5' }, len: 3, at: [0.55, 1.6, 2.9] },
  { name: 'wide-ambient-sky', type: 'common.ambient', params: { look: 'sky', stops: '0:2, 1:4:1', flash: '' }, len: 3, at: [2.5], wide: true },
  { name: 'headline-name', type: 'common.headline', params: { look: 'name', text: 'Happy Birthday', sub: 'SWEET SIXTEEN' }, len: 4, at: [0.5, 1.9, 3.0], bg: '#6b5a48' },
  { name: 'wide-headline-name', type: 'common.headline', params: { look: 'name', text: 'Happy Birthday', sub: 'SWEET SIXTEEN', bg: 'none' }, len: 4, at: [3.0], wide: true, bg: '#6b5a48' },
  { name: 'outro-credits', type: 'common.outro', params: { look: 'credits', lines: '*With love to everyone who came*\nMom & Dad\nGrandma & Grandpa\n*and all the friends*\n_Music: original score_', beat: 0.4 }, len: 4, at: [0.6, 3.0], bg: '#6b5a48' },
  { name: 'slam-gold', type: 'common.slam', params: { look: 'gold', text: 'Surprise!', tilt: 0, size: 8 }, at: [0.15, 1.5], bg: '#3a2f45' },
  { name: 'notecard-tick', type: 'common.notecard', params: { mode: 'list', title: 'to-do list', items: 'unpack|clean the house|edit videos|workout|returns|grocery shop', tick: 3, count: '', note: '' }, at: [0.2, 0.62, 1.4], bg: '#e7d8bd' },
  { name: 'caption-strip', type: 'common.caption', params: { text: 'Today I finally cleaned the whole kitchen', style: 'strip', size: 3.2, words: [[0, 5], [0.3, 7], [0.5, 15], [0.9, 23], [1.2, 27], [1.4, 33], [1.7, 41]] }, at: [1.0, 2.5], bg: '#7a6650' },
  { name: 'tag-day', type: 'common.tag', params: { look: 'day', tags: 'Day 2,15° · rain', x: 0.08, y: 0.12 }, at: [0.1, 1.5], bg: '#6d7f92' },
  { name: 'wide-tag-day', type: 'common.tag', params: { look: 'day', tags: 'Day 2,15° · rain', x: 0.06, y: 0.1, size: 3 }, at: [1.5], wide: true, bg: '#6d7f92' },
  // group B (amber-podcast): the solo speaker window, the numbered slots and a stub flying into one, the show's end card
  { name: 'duo-solo', type: 'common.duo', params: { mode: 'solo', top: 0.177, band: 0, foot: 0.167, label: 'EP 12', topic: 'Three rules for posting online', nameA: 'ALEX', roleA: 'GUEST', nameB: 'SAM', roleB: 'HOST', colorB: '#b9a5f7', segs: '0-1.4|a\n1.5-2.9|b' }, at: [0.6, 2.0], theme: AMBER, bg: '#3f6a73' },
  { name: 'wide-duo-solo', type: 'common.duo', params: { mode: 'solo', top: 0.12, band: 0, foot: 0.05, label: '', topic: '', nameA: 'ALEX', roleA: 'GUEST', colorB: '#b9a5f7', segs: '0-1.4|a\n1.5-2.9|b' }, at: [0.6], wide: true, theme: AMBER, bg: '#3f6a73' },
  { name: 'progress-slots', type: 'common.progress', params: { mode: 'slots', labels: 'Home,Name,Later', fills: '0.3,1.2', pulses: '2.2|0' }, at: [0.15, 1.3, 2.4], theme: AMBER, bg: '#20262d' },
  { name: 'wide-progress-slots', type: 'common.progress', params: { mode: 'slots', labels: 'Home,Name,Later', fills: '0.3,1.2,1.8' }, at: [2.4], wide: true, theme: AMBER, bg: '#20262d' },
  { name: 'slip-fly', type: 'common.slip', params: { no: '02', noLabel: 'RULE', title: "Don't share your last name", sub: 'it makes you harder to find', y: 0.52, slot: 1, slots: 3 }, at: [0.6, 2.7], bg: '#20262d' },
  { name: 'outro-episode', type: 'common.outro', params: { look: 'episode', lines: 'The Morning\nPodcast', ep: 'Episode 12 · with a guest', cta: 'Full episode on YouTube', credit: 'The Morning Podcast · E12 · CC BY' }, at: [0.3, 2.0], theme: AMBER, bg: '#5a7d8c' },
  { name: 'wide-outro-episode', type: 'common.outro', params: { look: 'episode', lines: 'The Morning\nPodcast', ep: 'Episode 12 · with a guest', cta: 'Full episode on YouTube', credit: 'The Morning Podcast · E12 · CC BY' }, at: [2.0], wide: true, theme: AMBER, bg: '#5a7d8c' },
  // group D (seoul-bbq): a ranking revealed from the last place up with ties, the ember (charcoal-fire) dish label and verdict stamp
  { name: 'chart-rank-up', type: 'common.chart', params: { kind: 'rank', reveal: 'up', title: 'Bakery ranking', data: BAKERY, unit: '', hl: '1', note: 'No. 1', tie: 'TIED', source: '' }, at: [0.8, 2.6] },
  { name: 'wide-chart-rank-up', type: 'common.chart', params: { kind: 'rank', reveal: 'up', title: 'Bakery ranking', data: BAKERY, unit: '', hl: '1', note: 'No. 1', tie: 'TIED', source: '' }, at: [2.6], wide: true, theme: EMBER, bg: '#3a2a20' },
  { name: 'tag-ember', type: 'common.tag', params: { look: 'ember', tags: 'BLACK PORK BELLY,Charcoal grill · upstairs', size: 3.2, x: 0.12, y: 0.17 }, at: [0.3, 1.5], theme: EMBER, bg: '#5a4636' },
  { name: 'wide-tag-ember', type: 'common.tag', params: { look: 'ember', tags: 'PORK NECK', size: 4.5, x: 0.08, y: 0.12 }, at: [1.5], wide: true, theme: EMBER, bg: '#5a4636' },
  { name: 'stamp-ember', type: 'common.stamp', params: { shape: 'ember', text: 'GREAT', size: 6, angle: -4, x: 0.4, y: 0.6 }, at: [0.1, 1.5], theme: EMBER, bg: '#5a4636' },
  { name: 'wide-stamp-ember', type: 'common.stamp', params: { shape: 'ember', head: 'VERDICT', text: 'Worth the queue', size: 9, angle: -4 }, at: [1.5], wide: true, theme: EMBER, bg: '#5a4636' },
  // the Tellcut dachshund (2026-10-30): walking, the cream dog facing left on black, footage in its frames, a cut, sitting in 16:9
  { name: 'dachshund-walk', type: 'common.dachshund', at: [0.5, 1.5] },
  { name: 'dachshund-dark-left', type: 'common.dachshund', params: { look: 'dark', facing: 'left', action: 'wag' }, bg: '#161412', at: [1] },
  { name: 'dachshund-frames', type: 'common.dachshund', sources: PIC, params: { source: 'pic', action: 'idle' }, at: [1] },
  { name: 'dachshund-cut', type: 'common.dachshund', params: { action: 'cut', cutAt: 1 }, at: [1.2] },
  { name: 'wide-dachshund', type: 'common.dachshund', params: { action: 'sit' }, at: [1.5], wide: true },
];
