import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pickText } from '@tellcut/protocol';
import { cleanFields, fieldsNote, findPreset, loadPresets, missingPresetBlock, parsePreset, presetBlock, run } from '@tellcut/media-node';
import { demoProject, makeProjects, startApp } from './test-utils.ts';

const FRONT = { order: 1, name: { zh: '旅行精華', en: 'Travel Highlights' }, summary: { zh: 's' },
  styles: [{ id: 'map', name: { zh: '地圖' }, desc: { zh: 'd' }, prompt: 'Map.' }] };
const doc = (front: unknown, body = 'These are defaults.\n') => `---\n${typeof front === 'string' ? front : JSON.stringify(front)}\n---\n${body}`;
function dirs() {
  const root = mkdtempSync(join(tmpdir(), 'presets-'));
  const d = { repo: join(root, 'repo'), user: join(root, 'user') };
  mkdirSync(d.repo); mkdirSync(d.user);
  return d;
}
const put = (dir: string, id: string, text: string) => { mkdirSync(join(dir, id), { recursive: true }); writeFileSync(join(dir, id, 'preset.md'), text); };

test('parses JSON frontmatter and the English prompt', () => {
  const p = parsePreset(doc(FRONT, 'These are defaults…\nMore.\n'), 'travel', false);
  expect(p.name.en).toBe('Travel Highlights');
  expect(p.prompt.startsWith('These are defaults')).toBe(true);
  expect(p.styles[0].prompt).toBe('Map.');
  expect(p.fit).toEqual({});
  expect(p.facts).toEqual({});
  expect(p.mine).toBe(false);
  expect(p.sources).toEqual([]);                                                   // none named: nothing ticked
  expect(parsePreset(doc({ ...FRONT, sources: ['maps', 'freesound'] }), 'travel', false).sources).toEqual(['maps', 'freesound']);
  expect(() => parsePreset(doc({ ...FRONT, sources: 'maps' }), 'travel', false)).toThrow(/sources/);
});

const RATIO = { id: 'ratio', name: { zh: '比例', en: 'Ratio' }, group: { zh: '畫面' },
  options: [{ id: '9:16', name: { zh: '9:16 直式', en: '9:16 vertical' }, prompt: 'Make it 9:16.' }, { id: '16:9', name: { zh: '16:9 橫式', en: '16:9 wide' }, prompt: 'Make it 16:9.' }] };
const LENGTH = { id: 'length', name: { zh: '長度', en: 'Length' }, seconds: true,
  options: [{ id: '15', name: { zh: '15 秒' }, prompt: 'About 15 s long.' }, { id: '30', name: { zh: '30 秒' }, prompt: 'About 30 s long.' }] };

test('parses fields and examples', () => {
  const p = parsePreset(doc({ ...FRONT, fields: [RATIO], examples: [{ zh: '復古底片感' }] }), 'custom', false);
  expect(p.fields[0].options[0].prompt).toBe('Make it 9:16.');
  expect(p.fields[0].group).toEqual({ zh: '畫面' });
  expect(p.examples).toEqual([{ zh: '復古底片感' }]);
  const plain = parsePreset(doc(FRONT), 'travel', false);
  expect([plain.fields, plain.examples]).toEqual([[], []]);
});

test('rejects bad fields', () => {
  const opt = (id: string) => ({ id, name: { zh: id }, prompt: 'P.' });
  const bad = [
    [{ ...RATIO, options: [opt('auto')] }],                       // auto is every field's own default
    [{ ...RATIO, options: [opt('a'), opt('a')] }],
    [RATIO, { ...RATIO, options: [opt('b')] }],                   // two fields named ratio
    [{ ...RATIO, options: [] }],
  ];
  for (const fields of bad) expect(() => parsePreset(doc({ ...FRONT, fields }), 'custom', false), JSON.stringify(fields)).toThrow(/fields/);
});

test('pickText falls back to en then zh', () => {
  expect(pickText({ zh: '中', en: 'E' }, 'ja')).toBe('E');
  expect(pickText({ zh: '中' }, 'ja')).toBe('中');
  expect(pickText({ zh: '中', ja: '日' }, 'ja')).toBe('日');
  expect(pickText(undefined, 'zh')).toBeUndefined();
});

