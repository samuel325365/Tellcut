import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TELLCUT_ROOT } from '@tellcut/media-node';
import { main } from './score.ts';
import { applyStylePromotion, planStylePromotion } from './promote-style.ts';

const MIX = { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1, send: 0 } };
const STYLE = (id: string, body = 'ctx.rng() < 2') => `export default { id: '${id}', label: '自訂', doc: '測試用', defaults: { bpm: 100, key: 'C' },
  build(ctx) { const out = []; for (let b = 0; b < ctx.bars; b++) { if (${body}) out.push({ t: ctx.at(b, 0), inst: 'pluck', midi: ctx.scaleNote(1, 4), dur: 1, vel: 0.8, pan: 0 }); } return out; } };\n`;
const id = '_score-test', dir = join(TELLCUT_ROOT, 'projects', id);

beforeEach(() => {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'score'), { recursive: true });
  writeFileSync(join(dir, 'project.json'), JSON.stringify({ version: 1, meta: { name: 't', width: 100, height: 100, fps: 30, duration: 4, plugins: [], mix: MIX }, sources: {}, media: {}, grids: [], tracks: [] }));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

test('the style list shows the built-in ones and the project’s own; a project style makes music like a built-in one', async () => {
  writeFileSync(join(dir, 'score', 'mine.js'), STYLE('mine'));
  const list = await main(['--styles', id]);
  expect(list).toContain('lofi');
  expect(list).toMatch(/mine\s+自訂（本專案/);
  const out = await main([id, '--style', 'mine', '--length', '8']);
  expect(out).toContain("c.music('score-mine')");
  expect(JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')).media['score-mine'].path).toBe('media/score-mine.wav');
});

test('a project style that breaks the rules is refused before any music is made', async () => {
  writeFileSync(join(dir, 'score', 'clock.js'), STYLE('clock', 'new Date(0).getTime() === 0'));   // repeatable, but the clock is not allowed
  await expect(main([id, '--style', 'clock', '--length', '8'])).rejects.toThrow('不可用 Date');
  expect(existsSync(join(dir, 'media', 'score-clock.wav'))).toBe(false);
  await expect(main([id, '--style', 'nothing'])).rejects.toThrow('沒有「nothing」這個風格');
});

test('promote-style moves one style file into the library and gives it the next MUS handle; it refuses a shared file, a taken id, a missing style', async () => {
  const lib = mkdtempSync(join(tmpdir(), 'lib-')), handlesFile = join(lib, 'handles.ts');
  writeFileSync(handlesFile, `export const HANDLES = {\n  'MUS-01': 'style:pluck',\n  'RCP-01': 'recipe:travel',\n};\n`);
  try {
    writeFileSync(join(dir, 'score', 'good.js'), STYLE('good'));
    const p = await planStylePromotion({ dir, id: 'good', library: lib, handlesFile });
    expect([p.to, p.handle]).toEqual([join(lib, 'good.js'), 'MUS-02']);
    applyStylePromotion(p);
    expect(existsSync(join(lib, 'good.js'))).toBe(true);
    expect(existsSync(join(dir, 'score', 'good.js'))).toBe(false);
    expect(readFileSync(handlesFile, 'utf8')).toContain("  'MUS-01': 'style:pluck',\n  'MUS-02': 'style:good',\n  'RCP-01'");
    writeFileSync(join(dir, 'score', 'good.js'), STYLE('good'));
    await expect(planStylePromotion({ dir, id: 'good', library: lib, handlesFile })).rejects.toThrow('風格庫裡已經有');
    writeFileSync(join(dir, 'score', 'two.js'), `const a = ${STYLE('one-a').replace('export default ', '').replace(/;\n$/, '')};\nconst b = ${STYLE('one-b').replace('export default ', '').replace(/;\n$/, '')};\nexport default [a, b];\n`);
    await expect(planStylePromotion({ dir, id: 'one-a', library: lib, handlesFile })).rejects.toThrow('先拆成一個風格一個檔案');
    await expect(planStylePromotion({ dir, id: 'nope', library: lib, handlesFile })).rejects.toThrow('專案裡沒有風格');
  } finally { rmSync(lib, { recursive: true, force: true }); }
});
