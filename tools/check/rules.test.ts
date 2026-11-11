import { createRegistry, parseProject, type Transcript } from '@tellcut/engine';
import { plugins } from '@tellcut/plugins';
import { canvasFxFiles, chosenSpec, flatlayHandOff, fxChecks, modelChecks, oldBlocks, outsideFiles, presetChecks, reportsCanvasText, visibleWords } from './rules.ts';
import { formatReport } from './report.ts';

const MIX = { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1.6, send: 0.35 } };
const clip = (id: string, start: number, end: number, o: object = {}) => ({ id, start, end, source: 'v', in: 0, speed: 1, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } }, ...o });
const project = (tracks: any[], o: { duration?: number; media?: object } = {}) => parseProject({ version: 1,
  meta: { name: 't', width: 1920, height: 1080, fps: 30, duration: o.duration ?? 10, plugins: [], mix: MIX },
  sources: { v: { path: 'v.mp4', duration: 60, kind: 'video', audio: true }, w: { path: 'gone.mp4', duration: 60, kind: 'video' }, ph: { path: 'p.jpg', duration: 3600, kind: 'image' } },
  media: { song: { path: 'song.mp3', duration: 30 }, ...(o.media ?? {}) }, grids: [], tracks });
const ok = { exists: (p: string) => !p.includes('gone'), transcripts: {} as Record<string, Transcript | null> };
const msgs = (f: ReturnType<typeof modelChecks>) => f.map((x) => `${x.level} ${x.t ? x.t.join('-') : ''} ${x.msg}`);

test('a clean project has nothing to report', () => {
  const p = project([{ id: 'main', kind: 'video', magnetic: true, items: [clip('c1', 0, 4), clip('c2', 4, 10, { in: 20 })] }]);
  expect(modelChecks(p, ok)).toEqual([]);
});

test('offline material that the film uses is an error; unused offline material is not', () => {
  const p = project([{ id: 'main', kind: 'video', items: [clip('c1', 0, 10, { source: 'w' })] }, { id: 'm', kind: 'music', items: [{ id: 'mu', start: 0, end: 10, media: 'song', in: 0, gain: 0, fadeIn: 0, fadeOut: 0 }] }]);
  expect(msgs(modelChecks(p, { ...ok, exists: (x) => !x.includes('gone') && !x.includes('song') }))).toEqual([
    'error  素材離線：w（gone.mp4）', 'error  音樂離線：song（song.mp3）']);
  expect(modelChecks(p, { ...ok, exists: (x) => !x.includes('gone') && !x.includes('song') }).map((f) => f.code)).toEqual(['offline', 'offline']);   // what check.ts skips the page layer on
  const q = project([{ id: 'main', kind: 'video', items: [clip('c1', 0, 10)] }]);
  expect(modelChecks(q, ok)).toEqual([]);
});

test('black frames: stretches no picture covers (dissolve overlaps and scene items count, a hidden track does not)', () => {
  const p = project([
    { id: 'main', kind: 'video', items: [clip('c1', 0, 4.2), clip('c2', 4, 6), clip('c3', 7, 10)] },
    { id: 'hidden', kind: 'video', muted: true, items: [clip('h', 6, 7)] },
  ]);
  expect(msgs(modelChecks(p, ok))).toEqual(['error 6-7 黑畫面（c2 與 c3 之間）']);
  const q = project([{ id: 'main', kind: 'video', items: [clip('c1', 0, 6)] }, { id: 's', kind: 'scene', items: [{ id: 'card', start: 6, end: 10, type: 'core.title', params: {} }] }]);
  expect(modelChecks(q, ok)).toEqual([]);
  // an end card drawn over the background is a choice, not a black frame
  const card = project([{ id: 'main', kind: 'video', items: [clip('c1', 0, 7)] }, { id: 'o', kind: 'overlay', items: [{ id: 'end', start: 7, end: 10, type: 'core.endCard', params: {} }] }]);
  expect(modelChecks(card, ok)).toEqual([]);
  // so is a title on a black backing: its own, its template's (gold-black), or the film's default title template's; on a band it is not
  const heading = (params: Record<string, unknown>, titleTemplate?: string) => {
    const q = project([{ id: 'main', kind: 'video', items: [clip('c1', 3, 10)] }, { id: 'o', kind: 'overlay', items: [{ id: 'h', start: 0, end: 3, type: 'common.heading', params: { text: '片名', ...params } }] }]);
    if (titleTemplate) (q.meta as Record<string, unknown>).titleTemplate = titleTemplate;
    return msgs(modelChecks(q, ok)).filter((m) => !m.includes('theme'));
  };
  expect(heading({ backing: 'black' })).toEqual([]);
  expect(heading({ template: 'gold-black' })).toEqual([]);
  expect(heading({}, 'chrome-black')).toEqual([]);
  expect(heading({ backing: 'band' })).toEqual(['warn 0-3 黑底上只有疊加層（h）：確認這段沒有畫面是刻意的']);
  // c.title's heading alone in the frame is the old core.title's card (it was warned about once c.title made common.heading);
  // a strap or label over nothing, or a backing made to lie on a picture, is still asked about
  expect(heading({})).toEqual([]);
  expect(heading({ layout: 'full' })).toEqual([]);
  expect(heading({ layout: 'left', backing: 'rules' })).toEqual([]);
  expect(heading({ layout: 'corner', backing: 'card' })).toEqual([]);
  for (const params of [{ layout: 'lower' }, { layout: 'corner' }, { backing: 'scrim' }, { layout: 'full', backing: 'blur' }])
    expect(heading(params), JSON.stringify(params)).toEqual(['warn 0-3 黑底上只有疊加層（h）：確認這段沒有畫面是刻意的']);
  // other layers (grain, a flash, a caption) over a gap do not make it a picture: asked about, not passed
  const grain = project([{ id: 'main', kind: 'video', items: [clip('c1', 0, 3), clip('c2', 6, 10)] },
    { id: 'o', kind: 'overlay', items: [{ id: 'fl', start: 0, end: 10, type: 'core.flash', params: {} }, { id: 'cap', start: 2, end: 4, type: 'core.caption', params: { text: 'x' } }] }]);
  expect(msgs(modelChecks(grain, ok))).toEqual(['warn 3-6 黑底上只有疊加層（fl、cap）：確認這段沒有畫面是刻意的']);
  const r = project([{ id: 'main', kind: 'video', items: [clip('c1', 0.5, 10)] }]);
  expect(msgs(modelChecks(r, ok))).toEqual(['error 0-0.5 黑畫面（片頭）']);
  const tail = project([{ id: 'main', kind: 'video', items: [clip('c1', 0, 9)] }]);
  expect(msgs(modelChecks(tail, ok))).toEqual(['error 9-10 黑畫面（片尾）']);
  // shorter than a frame: rounding, not a black frame
  expect(modelChecks(project([{ id: 'main', kind: 'video', items: [clip('c1', 0, 5), clip('c2', 5.01, 10)] }]), ok)).toEqual([]);
});