test('a broken preset is skipped, the others still list', () => {
  const d = dirs(), warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    put(d.repo, 'a', doc(FRONT));
    put(d.repo, 'b', doc('{ not json'));
    put(d.repo, 'c', doc({ summary: { zh: 's' } }));
    expect(loadPresets(d).map((p) => p.id)).toEqual(['a']);
    expect(warn).toHaveBeenCalledTimes(2);
  } finally { warn.mockRestore(); }
});

test('user presets need my- and a safe id', () => {
  const d = dirs(), warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    put(d.repo, 'a', doc({ ...FRONT, order: 2 }));
    put(d.repo, 'b', doc({ ...FRONT, order: 1 }));
    put(d.user, 'my-x', doc(FRONT));
    put(d.user, 'travel', doc(FRONT));
    put(d.user, 'My-Y', doc(FRONT));
    const all = loadPresets(d);
    expect(all.map((p) => [p.id, p.mine])).toEqual([['b', false], ['a', false], ['my-x', true]]);
    expect(warn).toHaveBeenCalled();
  } finally { warn.mockRestore(); }
});

test('the list leaves the prompts out; posters only when the file is there', async () => {
  const d = dirs();
  put(d.repo, 'a', doc(FRONT, 'These are defaults. Secret prompt.\n'));
  put(d.repo, 'b', doc({ ...FRONT, fields: [RATIO] }));
  writeFileSync(join(d.repo, 'a', 'poster.jpg'), 'jpg');
  const { app, base } = await startApp({ projectsDir: makeProjects(), presetDirs: d });
  try {
    const text = await (await fetch(`${base}/api/presets`)).text(), list = JSON.parse(text).presets;
    expect(text).not.toContain('These are defaults');
    expect(text).not.toContain('Map.');
    expect(text).not.toContain('Make it 9:16.');
    expect(list[1].fields[0].options[0]).toEqual({ id: '9:16', name: { zh: '9:16 直式', en: '9:16 vertical' } });
    expect(list.map((p: any) => [p.id, p.poster, p.preview])).toEqual([['a', '/api/presets/a/poster.jpg', null], ['b', null, null]]);
    expect(list[0].styles[0]).toEqual({ id: 'map', name: { zh: '地圖' }, desc: { zh: 'd' } });
  } finally { await app.close(); }
});

test('only poster.jpg and preview.webm are served', async () => {
  const d = dirs();
  put(d.repo, 'a', doc(FRONT));
  writeFileSync(join(d.repo, 'a', 'poster.jpg'), 'jpg');
  const { app, base } = await startApp({ projectsDir: makeProjects(), presetDirs: d });
  try {
    expect((await fetch(`${base}/api/presets/a/poster.jpg`)).status).toBe(200);
    expect((await fetch(`${base}/api/presets/a/preset.md`)).status).toBe(404);
    expect((await fetch(`${base}/api/presets/..%2Fx/poster.jpg`)).status).toBe(404);
    expect((await fetch(`${base}/api/presets/b/poster.jpg`)).status).toBe(404);
  } finally { await app.close(); }
});

test('presetBlock wraps the prompt and the picked styles', () => {
  const p = parsePreset(doc({ ...FRONT, name: { en: 'Travel Highlights' } }, 'These are defaults.\nGoal: x.\n'), 'travel', false);
  const b = presetBlock(p, ['map', 'nope']);
  expect(b.startsWith('<preset id="travel" name="Travel Highlights">')).toBe(true);
  expect(b.endsWith('</preset>')).toBe(true);
  expect(b).toContain('These are defaults.\nGoal: x.');
  expect(b).toContain('Styles the user picked:\n- 地圖: Map.');
  expect(presetBlock(p, [])).not.toContain('Styles the user picked');
  expect(missingPresetBlock('gone')).toContain('The preset "gone" the user picked is gone');
});

test('a preset with "genres": false tells Claude to skip the genre cards', () => {
  const p = parsePreset(doc(FRONT, 'These are defaults.\nGoal: x.\n'), 'travel', false);
  expect(p.genres).toBe(true);
  expect(presetBlock(p, [])).not.toContain('guides/genres');
  const own = parsePreset(doc({ ...FRONT, genres: false }, 'These are defaults.\nGoal: x.\n'), 'travel', false);
  expect(presetBlock(own, [])).toContain('Goal: x.\nThis preset is the whole direction of the film: skip choosing a genre and do not read guides/genres/.');
  expect(() => parsePreset(doc({ ...FRONT, genres: 'no' }), 'travel', false)).toThrow(/genres/);
});

