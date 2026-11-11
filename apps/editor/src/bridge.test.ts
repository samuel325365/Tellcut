import { PlayerBridge, playerErrorText } from './bridge.ts';
import { setLang } from './i18n/lang.ts';

function setup() {
  // the words sent at boot are kept apart: the tests below follow the project and transport messages
  const sent: any[] = [], texts: any[] = [];
  let frame: (() => void) | null = null;
  const b = new PlayerBridge('http://h', (f) => { frame = f; });
  b.attach({ postMessage: (m: any) => (m.type === 'texts' ? texts : sent).push(m) } as any);
  return { b, sent, texts, tick: () => { const f = frame; frame = null; f?.(); } };
}

test("a starting player gets the words its hints show, in the page's language", () => {
  setLang('ja');
  const { b, texts } = setup();
  b.handle({ type: 'boot' });
  expect(texts).toEqual([{ type: 'texts', texts: { textInPanel: 'このテキストは Properties で編集してください' } }]);
  setLang('zh');
});

test('a running player gets the words again when the language changes (only once it has started)', () => {
  const { b, texts } = setup();
  setLang('en');
  expect(texts).toEqual([]);
  b.handle({ type: 'boot' });
  setLang('ja');
  expect(texts.map((m) => m.texts.textInPanel)).toEqual([expect.stringContaining('Properties'), 'このテキストは Properties で編集してください']);
  expect(texts[0].texts.textInPanel).not.toBe(texts[1].texts.textInPanel);
  b.dispose();
  setLang('zh');
  expect(texts.length).toBe(2);
});

test('load waits for boot; patches before ready are held and only the newest is sent once', () => {
  const { b, sent, tick } = setup();
  b.load({ v: 0 });
  b.patch({ v: 1 });
  expect(sent).toEqual([]);
  b.handle({ type: 'boot' });
  expect(sent).toEqual([{ type: 'load', project: { v: 1 } }]);   // the newest project, patch included
  b.patch({ v: 2 });
  tick();
  expect(sent.length).toBe(1);
  let ready = 0;
  b.onReady = (d) => { ready = d; };
  b.handle({ type: 'ready', duration: 9 });
  expect(ready).toBe(9);
  expect(sent.at(-1)).toEqual({ type: 'patch', project: { v: 2 } });
  b.patch({ v: 3 }); b.patch({ v: 4 });
  tick();
  expect(sent.filter((m) => m.type === 'patch').map((m) => m.project.v)).toEqual([2, 4]);
});

test('transport messages go out only when ready; player events reach the callbacks', () => {
  const { b, sent } = setup();
  b.seek(1);
  expect(sent).toEqual([]);
  b.handle({ type: 'boot' }); b.load({}); b.handle({ type: 'ready', duration: 1 });
  b.seek(2); b.play(2); b.pause();
  expect(sent.slice(1)).toEqual([{ type: 'seek', t: 2 }, { type: 'play', from: 2 }, { type: 'pause' }]);
  const seen: any[] = [];
  b.onTime = (t) => seen.push(t); b.onEnded = () => seen.push('end'); b.onError = (m) => seen.push(m);
  b.handle({ type: 'time', t: 0.5 }); b.handle({ type: 'ended' }); b.handle({ type: 'error', message: 'x' });
  expect(seen).toEqual([0.5, 'end', 'x']);
});

test('a re-booted player gets the newest project, not the one from open time', () => {
  const { b, sent, tick } = setup();
  b.handle({ type: 'boot' }); b.load({ v: 0 }); b.handle({ type: 'ready', duration: 1 });
  b.patch({ v: 1 }); tick();
  b.handle({ type: 'boot' });
  expect(sent.at(-1)).toEqual({ type: 'load', project: { v: 1 } });
});

test('forwarded keys reach onKey', () => {
  const { b } = setup();
  const keys: string[] = [];
  b.onKey = (k) => keys.push(k.key);
  b.handle({ type: 'key', key: 's', code: 'KeyS', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false });
  expect(keys).toEqual(['s']);
});

