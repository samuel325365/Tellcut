// Presets of the user's own (spec 2026-10-29-my-library §3.5–3.7, §4.5, §4.6): written from the save dialog, read back like any preset.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findPreset, presetBlock, presetInfo } from './presets.ts';
import { deleteUserPreset, presetBody, renameUserPreset, writeUserPreset, PresetDraftZ, posterFromImage } from './preset-write.ts';
import { ffprobe, run } from './ffmpeg.ts';
import type { BlockEntry, StyleEntry } from './library/store.ts';

function dirs() {
  const root = mkdtempSync(join(tmpdir(), 'mypresets-')), d = { repo: join(root, 'repo'), user: join(root, 'user') };
  mkdirSync(d.repo); mkdirSync(d.user);
  return d;
}
const POINTS = [{ text: '9:16 直式，約 30 秒', prompt: 'Make it 9:16, about 30 s.' }, { text: '前 2 秒放最好看的一口', prompt: 'Open on the best bite within 2 s.' }];
const entry = (slug: string, name: string): BlockEntry => ({ slug, types: [{ type: `fx.${slug}`, name, desc: '' }], main: `fx/${slug}.js`, files: [], from: { project: 'p', file: '' }, savedAt: '', version: '1' });
const style = (slug: string): StyleEntry => ({ slug, id: slug, name: '街頭爵士', desc: '', from: { project: 'p', file: '' }, savedAt: '', version: '1' });

test('the body is the opening line and one line per point', () => {
  expect(presetBody(POINTS)).toBe(`This is the user's own preset, saved from a film they liked. Follow every point; what the user says in the message still comes first.\n- Make it 9:16, about 30 s.\n- Open on the best bite within 2 s.`);
});

test('a written preset reads back: my- id, its own direction, points, facts in each language', () => {
  const d = dirs();
  const p = writeUserPreset(d, { name: '我的美食短片', summary: '小吃店探訪', points: POINTS, ratios: ['9:16'], length: [25, 35], theme: { palette: { accent: '#e8590c' } }, score: 'jazz', blocks: ['chalk'], lang: 'zh' });
  expect(p.id).toMatch(/^my-/);
  const back = findPreset(d, p.id)!;
  expect(back).toMatchObject({ mine: true, genres: false, name: { zh: '我的美食短片' }, summary: { zh: '小吃店探訪' }, points: POINTS, ratios: ['9:16'], length: [25, 35], score: 'jazz', blocks: ['chalk'], facts: { zh: ['9:16', '25–35 秒'] } });
  expect(back.prompt).toBe(presetBody(POINTS));
  // saved again under its id: changed in place, not a second preset
  writeUserPreset(d, { name: '我的美食短片', summary: '改過', points: POINTS.slice(0, 1), lang: 'zh' }, p.id);
  expect(findPreset(d, p.id)!.points).toHaveLength(1);
  expect(renameUserPreset(d, p.id, '夜市').name).toEqual({ zh: '夜市', en: '夜市', ja: '夜市' });
});

test('a preset from the form keeps choosing a genre; only my- presets can be changed', () => {
  const d = dirs();
  const p = writeUserPreset(d, { name: 'Vertical', summary: '', points: POINTS, genres: true, color: '#12b886', lang: 'en' });
  expect(findPreset(d, p.id)).toMatchObject({ genres: true, color: '#12b886', name: { en: 'Vertical' } });
  expect(() => deleteUserPreset(d, 'travel')).toThrow();
  expect(() => writeUserPreset(d, { name: 'x', summary: '', points: [], lang: 'zh' }, 'travel')).toThrow();
  deleteUserPreset(d, p.id);
  expect(findPreset(d, p.id)).toBeNull();
});

