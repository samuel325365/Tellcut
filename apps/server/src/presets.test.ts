import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pickText } from '@tellcut/protocol';
import { cleanFields, fieldsNote, loadPresets, missingPresetBlock, parsePreset, presetBlock } from '@tellcut/media-node';
import { makeProjects, startApp } from './test-utils.ts';

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
