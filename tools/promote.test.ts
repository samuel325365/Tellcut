import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseProject } from '@tellcut/engine';
import { applyPromotion, describePromotion, planPromotion } from './promote.ts';
import { nextHandle, similarNames, withHandle } from './handle-registry.ts';

const MIX = { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1, send: 0 } };
const fxSrc = (...types: string[]) => `export default [${types.map((t) => `{ type: '${t}', label: '${t}', kind: 'overlay', doc: 'd', params: [], build() { return 0; }, draw() {} }`).join(', ')}];\n`;
const INDEX = `import type { ItemType, Plugin } from '@tellcut/engine';\nimport { film } from './film.ts';\nimport { progress } from './progress.ts';\n\nexport const commonItems: ItemType[] = [progress, film] as ItemType[];\nexport const commonPlugin: Plugin = { id: 'common', items: commonItems };\n`;
const CASES = `export const cases = [\n  { name: 'film', type: 'common.film', at: [1] },\n];\n`;
const HANDLES = `export const HANDLES: Readonly<Record<string, string>> = {\n  'MRK-01': 'common.stamp',\n  'LOK-01': 'common.film',\n};\nexport const RETIRED: Readonly<Record<string, string>> = {\n  'MRK-02': 'common.gone',\n};\n`;
/** the shared names a new one is compared with */
const NAMES = ['film', 'progress', 'ding', 'rings', 'ringbell'];

let root: string, dir: string, common: string, handlesFile: string;
const plan = (o: { type: string; name?: string; category?: string }) => planPromotion({ dir, category: 'mark', ...o, commonDir: common, handlesFile, names: NAMES });
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'promote-'));
  dir = join(root, 'proj'); common = join(root, 'common'); handlesFile = join(root, 'handles.ts');
  for (const d of [join(dir, 'fx'), join(common, 'src'), join(common, 'golden')]) mkdirSync(d, { recursive: true });
  writeFileSync(join(common, 'src', 'index.ts'), INDEX);
  writeFileSync(join(common, 'golden', 'cases.ts'), CASES);
  writeFileSync(handlesFile, HANDLES);
  writeFileSync(join(dir, 'fx', 'ring.js'), fxSrc('fx.ring'));
  writeFileSync(join(dir, 'fx', 'pair.js'), fxSrc('fx.a', 'fx.b'));
  writeFileSync(join(dir, 'project.json'), JSON.stringify({ version: 1,
    meta: { name: 'p', width: 100, height: 100, fps: 30, duration: 4, plugins: [], fx: ['fx/ring.js', 'fx/pair.js'], mix: MIX }, sources: {}, media: {}, grids: [],
    tracks: [{ id: 'o', kind: 'overlay', items: [{ id: 'r1', type: 'fx.ring', start: 0, end: 1, params: {} }, { id: 'r2', type: 'fx.ring', start: 1, end: 2, params: {} }, { id: 'a1', type: 'fx.a', start: 2, end: 3, params: {} }] }] }));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

test('the plan names the file, the new id, the items that change, the category and the next handle', async () => {
  const pl = await plan({ type: 'fx.ring' });
  expect([pl.fxFile, pl.to, pl.name, pl.items, pl.category, pl.handle]).toEqual(['fx/ring.js', 'common.ring', 'ring', ['r1', 'r2'], 'mark', 'MRK-03']);   // MRK-02 is retired
  expect(describePromotion(pl)).toContain('common.ring');
  expect(describePromotion(pl)).toContain('圖鑑代號 MRK-03');
  expect((await plan({ type: 'fx.ring', name: 'halo' })).to).toBe('common.halo');
  expect((await plan({ type: 'fx.ring', name: 'halo', category: 'look' })).handle).toBe('LOK-02');
});

test('it refuses what it should: not an fx, unknown, a file with other blocks, a bad, numbered or taken name, no category', async () => {
  await expect(plan({ type: 'core.flash' })).rejects.toThrow('fx.');
  await expect(plan({ type: 'fx.nope' })).rejects.toThrow('找不到');
  await expect(plan({ type: 'fx.a' })).rejects.toThrow('拆成自己的檔案');
  await expect(plan({ type: 'fx.ring', name: 'Bad Name' })).rejects.toThrow('不合法');
  await expect(plan({ type: 'fx.ring', name: 'film2' })).rejects.toThrow('數字結尾');
  await expect(plan({ type: 'fx.ring', name: 'film' })).rejects.toThrow('已經存在');
  await expect(planPromotion({ dir, type: 'fx.ring', commonDir: common, handlesFile, names: NAMES })).rejects.toThrow(/要給分類：加 --category text\|chapter/);
  await expect(plan({ type: 'fx.ring', category: 'nope' })).rejects.toThrow('沒有「nope」這個分類');
});