test('items past the end of the film; empty text (an item ending before it starts never parses)', () => {
  const p = project([
    { id: 'main', kind: 'video', items: [clip('c1', 0, 10)] },
    { id: 'o', kind: 'overlay', items: [
      { id: 't1', start: 8, end: 12, type: 'core.title', params: { text: '片名' } },
      { id: 't3', start: 1, end: 2, type: 'core.caption', params: { text: '  ' } },
    ] },
  ]);
  expect(msgs(modelChecks(p, ok))).toEqual(['warn 1-2 文字是空的（t3）', 'error 8-12 超出片長 10 秒（t1）']);
});

test('music that stops before the film ends is a warning unless it runs to the end', () => {
  const music = (o: object) => [{ id: 'main', kind: 'video', items: [clip('c1', 0, 10)] }, { id: 'm', kind: 'music', items: [{ id: 'mu', start: 0, end: 6, media: 'song', in: 0, gain: 0, fadeIn: 0, fadeOut: 0, ...o }] }];
  expect(msgs(modelChecks(project(music({})), ok))).toEqual(['warn 6-10 配樂在 0:06.0 就停了，片長 0:10.0']);
  expect(modelChecks(project(music({ end: 9.5 })), ok)).toEqual([]);
  expect(modelChecks(project(music({ toEnd: true, end: 10 })), ok)).toEqual([]);
  // toEnd asks the music to follow the film's end, but a file shorter than the film still stops early (Cut.save writes toEnd on it)
  expect(msgs(modelChecks(project(music({ toEnd: true })), ok))).toEqual(['warn 6-10 配樂在 0:06.0 就停了，片長 0:10.0：它設成跟著片尾，但音樂檔不夠長；換長一點的、從前面一點開始，或後面再接一首']);
  // narration lives on a music track too: a film with a voice and no bed is not "music that stops"
  const voiceOnly = [{ id: 'main', kind: 'video', items: [clip('c1', 0, 10)] }, { id: 'voice', kind: 'music', name: '旁白', items: [{ id: 'v1', start: 0, end: 6, media: 'song', in: 0, gain: 0, fadeIn: 0, fadeOut: 0 }] }];
  expect(modelChecks(project(voiceOnly), ok)).toEqual([]);
});

test('captions and speech: a speech caption shown at the wrong time, a long sentence left without one; narration and no transcript are left alone', () => {
  const tr: Transcript = { language: 'zh', segments: [
    { start: 21, end: 23, text: '大家好' }, { start: 24, end: 26.5, text: '今天去京都！' }, { start: 27, end: 27.8, text: '嗯' }, { start: 28.2, end: 29.9, text: '好開心喔' }] };
  // c1 plays v from 20 s: speech at 1–3, 4–6.5, 7–7.8, 8.2–9.9 on the timeline
  const p = project([
    { id: 'main', kind: 'video', items: [clip('c1', 0, 10, { in: 20 })] },
    { id: 'orig', kind: 'audio', gain: 0, items: [{ id: 'a1', source: 'v', in: 20, rate: 1, start: 0, end: 10, gain: 0, fadeIn: 0, fadeOut: 0 }] },   // c1's own sound
    { id: 'o', kind: 'overlay', items: [
      { id: 'cap0', start: 0, end: 1, type: 'core.caption', params: { text: '晚點見' } },          // narration: says nothing heard
      { id: 'cap1', start: 1, end: 3, type: 'core.caption', params: { text: '大家好' } },
      { id: 'cap2', start: 6.6, end: 7.9, type: 'core.caption', params: { text: '今天去京都' } },   // the right words, too late
    ] },
  ]);
  expect(msgs(modelChecks(p, { ...ok, transcripts: { v: tr } }))).toEqual([
    'warn 6.6-7.9 字幕時間沒對上講話：「今天去京都」在 0:04.0–0:06.5（cap2）',
    'note 8.2-9.9 可能漏字幕：「好開心喔」',
  ]);
  expect(modelChecks(p, ok)).toEqual([]);
  // the toolkit's caption block (and its 【highlight】{bleep} marks) is checked the same way
  const q = project([
    { id: 'main', kind: 'video', items: [clip('c1', 0, 10, { in: 20 })] },
    { id: 'orig', kind: 'audio', gain: 0, items: [{ id: 'a1', source: 'v', in: 20, rate: 1, start: 0, end: 10, gain: 0, fadeIn: 0, fadeOut: 0 }] },   // c1's own sound
    { id: 'o', kind: 'overlay', items: [{ id: 'cc', start: 6.6, end: 7.9, type: 'common.caption', params: { text: '今天去【京都】' } }] },
  ]);
  expect(msgs(modelChecks(q, { ...ok, transcripts: { v: tr } }))).toContain('warn 6.6-7.9 字幕時間沒對上講話：「今天去京都」在 0:04.0–0:06.5（cc）');
});

test('a caption is timed against the right sentence: a phrase said twice, a caption joining two lines, a line said inside a longer caption', () => {
  const tr: Transcript = { language: 'zh', segments: [
    { start: 21, end: 22, text: '在這個深度' }, { start: 23, end: 24.5, text: '用力摸' }, { start: 25, end: 26, text: '會摸到一條縫' }, { start: 27, end: 28, text: '在這個深度' }] };
  const p = project([
    { id: 'main', kind: 'video', items: [clip('c1', 0, 10, { in: 20 })] },
    { id: 'orig', kind: 'audio', gain: 0, items: [{ id: 'a1', source: 'v', in: 20, rate: 1, start: 0, end: 10, gain: 0, fadeIn: 0, fadeOut: 0 }] },
    { id: 'o', kind: 'overlay', items: [
      { id: 'again', start: 7, end: 8, type: 'core.caption', params: { text: '在這個深度' } },          // the second time it is said
      { id: 'joined', start: 3, end: 6.2, type: 'core.caption', params: { text: '用力摸，會摸到一條縫' } },  // two lines on one caption
      { id: 'late', start: 8.5, end: 9.5, type: 'core.caption', params: { text: '會摸到一條縫' } },        // really off
    ] },
  ]);
  expect(msgs(modelChecks(p, { ...ok, transcripts: { v: tr } }))).toEqual(['warn 8.5-9.5 字幕時間沒對上講話：「會摸到一條縫」在 0:05.0–0:06.0（late）']);
});

test('speech is what is heard: no own sound (sound:false) or a muted sound track says nothing; a hidden caption track is not checked', () => {
  const tr: Transcript = { language: 'zh', segments: [{ start: 24, end: 26.5, text: '今天去京都！' }, { start: 28.2, end: 29.9, text: '好開心喔' }] };
  const cap = { id: 'o', kind: 'overlay', items: [{ id: 'cap2', start: 6.6, end: 7.9, type: 'core.caption', params: { text: '今天去京都' } }] };
  const sound = (muted: boolean) => ({ id: 'orig', kind: 'audio', gain: 0, ...(muted ? { muted: true } : {}), items: [{ id: 'a1', source: 'v', in: 20, rate: 1, start: 0, end: 10, gain: 0, fadeIn: 0, fadeOut: 0 }] });
  const video = { id: 'main', kind: 'video', items: [clip('c1', 0, 10, { in: 20 })] };
  expect(modelChecks(project([video, cap]), { ...ok, transcripts: { v: tr } })).toEqual([]);                      // sound:false
  expect(modelChecks(project([video, sound(true), cap]), { ...ok, transcripts: { v: tr } })).toEqual([]);         // its sound muted
  expect(msgs(modelChecks(project([video, sound(false), { ...cap, muted: true }]), { ...ok, transcripts: { v: tr } }))).toEqual([]);   // hidden captions
  expect(msgs(modelChecks(project([video, sound(false), cap]), { ...ok, transcripts: { v: tr } }))).toContain('warn 6.6-7.9 字幕時間沒對上講話：「今天去京都」在 0:04.0–0:06.5（cap2）');
});

