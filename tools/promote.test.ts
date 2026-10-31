import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseProject } from '@tellcut/engine';
import { applyPromotion, describePromotion, planPromotion, rewriteCutScript } from './promote.ts';
import { splitFx, unknownNames } from './fx-split.ts';
import { editedSinceCut } from './cut/cut.ts';
import { nextHandle, similarNames, withHandle } from './handle-registry.ts';

const MIX = { master: 0.9, compressor: { threshold: -14, ratio: 3, attack: 0.01, release: 0.2 }, reverb: { seconds: 1, send: 0 } };
const fxSrc = (...types: string[]) => `export default [${types.map((t) => `{ type: '${t}', label: '${t}', kind: 'overlay', doc: 'd', params: [], build() { return 0; }, draw() {} }`).join(', ')}];\n`;
const INDEX = `import type { ItemType, Plugin } from '@tellcut/engine';\nimport { film } from './film.ts';\nimport { progress } from './progress.ts';\n\nexport const commonItems: ItemType[] = [progress, film] as ItemType[];\nexport const commonPlugin: Plugin = { id: 'common', items: commonItems };\n`;
const SAMPLES = `export const samples = [\n  { name: 'film', type: 'common.film', at: [1] },\n];\n`;
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
  writeFileSync(join(common, 'src', 'samples.ts'), SAMPLES);
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