test('a preset.md saved with a BOM (PowerShell) still reads', () => {
  const p = parsePreset('\uFEFF' + doc(FRONT), 'travel', false);
  expect(p.name.en).toBe('Travel Highlights');
});

const custom = () => parsePreset(doc({ ...FRONT, styles: [], name: { en: 'Custom' }, fields: [RATIO, LENGTH] }), 'custom', false);

test("cleanFields keeps the preset's own options and the seconds", () => {
  const p = custom();
  expect(cleanFields(p, { ratio: '9:16', length: '45', nope: 'x', pace: 'fast' })).toEqual({ ratio: '9:16', length: '45' });
  expect(cleanFields(p, { length: '30' })).toEqual({ length: '30' });
  // a typed 045 is 45 (and 030 the option 30)
  expect(cleanFields(p, { length: '045' })).toEqual({ length: '45' });
  expect(cleanFields(p, { length: '030' })).toEqual({ length: '30' });
  for (const raw of [{ length: '4' }, { length: '601' }, { length: '3.5' }, { length: 'abc' }, { length: 45 }, { ratio: 'auto' }, { ratio: '1:1' }, { ratio: '45' }, 'ratio', null, undefined])
    expect(cleanFields(p, raw), JSON.stringify(raw)).toEqual({});
});

test('presetBlock lists only the options the user set', () => {
  const p = custom(), plain = presetBlock(p, []);
  expect(plain).not.toContain('Options the user set');
  expect(presetBlock(p, [], {})).toBe(plain);
  const b = presetBlock(p, [], { ratio: '9:16', length: '30' });
  expect(b).toContain('Options the user set in the form (what the user says in the message still comes first):\n- Ratio: Make it 9:16.\n- Length: About 30 s long.');
  expect(b.endsWith('</preset>')).toBe(true);
  expect(presetBlock(p, [], { length: '45' })).toContain('- Length: about 45 s');
});

test('fieldsNote: the options in one line for a project chat', () => {
  const p = custom();
  expect(fieldsNote(p)).toBe('');
  expect(fieldsNote(p, {})).toBe('');
  expect(fieldsNote(p, { ratio: '9:16', length: '45' })).toBe('Options the user set in the form (what the user says in the message still comes first): Ratio: 9:16 vertical; Length: about 45 s.');
  expect(fieldsNote(p, { length: '30', gone: 'x' })).toBe('Options the user set in the form (what the user says in the message still comes first): Length: 30 秒.');
  // what project.json kept is checked again: an option the preset no longer has, or a hand edit, is dropped
  expect(fieldsNote(p, { ratio: '1:1', length: '4' })).toBe('');
});

// ---------------------------------------------------------------- presets of the user's own (spec 2026-10-29-my-library §3.5–3.7, §4.5)
import { existsSync, readFileSync } from 'node:fs';
import { fxModule, makeProject } from '../../../packages/media-node/src/library/fixture.ts';

const CUSTOM = { order: 0, name: { zh: '自定義', en: 'Custom' }, summary: { zh: 's' }, fields: [RATIO, LENGTH] };
async function mine() {
  const d = dirs(), projects = mkdtempSync(join(tmpdir(), 'mine-'));
  d.user = join(projects, '_presets');
  put(d.repo, 'custom', doc(CUSTOM, 'Custom.\n'));
  makeProject(projects, 'trip');
  writeFileSync(join(projects, 'trip', 'project.json'), JSON.stringify({ ...demoProject(), meta: { ...demoProject().meta, width: 1080, height: 1920, fx: ['fx/chalk.js'], theme: { palette: { accent: '#e8590c' } } } }));
  writeFileSync(join(projects, 'trip', 'preset-draft.json'), JSON.stringify({ name: '我的美食', summary: '小吃店', points: [{ text: '前 2 秒放最好看的一口', prompt: 'Open on the best bite.' }],
    ratio: '9:16', length: [25, 35], theme: { palette: { accent: '#e8590c' } }, score: 'street-jazz', fx: ['fx/chalk.js'] }));
  const posters: any[] = [];
  const { app, base } = await startApp({ projectsDir: projects, presetDirs: d, libraryThumb: async () => {}, presetPoster: async (o, out) => { posters.push(o.at ?? null); writeFileSync(out, 'JPG'); } });
  const send = (method: string, url: string, body?: unknown) => fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { d, projects, app, base, send, posters };
}

