// Golden samples, in order (samples.ts joins the parts):
// group F, the brand film's looks, the later promotion groups and the acceptance films' blocks (to 2026-11-05).
import { type Sample, QUOTE, AMBER, NOTE, EMBER, BAKERY, PIC } from './fixtures.ts';

export const GROUPS: Sample[] = [
  // group F: the magazine (t2-magazine's pages: a feature page with stills, a tag and a pull quote that slams; the cover, a list page,
  // the back cover), the page curl (common.wipe mode curl: a still, a magazine page over a still, a plain sheet from the corner) and
  // the notebook route page (fd-map's nbPage: legs with walking times, ticks; the camera from walk to the corner scrap and close in)
  { name: 'magazine', type: 'common.magazine', sources: PIC, params: { cells: 'pic|0|0.5,0.3,1.5\n-\npic|0|0.3,0.7,2', tags: '0.8-1.5|0|HIDDEN GEM|隱藏版的寶石', quote: '錢不多，\n但很快樂。', quoteAt: 1.6, quoteBy: '— 受訪者' }, at: [0.3, 1.0, 2.9] },
  { name: 'magazine-slam', type: 'common.magazine', params: { slam: true, quote: '以懶為榮', quoteEn: 'We are proud to be lazy.', quoteAt: 1.6, quoteBy: '— 受訪者', kicker: 'RUMOUR', page: 3 }, at: [1.7, 2.6] },
  { name: 'magazine-cover', type: 'common.magazine', params: { layout: 'cover', cells: '-\n-' }, at: [0.4, 2.5] },
  { name: 'magazine-list', type: 'common.magazine', params: { layout: 'list', kicker: 'GUIDE', headline: '三個地方，\n一天走完', deck: '從市場到老城' }, at: [1.2, 2.5] },
  { name: 'magazine-back', type: 'common.magazine', params: { layout: 'back', headline: '本期未完', deck: '完整專訪' }, at: [2.5] },
  { name: 'paper-print', type: 'common.paper', params: { look: 'print' }, at: [0.5] },
  { name: 'paper-journal', type: 'common.paper', params: { doodles: true, doodleSet: 'journal', sign: 'Day 3' }, at: [0.5] },
  { name: 'paper-travel', type: 'common.paper', params: { doodles: true, doodleSet: 'travel', sign: '' }, at: [0.5] },
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
  { name: 'notecard-added', type: 'common.notecard', params: { mode: 'list', title: '待辦清單', items: '拆行李|打掃家裡|剪片|退貨|+運動|+買菜', tick: 5, ticked: '1,2,3', count: '', addInk: '#2f6f8f' }, at: [1.3], bg: '#e7d8bd' },
  { name: 'notecard-strike', type: 'common.notecard', params: { mode: 'list', title: '待辦清單', items: '回信|繳帳單|買菜|運動|整理書桌|洗衣服', tick: 6, strike: true, stamp: '清空！', count: '', note: '' }, at: [1.15, 2.0], bg: '#e7d8bd' },
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
  // common.audiogram (2026-10-31): no sound clip in a golden project, so it draws its made-up speech levels (a fixed synthetic peaks
  // array); the second speaker takes over at 1.5 s
  { name: 'audiogram-bars', type: 'common.audiogram', params: { speakers: [[0, 1.5, 1], [1.5, 60, 2]], names: ['', 'Mia', 'Leo'] }, at: [1.0, 2.5], theme: QUOTE, bg: '#15171f' },
  { name: 'audiogram-wave', type: 'common.audiogram', sources: PIC, params: { look: 'wave', artSource: 'pic', speakers: [[0, 1.5, 1], [1.5, 60, 2]], names: ['', 'Mia', 'Leo'] }, at: [1.0, 2.5], theme: QUOTE, bg: '#15171f' },
  { name: 'audiogram-ring', type: 'common.audiogram', sources: PIC, params: { look: 'ring', artSource: 'pic', speakers: [[0, 1.5, 1], [1.5, 60, 2]], names: ['', 'Mia', 'Leo'] }, at: [1.0, 2.5], theme: QUOTE, bg: '#15171f' },
  { name: 'wide-audiogram-ring', type: 'common.audiogram', params: { look: 'ring', speakers: [[0, 1.5, 1], [1.5, 60, 2]], names: ['', 'Mia', 'Leo'] }, at: [2.5], wide: true, theme: QUOTE, bg: '#15171f' },
  // common.quiz (2026-11-02, the quiz acceptance film): the options popping in, the reveal, the wrong rows folded away with the badge and the fact chip
  { name: 'quiz', type: 'common.quiz', params: { stars: 2, reveal: 2.4, badge: '🌈', fact: '7 種', factSub: '紅、橙、黃、綠、藍、靛、紫' }, len: 4.5, at: [1.6, 2.7, 4.2], bg: '#4f7f8f' },
  { name: 'wide-quiz', type: 'common.quiz', params: { stars: 2, reveal: 2.4, badge: '🌈', fact: '7 種', factSub: '紅、橙、黃、綠、藍、靛、紫' }, len: 4.5, at: [4.2], wide: true, bg: '#4f7f8f' },
  // common.doodle (2026-11-02, the whiteboard acceptance film): the default strokes being drawn and done; the board eraser mid-sweep
  { name: 'doodle', type: 'common.doodle', at: [0.8, 2.6], bg: '#f4f2ec' },
  { name: 'doodle-erase', type: 'common.doodle', params: { erase: 2.45, eraseDur: 0.5, ey0: 0.22, ey1: 0.66 }, at: [2.7], bg: '#f4f2ec' },
  { name: 'wide-doodle', type: 'common.doodle', at: [2.6], wide: true, bg: '#f4f2ec' },
  // common.healthbar (2026-11-02, the reaction-clip acceptance film's fx.livebar): a hit, a heal, the low state, the bar shattered; no header row
  { name: 'healthbar', type: 'common.healthbar', len: 4.2, at: [1.15, 2.0, 2.9, 3.6], bg: '#3a4656' },
  { name: 'healthbar-bare', type: 'common.healthbar', params: { title: '', live: '', replay: '', label: 'HP', stops: '0:100, 0.6:40' }, at: [1.2], bg: '#3a4656' },
  { name: 'wide-healthbar', type: 'common.healthbar', len: 4.2, at: [3.6], wide: true, bg: '#3a4656' },
  // common.tabletop (2026-11-02, the grill-restaurant acceptance film's fx.steeltable): brushed steel, with the corner grill, wood
  { name: 'tabletop', type: 'common.tabletop', at: [0.5] },
  { name: 'tabletop-grill', type: 'common.tabletop', params: { grill: true }, at: [0.5] },
  { name: 'tabletop-wood', type: 'common.tabletop', params: { look: 'wood', grill: true, grillX: -0.02, grillY: 0.1, grillR: 0.24 }, at: [0.5] },
  { name: 'wide-tabletop', type: 'common.tabletop', params: { grill: true }, at: [0.5], wide: true },
  // common.bounce (2026-11-02, the outdoor-brand acceptance film's fx.words): drop and pop with a hop; every mode at once; knock's holes
  { name: 'bounce', type: 'common.bounce', len: 3, at: [0.35, 1.2, 2.25], bg: '#4a6b7c' },
  { name: 'bounce-modes', type: 'common.bounce', params: { items: '0|砸下來|220||0.5|0.24|slam\n0.3|慢慢浮上來|140||0.5|0.42|float|shadow=1;scrim=1\n0.5|搖一搖|170|hl|0.5|0.6|sway|wob=1\n0.2|掉【下去】|170||0.5|0.8|pop|sink=1.4' }, len: 3, at: [0.9, 1.9], bg: '#55606e' },
  { name: 'bounce-knock', type: 'common.bounce', params: { items: '0.05|就現在|420||0.5|0.45|knock|stagger=0.08;out=1.6' }, at: [0.2, 1.0, 1.7], bg: '#3b7fbf' },
  { name: 'wide-bounce', type: 'common.bounce', len: 3, at: [1.2], wide: true, bg: '#4a6b7c' },
  // common.header shade (2026-11-02, the true-crime acceptance film's fx.topshade) over a bright frame; common.headline enter roll and the strike
  { name: 'header-shade', type: 'common.header', params: { look: 'kicker', text: '這件事【到底】怎麼了？', kicker: '節目名｜第 3 集', shade: 0.82 }, at: [1.5], bg: '#e9e4da' },
  { name: 'headline-roll', type: 'common.headline', params: { text: '一層一層擀開', sub: '', bg: 'none', rules: false, enter: 'roll' }, at: [0.7, 2.2], bg: '#6b5a48' },
  { name: 'headline-strike', type: 'common.headline', params: { text: '不加人工色素', sub: '第三件事', strikeFrom: 2, strikeAt: 0.6 }, at: [1.1, 2.4], bg: '#6b5a48' },
  // common.leak (2026-11-03, the Egypt photo films' fx.leak / fx.lightleak / fx.glow): the sweep from the top right, a still sun; core.flash fade out
  { name: 'leak', type: 'common.leak', len: 3, at: [0.8, 1.5, 2.2], bg: '#4d5866' },
  { name: 'leak-still', type: 'common.leak', params: { travel: 0 }, len: 3, at: [1.5], bg: '#4d5866' },
  { name: 'wide-leak', type: 'common.leak', params: { from: 'l' }, len: 3, at: [1.5], wide: true, bg: '#4d5866' },
  { name: 'core-flash-fade', type: 'core.flash', params: { fade: 'out', color: '#000' }, len: 3, at: [0.75, 1.5, 2.25], bg: '#c9803c' },
  // common.comic, common.onomatopoeia and burst's comic look (2026-11-05, the comic pilot film's fx.comicpage / fx.comicsfx): the
  // second panel sliding in and its focus lines, every layout settled, a sound word mid-pop and settled, an English one
  { name: 'comic', type: 'common.comic', params: { focus: '2|0.5,0.78' }, len: 3, at: [0.75, 1.5], bg: '#4a6b7c' },
  { name: 'comic-three', type: 'common.comic', params: { layout: 'three' }, len: 3, at: [2], bg: '#4a6b7c' },
  { name: 'comic-four', type: 'common.comic', params: { layout: 'four', times: '0,0.3,0.6,0.9' }, len: 3, at: [2], bg: '#4a6b7c' },
  { name: 'comic-one', type: 'common.comic', params: { layout: 'one', focus: '1|0.5,0.45' }, len: 3, at: [1.5], bg: '#4a6b7c' },
  { name: 'wide-comic', type: 'common.comic', params: { layout: 'side' }, len: 3, at: [2], wide: true, bg: '#4a6b7c' },
  { name: 'onomatopoeia', type: 'common.onomatopoeia', params: { rise: 0.06 }, len: 3, at: [0.12, 1.5], bg: '#4a6b7c' },
  { name: 'onomatopoeia-en', type: 'common.onomatopoeia', params: { text: 'SNIFF', font: 'Bangers', weight: 400, color: '#ffffff', size: 12, stroke: 10, spacing: 1.12, depth: 8, tilt: 6 }, len: 3, at: [1.5], bg: '#4a6b7c' },
];