test('it refuses what it should: not an fx, unknown, a file it cannot split, a bad, numbered or taken name, no category', async () => {
  await expect(plan({ type: 'core.flash' })).rejects.toThrow('fx.');
  await expect(plan({ type: 'fx.nope' })).rejects.toThrow('找不到');
  // a file of several is split only when its export is written out plainly
  writeFileSync(join(dir, 'fx', 'pair.js'), `const list = ${fxSrc('fx.a', 'fx.b').replace('export default ', '')}export default list;\n`);
  await expect(plan({ type: 'fx.a' })).rejects.toThrow(/沒辦法自動拆開（export default 不是直接寫出來的陣列/);
  writeFileSync(join(dir, 'fx', 'pair.js'), `const more = ${fxSrc('fx.b').replace('export default ', '')}${fxSrc('fx.a').replace('];', ', ...more];')}`);
  await expect(plan({ type: 'fx.a' })).rejects.toThrow('第 2 項不是');
  // the type written is not the type it loads as
  writeFileSync(join(dir, 'fx', 'pair.js'), `const base = { type: 'fx.c' };\n${fxSrc('fx.a', 'fx.b').replace("{ type: 'fx.b',", "{ type: 'fx.b', ...base,")}`);
  await expect(plan({ type: 'fx.a' })).rejects.toThrow('跟 export default 寫的 fx.a、fx.b 不一樣');
  expect(readFileSync(join(dir, 'fx', 'pair.js'), 'utf8')).toContain('...base');   // a refusal writes nothing
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
  expect(readFileSync(join(common, 'src', 'samples.ts'), 'utf8')).toContain("{ name: 'ring', type: 'common.ring', at: [1] },");
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

test("the project's cut.ts is rewritten so the next cut does not bring the fx back; params naming it follow; a clean cut stays clean", async () => {
  // a project made by a cut script: cut-state.json holds project.json's hash as the cut wrote it
  const raw = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  raw.tracks[0].items.push({ id: 'c1', type: 'common.card', start: 3, end: 4, params: { title: 't', art: 'fx.ring', artParams: { x: 1 } } });
  const text = JSON.stringify(raw, null, 2);
  writeFileSync(join(dir, 'project.json'), text);
  mkdirSync(join(dir, 'cache'));
  writeFileSync(join(dir, 'cache', 'cut-state.json'), JSON.stringify({ hash: createHash('sha1').update(text).digest('hex') }));
  writeFileSync(join(dir, 'cut.ts'), "export default async function (c) {\n  c.fx('fx/ring.js');\n  c.fx('fx/pair.js');\n  c.effect('fx.ring', { at: 0, len: 1 });\n  c.effect('common.card', { art: \"fx.ring\" });\n}\n");
  expect(editedSinceCut(dir)).toBe(false);
  const pl = await plan({ type: 'fx.ring' });
  expect([pl.items, pl.refs, pl.cutScript]).toEqual([['r1', 'r2'], ['c1'], true]);
  expect(describePromotion(pl)).toContain("cut.ts 裡的 'fx.ring' 改成 'common.ring'");
  expect(await applyPromotion({ dir, commonDir: common, plan: pl, handlesFile })).toEqual({ cutLeft: false });
  expect(readFileSync(join(dir, 'cut.ts'), 'utf8')).toBe("export default async function (c) {\n  c.fx('fx/pair.js');\n  c.effect('common.ring', { at: 0, len: 1 });\n  c.effect('common.card', { art: \"common.ring\" });\n}\n");
  const p = parseProject(JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')));
  expect(p.tracks[0].items.find((i) => i.id === 'c1')).toMatchObject({ params: { art: 'common.ring', artParams: { x: 1 } } });
  expect(editedSinceCut(dir)).toBe(false);   // npm run cut needs no --force for the promotion
});

test('a project edited since its cut stays edited; no cut.ts, nothing to rewrite', async () => {
  mkdirSync(join(dir, 'cache'));
  writeFileSync(join(dir, 'cache', 'cut-state.json'), JSON.stringify({ hash: 'old' }));
  const pl = await plan({ type: 'fx.ring' });
  expect(pl.cutScript).toBe(false);
  expect(await applyPromotion({ dir, commonDir: common, plan: pl, handlesFile })).toEqual({ cutLeft: false });
  expect(editedSinceCut(dir)).toBe(true);
});

test("cut.ts's c.fx call goes wherever it is written; one it cannot find is reported", () => {
  const o = { from: 'fx.ring', to: 'common.ring', fxFile: 'fx/ring.js' };
  const rw = (s: string) => rewriteCutScript(s, o);
  expect(rw("  c.fx('fx/a.js'); c.fx(\"./fx/ring.js\"); c.fx('fx/b.js');\n")).toEqual({ src: "  c.fx('fx/a.js'); c.fx('fx/b.js');\n", left: false });
  expect(rw("  c.fx('fx/ring.js'); c.fx('fx/b.js');\n").src).toBe("  c.fx('fx/b.js');\n");
  expect(rw("c.fx('fx/ring.js').fx('fx/b.js');\n").src).toBe("c.fx('fx/b.js');\n");
  expect(rw("c.fx('fx/a.js').fx( 'fx/ring.js' ).fx('fx/b.js');\n").src).toBe("c.fx('fx/a.js').fx('fx/b.js');\n");
  expect(rw("a();\r\n  cut.fx(`fx/ring.js`);\r\nb();\r\n").src).toBe('a();\r\nb();\r\n');
  expect(rw("c.effect('fx.rings', {}); c.effect(`fx.ring`, {});").src).toBe("c.effect('fx.rings', {}); c.effect(`common.ring`, {});");
  expect(rw("const f = 'fx/ring.js';\nc.fx(f);\n")).toEqual({ src: "const f = 'fx/ring.js';\nc.fx(f);\n", left: true });
});

test('another fx file of the project that names the type is warned about', async () => {
  writeFileSync(join(dir, 'fx', 'pair.js'), fxSrc('fx.a', 'fx.b').replace("doc: 'd'", "doc: 'd', art: 'fx.ring'"));
  expect((await plan({ type: 'fx.ring' })).warnings.join('\n')).toContain('fx/pair.js 裡也寫了 fx.ring');
});

// a file of several blocks: helpers each uses, one both use, a header and a comment on each entry
const SEVERAL = `// the project's own effects
import { ease } from './lib/ease.js';

const GOLD = '#e9a73b', INK = '#1b1614';
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
/** a ring around the centre */
function ring(g, r) { g.strokeStyle = GOLD; g.arc(0, 0, clamp(r), 0, 7); }
const started = Date.now();

function bar(g, w) { g.fillStyle = INK; g.fillRect(0, 0, clamp(w), 4); }

export default [
  // the bar
  {
    type: 'fx.bar', label: 'bar', kind: 'overlay', doc: 'd', params: [],
    build() { return 0; }, draw({ g }) { bar(g, ease(1)); },
  },
  // the ring
  {
    type: 'fx.ring', label: 'ring', kind: 'overlay', doc: 'd', params: [],
    build() { return 0; }, draw({ g }) { ring(g, 1); },
  },
  {
    type: 'fx.dot', label: 'dot', kind: 'overlay', doc: 'd', params: [],
    build() { return 0; }, draw() {},
  },
];
`;

test('from a file of several, only the named block moves: the shared file keeps the helpers it names, the project keeps the rest', async () => {
  mkdirSync(join(dir, 'fx', 'lib'));
  writeFileSync(join(dir, 'fx', 'lib', 'ease.js'), 'export const ease = (x) => x;\n');
  writeFileSync(join(dir, 'fx', 'pair.js'), SEVERAL);
  const raw = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  raw.meta.fx = ['fx/pair.js'];   // its own fx.ring only
  rmSync(join(dir, 'fx', 'ring.js'));
  raw.tracks[0].items = [{ id: 'g1', type: 'fx.ring', start: 0, end: 1, params: {} }, { id: 'b1', type: 'fx.bar', start: 1, end: 2, params: {} }];
  writeFileSync(join(dir, 'project.json'), JSON.stringify(raw));
  writeFileSync(join(dir, 'cut.ts'), "export default async function (c) {\n  c.fx('fx/pair.js');\n  c.effect('fx.ring', { at: 0, len: 1 });\n}\n");
  const pl = await plan({ type: 'fx.ring', name: 'halo' });
  expect([pl.fxFile, pl.keepsFxEntry, pl.split?.keeps, pl.items]).toEqual(['fx/pair.js', true, ['fx.bar', 'fx.dot'], ['g1']]);
  expect(describePromotion(pl)).toContain('fx/pair.js 留著其餘 2 個積木（fx.bar、fx.dot）');
  expect(describePromotion(pl)).toContain("c.fx('fx/pair.js') 留著");
  expect(pl.warnings).toEqual([]);   // the import is used only by fx.bar, which stays: the moved copy drops it

  await applyPromotion({ dir, commonDir: common, plan: pl, handlesFile });
  const moved = readFileSync(join(common, 'src', 'halo.ts'), 'utf8');
  expect(moved).toBe(`// @ts-nocheck — promoted from a project's own effect (fx.ring); add types when you next touch it.
// the project's own effects

const GOLD = '#e9a73b';
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
/** a ring around the centre */
function ring(g, r) { g.strokeStyle = GOLD; g.arc(0, 0, clamp(r), 0, 7); }
const started = Date.now();

export default [
  // the ring
  {
    type: 'common.halo', category: 'mark', label: 'ring', kind: 'overlay', doc: 'd', params: [],
    build() { return 0; }, draw({ g }) { ring(g, 1); },
  },
];
`);
  // the project's file: only the entry and its comment are gone; its helpers stay as they were
  expect(readFileSync(join(dir, 'fx', 'pair.js'), 'utf8')).toBe(SEVERAL.replace(`  // the ring
  {
    type: 'fx.ring', label: 'ring', kind: 'overlay', doc: 'd', params: [],
    build() { return 0; }, draw({ g }) { ring(g, 1); },
  },
`, ''));
  const p = parseProject(JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8')));
  expect(p.meta.fx).toEqual(['fx/pair.js']);
  expect(p.tracks[0].items.map((i: any) => i.type)).toEqual(['common.halo', 'fx.bar']);
  expect(readFileSync(join(dir, 'cut.ts'), 'utf8')).toBe("export default async function (c) {\n  c.fx('fx/pair.js');\n  c.effect('common.halo', { at: 0, len: 1 });\n}\n");
  expect(readdirSync(join(dir, '.history', 'promote')).map((f) => f.replace(/^[^_]+_/, ''))).toEqual(['pair.js']);
  expect(readFileSync(join(dir, '.history', 'promote', readdirSync(join(dir, '.history', 'promote'))[0]), 'utf8')).toBe(SEVERAL);
  // the rest still loads as the other two
  const { loadProjectFx } = await import('@tellcut/media-node');
  const r = await loadProjectFx(dir, ['fx/pair.js']);
  expect([r.errors, r.plugin.items!.map((i) => i.type)]).toEqual([[], ['fx.bar', 'fx.dot']]);
});

test('splitting: the first or the last entry, a one-line list; an import the moved block needs is warned about', () => {
  const one = `export default [{ type: 'fx.a', n: 1 }, { type: 'fx.b', n: 2 }];\n`;
  expect(splitFx(one, 'x.js', 'fx.a', ['fx.a', 'fx.b'])).toMatchObject({ rest: `export default [ { type: 'fx.b', n: 2 }];\n`, shared: `export default [{ type: 'fx.a', n: 1 }];\n` });
  expect(splitFx(one, 'x.js', 'fx.b', ['fx.a', 'fx.b'])).toMatchObject({ rest: `export default [{ type: 'fx.a', n: 1 }];\n`, shared: `export default [ { type: 'fx.b', n: 2 }];\n` });
  const s = splitFx(SEVERAL, 'x.js', 'fx.bar', ['fx.bar', 'fx.ring', 'fx.dot']);
  expect(s.shared).toContain("import { ease } from './lib/ease.js';");
  expect(s.shared).toContain('function bar(');
  expect(s.shared).not.toMatch(/function ring|GOLD/);
  expect(s.shared).toContain("const INK = '#1b1614';");
  expect(s.rest).not.toContain("type: 'fx.bar'");
  // a value made by running something stays even when nothing names it
  expect(s.shared).toContain('const started = Date.now();');
  expect(() => splitFx(SEVERAL.replace("type: 'fx.dot'", "type: 'fx.ring'"), 'x.js', 'fx.ring', ['fx.bar', 'fx.ring', 'fx.ring'])).toThrow('不是剛好寫了一次');
  expect(() => splitFx('export default [{ type: "fx.a" },, { type: "fx.b" }];', 'x.js', 'fx.a', ['fx.a', 'fx.b'])).toThrow('第 2 項不是');
  expect(() => splitFx('export default [{ type: "fx.a" }, { type: "fx.b" }', 'x.js', 'fx.a', ['fx.a', 'fx.b'])).toThrow('讀不懂它的語法');
});

test('splitting leaves what a literal says as it was written, blank lines and all', () => {
  const src = 'const css = `a\n\n\n\nb`;\nconst k = 1;\n\n\n\nconst t = `x\n\n\n\ny`;\nexport default [\n  { type: \'fx.a\', s: css + t },\n  { type: \'fx.b\', n: k },\n];\n';
  expect(splitFx(src, 'x.js', 'fx.a', ['fx.a', 'fx.b']).shared).toBe('const css = `a\n\n\n\nb`;\n\nconst t = `x\n\n\n\ny`;\nexport default [\n  { type: \'fx.a\', s: css + t },\n];\n');
});

test('an entry takes the comment on its own line with it, not the one after the entry before', () => {
  const src = "export default [\n  { type: 'fx.a', n: 1 }, // a\n  { type: 'fx.b', n: 2 }, // b\n  { type: 'fx.c', n: 3 }, // c\n];\n";
  const t = ['fx.a', 'fx.b', 'fx.c'];
  expect(splitFx(src, 'x.js', 'fx.b', t)).toMatchObject({ rest: "export default [\n  { type: 'fx.a', n: 1 }, // a\n  { type: 'fx.c', n: 3 }, // c\n];\n", shared: "export default [\n  { type: 'fx.b', n: 2 }, // b\n];\n" });
  expect(splitFx(src, 'x.js', 'fx.a', t)).toMatchObject({ rest: "export default [\n  { type: 'fx.b', n: 2 }, // b\n  { type: 'fx.c', n: 3 }, // c\n];\n", shared: "export default [\n  { type: 'fx.a', n: 1 }, // a\n];\n" });
  expect(splitFx(src, 'x.js', 'fx.c', t)).toMatchObject({ rest: "export default [\n  { type: 'fx.a', n: 1 }, // a\n  { type: 'fx.b', n: 2 }, // b\n];\n", shared: "export default [\n  { type: 'fx.c', n: 3 }, // c\n];\n" });
  const bare = "export default [\n  { type: 'fx.a', n: 1 }, /* a */\n  { type: 'fx.b', n: 2 } // b\n];\n";
  expect(splitFx(bare, 'x.js', 'fx.b', ['fx.a', 'fx.b'])).toMatchObject({ rest: "export default [\n  { type: 'fx.a', n: 1 }, /* a */\n];\n", shared: "export default [\n  { type: 'fx.b', n: 2 } // b\n];\n" });
  expect(splitFx(bare, 'x.js', 'fx.a', ['fx.a', 'fx.b'])).toMatchObject({ rest: "export default [\n  { type: 'fx.b', n: 2 } // b\n];\n", shared: "export default [\n  { type: 'fx.a', n: 1 } /* a */\n];\n" });
});

test('a moved block that imports a project file is warned about', async () => {
  mkdirSync(join(dir, 'fx', 'lib'));
  writeFileSync(join(dir, 'fx', 'lib', 'ease.js'), 'export const ease = (x) => x;\n');
  writeFileSync(join(dir, 'fx', 'pair.js'), SEVERAL);
  expect((await plan({ type: 'fx.bar' })).warnings.join('\n')).toContain('從專案裡的檔案 import 東西');
});

test('the split is checked for names it would lose: what a module uses but does not declare, the browser aside', () => {
  expect(unknownNames("import { e } from './e.js';\nconst a = 1;\nb(a, e); document.body.append(new Path2D()); Math.max(1);\n", 'x.js')).toEqual(['b']);
  expect(unknownNames(SEVERAL, 'x.js')).toEqual([]);
});

test('a file of several edited between the preview and --yes is not touched: nothing at all is written', async () => {
  mkdirSync(join(dir, 'fx', 'lib'));
  writeFileSync(join(dir, 'fx', 'lib', 'ease.js'), 'export const ease = (x) => x;\n');
  writeFileSync(join(dir, 'fx', 'pair.js'), SEVERAL);
  const raw = JSON.parse(readFileSync(join(dir, 'project.json'), 'utf8'));
  raw.meta.fx = ['fx/pair.js'];
  writeFileSync(join(dir, 'project.json'), JSON.stringify(raw));
  const pl = await plan({ type: 'fx.dot', name: 'dot' });
  writeFileSync(join(dir, 'fx', 'pair.js'), SEVERAL.replace("label: 'dot'", "label: 'spot'"));
  await expect(applyPromotion({ dir, commonDir: common, plan: pl, handlesFile })).rejects.toThrow('在預覽之後改過了');
  expect([readFileSync(handlesFile, 'utf8'), existsSync(join(common, 'src', 'dot.ts')), existsSync(join(dir, '.history'))]).toEqual([HANDLES, false, false]);
});