test('the report: by time, levels in words, a total line', () => {
  const s = formatReport([
    { level: 'warn', t: [8, 9.5], ids: ['cap2'], msg: '字幕時間沒對上講話（cap2）' },
    { level: 'error', msg: '素材離線：w（gone.mp4）' },
    { level: 'error', t: [6, 7], msg: '黑畫面（c2 與 c3 之間）' },
  ]);
  expect(s.split('\n')).toEqual([
    '錯誤  素材離線：w（gone.mp4）',
    '錯誤  0:06.0–0:07.0  黑畫面（c2 與 c3 之間）',
    '警告  0:08.0–0:09.5  字幕時間沒對上講話（cap2）',
    '',
    '共 2 個錯誤、1 個警告、0 個提醒',
  ]);
  expect(formatReport([])).toBe('沒有發現問題');
});

describe('fx determinism scan', () => {
  const scan = (src: string) => fxChecks({ 'fx/a.js': src }).map((f) => `${f.level} ${f.msg}`);
  test('flags each banned call with file and line', () => {
    expect(scan('const a = 1;\nconst r = Math.random();')).toEqual(['error fx/a.js:2 不可用 Math.random（畫面必須只由時間決定；要隨機請用自帶的種子 LCG）']);
    for (const bad of ['new Date()', 'Date.now()', 'performance.now()', 'setTimeout(f, 1)', 'setInterval(f, 1)', 'requestAnimationFrame(f)', 'fetch(u)', 'new XMLHttpRequest()', 'import("x")', 'eval("1")', 'new Function("1")', 'crypto.getRandomValues(a)', 'crypto.randomUUID()', 'self.crypto.randomUUID()'])
      expect(scan(`x = ${bad};`), bad).toHaveLength(1);
  });
  test('a template literal’s ${…} is code: a banned call in it is flagged, its text (and a template nested in it) is not', () => {
    const found = (src: string) => scan(src).map((m) => m.split(' ')[1]);
    expect(found('ctx.label = `${Math.random()}`;')).toEqual(['fx/a.js:1']);
    expect(found('const y = `year ${new Date().getFullYear()}`;')).toEqual(['fx/a.js:1']);
    expect(found('const a = `${x ? `Date.now()` : { b: 1 }.b} and ${`${fetch(u)}`}`;\nconst t = `Math.random ${1}`;')).toEqual(['fx/a.js:1']);
    expect(found('const a = `${o.map((v) => { return v; })}`; const s = `}`;\nconst r = Math.random();')).toEqual(['fx/a.js:2']);   // braces in ${…} pair up
    expect(found('const a = `line\n${\n  performance.now()\n}`;')).toEqual(['fx/a.js:3']);   // the line it is on
    expect(found('g.font = `${ctx.H / 10}px sans`; const q = /`/; const z = Date.now();')).toEqual(['fx/a.js:1']);
  });
  test('ignores banned words inside comments and strings', () => {
    expect(scan('// Math.random is banned\n/* Date.now() */\nconst s = "Math.random()"; const t = `fetch`;')).toEqual([]);
  });
  test('only relative imports are allowed', () => {
    expect(scan("import { a } from './util.js';")).toEqual([]);
    expect(scan("import { createRegistry } from '@tellcut/engine';")).toEqual(['error fx/a.js:1 不可 import "@tellcut/engine"（瀏覽器載不到套件；fx 要自成一體，只能相對路徑）']);
  });
  test('an import over several lines, and a re-export, are read whole (the line is where it starts)', () => {
    expect(scan("const a = 1;\nimport {\n  x,\n  y,\n} from 'three';\nimport {\n  z } from './z.js';\nexport { w } from 'pkg';\nexport const s = 'str';"))
      .toEqual(['error fx/a.js:2 不可 import "three"（瀏覽器載不到套件；fx 要自成一體，只能相對路徑）', 'error fx/a.js:8 不可 import "pkg"（瀏覽器載不到套件；fx 要自成一體，只能相對路徑）']);
  });
  test('a quote or a slash inside a regex literal opens no string or comment: what follows is still scanned', () => {
    const found = (src: string) => scan(src).map((m) => m.split(' ')[1]);
    expect(found("const q = s.replace(/'/g, '');\nconst t = Date.now();")).toEqual(['fx/a.js:2']);
    expect(found('const q = [/"/, /`/];\nconst r = x && /[/"]\\//.test(s) ? 1 : Math.random();')).toEqual(['fx/a.js:2']);
    expect(found("if (/[/*]/.test(s)) f();\nfetch(u);\nreturn /'/;\nimport('x');")).toEqual(['fx/a.js:4', 'fx/a.js:2', 'fx/a.js:4']);   // the import, then fetch and import()
    expect(found('const half = w / 2, q = h / 3; // Math.random\nconst k = (a) / b;')).toEqual([]);   // division stays division
    expect(found('const re = /Date.now()/;')).toEqual([]);                                             // banned words in a regex are text
  });
  test('letters drawn on a canvas are noted once: the layout check cannot see them unless the fx reports them', () => {
    expect(scan("g.font = '700 60px x';\ng.fillText(t, 0, 0);\ng.strokeText(t, 0, 0);")).toEqual(['note fx/a.js:2 在 canvas 上畫字，沒有用 ctx.reportText 回報：check 量不到這些字（超出安全區、蓋到字幕、字太小都不會報）；每個 fillText 後面加 ctx.reportText(g, 字, x, y)，或用 frames 自己看']);
    expect(scan('// g.fillText(t)\nconst s = "fillText(";')).toEqual([]);
    expect(scan('g.fillText(t, 0, 0); ctx.reportText(g, t, 0, 0);')).toEqual([]);
    expect(scan('g.fillText(t, 0, 0); // ctx.reportText(g, t, 0, 0)')).toHaveLength(1);   // a comment reports nothing
  });
});

describe('theme', () => {
  const overlay = (type: string) => [{ id: 'o', kind: 'overlay', items: [{ id: 'x', type, start: 0, end: 2, params: {} }] }];
  const withTheme = (theme: object | undefined, type = 'common.slam') => {
    const p = project(overlay(type));
    p.meta.theme = theme as any;
    return p;
  };
  test('a common block without a project theme is only a note', () => {
    expect(msgs(modelChecks(withTheme(undefined), ok)).filter((m) => m.includes('theme'))).toEqual(['note  用了共用積木（common.*）但專案沒設 theme，全部用預設風格；要統一風格請在 cut.ts 用 c.theme({...})']);
    expect(msgs(modelChecks(withTheme({ radius: 4 }), ok)).filter((m) => m.includes('theme'))).toEqual([]);
    expect(msgs(modelChecks(withTheme(undefined, 'core.title'), ok)).filter((m) => m.includes('theme'))).toEqual([]);
  });
  test('a theme font that no plugin brings along is a warning', () => {
    const known = { ...ok, knownFonts: ['Noto Sans TC', 'Consolas'] };
    expect(msgs(modelChecks(withTheme({ fonts: { display: 'Comic Neue' } }), known)).filter((m) => m.includes('字型'))).toHaveLength(1);
    expect(msgs(modelChecks(withTheme({ fonts: { display: 'Noto Sans TC' } }), known)).filter((m) => m.includes('字型'))).toEqual([]);
    expect(msgs(modelChecks(withTheme({ fonts: { display: 'Comic Neue' } }), ok)).filter((m) => m.includes('字型'))).toEqual([]);   // unknown list: no opinion
  });
});

