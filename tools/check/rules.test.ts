import { parseProject, type Transcript } from '@tellcut/engine';
import { chosenSpec, fxChecks, modelChecks, outsideFiles, presetChecks } from './rules.ts';
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
  expect(modelChecks(project(music({ toEnd: true })), ok)).toEqual([]);
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
    for (const bad of ['new Date()', 'Date.now()', 'performance.now()', 'setTimeout(f, 1)', 'setInterval(f, 1)', 'requestAnimationFrame(f)', 'fetch(u)', 'new XMLHttpRequest()', 'import("x")', 'eval("1")', 'new Function("1")'])
      expect(scan(`x = ${bad};`), bad).toHaveLength(1);
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
  test('letters drawn on a canvas are noted once: the layout check cannot see them', () => {
    expect(scan("g.font = '700 60px x';\ng.fillText(t, 0, 0);\ng.strokeText(t, 0, 0);")).toEqual(['note fx/a.js:2 在 canvas 上畫字：check 量不到這些字（超出安全區、蓋到字幕、字太小都不會報），請用 frames 自己看']);
    expect(scan('// g.fillText(t)\nconst s = "fillText(";')).toEqual([]);
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
  const p = project([]);
  p.sources = { a: { path: '../../../sources/trip/a.mp4', duration: 5 } as any, b: { path: 'media/b.mp4', duration: 5 } as any, c: { path: 'D:/Trips/c.mp4', duration: 5 } as any };
  p.media = { m: { path: '../../../music/song.mp3' } as any, v: { path: 'media/voice/1.wav' } as any };
  const f = outsideFiles(p, 'C:/s/tellcut/projects/x', 'C:/s/tellcut');
  expect(f).toHaveLength(1);
  expect(f[0]).toMatchObject({ level: 'note' });
  expect(f[0].msg).toContain('3 個檔案在 tellcut 資料夾外面');
  expect(f[0].msg).toContain('a、c、m');
  expect(outsideFiles({ ...p, sources: {}, media: {} }, 'C:/s/tellcut/projects/x', 'C:/s/tellcut')).toEqual([]);
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