test('a deleted block is left out of the preset block and marked gone', () => {
  const d = dirs();
  const p = writeUserPreset(d, { name: '美食', summary: '', points: POINTS, theme: { palette: { accent: '#e8590c' }, fonts: { display: 'Noto Serif TC' } }, score: 'jazz', blocks: ['chalk', 'stamp'], lang: 'zh' });
  const lib = { blocks: [entry('chalk', '粉筆標題卡')], styles: [style('jazz')] };
  const block = presetBlock(findPreset(d, p.id)!, [], undefined, lib);
  expect(block).toContain('c.theme({"palette":{"accent":"#e8590c"},"fonts":{"display":"Noto Serif TC"}})');
  expect(block).toContain('npm run tellcut -- library use <the project id> chalk');
  expect(block).not.toMatch(/\bstamp\b/);
  expect(block).toContain('library use <the project id> --style jazz');
  expect(block).toContain("c.score('jazz')");
  const info = presetInfo(findPreset(d, p.id)!, { ...lib, thumb: (slug) => `/t/${slug}` });
  expect(info.points).toEqual(['9:16 直式，約 30 秒', '前 2 秒放最好看的一口']);
  expect(info.uses).toEqual({ fonts: ['Noto Serif TC'], colors: ['#e8590c'], score: { slug: 'jazz', name: '街頭爵士', gone: false },
    blocks: [{ slug: 'chalk', name: '粉筆標題卡', thumb: '/t/chalk', gone: false }, { slug: 'stamp', name: 'stamp', thumb: null, gone: true }] });
  expect(JSON.stringify(info)).not.toContain('Open on the best bite');   // the agent's English stays on the server
});

test('a draft is checked before the dialog shows it', () => {
  expect(PresetDraftZ.safeParse({ name: 'x', summary: 's', points: [{ text: 'a', prompt: 'A' }], ratio: '9:16', length: [25, 35], fx: ['fx/a.js'] }).success).toBe(true);
  expect(PresetDraftZ.safeParse({ name: 'x', summary: 's', points: [{ text: 'a' }] }).success).toBe(false);
  expect(PresetDraftZ.safeParse({ name: 'x', summary: 's', points: [], fx: ['../x.js'] }).success).toBe(false);
});

test('a poster is cut to 9:16 from any picture', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'poster-')), src = join(dir, 'wide.png'), out = join(dir, 'poster.jpg');
  await run(['-f', 'lavfi', '-i', 'color=red:s=640x360:d=1', '-frames:v', '1', src]);
  await posterFromImage(src, out);
  expect(existsSync(out)).toBe(true);
  const j = JSON.parse(await ffprobe(['-show_streams', '-of', 'json', out]));
  expect([j.streams[0].width, j.streams[0].height]).toEqual([540, 960]);
});

test('a preset’s name and summary are the user’s own words in every language; a rename in one keeps a translation made by hand in another', () => {
  const d = dirs();
  const p = writeUserPreset(d, { name: '夜の屋台', summary: '屋台めぐり', points: POINTS, ratios: ['9:16'], length: [25, 35], lang: 'ja' });
  // saved in the Japanese UI, the Chinese and English ones still show a name
  expect(findPreset(d, p.id)).toMatchObject({ name: { zh: '夜の屋台', en: '夜の屋台', ja: '夜の屋台' }, summary: { zh: '屋台めぐり', en: '屋台めぐり', ja: '屋台めぐり' },
    facts: { zh: ['9:16', '25–35 秒'], en: ['9:16', '25–35 s'], ja: ['9:16', '25〜35 秒'] } });
  // an English name added by hand in preset.md
  const file = join(d.user, p.id, 'preset.md'), text = readFileSync(file, 'utf8');
  writeFileSync(file, text.replace('"en": "夜の屋台"', '"en": "Night stalls"'));
  expect(renameUserPreset(d, p.id, '夜市', 'zh').name).toEqual({ zh: '夜市', en: 'Night stalls', ja: '夜市' });
  writeUserPreset(d, { name: 'Night market', summary: '屋台めぐり', points: POINTS, lang: 'en' }, p.id);
  expect(findPreset(d, p.id)!.name).toEqual({ zh: '夜市', en: 'Night market', ja: '夜市' });
});

test('a preset keeps only the theme its dialog shows: the colours and fonts that are valid, nothing else', () => {
  const d = dirs();
  const p = writeUserPreset(d, { name: 'a', summary: '', points: POINTS, lang: 'zh',
    theme: { palette: { accent: '#e8590c', ink: 3 }, fonts: { display: 'Noto Serif TC' }, safe: { top: 0.2 }, radius: 4, junk: { x: 1 } } });
  expect(findPreset(d, p.id)!.theme).toEqual({ palette: { accent: '#e8590c' }, fonts: { display: 'Noto Serif TC' } });
  const none = writeUserPreset(d, { name: 'b', summary: '', points: POINTS, lang: 'zh', theme: { safe: { top: 0.1 }, junk: 1 } });
  expect(findPreset(d, none.id)!.theme).toBeUndefined();
  expect(writeUserPreset(d, { name: 'c', summary: '', points: POINTS, lang: 'zh', theme: 'nonsense' }).theme).toBeUndefined();
});