describe('panel', () => {
  const clipIn = (frame: number[]) => ({ id: 'c1', start: 0, end: 4, source: 'v', in: 0, speed: 1, frame, crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1 } } });
  const panelP = (frame: number[], params: object) => project([{ id: 'v1', kind: 'video', items: [clipIn(frame)] }, { id: 'pn', kind: 'overlay', items: [{ id: 'pb', type: 'common.panel', start: 0, end: 4, params }] }], { duration: 4 });
  test('a border that matches the clip frame is fine, one that does not is a warning', () => {
    const f = [0.05, 0.2, 0.9, 0.5];
    expect(msgs(modelChecks(panelP(f, { x: 0.05, y: 0.2, w: 0.9, h: 0.5 }), ok)).filter((m) => m.includes('面板'))).toEqual([]);
    expect(msgs(modelChecks(panelP(f, { x: 0.05, y: 0.2, w: 0.9, h: 0.6 }), ok)).filter((m) => m.includes('面板'))).toHaveLength(1);
    expect(msgs(modelChecks(panelP([0.04, 0.18, 0.92, 0.56], {}), ok)).filter((m) => m.includes('面板'))).toEqual([]);   // the defaults agree
    expect(msgs(modelChecks(panelP([0, 0, 1, 1], {}), ok)).filter((m) => m.includes('面板'))).toHaveLength(1);
  });
  test("a blurred full-screen copy under the panel (c.panel({ backdrop: 'blur' })) is the backdrop, not a clip the border misses", () => {
    const f = [0.04, 0.18, 0.92, 0.56], p = panelP(f, {});
    p.tracks.unshift({ id: 'bgv', kind: 'video', items: [{ ...clipIn([0, 0, 1, 1]), id: 'b1', defocus: { from: 0, to: 0, px: 40, px0: 40 }, opacity: 0.55 }] } as any);
    expect(msgs(modelChecks(p, ok)).filter((m) => m.includes('面板'))).toEqual([]);
  });
});

describe('narration and music', () => {
  const tracks = (musicGain: number, envelope?: Array<[number, number]>) => [
    { id: 'music', kind: 'music', gain: 0, items: [{ id: 'm', media: 'song', in: 0, start: 0, end: 10, gain: musicGain, fadeIn: 0, fadeOut: 0, ...(envelope ? { envelope } : {}) }] },
    { id: 'voice', kind: 'music', name: '旁白', gain: 0, items: [{ id: 'v', media: 'song', in: 0, start: 2, end: 4, gain: 0, fadeIn: 0, fadeOut: 0 }] },
  ];
  const warns = (t: any[]) => msgs(modelChecks(project(t), ok)).filter((m) => m.includes('旁白可能被配樂蓋過'));
  test('music as loud as the voice is a warning; turned down or dipped under it is not', () => {
    expect(warns(tracks(0))).toHaveLength(1);
    expect(warns(tracks(-8))).toEqual([]);
    expect(warns(tracks(0, [[1.75, 0], [2, -10], [4, -10], [4.25, 0]]))).toEqual([]);
  });
  test('a sound file on the sound-effect track (c.sfxFile) is a sound effect, not music: loud under the voice is no warning; missing is offline', () => {
    const fx = { id: 'sfx', kind: 'sfx', gain: 0, items: [{ id: 'f', type: 'core.file', start: 2.5, end: 3.5, params: { path: 'media/sfx/gone.wav' }, gain: 6 }] };
    const t = [...tracks(-8), fx];
    expect(warns(t)).toEqual([]);
    expect(msgs(modelChecks(project(t), ok)).filter((m) => m.includes('離線'))).toEqual(['error  音效檔離線：media/sfx/gone.wav']);
    expect(modelChecks(project(t), ok).filter((f) => f.code === 'offline')).toHaveLength(1);
    expect(msgs(modelChecks(project(t), { ...ok, exists: () => true })).filter((m) => m.includes('離線'))).toEqual([]);
  });
});

test('black at the end is called the end even when an item lies past the film\u2019s end', () => {
  const p = project([{ id: 'v1', kind: 'video', items: [clip('c1', 0, 8), clip('c2', 11, 12)] }], { duration: 10 });
  expect(msgs(modelChecks(p, ok)).filter((m) => m.includes('黑畫面'))).toEqual(['error 8-10 黑畫面（片尾）']);
});