test('saving from a film: the draft’s blocks and music go into My blocks, the points the user kept are the preset, the draft is gone', async () => {
  const { d, projects, app, base, send, posters } = await mine();
  try {
    const points = [{ text: '前 2 秒放最好看的一口', prompt: 'Open on the best bite.' }, { text: '字幕放中間', prompt: '字幕放中間' }];
    const r = await send('POST', '/api/presets', { from: 'project', project: 'trip', name: '我的美食', summary: '小吃店', points, include: { theme: true, score: true, blocks: true }, posterAt: 2.5, lang: 'zh' });
    expect(r.status).toBe(200);
    const info = await r.json();
    expect(info).toMatchObject({ mine: true, points: ['前 2 秒放最好看的一口', '字幕放中間'], poster: expect.stringContaining('poster.jpg'),
      uses: { colors: ['#e8590c'], score: { slug: 'street-jazz', gone: false }, blocks: [{ slug: 'chalk-title', gone: false }] } });
    expect(posters).toEqual([2.5]);
    expect(existsSync(join(projects, 'trip', 'preset-draft.json'))).toBe(false);
    expect(existsSync(join(projects, '_library', 'blocks', 'chalk-title'))).toBe(true);
    const p = findPreset(d, info.id)!;
    expect(p).toMatchObject({ genres: false, ratios: ['9:16'], length: [25, 35], blocks: ['chalk-title'], score: 'street-jazz' });
    expect(p.prompt).toContain('- 字幕放中間');
    const list = (await (await fetch(`${base}/api/presets`)).json()).presets;
    expect(list.find((x: any) => x.id === info.id).uses.blocks[0].name).toBe('chalk-title');
  } finally { await app.close(); }
});

test('without its draft a film cannot be saved as a preset', async () => {
  const { projects, app, send } = await mine();
  try {
    rmSync(join(projects, 'trip', 'preset-draft.json'));
    const r = await send('POST', '/api/presets', { from: 'project', project: 'trip', name: 'x', summary: '', points: [], include: {}, lang: 'zh' });
    expect(r.status).toBe(404);
    expect((await r.json()).code).toBe('preset.noDraft');
  } finally { await app.close(); }
});

test('saving from the custom form: each option set is a point in the user’s words, and the agent still picks a genre', async () => {
  const { d, app, send } = await mine();
  try {
    const info = await (await send('POST', '/api/presets', { from: 'form', name: '我的直式', color: '#12b886', fields: { ratio: '9:16', length: '45', bogus: 'x' }, examples: ['復古底片感'], lang: 'zh' })).json();
    expect(info.points).toEqual(['9:16 直式', '約 45 秒', '復古底片感']);
    expect(findPreset(d, info.id)).toMatchObject({ genres: true, color: '#12b886', ratios: ['9:16'], length: [41, 50] });
    expect(findPreset(d, info.id)!.prompt).toContain('- Make it 9:16.');
  } finally { await app.close(); }
});

test('the form’s points come first for the dialog; what it sends is saved, the user’s own words as their own prompt; none is refused', async () => {
  const { d, app, send } = await mine();
  try {
    const { points } = await (await send('POST', '/api/presets/form-points', { fields: { ratio: '9:16' }, examples: ['復古底片感'], lang: 'zh' })).json();
    expect(points).toEqual([{ text: '9:16 直式', prompt: 'Make it 9:16.' }, { text: '復古底片感', prompt: '復古底片感' }]);
    const info = await (await send('POST', '/api/presets', { from: 'form', name: '我的', fields: { ratio: '9:16' }, points: [points[0], { text: '每段不超過 3 秒', prompt: '每段不超過 3 秒' }], lang: 'zh' })).json();
    expect(info.points).toEqual(['9:16 直式', '每段不超過 3 秒']);
    expect(findPreset(d, info.id)).toMatchObject({ ratios: ['9:16'], genres: true });
    expect(findPreset(d, info.id)!.prompt).toContain('- 每段不超過 3 秒');
    // a new preset from nothing: no form, only the user's points
    const blank = await (await send('POST', '/api/presets', { from: 'form', name: '空白', fields: {}, points: [{ text: '慢一點', prompt: '慢一點' }], lang: 'zh' })).json();
    expect(blank.points).toEqual(['慢一點']);
    const none = await send('POST', '/api/presets', { from: 'form', name: 'x', fields: {}, points: [{ text: ' ', prompt: '' }], lang: 'zh' });
    expect(none.status).toBe(400);
    expect((await none.json()).code).toBe('preset.noPoints');
    expect((await send('POST', '/api/presets', { from: 'form', name: 'x', fields: {}, examples: [], lang: 'zh' })).status).toBe(400);
    expect((await send('PUT', `/api/presets/${info.id}`, { points: [], lang: 'zh' })).status).toBe(400);
  } finally { await app.close(); }
});