test('cropMode goes out when ready; cropChange reaches onCropChange', () => {
  const { b, sent } = setup();
  b.handle({ type: 'boot' }); b.load({}); b.handle({ type: 'ready', duration: 1 });
  b.cropMode({ itemId: 'c', which: 'from' });
  expect(sent.at(-1)).toEqual({ type: 'cropMode', sel: { itemId: 'c', which: 'from' } });
  const got: any[] = [];
  b.onCropChange = (m) => got.push(m.crop.x);
  b.handle({ type: 'cropChange', itemId: 'c', which: 'from', crop: { x: 0.3, y: 0.5, zoom: 1 }, final: true });
  expect(got).toEqual([0.3]);
});

test('level messages reach onLevel', () => {
  const { b } = setup();
  const got: number[] = [];
  b.onLevel = (db) => got.push(db);
  b.handle({ type: 'level', db: -9 });
  expect(got).toEqual([-9]);
});

test('quality goes out once the player is ready', () => {
  const { b, sent } = setup();
  b.quality('draft');
  expect(sent).toEqual([]);
  b.handle({ type: 'boot' }); b.load({}); b.handle({ type: 'ready', duration: 1 });
  b.quality('draft');
  expect(sent.at(-1)).toEqual({ type: 'quality', value: 'draft' });
});

test('selection goes to the preview; picks, transform changes and text edits come back', () => {
  const { b, sent } = setup();
  b.handle({ type: 'boot' }); b.load({}); b.handle({ type: 'ready', duration: 1 });
  b.select('f');
  expect(sent.at(-1)).toEqual({ type: 'select', itemId: 'f' });
  const got: any[] = [];
  b.onPick = (id) => got.push(['pick', id]);
  b.onTransformChange = (m) => got.push(['tf', m.final]);
  b.onParamEdit = (m) => got.push(['edit', m.key, m.value]);
  b.handle({ type: 'pick', itemId: 'f' });
  b.handle({ type: 'transformChange', itemId: 'f', transform: { x: 0, y: 0, scale: 1, ox: 0.5, oy: 0.5 }, final: true });
  b.handle({ type: 'paramEdit', itemId: 'f', key: 'title', value: 'x' });
  expect(got).toEqual([['pick', 'f'], ['tf', true], ['edit', 'title', 'x']]);
});

test('a seek or play goes out after the waiting patch: the player plays the project as it is now', () => {
  const { b, sent } = setup();
  b.handle({ type: 'boot' }); b.load({ v: 0 }); b.handle({ type: 'ready', duration: 1 });
  b.patch({ v: 1 }); b.seek(2); b.play(2);
  expect(sent.slice(-3).map((m) => m.type)).toEqual(['patch', 'seek', 'play']);
});

test('a boot is reported (the preview restarted: the editor must not take the old player as ready)', () => {
  const { b } = setup();
  let boots = 0;
  b.onBoot = () => { boots++; };
  b.handle({ type: 'boot' }); b.handle({ type: 'ready', duration: 1 }); b.handle({ type: 'boot' });
  expect(boots).toBe(2);
});