describe('pacing rules (2026-10-18)', () => {
  const tall = (tracks: any[], duration = 10) => { const p = project(tracks, { duration }); p.meta.width = 1080; p.meta.height = 1920; return p; };
  const say: Transcript = { language: 'zh', segments: [{ start: 0.2, end: 2, text: '大家好' }] };
  const sound = (items: any[]) => ({ id: 'a', kind: 'audio', items });

  test('a short that says nothing in its first second is warned; text or speech before 1 s is enough; landscape or long films are not asked', () => {
    const silent = tall([{ id: 'main', kind: 'video', items: [clip('c1', 0, 10)] }]);
    expect(msgs(modelChecks(silent, ok))).toEqual([expect.stringMatching(/^warn 0-1 開頭第一秒沒有字也沒有人說話/)]);
    const titled = tall([{ id: 'main', kind: 'video', items: [clip('c1', 0, 10)] }, { id: 'o', kind: 'overlay', items: [{ id: 't', start: 0.1, end: 3, type: 'core.title', params: { text: '你絕對想不到' } }] }]);
    expect(modelChecks(titled, ok)).toEqual([]);
    const talk = tall([{ id: 'main', kind: 'video', items: [clip('c1', 0, 10)] }, sound([{ id: 's', start: 0, end: 10, source: 'v', in: 0, rate: 1, gain: 0, fadeIn: 0, fadeOut: 0 }])]);
    expect(modelChecks(talk, { ...ok, transcripts: { v: say } })).toEqual([]);
    expect(modelChecks(project([{ id: 'main', kind: 'video', items: [clip('c1', 0, 10)] }]), ok)).toEqual([]);
    expect(modelChecks(tall([{ id: 'main', kind: 'video', items: [clip('c1', 0, 200)] }], 200), ok)).toEqual([]);
  });

  test('a word card shorter than its reading time is warned; captions are not (they follow the speech)', () => {
    const p = project([{ id: 'main', kind: 'video', items: [clip('c1', 0, 10)] }, { id: 'o', kind: 'overlay', items: [
      { id: 'slam', start: 1, end: 2, type: 'common.slam', params: { text: '借來的釣竿\n要價【6萬5】日幣' } },       // 10 Chinese characters and 2 digits: 0.4 + 10/9 + 2/17 ≈ 1.6 s
      { id: 'ok', start: 3, end: 5, type: 'common.slam', params: { text: '啪！' } },
      { id: 'cap', start: 6, end: 6.5, type: 'common.caption', params: { text: '這一句字幕很長很長很長很長' } },
      // a chat: only the messages' words count, not the times, who, kinds and keys (7 Chinese characters: 0.4 + 7/9 ≈ 1.18 s)
      { id: 'chat', start: 7, end: 8.2, type: 'common.chat', params: { items: '0|me|你好/明天見|when=21:04\n0.5|them||typing\n1|them|好啊|unread' } },
    ] }]);
    expect(msgs(modelChecks(p, ok)).filter((m) => m.startsWith('warn'))).toEqual([expect.stringMatching(/^warn 1-2 字卡「借來的釣竿 要價 6萬5 日幣」只出現 1.0 秒，讀完約要 1.6 秒（slam）/)]);
  });

  // acc-b3-outdoor (2026-11-01): fx.words' items line was counted whole, its times, sizes, colours and modes as letters
  const str = (key: string, def: string) => ({ key, label: key, type: 'string' as const, default: def });
  const FX: Record<string, any[]> = {
    'fx.words': [{ key: 't0', label: 't0', type: 'number', default: 0 }, str('stops', '0:0.09'), str('items', '0.1|釣魚，|260|navy|960|360|drop'), str('font', 'Noto Sans TC')],
    'fx.rod': [str('t1', '一支竿折起來就走'), str('mode', 'drop')],
    'fx.paint': [{ key: 'color', label: 'c', type: 'color', default: '#fff' }],
  };
  const declared = { ...ok, params: (t: string) => FX[t], knownFonts: ['Noto Sans TC'] };

  test("an fx's card counts only the words its declared params show: not a line's times, sizes, colours, modes, nor its timing params", () => {
    const p = project([{ id: 'main', kind: 'video', items: [clip('c1', 0, 10)] }, { id: 'o', kind: 'overlay', items: [
      { id: 'w', start: 0, end: 2.2222, type: 'fx.words', params: { t0: 6.67, stops: '0:0.09,8.8889:0.14,16.6667:0.2', items: '0.02|出門，|580|navy|960|490|knock|stagger=0.08' } },
      { id: 'rod', start: 3, end: 3.8, type: 'fx.rod', params: {} },                               // its default words are drawn: 8 characters ≈ 1.3 s
      { id: 'bill', start: 5, end: 7.2, type: 'common.receipt', params: { items: '0.2|🚄|來回車票|NT$1,480|n\n0.55|🏨|民宿一晚|NT$2,200|n' } },
    ] }]);
    expect(msgs(modelChecks(p, declared)).filter((m) => m.startsWith('warn'))).toEqual([expect.stringMatching(/^warn 3-3.8 字卡「一支竿折起來就走」只出現 0.8 秒，讀完約要 1.3 秒（rod）/)]);
  });

  test("a short's first second: an fx's declared words count as text; one that draws letters on a canvas is a note, not a warning", () => {
    const tall1 = (fx: any) => tall([{ id: 'main', kind: 'video', items: [clip('c1', 0, 10)] }, { id: 'o', kind: 'overlay', items: [fx] }]);
    expect(modelChecks(tall1({ id: 'rod', start: 0, end: 3, type: 'fx.rod', params: { t1: '出門了' } }), declared)).toEqual([]);
    const painted = tall1({ id: 'p', start: 0, end: 3, type: 'fx.paint', params: {} });
    expect(msgs(modelChecks(painted, { ...declared, canvasText: (t: string) => t === 'fx.paint' }))).toEqual([expect.stringMatching(/^note 0-1 開頭第一秒沒有人說話，也看不到字幕或字卡；p 在 canvas 上畫字，check 看不到/)]);
    expect(msgs(modelChecks(painted, declared))).toEqual([expect.stringMatching(/^warn 0-1 開頭第一秒沒有字也沒有人說話/)]);   // no canvas letters: still a warning
  });

  test('an fx that reports its canvas letters (ctx.reportText): the measured frames decide the first second and the reading time', () => {
    const tall1 = (...fx: any[]) => tall([{ id: 'main', kind: 'video', items: [clip('c1', 0, 10)] }, { id: 'o', kind: 'overlay', items: fx }]);
    const reporting = { ...declared, canvasText: (t: string) => t === 'fx.paint', reportsText: (t: string) => t === 'fx.paint' };
    const painted = tall1({ id: 'p', start: 0, end: 3, type: 'fx.paint', params: {} });
    const drawn = (words: Record<string, string>, early: string[]) => ({ words: new Map(Object.entries(words)), early: new Set(early) });
    // --quick measured nothing: run it without
    expect(msgs(modelChecks(painted, reporting))).toEqual([expect.stringMatching(/^note 0-1 .*p 在 canvas 上畫字，--quick 不量畫面/)]);
    // measured: words up before 1 s are text; none is the plain warning, as for any film
    expect(modelChecks(painted, { ...reporting, drawn: drawn({ p: '出門了' }, ['p']) })).toEqual([]);
    expect(msgs(modelChecks(painted, { ...reporting, drawn: drawn({ p: '出門了' }, []) }))).toEqual([expect.stringMatching(/^warn 0-1 開頭第一秒沒有字也沒有人說話/)]);
    // its reading time is the words it drew, not its params (fx.rod's default words would need 1.3 s)
    const rod = tall1({ id: 'say', start: 0, end: 0.8, type: 'fx.paint', params: {} }, { id: 'r', start: 0, end: 0.8, type: 'fx.rod', params: {} });
    const read = (words: string) => msgs(modelChecks(rod, { ...reporting, drawn: drawn({ say: words }, ['say']) })).filter((m) => m.includes('（say）'));
    expect(read('好')).toEqual([]);
    expect(read('這一句畫在畫布上的字很長')).toEqual([expect.stringMatching(/^warn 0-0.8 字卡「這一句畫在畫布上的字很長」只出現 0.8 秒/)]);
  });

  test("a shared block's words are in all the string and text params it declares (outro lines, handwrite lines, a slam's kicker), not its options", () => {
    const registry = createRegistry(plugins), shared = { ...ok, params: (t: string) => registry.item(t)?.params };
    const p = project([{ id: 'main', kind: 'video', items: [clip('c1', 0, 10)] }, { id: 'o', kind: 'overlay', items: [
      // c.endCard's credits: 15 Chinese characters ≈ 2.1 s
      { id: 'end', start: 8, end: 9, type: 'common.outro', params: { lines: '謝謝收看\n下一集見\n記得訂閱頻道喔' } },
      { id: 'slam', start: 1, end: 1.6, type: 'common.slam', params: { text: '好', kicker: '你絕對想不到的是' } },
      // options are not words: a corner list, colours
      { id: 'amb', start: 2, end: 2.3, type: 'common.ambient', params: { colors: '#2bb3d6,#0c4e80', stops: '0:0, 0.8:0.5' } },
      { id: 'pan', start: 3, end: 3.3, type: 'common.panel', params: { corners: 'tl,br' } },
    ] }]);
    expect(msgs(modelChecks(p, shared)).filter((m) => m.includes('字卡'))).toEqual([
      expect.stringMatching(/^warn 1-1.6 字卡「好 你絕對想不到的是」只出現 0.6 秒.*（slam）/),
      expect.stringMatching(/^warn 8-9 字卡「謝謝收看 下一集見 記得訂閱頻道喔」只出現 1.0 秒.*（end）/),
    ]);
    // a short opening on handwritten lines has words in its first second
    const tallP = tall([{ id: 'main', kind: 'video', items: [clip('c1', 0, 10)] }, { id: 'o', kind: 'overlay', items: [
      { id: 'hw', start: 0, end: 4, type: 'common.handwrite', params: { lines: '0.1-1.3|今天的風很溫柔\n1.5-2.7|我們沿著河邊慢慢走' } }] }]);
    expect(msgs(modelChecks(tallP, shared)).filter((m) => !m.includes('theme'))).toEqual([]);
  });

  test('visibleWords keeps the words of a value: lines and |-fields, not numbers, colours, files, key=value or (in a line) lowercase tokens', () => {
    expect(visibleWords('#2bb3d6,#0c4e80,#051630')).toBe('');                       // a list of colours
    expect(visibleWords('rgba(0,0,0,0.55)')).toBe('');
    expect(visibleWords('tl,tr', true)).toBe('');                                   // a list of options
    expect(visibleWords('Hello, world', true)).toBe('Hello, world');                 // words with a comma stay words
    expect(visibleWords('借來的釣竿\n要價【6萬5】日幣')).toBe('借來的釣竿 要價【6萬5】日幣');
    expect(visibleWords('hello')).toBe('hello');                                     // a plain value's lowercase word is a word
    expect(visibleWords('drop', true)).toBe('');                                     // an fx's lone lowercase token is an option
    expect(visibleWords('0.05|Got a bite,|280|#10204A|960|300|drop|jump=0.8\\n1|media/x.png|好')).toBe('Got a bite, 好');
  });

  test('canvasFxFiles: the fx modules that draw letters on a canvas, in their own code or a helper they import', () => {
    const files: Record<string, string> = {
      'fx/a.js': "import { word } from './lib/text.js';\nexport default [];", 'fx/lib/text.js': 'export const word = (g) => g.fillText("x", 0, 0);',
      'fx/b.js': '// g.fillText(no)\nexport default [];', 'fx/c.js': "export * from './b.js';\nconst s = 'g.fillText(';",
      'fx/lib/x/_entry.js': "export { default } from '../../a.js';",
    };
    expect(canvasFxFiles(['fx/a.js', 'fx/b.js', 'fx/c.js', 'fx/lib/x/_entry.js', 'fx/gone.js'], (f) => files[f] ?? null)).toEqual(['fx/a.js', 'fx/lib/x/_entry.js']);
    // the ones that report those letters (ctx.reportText), the same way
    files['fx/lib/text.js'] += '\nexport const tell = (ctx, g) => ctx.reportText(g, "x", 0, 0);';
    expect(canvasFxFiles(['fx/a.js', 'fx/b.js', 'fx/lib/x/_entry.js'], (f) => files[f] ?? null, reportsCanvasText)).toEqual(['fx/a.js', 'fx/lib/x/_entry.js']);
  });

  test('a photo that holds over 4 s without moving is warned', () => {
    const p = project([{ id: 'main', kind: 'video', items: [clip('p1', 0, 5, { source: 'ph' }), clip('p2', 5, 10, { source: 'ph', crop: { from: { x: 0.5, y: 0.5, zoom: 1 }, to: { x: 0.5, y: 0.5, zoom: 1.1 } } })] }]);
    expect(msgs(modelChecks(p, ok))).toEqual(['warn 0-5 照片 p1 停了 5.0 秒完全沒動：加推近或平移（crop 的 from／to），或縮短']);
  });

  test('five shots in a row of one length is a note; a varied run is not', () => {
    const even = project([{ id: 'main', kind: 'video', items: [0, 2, 4, 6, 8].map((t, i) => clip(`c${i}`, t, t + 2, { in: t })) }]);
    expect(msgs(modelChecks(even, ok))).toEqual([expect.stringMatching(/^note 0-10 連續 5 個鏡頭都差不多 2.0 秒長/)]);
    const varied = project([{ id: 'main', kind: 'video', items: [[0, 2], [2, 3], [3, 6], [6, 8], [8, 10]].map(([a, b], i) => clip(`c${i}`, a, b, { in: a })) }]);
    expect(modelChecks(varied, ok)).toEqual([]);
  });

  test('equal shots cut on the half bars of the music grid are cutting to the music, not a slideshow', () => {
    // 80 BPM: a half bar is 1.5 s
    const cuts = (at: number, len: number) => [0, 1, 2, 3, 4].map((k) => clip(`c${k}`, at + k * len, at + (k + 1) * len, { in: k * 3 }));
    const slideshow = (items: any[], grids: any[]) => msgs(modelChecks({ ...project([{ id: 'main', kind: 'video', items }], { duration: 30 }), grids }, ok)).filter((m) => m.includes('幻燈片'));
    expect(slideshow(cuts(0, 1.5), [{ id: 'music', at: 0, bpm: 80 }])).toEqual([]);
    expect(slideshow(cuts(3, 4.5), [{ id: 'music', at: 0, bpm: 80 }])).toEqual([]);
    // off the half bar (a beat in), another tempo, or past the grid's end: still a note
    for (const g of [{ id: 'music', at: 0.75, bpm: 80 }, { id: 'music', at: 0, bpm: 97 }, { id: 'music', at: 0, bpm: 80, until: 4.5 }])
      expect(slideshow(cuts(0, 1.5), [g]), JSON.stringify(g)).toEqual([expect.stringMatching(/^note 0-7.5 連續 5 個鏡頭/)]);
  });
});