test('a preset of the user’s own is edited, renamed, given a poster and deleted; a repo one is not', async () => {
  const { d, app, base, send } = await mine();
  try {
    const info = await (await send('POST', '/api/presets', { from: 'form', name: 'A', fields: { ratio: '9:16' }, examples: [], lang: 'zh' })).json();
    const edited = await (await send('PUT', `/api/presets/${info.id}`, { name: 'B', points: [{ text: '慢一點', prompt: '慢一點' }], lang: 'zh' })).json();
    expect(edited).toMatchObject({ id: info.id, name: { zh: 'B' }, points: ['慢一點'] });
    const img = join(tmpdir(), `poster-${process.pid}.png`);
    await run(['-y', '-f', 'lavfi', '-i', 'color=blue:s=640x360:d=1', '-frames:v', '1', img]);
    const up = await fetch(`${base}/api/presets/${info.id}/poster`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: readFileSync(img) });
    expect(up.status).toBe(200);
    expect((await up.json()).poster).toContain('poster.jpg');
    expect(existsSync(join(d.user, info.id, 'poster.jpg'))).toBe(true);
    expect((await send('DELETE', '/api/presets/custom')).status).toBe(400);
    expect((await send('PUT', '/api/presets/custom', { name: 'x', lang: 'zh' })).status).toBe(400);
    expect((await send('DELETE', `/api/presets/${info.id}`)).status).toBe(200);
    expect(findPreset(d, info.id)).toBeNull();
  } finally { await app.close(); }
});

test('editing keeps the agent’s line of a point the user left alone, named by what it was', async () => {
  const { d, projects, app, send } = await mine();
  try {
    const info = await (await send('POST', '/api/presets', { from: 'project', project: 'trip', name: 'A', summary: '', include: {}, lang: 'zh',
      points: [{ text: '前 2 秒放最好看的一口', prompt: 'Open on the best bite.' }, { text: '字幕放中間', prompt: 'Captions in the middle.' }] })).json();
    await send('PUT', `/api/presets/${info.id}`, { points: [{ text: '前 2 秒放最好看的一口', orig: '前 2 秒放最好看的一口' }, { text: '字幕放下面', prompt: '字幕放下面' }, { text: '騙', orig: '不存在的' }], lang: 'zh' });
    expect(findPreset(d, info.id)!.points).toEqual([{ text: '前 2 秒放最好看的一口', prompt: 'Open on the best bite.' }, { text: '字幕放下面', prompt: '字幕放下面' }, { text: '騙', prompt: '騙' }]);
    void projects;
  } finally { await app.close(); }
});

test('a film that used My blocks saves its preset with those entries, not copies of them (I1)', async () => {
  const { projects, app, send } = await mine();
  try {
    const first = await (await send('POST', '/api/library/blocks', { project: 'trip', type: 'fx.chalk-title' })).json();
    makeProject(projects, 'night', { fx: fxModule(['fx.other']) });
    writeFileSync(join(projects, 'night', 'project.json'), JSON.stringify({ ...demoProject(), meta: { ...demoProject().meta, fx: [] } }));
    const u = await (await send('POST', '/api/projects/night/library/use', { slug: first.entry.slug })).json();
    writeFileSync(join(projects, 'night', 'preset-draft.json'), JSON.stringify({ name: 'n', summary: '', points: [{ text: 'a', prompt: 'A' }], fx: [u.file] }));
    const info = await (await send('POST', '/api/presets', { from: 'project', project: 'night', name: 'n', summary: '', include: { blocks: true }, lang: 'zh', points: [{ text: 'a', prompt: 'A' }] })).json();
    expect(info.uses.blocks.map((b: any) => b.slug)).toEqual([first.entry.slug]);
    const lib = await (await send('GET', '/api/library')).json();
    expect([...new Set(lib.blocks.map((b: any) => b.slug))]).toEqual([first.entry.slug]);
  } finally { await app.close(); }
});