test("a player error's code is worded in the page's language; its own words when the code has no text", () => {
  const off = { type: 'error', message: 'Audio not available (404): http://h/a.mp3', code: 'player.audioOffline', params: { error: '404', url: 'http://h/a.mp3' } } as const;
  expect(playerErrorText(off, 'en')).toBe('Audio not available (404): http://h/a.mp3');
  expect(playerErrorText(off, 'zh')).toBe('音訊無法使用（404）：http://h/a.mp3');
  expect(playerErrorText(off, 'ja')).toBe('音声を使えません（404）：http://h/a.mp3');
  const crop = { type: 'error', itemId: 'v1', message: 'Crop mode: the clip no longer exists', code: 'player.cropGone' } as const;
  expect(['en', 'zh', 'ja'].map((l) => playerErrorText(crop, l as any)))
    .toEqual(['v1: Crop mode: the clip no longer exists', 'v1: 裁切模式：這個片段已經不在了', 'v1: クロップモード：このクリップはもうありません']);
  expect(playerErrorText({ type: 'error', message: '3D not available, previewing flat (x)', code: 'player.noThreeD', params: { error: 'x' } }, 'ja'))
    .toBe('3D を使えないため、平面でプレビューします（x）');
  expect(playerErrorText({ type: 'error', message: 'm', code: 'player.audioDecode', params: { key: 'k', error: 'bad' } }, 'zh'))
    .toBe('音訊無法解碼，播放時略過（k）：bad');
  // an unknown code (a newer player) and no code at all: the player's own words
  expect(playerErrorText({ type: 'error', message: 'something new', code: 'player.fromTheFuture' }, 'zh')).toBe('something new');
  expect(playerErrorText({ type: 'error', itemId: 'v9', message: 'Video not available' }, 'ja')).toBe('v9: Video not available');
  // the engine stage's own: a block that fails to draw or to load, after its item; the block's error stays as thrown
  const bad = { type: 'error', itemId: 'b1', message: 'Item "b1" (common.slam): boom', code: 'player.itemFailed', params: { type: 'common.slam', error: 'boom' } } as const;
  expect(['en', 'zh', 'ja'].map((l) => playerErrorText(bad, l as any))).toEqual(['b1: common.slam could not be drawn: boom', 'b1: common.slam 畫不出來：boom', 'b1: common.slam を描画できません：boom']);
  expect(playerErrorText({ type: 'error', itemId: 'b1', message: 'no art', code: 'player.itemNotReady', params: { type: 'r.bad', error: 'no art' } }, 'zh')).toBe('b1: r.bad 需要的素材載入失敗：no art');
  // a load, edit, seek or play that failed; a project from a newer Tellcut keeps its own code
  expect(playerErrorText({ type: 'error', message: 'x', code: 'player.updateFailed', params: { error: 'x' } }, 'en')).toBe('The preview could not take the edit: x');
  expect(playerErrorText({ type: 'error', message: 'Invalid project', code: 'project.tooNew', params: { version: 9, max: 1 } }, 'zh')).toMatch(/較新的 Tellcut/);
});

test("an fx error is worded by the fx issue's own code, after the module's path; uncoded, its message already names it", () => {
  const fx = { type: 'error', message: 'fx fx/a.js：效果模組載入失敗', code: 'fx.loadFailed', params: { error: 'boom' }, path: 'fx/a.js' } as const;
  expect(playerErrorText(fx, 'en')).toBe('fx/a.js: The effect module failed to load: boom');
  expect(playerErrorText(fx, 'zh')).toBe('fx/a.js: 效果模組載入失敗：boom');
  expect(playerErrorText({ type: 'error', message: 'fx fx/a.js：old words', path: 'fx/a.js' }, 'en')).toBe('fx fx/a.js：old words');
});

test('coded player errors reach onError worded in the current language', () => {
  setLang('en');
  const { b } = setup();
  const seen: string[] = [];
  b.onError = (m) => seen.push(m);
  b.handle({ type: 'error', message: 'Crop mode: the clip no longer exists', code: 'player.cropGone', itemId: 'v1' });
  setLang('ja');
  b.handle({ type: 'error', message: '3D not available, previewing flat (x)', code: 'player.noThreeD', params: { error: 'x' } });
  setLang('zh');
  expect(seen).toEqual(['v1: Crop mode: the clip no longer exists', '3D を使えないため、平面でプレビューします（x）']);
});

test('a source analysed meanwhile is sent to a booted player (even one still loading), never before boot', () => {
  const { b, sent } = setup();
  b.mediaReady('s1');
  expect(sent).toEqual([]);   // a player not booted yet asks for everything when its load comes
  b.load({ v: 0 });
  b.handle({ type: 'boot' });
  b.mediaReady('s1');
  expect(sent).toEqual([{ type: 'load', project: { v: 0 } }, { type: 'mediaReady', source: 's1' }]);
});