test('a clip whose frame is off screen: all of it an error (pixels named), more than half a warning, a little bleed fine', () => {
  const p = project([{ id: 'main', kind: 'video', items: [
    clip('px', 0, 3, { frame: [80, 300, 920, 1100] }), clip('half', 3, 6, { frame: [0.75, 0.1, 0.6, 0.5] }), clip('bleed', 6, 10, { frame: [-0.02, 0.1, 1.04, 0.6] })] }]);
  const m = msgs(modelChecks(p, ok)).filter((x) => x.includes('frame'));
  expect(m).toEqual([
    'error 0-3 影片 px 的 frame [80, 300, 920, 1100] 整個在畫面外，看不到；frame 是畫面的比例（0–1），這組數字看起來是像素',
    'warn 3-6 影片 half 的 frame [0.75, 0.1, 0.6, 0.5] 只有 42% 在畫面裡']);
});

test('footage and music outside tellcut/ are named once: handing tellcut/ over or backing it up leaves them behind (R3-H8)', () => {
  const p = project([]), win = process.platform === 'win32', root = win ? 'C:/s/tellcut' : '/s/tellcut';
  p.sources = { a: { path: '../../../sources/trip/a.mp4', duration: 5 } as any, b: { path: 'media/b.mp4', duration: 5 } as any, c: { path: win ? 'D:/Trips/c.mp4' : '/Volumes/Trips/c.mp4', duration: 5 } as any };
  p.media = { m: { path: '../../../music/song.mp3' } as any, v: { path: 'media/voice/1.wav' } as any };
  const f = outsideFiles(p, `${root}/projects/x`, root);
  expect(f).toHaveLength(1);
  expect(f[0]).toMatchObject({ level: 'note' });
  expect(f[0].msg).toContain('3 個檔案在 tellcut 資料夾外面');
  expect(f[0].msg).toContain('a、c、m');
  expect(outsideFiles({ ...p, sources: {}, media: {} }, `${root}/projects/x`, root)).toEqual([]);
});