test('a name easy to mistake for a shared one is warned about, not refused', async () => {
  const pl = await plan({ type: 'fx.ring' });
  expect(pl.warnings.join('\n')).toMatch(/ring 跟現有的 ding、rings 只差一兩個字母/);
  expect(pl.warnings.join('\n')).toMatch(/ring 跟 ringbell 互相包含/);
  expect(describePromotion(pl)).toContain('⚠');
  expect((await plan({ type: 'fx.ring', name: 'halo' })).warnings).toEqual([]);
  // six letters or fewer: one letter off; longer: two
  expect(similarNames('flip', ['flap', 'slip', 'clip', 'film']).close).toEqual(['flap', 'slip', 'clip']);
  expect(similarNames('postcard', ['postmark', 'postcards', 'card']).close).toEqual(['postmark', 'postcards']);
  expect(similarNames('postcard', ['postmark', 'card']).within).toEqual(['card']);
});

test('the registry: the next number past every handle given (retired ones too), the new line after its prefix', () => {
  expect(nextHandle(HANDLES, 'MRK')).toBe('MRK-03');
  expect(nextHandle(HANDLES, 'SFX-HIT')).toBe('SFX-HIT-01');
  expect(nextHandle(`'MRK-99': 'x'`, 'MRK')).toBe('MRK-100');
  const t = withHandle(HANDLES, 'MRK-03', 'common.ring');
  expect(t).toContain("  'MRK-01': 'common.stamp',\n  'MRK-03': 'common.ring',\n  'LOK-01'");
  expect(withHandle(HANDLES, 'MUS-01', 'style:x')).toContain("  'LOK-01': 'common.film',\n  'MUS-01': 'style:x',\n};\nexport const RETIRED");
  expect(() => withHandle(HANDLES, 'MRK-02', 'common.ring')).toThrow('不能再用');
});

test('applying moves the file, registers it with its category and handle, rewrites the project and keeps the old project.json in history', async () => {
  const pl = await plan({ type: 'fx.ring' });
  await applyPromotion({ dir, commonDir: common, plan: pl, handlesFile });
  const moved = readFileSync(join(common, 'src', 'ring.ts'), 'utf8');
  expect(moved).toContain("type: 'common.ring', category: 'mark'");
  expect(moved.slice(moved.indexOf('\n') + 1)).not.toContain('fx.ring');   // only the provenance comment keeps the old id
  expect(moved.startsWith('// @ts-nocheck')).toBe(true);
  expect(readFileSync(handlesFile, 'utf8')).toContain("  'MRK-03': 'common.ring',\n");
  const index = readFileSync(join(common, 'src', 'index.ts'), 'utf8');
  expect(index).toContain("import ringItems from './ring.ts';");
  expect(index).toContain('[progress, film, ...ringItems] as ItemType[]');
  expect(readFileSync(join(common, 'golden', 'cases.ts'), 'utf8')).toContain("{ name: 'ring', type: 'common.ring', at: [1] },");
  const p = parseProject(JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')));
  expect(p.meta.fx).toEqual(['fx/pair.js']);
  expect(p.tracks[0].items.map((i: any) => i.type)).toEqual(['common.ring', 'common.ring', 'fx.a']);
  expect(existsSync(join(dir, 'fx', 'ring.js'))).toBe(false);
  expect(readdirSync(join(dir, '.history')).some((f) => f.endsWith('_promote.json'))).toBe(true);
});

test('an fx that already says its category keeps it and needs no --category', async () => {
  writeFileSync(join(dir, 'fx', 'ring.js'), fxSrc('fx.ring').replace("kind: 'overlay'", "kind: 'overlay', category: 'travel'"));
  const pl = await planPromotion({ dir, type: 'fx.ring', commonDir: common, handlesFile, names: NAMES });
  expect([pl.category, pl.handle]).toEqual(['travel', 'TRV-01']);
  await applyPromotion({ dir, commonDir: common, plan: pl, handlesFile });
  expect(readFileSync(join(common, 'src', 'ring.ts'), 'utf8').match(/category/g)).toHaveLength(1);
});