test('the preset the project was made from: off its length or ratio is a warning (the user may have asked for it), a preset that is gone a note', () => {
  const made = (o: { width?: number; height?: number; duration?: number; preset?: object | null } = {}) => parseProject({ version: 1,
    meta: { name: 't', width: o.width ?? 1080, height: o.height ?? 1920, fps: 30, duration: o.duration ?? 60, plugins: [], mix: MIX, ...(o.preset === null ? {} : { preset: o.preset ?? { id: 'travel' } }) },
    sources: {}, media: {}, grids: [], tracks: [] });
  const travel = { id: 'travel', name: '旅行精華', length: [30, 150] as [number, number], ratios: ['9:16'] };
  const msgs = (f: ReturnType<typeof presetChecks>) => f.map((x) => `${x.level} ${x.msg}`);
  expect(presetChecks(made(), travel)).toEqual([]);
  expect(presetChecks(made({ duration: 150.02 }), travel)).toEqual([]);   // within a frame of the longest
  expect(msgs(presetChecks(made({ duration: 180, width: 1920, height: 1080 }), travel))).toEqual([
    'warn 片長 180 秒，片型「旅行精華」（travel）是 30–150 秒：是使用者要的就沒關係，不然照片型改',
    'warn 畫面比例 16:9（1920×1080），片型「旅行精華」（travel）是 9:16：是使用者要的就沒關係，不然照片型改']);
  expect(msgs(presetChecks(made({ duration: 12.34 }), travel))[0]).toMatch(/^warn 片長 12.3 秒/);
  expect(msgs(presetChecks(made({ width: 1000, height: 1001 }), travel))[0]).toMatch(/^warn 畫面比例 1000×1001，/);
  // a preset that allows two ratios, one without a length
  expect(presetChecks(made({ width: 1920, height: 1080 }), { id: 'c', name: 'C', ratios: ['16:9', '9:16'] })).toEqual([]);
  expect(presetChecks(made({ preset: null, duration: 999 }), travel)).toEqual([]);
  expect(msgs(presetChecks(made({ preset: { id: 'my-gone' } }), null))).toEqual(['note 專案的片型 my-gone 找不到了（可能刪掉了）：長度和比例沒有照片型檢查']);
});

test("chosenSpec: the length (±10%) and ratio picked in the preset's form stand in for the preset's own", () => {
  const custom = { id: 'custom', name: '自定義' };
  expect(chosenSpec(custom, { length: '30', ratio: '1:1' })).toEqual({ ...custom, length: [27, 33], ratios: ['1:1'] });
  expect(chosenSpec(custom)).toEqual(custom);
  expect(chosenSpec(custom, { length: 'x', ratio: 'wide' })).toEqual(custom);
  expect(chosenSpec({ ...custom, length: [30, 150], ratios: ['9:16'] }, { length: '15' })).toEqual({ ...custom, length: [13.5, 16.5], ratios: ['9:16'] });
  const film = parseProject({ version: 1, meta: { name: 't', width: 1080, height: 1920, fps: 30, duration: 60, plugins: [], mix: MIX, preset: { id: 'custom' } },
    sources: {}, media: {}, grids: [], tracks: [] });
  expect(presetChecks(film, chosenSpec(custom, { length: '30', ratio: '1:1' })).map((f) => f.level)).toEqual(['warn', 'warn']);
  expect(presetChecks(film, chosenSpec(custom, { length: '60', ratio: '9:16' }))).toEqual([]);
});

test('a title template that does not exist is named: the film’s and a title’s own; a caption template is not a title template', () => {
  const ttl = (id: string, template: string) => ({ id, type: 'common.heading', start: 0, end: 2, params: { text: 'hi', template } });
  const p = project([{ id: 'main', kind: 'video', magnetic: true, items: [clip('c1', 0, 10)] }, { id: 'o', kind: 'overlay', items: [ttl('a', 'doc-rules'), ttl('b', 'neon-fill'), ttl('c', 'my-gold')] }]);
  (p.meta as any).titleTemplate = 'nope';
  (p.meta as any).titleTemplates = { 'my-gold': { style: 'gold' } };
  const found = modelChecks(p, ok).filter((f) => f.msg.includes('標題'));
  expect(found.map((f) => f.ids ?? [])).toEqual([[], ['b']]);
  expect(found[0].msg).toContain('nope');
});

test('a caption template that does not exist is named: the film’s and a caption’s own (a CAP-xx handle is not an id)', () => {
  const cap = (id: string, template: string) => ({ id, type: 'common.caption', start: 0, end: 2, params: { text: 'hi', template } });
  const p = project([{ id: 'main', kind: 'video', magnetic: true, items: [clip('c1', 0, 10)] }, { id: 'o', kind: 'overlay', items: [cap('a', 'punch-box'), cap('b', 'CAP-12'), cap('c', 'my-pink')] }]);
  (p.meta as any).captionTemplate = 'nope';
  (p.meta as any).captionTemplates = { 'my-pink': { style: 'neon' } };
  const found = modelChecks(p, ok).filter((f) => f.msg.includes('範本'));
  expect(found.map((f) => f.ids ?? [])).toEqual([[], ['b']]);
  expect(found[0].msg).toContain('nope');
});

test('the old core.title / core.caption are warned about once a type, with what to use instead; the shared blocks are not', () => {
  const p = project([{ id: 'main', kind: 'video', items: [clip('c1', 0, 10)] }, { id: 'o', kind: 'overlay', items: [
    { id: 't', start: 0, end: 2, type: 'core.title', params: { text: '片名' } },
    { id: 'a', start: 3, end: 4, type: 'core.caption', params: { text: '一' } }, { id: 'b', start: 5, end: 6, type: 'core.caption', params: { text: '二' } },
    { id: 'h', start: 7, end: 8, type: 'common.heading', params: { text: '章' } }, { id: 'c', start: 8, end: 9, type: 'common.caption', params: { text: '三' } }] }]);
  expect(msgs(oldBlocks(p))).toEqual([
    'warn 0-2 core.title 是舊積木（只為了讓舊專案打得開，1 個）：新片請改用 common.heading，照片子的標題範本',
    'warn 3-4 core.caption 是舊積木（只為了讓舊專案打得開，2 個）：新片請改用 common.caption，照片子的字幕範本']);
  expect(oldBlocks(project([{ id: 'main', kind: 'video', items: [clip('c1', 0, 10)] }]))).toEqual([]);
});

test("a project fx's param of a type ParamDef does not have is warned about, with the type it meant", async () => {
  const { fxParamTypeChecks } = await import('./rules.ts');
  const ok = { type: 'fx.ok', params: [{ key: 'a', label: 'a', type: 'text', default: '' }, { key: 'b', label: 'b', type: 'bool', default: false }] };
  expect(fxParamTypeChecks([ok])).toEqual([]);
  const odd = { type: 'fx.token', params: [{ key: 'steps', type: 'textarea' }, { key: 'enter', type: 'boolean' }, { key: 'x', type: 'constructor' }] };
  const [f, ...more] = fxParamTypeChecks([ok, odd]);
  expect(more).toEqual([]);
  expect(f.level).toBe('warn');
  expect(f.msg).toBe('fx.token 的參數 steps 型別是「textarea」，不是積木參數的型別（應該是 text）；fx.token 的參數 enter 型別是「boolean」，不是積木參數的型別（應該是 bool）；'
    + 'fx.token 的參數 x 型別是「constructor」，不是積木參數的型別：編輯器會把它畫成 JSON 欄位、catalog 印 undefined（可以用：number、string、text、color、bool、enum、source-ref、media-ref、json）');
});

test('the old common.postcard is warned about with the 3D desk to use instead (and no template)', () => {
  const p = project([{ id: 'main', kind: 'video', items: [clip('c1', 0, 10)] }, { id: 'o', kind: 'overlay', items: [
    { id: 'pc', start: 1, end: 4, type: 'common.postcard', params: {} }] }]);
  const [f, ...more] = oldBlocks(p);
  expect(more).toEqual([]);
  expect(f.level).toBe('warn');
  expect(f.msg).toContain('common.flatlay');
  expect(f.msg).not.toContain('範本');
});

test('the old core lower third and end card and common.wash are warned about, each with how its new block does the same', () => {
  const p = project([{ id: 'main', kind: 'video', items: [clip('c1', 0, 10)] }, { id: 'o', kind: 'overlay', items: [
    { id: 'lt', start: 1, end: 3, type: 'core.lowerThird', params: { text: 'x' } }, { id: 'g', start: 0, end: 10, type: 'common.grade', params: {} },
    { id: 'w', start: 0, end: 10, type: 'common.wash', params: {} }, { id: 'ec', start: 8, end: 10, type: 'core.endCard', params: {} }] }]);
  expect(msgs(oldBlocks(p))).toEqual([
    'warn 1-3 core.lowerThird 是舊積木（只為了讓舊專案打得開，1 個）：新片請改用 common.heading 的標題範本 lower-bar（c.lowerThird 就是）',
    'warn 8-10 core.endCard 是舊積木（只為了讓舊專案打得開，1 個）：新片請改用 common.outro 的 look credits（c.endCard 就是）',
    'warn 0-10 common.wash 是舊積木（只為了讓舊專案打得開，1 個）：新片請改用 common.grade 的 deep: true（同一個項目裡畫）']);
});

test('an outro after the last clip is an end card of its own, not overlays on a black frame', () => {
  const p = project([{ id: 'main', kind: 'video', items: [clip('c1', 0, 7)] }, { id: 'o', kind: 'overlay', items: [{ id: 'end', start: 7, end: 10, type: 'common.outro', params: { look: 'credits' } }] }]);
  expect(msgs(modelChecks(p, ok)).filter((m) => m.includes('黑'))).toEqual([]);
});

test('a desk that flies into a video with no main-track clip to take over is warned about', () => {
  const desk = (fly: object) => ({ id: 'desk', start: 0, end: 6, type: 'common.flatlay', params: { objects: JSON.stringify([{ kind: 'polaroid', shot: 'v|4', at: 0 }]), fly } });
  const bare = project([{ id: 'main', kind: 'video', items: [] }, { id: 'o', kind: 'overlay', items: [desk({ index: 0, at: 1, dur: 1 })] }]);
  const [f, ...more] = flatlayHandOff(bare);
  expect(more).toEqual([]);
  expect(f.level).toBe('warn');
  expect(f.ids).toEqual(['desk']);
  expect(f.msg).toContain('flatlayClip');
  const handed = project([{ id: 'main', kind: 'video', items: [clip('c1', 0, 6, { in: 4 })] }, { id: 'o', kind: 'overlay', items: [desk({ index: 0, at: 1, dur: 1 })] }]);
  expect(flatlayHandOff(handed)).toEqual([]);
  const back = project([{ id: 'main', kind: 'video', items: [] }, { id: 'o', kind: 'overlay', items: [desk({ index: 0, at: 1, dur: 1, back: 2.5 })] }]);
  expect(flatlayHandOff(back).length, 'flies back out: the main track is seen only for a moment').toBe(1);
  const still = project([{ id: 'main', kind: 'video', items: [] }, { id: 'o', kind: 'overlay', items: [{ ...desk({ index: 0, at: 1, dur: 1 }), params: { objects: JSON.stringify([{ kind: 'polaroid', shot: 'ph|0||still', at: 0 }]), fly: { index: 0, at: 1, dur: 1 } } }] }]);
  expect(flatlayHandOff(still), 'a still: the desk keeps drawing it').toEqual([]);
});

test("a desk whose objects or fly can't be read is an error (the block would draw one default object, or never fly)", () => {
  const desk = (params: object) => project([{ id: 'main', kind: 'video', items: [clip('c1', 0, 10)] }, { id: 'o', kind: 'overlay', items: [{ id: 'desk', start: 0, end: 6, type: 'common.flatlay', params }] }]);
  const errs = (params: object) => modelChecks(desk(params), ok).filter((f) => f.level === 'error');
  const objs = errs({ objects: '[{"kind":"polaroid",' });
  expect(objs.length).toBe(1);
  expect(objs[0].ids).toEqual(['desk']);
  expect(objs[0].msg).toContain('objects');
  const fly = errs({ objects: '[{"kind":"polaroid","at":0}]', fly: '{"index":0,' });
  expect(fly.length).toBe(1);
  expect(fly[0].msg).toContain('fly');
  expect(errs({ fly: '[1]' })[0].msg).toContain('fly');
  expect(errs({ objects: '[{"kind":"polaroid","at":0}]', fly: { index: 0, at: 1, dur: 1 } })).toEqual([]);
  expect(errs({})).toEqual([]);
});

test('a desk whose fly index names no object is an error (the block never flies, saying so only on the console)', () => {
  const desk = (params: object) => project([{ id: 'main', kind: 'video', items: [clip('c1', 0, 10)] }, { id: 'o', kind: 'overlay', items: [{ id: 'desk', start: 0, end: 6, type: 'common.flatlay', params }] }]);
  const errs = (params: object) => modelChecks(desk(params), ok).filter((f) => f.level === 'error');
  const two = JSON.stringify([{ kind: 'polaroid', at: 0 }, { kind: 'postcard', at: 0.5 }]);
  const [f, ...more] = errs({ objects: two, fly: { index: 2, at: 1, dur: 1 } });
  expect(more).toEqual([]);
  expect(f.ids).toEqual(['desk']);
  expect(f.msg).toContain('第 2 樣');
  expect(f.msg).toContain('只有 2 樣');
  expect(errs({ objects: two, fly: '{"index":1,"at":1,"dur":1}' })).toEqual([]);
  // no objects list: the one object kind names is index 0
  expect(errs({ fly: { index: 1, at: 1, dur: 1 } }).length).toBe(1);
  expect(errs({ fly: { index: 0, at: 1, dur: 1 } })).toEqual([]);
});
